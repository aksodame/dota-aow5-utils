import type { ItemFull, RichNode } from '../types/items.ts';
import { entryShare, poolInSeason, type PoolsFile, type RulesetId, CURRENT_RULESET } from './pools.ts';

/**
 * What the wiki needs to know about an item that `items.full.json` does not
 * carry — `wiki/items-extra.json` and `wiki/locale.<lang>.items-extra.json`.
 *
 * Deliberately a supplement, not a second item table: names, icons, stats,
 * recipes, dismantle yields and Greed Cave sources stay in `items.full.json`,
 * and a page joins the two by id. What lives here is:
 *
 *   - small per-item facts the builder never needed (`items`): which KV file
 *     an item comes from, the ancient-merchant and exchange flags, a
 *     consumable's use cap, a glyph's target ability and hero data;
 *   - what a container opens (`items[].container`) and what a magic-tower
 *     chest is (`items[].chest` + `chests`);
 *   - a Life Soul's boss transformation (`items[].soul` + `soulSkills`);
 *   - the cosmetics (`wearables`), which are not in the item table at all but
 *     appear in the treasure pools;
 *   - per-season patches (`seasonal`) for the fields where a ruleset's copy of
 *     the item table differs from the base one `items.full.json` was built
 *     from. This is the "known gap" the parser README describes.
 */

/** The KV file an item is defined in. The partner wiki keys behaviour on it. */
export type ItemSourceFile =
  | 'ak_items'
  | 'ak_items_equip'
  | 'ak_items_potion'
  | 'ak_items_stone'
  | 'ak_items_formula'
  | 'ak_items_change'
  | 'ak_gems';

/**
 * A container item: opening it draws from `pool`.
 *
 * Read from the plain (unencrypted) Lua classes under
 * `scripts/vscripts/abilities/items/` — no table names a container's pool.
 */
export interface ContainerInfo {
  /** The `ak_drop_pools` id it draws from. */
  pool: string;
  /** Percent chance that an open draws from the pool at all. */
  chance: number;
  /** Draws per open when the chance passes. */
  draws: number;
  /**
   * Gold granted on every open, as `[min, max]` inclusive. The addon rolls
   * `floor(RandomInt(cost × lo, cost × hi))` on the item's own `ItemCost`;
   * these are that range for the S2 cost.
   */
  gold?: [min: number, max: number];
}

/** One row of `ak_magic_tower_chests`: a chest the magic towers hand out. */
export interface TowerChest {
  /** `ak_magic_tower_chests` row id, e.g. `shadow_3`. */
  id: string;
  /** `mine`, `dark_forest`, `shadow`. Named in `locale.towers`. */
  tower: string;
  level: number;
  checkpoint: string;
  /** The `ak_drop_pools` id the chest draws from. */
  pool: string;
  /** Draws per opened chest, as the table states it (the normal-difficulty item). */
  count: number;
  equipment: number;
  gem: number;
  fragments: number;
  relicChance: number;
  /** The item ids of each variant of this chest. */
  items: { normal: string; easy?: string; hard?: string; temporary?: string };
}

/** Which chest an item is, and which variant of it. */
export interface ChestRef {
  chest: string;
  variant: 'normal' | 'easy' | 'hard' | 'temporary';
}

/**
 * A Life Soul's own numbers, from the S2 `ak_life_souls` table.
 *
 * The skill it turns its wearer into is shared between souls and lives in
 * `soulSkills[source]`.
 */
export interface LifeSoulInfo {
  /** Key into `ItemsExtraFile.soulSkills`. */
  source: string;
  /** Cooldown at upgrade 0, in seconds. */
  cooldown: number;
  /** Percent the cooldown shrinks per upgrade, compounding. */
  cdrPct: number;
  maxUpgrade: number;
  /** Fragments (`item_M012`) an upgrade costs per level: `fragmentStep × (level + 1)`. */
  fragmentStep: number;
  dismantleBase: number;
  /** The rulesets whose life-soul table lists it. */
  rulesets: RulesetId[];
}

/**
 * The boss transformation behind a Life Soul skill.
 *
 * `bossUnit`, `window` and the damage figures come from the S2
 * `ak_player_boss_abilities` table; `segments`, `aim`, `cast` and
 * `pointRange` from the plain `scripts/vscripts/shared/player_boss_transform.lua`,
 * the only place the addon states them.
 */
