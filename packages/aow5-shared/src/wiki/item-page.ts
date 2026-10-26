import type { ItemFull, ItemSource } from '../types/items.ts';
import type { CraftFile, TalentUnlock } from './craft.ts';
import { craftInSeason } from './craft.ts';
import {
  dropChance,
  monsterInSeason,
  poolFor,
  totalWeight,
  type DifficultyKey,
  type MonstersFile,
} from './monsters.ts';
import { entryShare, poolInSeason, PRIMARY_RULESET, type PoolsFile, type RulesetId } from './pools.ts';
import { PARTNER_CHEST_REWARD } from './sky.ts';
import {
  ancientPrice,
  exchangePoints,
  PARTNER_REGULAR_RULES,
  regularPrice,
  regularStock,
  type VendorKey,
  type VendorsFile,
} from './vendors.ts';

/**
 * The item page's joins across the wiki's files — the partner wiki's
 * `tab-items.js` indexes (`SOURCES`, `RECIPE_SOURCES`, `FIRST_SOURCES`,
 * `buyAt`, `cave`), rebuilt from the per-domain data rather than shipped as a
 * second copy of it.
 *
 * Every function here answers "where does *this item* turn up", which is the
 * inverse of how the files are keyed (a monster lists its drops, a vendor its
 * stock). The inversions that walk the whole monster table are built once per
 * file and reused — see `itemDropIndex`.
 */

// --- monsters -----------------------------------------------------------------

/** One unit that can drop an item, with the chance one kill does. */
export interface ItemDropRow {
  monster: string;
  /** `[0, 1]`. Per kill for the ordinary pool; share of the list for a first drop. */
  chance: number;
}

/** Item id -> the units that drop it, best chance first. */
export interface ItemDropIndex {
  /** The ordinary pool, recipes taken out of it. */
  drops: Map<string, ItemDropRow[]>;
  /** Recipe items, counted against the whole pool while they are still in it. */
  recipes: Map<string, ItemDropRow[]>;
  /** The guaranteed first-kill list (`first_drop`): share of that list. */
  first: Map<string, ItemDropRow[]>;
}

const dropIndexes = new WeakMap<MonstersFile, Map<string, ItemDropIndex>>();

/**
 * Every monster's drops, inverted to item -> monsters.
 *
 * The partner's rules, kept so the numbers agree with theirs:
 *
 *   - the chance is per kill at `difficulty` (the partner fixed it at hard,
 *     where `poolHard` is merged in) — `dropChance` over the pool's total;
 *   - an ordinary item is counted against the pool **without recipes**: a
 *     recipe drops once and leaves the pool, so that is the pool a returning
 *     player actually draws from;
 *   - a recipe is counted against the **whole** pool, because the only time it
 *     can drop is while it is still in there;
 *   - the first-kill list picks exactly one row by weight, so its number is a
 *     share of that list rather than a per-kill chance.
 *
 * Memoised per file, difficulty and season: it walks every pool of ~1,000 units
 * and the item page asks for it on every navigation.
 *
 * `ruleset` is the season whose rows the index reads. A monster's pool can be
 * season-specific (`Monster.bySeason`) — the S3 bosses, for one, drop the S3
 * runes that no base table names — and a card offering an S3 item's sources
 * must read the same season as the numbers above them. Omitted, the rows are
 * the base ones the file carries, which is what the non-seasonal callers want.
 */
export function itemDropIndex(
  file: MonstersFile,
  isRecipe: (itemId: string) => boolean,
  difficulty: DifficultyKey = 'hard',
  ruleset?: RulesetId,
): ItemDropIndex {
  let byDiff = dropIndexes.get(file);
  if (byDiff === undefined) {
    byDiff = new Map();
    dropIndexes.set(file, byDiff);
  }
  const cacheKey = ruleset === undefined ? difficulty : `${ruleset}/${difficulty}`;
  const cached = byDiff.get(cacheKey);
  if (cached !== undefined) return cached;

  const diff = file.difficulties.find((d) => d.key === difficulty);
  const index: ItemDropIndex = { drops: new Map(), recipes: new Map(), first: new Map() };
  const push = (map: Map<string, ItemDropRow[]>, id: string, row: ItemDropRow) => {
    const list = map.get(id);
    if (list === undefined) map.set(id, [row]);
    else list.push(row);
  };

  for (const base of file.monsters) {
    const m = ruleset === undefined ? base : monsterInSeason(base, ruleset);
    // An item listed on two rows of one pool is one item with both weights.
    const weights = new Map<string, number>();
    for (const [id, w] of poolFor(m, difficulty)) weights.set(id, (weights.get(id) ?? 0) + w);
    let whole = 0;
    let plain = 0;
    for (const [id, w] of weights) {
      whole += w;
      if (!isRecipe(id)) plain += w;
    }
    for (const [id, w] of weights) {
      const recipe = isRecipe(id);
      const chance = dropChance(m, w, recipe ? whole : plain, diff);
      if (chance > 0) push(recipe ? index.recipes : index.drops, id, { monster: m.id, chance });
    }

    const firstTotal = totalWeight(m.poolFirst);
    if (firstTotal > 0) {
      const firsts = new Map<string, number>();
      for (const [id, w] of m.poolFirst) firsts.set(id, (firsts.get(id) ?? 0) + w);
      for (const [id, w] of firsts) push(index.first, id, { monster: m.id, chance: w / firstTotal });
    }
  }

  const order = (a: ItemDropRow, b: ItemDropRow) =>
    b.chance - a.chance || (a.monster < b.monster ? -1 : a.monster > b.monster ? 1 : 0);
  for (const map of [index.drops, index.recipes, index.first]) for (const list of map.values()) list.sort(order);

  byDiff.set(cacheKey, index);
  return index;
}

// --- vendors ------------------------------------------------------------------

/** One vendor that can sell an item, and on what terms. */
export interface VendorOffer {
  vendor: VendorKey;
  /** The guild merchant's offers are on its point exchange. */
  guildTab?: 'exchange';
  /** Regular merchant, equipment: the shop level from which it is stocked. */
  shopLevel?: number;
  /**
   * The item only enters the shelf once it has dropped for the player this
   * many times — the partner's rule for anything that is not equipment.
   */
  unlockDrops?: number;
  /** `Subclass: precious` on the regular merchant: a higher ceiling. */
  precious?: boolean;
  /** Gold, regular merchant: what one restock may price it at. */
  gold?: { min: number; max: number; precious?: number };
  /** Ancient Coins, ancient merchant. */
  coins?: { min: number; max: number };
  /** Exchange points, guild merchant. */
  points?: number;
  /** Exchange stock (`ExchangeInventory`). */
  stock?: number;
}

/**
 * Every vendor that can stock an item — the partner's `buyAt`.
 *
 * Prices are ranges because the regular and ancient merchants re-roll every
 * slot's price on each restock (`regularPrice`, `ancientPrice`). Equipment
 * enters the regular shelf at a shop level; anything else waits for the
 * partner's "dropped for you N times" rule, which the ancient merchant's random
 * slots share.
 */
export function vendorOffersOf(
  file: VendorsFile,
  item: { id: string; type: string; cost: number; quality: number },
  ruleset: RulesetId = PRIMARY_RULESET,
): VendorOffer[] {
  const out: VendorOffer[] = [];
  const equip = item.type === 'equip';

  const stock = regularStock(file.regular, ruleset);
  for (const [level, ids] of Object.entries(stock.byLevel)) {
    if (!ids.includes(item.id)) continue;
    const precious = stock.precious.includes(item.id);
    out.push({
      vendor: 'regular',
      ...(equip ? { shopLevel: Number(level) } : { unlockDrops: PARTNER_REGULAR_RULES.unlockDrops }),
      ...(precious ? { precious: true } : {}),
      gold: regularPrice(item.cost, precious),
    });
    break;
  }

  const accepts = file.ancient.bySeason?.[ruleset]?.accepts ?? file.ancient.accepts;
  if (accepts.includes(item.id)) {
    const p = ancientPrice(item.cost);
    out.push({ vendor: 'ancient', unlockDrops: PARTNER_REGULAR_RULES.unlockDrops, coins: { min: p.coinMin, max: p.coinMax } });
  }

  const offers = file.guild.bySeason?.[ruleset]?.offers ?? file.guild.exchange.offers;
  const offer = offers.find(([id]) => id === item.id);
  if (offer !== undefined) {
    out.push({
      vendor: 'guild',
      guildTab: 'exchange',
      points: exchangePoints(item.id, item.cost, item.quality),
      stock: offer[1],
    });
  }
  return out;
}

// --- the Skyfall Realm --------------------------------------------------------

/** One depth of the endless run that can hand the item out. */
export interface EndlessStage {
  /** The row's `Level`: the boss's ordinal, or the merchant's level. */
  stage: number;
  /** Bosses (and the merchant after them) come every third floor. */
  wave: number;
}

/**
 * Where the endless run hands an item out, from `ItemFull.sources` — the
 * partner's `cave` boss/merchant rows. A boss reward and a merchant level are
 * both one per third floor, hence `wave = stage × 3` for both. De-duplicated
 * and ascending.
 */