export interface SoulSkill {
  /** The `ak_player_boss_abilities` row id, e.g. `phantome_ab4`. */
  id: string;
  /** The ability the player casts, e.g. `player_boss_phantome_ab4`. */
  ability: string;
  /** The monster the hero turns into. */
  bossUnit: string;
  /** Seconds the transformation lasts (`MaxDuration`). */
  window: number;
  /** Logical damage hits the whole move's damage is split across. */
  segments: number;
  aim: 'point' | 'direction' | 'self' | string;
  /** Seconds the move takes to play out. */
  cast: number;
  /** Targeting range for a `point` aim. */
  pointRange: number;
  damagePct: number;
  secondaryDamagePct: number;
  damageType: string;
  enterDuration: number;
  exitDuration: number;
}

/** Per-item facts. Only items with at least one of them are listed. */
export interface ItemExtra {
  /** `ItemSellableInAncient` — the ancient merchant buys it. */
  sellableAncient?: true;
  /** `ExchangeInventory`, when non-zero. */
  exchangeInventory?: number;
  /** `use_max`: how many a hero may consume. */
  useMax?: number;
  /** A glyph's `target_ability`. */
  gemTarget?: string;
  /** A glyph's `hero_data`, parsed: what it changes on the target ability. */
  gemData?: Record<string, number>;
  container?: ContainerInfo;
  chest?: ChestRef;
  soul?: LifeSoulInfo;
}

/** A cosmetic from `ak_items_wearable`. Named in `locale.wearables`. */
export interface Wearable {
  quality: number;
  /** `weapon`, `armor`, `head`, `back`, `belt`, `aura`, …; absent on a few. */
  slot?: string;
  /** The heroes it fits, as the table names them (`Axe`, `DragonKnight`). */
  heroes: string;
  kind: string;
  initial?: true;
  inTreasurePool?: true;
  enabled: boolean;
}

/**
 * Where one ruleset's copy of an item differs from the base table that
 * `items.full.json` was built from. Only the differing fields are present.
 */
export interface SeasonalPatch {
  level?: number;
  quality?: number;
  cost?: number;
  timeCost?: number;
  useMax?: number;
  /** Replaces `ItemFull.needs` entirely. */
  needs?: [itemId: string, count: number][];
  /** Replaces `ItemFull.values` entirely. */
  values?: Record<string, number | string>;
  cooldown?: number;
  /** Replaces `ItemFull.gem.values` entirely. */
  gemValues?: Record<string, number>;
  gemData?: Record<string, number>;
}

/** `wiki/items-extra.json`. */
export interface ItemsExtraFile {
  schema: 1;
  generatedAt: string;
  ruleset: RulesetId;
  /**
   * Which KV file defines each item, as id lists per file (grouped rather than
   * repeated on 2,100 records). Use `sourceFileOf`.
   */
  tables: Record<ItemSourceFile, string[]>;
  items: Record<string, ItemExtra>;
  chests: Record<string, TowerChest>;
  soulSkills: Record<string, SoulSkill>;
  wearables: Record<string, Wearable>;
  seasonal: Record<string, Partial<Record<RulesetId, SeasonalPatch>>>;
}

/** `wiki/locale.<lang>.items-extra.json`. Absent keys had no game token. */
export interface ItemsExtraLocale {
  schema: 1;
  lang: string;
  /** Item quality -> its name (`ak_quality_<n>`), e.g. `5` -> "Legendary". */
  qualities: Record<string, string>;
  wearables: Record<string, string>;
  /** Tower id -> name (`magic_tower_name_<id>`). */
  towers: Record<string, string>;
  /** Soul skill id -> its name and its tooltip. */
  soulSkills: Record<string, { name?: string; desc?: RichNode[] }>;
}

const sourceIndex = new WeakMap<ItemsExtraFile, Map<string, ItemSourceFile>>();

/** The KV file an item is defined in (the partner wiki's `src`), or undefined for an unknown id. */
export function sourceFileOf(extra: ItemsExtraFile, itemId: string): ItemSourceFile | undefined {
  let index = sourceIndex.get(extra);
  if (index === undefined) {
    index = new Map();
    for (const [file, ids] of Object.entries(extra.tables) as [ItemSourceFile, string[]][]) {
      for (const id of ids) index.set(id, file);
    }
    sourceIndex.set(extra, index);
  }
  return index.get(itemId);
}