export function endlessAppearances(sources: readonly Pick<ItemSource, 'kind' | 'level'>[] | undefined): {
  bosses: EndlessStage[];
  merchants: EndlessStage[];
} {
  const collect = (match: (kind: string) => boolean): EndlessStage[] =>
    [...new Set((sources ?? []).filter((s) => match(s.kind)).map((s) => s.level))]
      .sort((a, b) => a - b)
      .map((stage) => ({ stage, wave: stage * 3 }));
  return {
    bosses: collect((k) => k === 'boss_reward'),
    merchants: collect((k) => k.startsWith('merchant')),
  };
}

/**
 * The tiers whose end-of-run reward chest can give the item — the partner's
 * `cave` reward rows. The chest's pool per tier is the partner's
 * `PARTNER_CHEST_REWARD.poolByTier`; the pool contents are the pak's.
 */
export function rewardChestTiers(
  pools: PoolsFile,
  itemId: string,
  ruleset: RulesetId = PRIMARY_RULESET,
): { tier: 1 | 2 | 3; pool: string; share: number }[] {
  const out: { tier: 1 | 2 | 3; pool: string; share: number }[] = [];
  for (const tier of [1, 2, 3] as const) {
    const id = PARTNER_CHEST_REWARD.poolByTier[tier];
    const pool = pools.pools[id];
    if (pool === undefined) continue;
    const share = entryShare(poolInSeason(pool, ruleset), itemId);
    if (share > 0) out.push({ tier, pool: id, share });
  }
  return out;
}

// --- crafting -----------------------------------------------------------------

/**
 * What unlocks crafting an item: its recipe items and talent nodes. For a
 * recipe item, the talents of what it crafts — the partner linked a recipe to
 * the talent behind its product, since a recipe has no talent of its own.
 *
 * An item the pack does not say how to make — no components at all — gets no
 * recipe either: the blueprint would describe nothing, and its own card says
 * nothing beyond what it makes. A hundred items are like this, Священная
 * Реликвия and Кубок кобольда among them, and in the pack every one of their
 * blueprints is sold by no vendor and sits in no drop or chest pool, so the
 * chip led to a dead end in both senses. Add a component to such an item in the
 * data and its recipe comes back on its own.
 */
export function craftUnlockOf(
  craft: CraftFile,
  item: Pick<ItemFull, 'id' | 'isRecipe' | 'produces' | 'needs'>,
  ruleset: RulesetId = PRIMARY_RULESET,
): { recipes: string[]; talents: TalentUnlock[]; via?: string } {
  const own = craft.items[item.id];
  const unlock = own === undefined ? {} : craftInSeason(own, ruleset);
  const talents = unlock.talents ?? [];
  if (talents.length === 0 && item.isRecipe === true && item.produces !== undefined) {
    const made = craft.items[item.produces];
    const madeTalents = made === undefined ? [] : (craftInSeason(made, ruleset).talents ?? []);
    if (madeTalents.length > 0) return { recipes: [], talents: madeTalents, via: item.produces };
  }
  return { recipes: item.needs.length > 0 ? (unlock.recipes ?? []) : [], talents };
}

// --- seasons and souls --------------------------------------------------------

// `applySeasonalPatch` lives in `items-extra.ts`, beside `seasonalPatch`.

/** The stat a Life Soul's active scales by: damage = all attributes × this. */
export const SOUL_MULTIPLIER_KEY = 'ability_value_damage_all_stats_multiplier';

/** A soul's damage multiplier, when it states one. */
export function soulMultiplier(item: Pick<ItemFull, 'values'>): number | undefined {
  const v = item.values[SOUL_MULTIPLIER_KEY];
  return typeof v === 'number' ? v : undefined;
}

/**
 * Multiplier by soul quality, ascending: `[[5, 6], [6, 8]]`.
 *
 * Computed from the data rather than written into prose, as the partner did —
 * the multiplier follows the soul's *quality*, not its level, and a patch has
 * changed it before.
 */
export function soulMultiplierRules(
  items: Iterable<Pick<ItemFull, 'isSoul' | 'quality' | 'values'>>,
): [quality: number, multiplier: number][] {
  const byQuality = new Map<number, number>();
  for (const item of items) {
    if (item.isSoul !== true) continue;
    const m = soulMultiplier(item);
    if (m !== undefined && !byQuality.has(item.quality)) byQuality.set(item.quality, m);
  }
  return [...byQuality.entries()].sort((a, b) => a[0] - b[0]);
}