/**
 * The chance one open of `container` yields `itemId`, in `[0, 1]`.
 *
 * `chance` gates the whole draw; then each of `draws` draws picks by weight.
 * With several draws this is the chance of *at least one*, treating draws as
 * independent — the server's per-player pool decay (a drawn item weighs less
 * next time) is not in any plain file, so it is not modelled.
 */
export function containerChance(
  container: ContainerInfo,
  pools: PoolsFile,
  itemId: string,
  ruleset: RulesetId = CURRENT_RULESET,
): number {
  const pool = pools.pools[container.pool];
  if (pool === undefined) return 0;
  const share = entryShare(poolInSeason(pool, ruleset), itemId);
  const atLeastOne = 1 - (1 - share) ** Math.max(1, container.draws);
  return (container.chance / 100) * atLeastOne;
}

/**
 * Every container that can yield `itemId`, with the chance one open does.
 * The partner wiki's `items[].containers`, computed rather than stored.
 */
export function containersOf(
  extra: ItemsExtraFile,
  pools: PoolsFile,
  itemId: string,
  ruleset: RulesetId = CURRENT_RULESET,
): { box: string; pool: string; chance: number }[] {
  const out: { box: string; pool: string; chance: number }[] = [];
  for (const [box, info] of Object.entries(extra.items)) {
    if (info.container === undefined) continue;
    const chance = containerChance(info.container, pools, itemId, ruleset);
    if (chance > 0) out.push({ box, pool: info.container.pool, chance });
  }
  return out.sort((a, b) => b.chance - a.chance || (a.box < b.box ? -1 : 1));
}

/** The other items that are the same magic-tower chest, normal first. */
export function chestVariants(extra: ItemsExtraFile, chestId: string): string[] {
  const chest = extra.chests[chestId];
  if (chest === undefined) return [];
  const { normal, easy, hard, temporary } = chest.items;
  return [normal, easy, hard, temporary].filter((id): id is string => id !== undefined);
}

/**
 * A Life Soul's cooldown at an upgrade level, in seconds.
 *
 * The addon's own formula (`GetLifeSoulCooldown` in the plain
 * `scripts/vscripts/shared/life_soul.lua`, and the same in the HUD bundle):
 * `cooldown × (1 − cdrPct/100) ^ min(maxUpgrade, floor(upgrade))`. Unrounded,
 * as the game keeps it; round for display.
 */
export function soulCooldownAt(soul: LifeSoulInfo, upgrade: number): number {
  const level = Math.max(0, Math.min(soul.maxUpgrade, Math.floor(Number.isFinite(upgrade) ? upgrade : 0)));
  return soul.cooldown * (1 - soul.cdrPct / 100) ** level;
}

/** Fragments one upgrade from `level` to `level + 1` costs (`FragmentStep × (level + 1)`). */
export function soulFragmentCost(soul: LifeSoulInfo, level: number): number {
  return soul.fragmentStep * (Math.max(0, Math.floor(level)) + 1);
}

/** An item's seasonal patch, or undefined when the season agrees with the base table. */
export function seasonalPatch(
  extra: ItemsExtraFile,
  itemId: string,
  ruleset: RulesetId = CURRENT_RULESET,
): SeasonalPatch | undefined {
  return extra.seasonal[itemId]?.[ruleset];
}

/**
 * An item as one season sees it: `ItemFull` is built from the base tables, and
 * a season's copy may change its numbers. Fields the patch does not name are
 * the base record's, by reference.
 */
export function applySeasonalPatch(full: ItemFull, patch: SeasonalPatch | undefined): ItemFull {
  if (patch === undefined) return full;
  const out: ItemFull = { ...full };
  if (patch.level !== undefined) out.level = patch.level;
  if (patch.quality !== undefined) out.quality = patch.quality;
  if (patch.cost !== undefined) out.cost = patch.cost;
  if (patch.timeCost !== undefined) out.timeCost = patch.timeCost;
  if (patch.values !== undefined) out.values = patch.values;
  if (patch.needs !== undefined) out.needs = patch.needs.map(([id, count]) => ({ id, count }));
  if (patch.cooldown !== undefined) out.ability = { ...full.ability, cooldown: patch.cooldown };
  if (patch.gemValues !== undefined) out.gem = { ...full.gem, values: patch.gemValues };
  return out;
}
