import type { Dismantle, ItemFull, ItemNeed } from '../types/items.ts';
import type { SeasonalPatch } from './items-extra.ts';
import { isShownRoom, locFarm, type Difficulty, type LocationsFile, type Monster } from './monsters.ts';
import { CURRENT_RULESET, type RulesetId } from './pools.ts';

/**
 * How a craftable item is unlocked — `wiki/craft.json`.
 *
 * The ingredients themselves are `ItemFull.needs` (with a season's
 * replacement in `ItemsExtraFile.seasonal`), and dismantle yields are
 * `ItemFull.dismantle`; neither is repeated here. What the item table does not
 * say is *what lets a player craft it*: either a recipe item from
 * `ak_items_formula` (whose `item` field names what it crafts), or a node of
 * the talent tree (`ak_talent`'s `formula` field), or nothing at all — the
 * partner wiki calls that last case `noFormula`.
 */

/** A talent node that unlocks a recipe. */
export interface TalentUnlock {
  /** `ak_talent` row id, e.g. `T201`. */
  node: string;
  /** The tree it sits in (`type`), e.g. `tree3`. */
  tree: string;
}

export interface CraftUnlock {
  /** Recipe items (`ak_items_formula`) that teach this craft. Usually one. */
  recipes?: string[];
  /** Talent nodes whose `formula` names this item. Usually one; `item_P048` has two. */
  talents?: TalentUnlock[];
}

export interface CraftEntry extends CraftUnlock {
  /** A season whose unlock differs from the S2 one, in full. */
  bySeason?: Partial<Record<RulesetId, CraftUnlock>>;
}

/** `wiki/craft.json`. */
export interface CraftFile {
  schema: 1;
  generatedAt: string;
  ruleset: RulesetId;
  /**
   * Every item the S2 tables give a `Needs` list, plus any item a recipe or a
   * talent names. Keyed by the crafted item.
   */
  items: Record<string, CraftEntry>;
}

/** The unlock as one season sees it. */
export function craftInSeason(entry: CraftEntry, ruleset: RulesetId = CURRENT_RULESET): CraftUnlock {
  return entry.bySeason?.[ruleset] ?? entry;
}

/** True when neither a recipe nor a talent unlocks the craft: it is available from the start. */
export function isFreeCraft(entry: CraftEntry, ruleset: RulesetId = CURRENT_RULESET): boolean {
  const unlock = craftInSeason(entry, ruleset);
  return (unlock.recipes?.length ?? 0) === 0 && (unlock.talents?.length ?? 0) === 0;
}

/**
 * Fate-stone ancestry as two lookups, from `items.full.json` alone.
 *
 * A stone's `upgradesFrom` is the item it is applied to and its `produces` the
 * ancestral item that results — so the partner wiki's separate `stones` file
 * and its `fromStone` / `upgradedBy` fields are both this inversion.
 */
export function stoneLinks(items: Iterable<Pick<ItemFull, 'id' | 'type' | 'upgradesFrom' | 'produces'>>): {
  /** Ancestral item -> the stone that makes it. */
  fromStone: Map<string, string>;
  /** Base item -> the stone that upgrades it. */
  upgradedBy: Map<string, string>;
} {
  const fromStone = new Map<string, string>();
  const upgradedBy = new Map<string, string>();
  for (const item of items) {
    if (item.type !== 'stone') continue;
    if (item.produces !== undefined) fromStone.set(item.produces, item.id);
    if (item.upgradesFrom !== undefined) upgradedBy.set(item.upgradesFrom, item.id);
  }
  return { fromStone, upgradedBy };
}

// --- the crafting planner -----------------------------------------------------
//
// The arithmetic behind the Crafting section, ported from the partner wiki's
// `tab-craft.js` and kept here so the page and the server's card agree on what
// a craft costs. Every function takes a lookup rather than the item table, so
// the caller decides which season's copy of an item it reads (`craftItemOf`
// lays the season's patch over `items.full.json`).

/** The fields of an item the planner reads, as one season sees them. */
export interface CraftItem {
  id: string;
  type: string;
  level: number;
  quality: number;
  /** `ItemCost`; 0 when the table gives none. */
  cost: number;
  /** What the game's craft checks. Empty means it cannot be crafted. */
  needs: ItemNeed[];
  dismantle?: Dismantle;
}

/** The item as a season sees it: the base record with its seasonal patch laid over. */
export function craftItemOf(
  full: Pick<ItemFull, 'id' | 'type' | 'level' | 'quality' | 'cost' | 'needs' | 'dismantle'>,
  patch?: SeasonalPatch,
): CraftItem {
  const item: CraftItem = {
    id: full.id,
    type: full.type,
    level: patch?.level ?? full.level,
    quality: patch?.quality ?? full.quality,
    cost: patch?.cost ?? full.cost,
    needs: patch?.needs !== undefined ? patch.needs.map(([id, count]) => ({ id, count })) : full.needs,
  };
  if (full.dismantle !== undefined) item.dismantle = full.dismantle;
  return item;
}

export type CraftLookup = (id: string) => CraftItem | undefined;

/** The tree stops here: some chains run ten levels deep, and hundreds of materials have recipes. */
export const CRAFT_MAX_DEPTH = 5;
export const CRAFT_MAX_NODES = 240;
/** The longest list the section draws. */
export const CRAFT_LIST_CAP = 400;

/** The partner wiki's `TYPE_GROUPS`: the three chips over the list. */
export const CRAFT_GROUPS = {
  equip: ['equip'],
  material: ['material'],
  potion: ['potion', 'special', 'personality'],
} as const satisfies Record<string, readonly string[]>;
export type CraftGroup = keyof typeof CRAFT_GROUPS;

export function craftGroupOf(type: string): CraftGroup | undefined {
  for (const [group, types] of Object.entries(CRAFT_GROUPS) as [CraftGroup, readonly string[]][]) {
    if (types.includes(type)) return group;
  }
  return undefined;
}

/** True when the game will craft it: it has a `Needs` list. A recipe alone only unlocks. */
export function isCraftable(item: CraftItem | undefined): item is CraftItem {
  return item !== undefined && item.needs.length > 0;
}

/** How many of one component a craft takes. The table never says zero; treat a missing count as one. */
export function needCount(need: ItemNeed): number {
  return Math.max(1, need.count || 1);
}

export interface CraftCostResult {
  /** Sum of the components' unit costs, or null when none of them is known. */
  value: number | null;
  /** Some component has no price at all — the sum is a lower bound. */
  unknown: boolean;
}

export type CraftVerdict = 'buy' | 'craft';

export interface CraftPricing {
  /** What it costs to craft `id` from its components. */
  craftOf(id: string): CraftCostResult;
  /**
   * What one `id` is worth to the craft that needs it: its exchange price when
   * the reader gave one (it could be sold for that, so that is its cost), else
   * what crafting it costs, else its game price.
   */
  unitCost(id: string): number | null;
  /** Which is cheaper, when both an exchange price and a craft cost are known. */
  verdict(id: string): CraftVerdict | null;
}

/**
 * The craft-cost arithmetic, memoised for one set of exchange prices. Build a
 * new one whenever a price changes. The data has no cycles, but a cycle would
 * read as "unknown" rather than recurse forever.
 */
export function craftPricing(lookup: CraftLookup, buy: (id: string) => number | null): CraftPricing {
  const memo = new Map<string, CraftCostResult>();

  function craftOf(id: string): CraftCostResult {
    const known = memo.get(id);
    if (known !== undefined) return known;
    memo.set(id, { value: null, unknown: false });
    let sum = 0;
    let found = 0;
    let unknown = 0;
    for (const need of lookup(id)?.needs ?? []) {
      if (lookup(need.id) === undefined) {
        unknown += 1;
        continue;
      }
      const unit = unitCost(need.id);
      if (unit === null) {
        unknown += 1;
        continue;
      }
      sum += unit * needCount(need);
      found += 1;
    }
    const out = { value: found > 0 ? sum : null, unknown: unknown > 0 };
    memo.set(id, out);
    return out;
  }

  function unitCost(id: string): number | null {
    const price = buy(id);
    if (price !== null) return price;
    const crafted = craftOf(id).value;
    if (crafted !== null) return crafted;
    const cost = lookup(id)?.cost;
    return cost ? cost : null;
  }

  function verdict(id: string): CraftVerdict | null {
    const price = buy(id);
    const crafted = craftOf(id).value;
    if (price === null || crafted === null) return null;
    if (price < crafted) return 'buy';
    if (crafted < price) return 'craft';
    return null;
  }

  return { craftOf, unitCost, verdict };
}

/** One node of the composition tree. */
export interface CraftNode {
  /** Path of indices from the root (`0.2.1`): stable while prices change, so an input keeps focus. */
  key: string;
  id: string;
  count: number;
  /** A material whose own recipe is hidden until the reader asks for one more level. */
  collapsed: boolean;
  children: CraftNode[];
}

export interface CraftTree {
  /** One branch per direct component, in the recipe's order. */
  branches: CraftNode[];
  /** Materials drawn collapsed. */
  collapsedMats: number;
  /** The tree hit `CRAFT_MAX_DEPTH` or `CRAFT_MAX_NODES`. */
  truncated: boolean;
}

/**
 * What a craft is made of, as nested branches.
 *
 * Materials (ingots, cloth) are not opened unless `matDepth` is set, and then
 * only by one level: an ingot shows the ore and the lower ingot, not the whole
 * chain to the bottom.
 */
export function craftTree(root: CraftItem, lookup: CraftLookup, matDepth: boolean): CraftTree {
  let nodes = 0;
  let collapsedMats = 0;
  let truncated = false;

  function branch(id: string, count: number, depth: number, insideMat: boolean, key: string): CraftNode {
    nodes += 1;
    const item = lookup(id);
    const mat = item?.type === 'material';
    const needs = item?.needs ?? [];
    const node: CraftNode = { key, id, count, collapsed: false, children: [] };
    if (needs.length === 0) return node;
    if (mat && !matDepth) {
      node.collapsed = true;
      collapsedMats += 1;
      return node;
    }
    if (mat && insideMat) return node;
    if (depth + 1 >= CRAFT_MAX_DEPTH || nodes >= CRAFT_MAX_NODES) {
      truncated = true;
      return node;
    }
    needs.forEach((need, index) => {
      if (nodes >= CRAFT_MAX_NODES) {
        truncated = true;
        return;
      }
      node.children.push(branch(need.id, needCount(need), depth + 1, insideMat || mat, `${key}.${index}`));
    });
    return node;
  }

  const branches = root.needs.map((need, index) => branch(need.id, needCount(need), 0, false, String(index)));
  return { branches, collapsedMats, truncated };
}

/**
 * How many of each item the whole craft takes, multiplied down the tree, with
 * materials opened the same way `craftTree` opens them. Most first; ties by id
 * (the page re-sorts ties by name in the reader's language).
 */
export function craftMaterials(root: CraftItem, lookup: CraftLookup, matDepth: boolean): { id: string; count: number }[] {
  const total = new Map<string, number>();
  let steps = 0;

  function walk(id: string, count: number, insideMat: boolean): void {
    if (steps++ > CRAFT_MAX_NODES * 4) return;
    total.set(id, (total.get(id) ?? 0) + count);
    const item = lookup(id);
    if (item === undefined || item.needs.length === 0) return;
    const mat = item.type === 'material';
    if (mat && (!matDepth || insideMat)) return;
    for (const need of item.needs) walk(need.id, count * needCount(need), insideMat || mat);
  }

  for (const need of root.needs) walk(need.id, needCount(need), false);
  return [...total.entries()]
    .filter(([id]) => id !== root.id && lookup(id) !== undefined)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One essence a dismantle returns, priced. */
export interface EssenceYield {
  id: string;
  /** Copies for one item at reforge 0. */
  count: number;
  /** Percent; 100 when guaranteed. */
  chance: number;
  /** Expected gold: count × chance × the essence's price. */
  value: number;
}

export interface CraftEconomy {
  /** The components at their game prices. */
  compValue: number;
  /** Components the table names but does not define (`item_M041` …). */
  unknown: number;
  /** `GetSellPrice` = `ItemCost × 0.5`. */
  sellValue: number;
  /** The components sold instead. */
  compSell: number;
  essences: EssenceYield[];
  essenceValue: number;
  /** Selling the crafted item beats selling its components. */
  profSell: boolean;
  /** Dismantling it beats selling its components. */
  profDis: boolean;
}

/**
 * Sell or dismantle: what the crafted item fetches against what its
 * components would. Dismantle yields are the server's own rule
 * (`ItemFull.dismantle`); `essencePrice` prices one essence.
 */
export function craftEconomy(item: CraftItem, lookup: CraftLookup, essencePrice: (id: string) => number): CraftEconomy {
  let compValue = 0;
  let unknown = 0;
  for (const need of item.needs) {
    const part = lookup(need.id);
    if (part === undefined) unknown += 1;
    else compValue += part.cost * needCount(need);
  }
  const essences: EssenceYield[] = (item.dismantle?.outputs ?? []).map((out) => {
    const count = out.count ?? 1;
    const chance = out.chance ?? 100;
    return { id: out.id, count, chance, value: count * (chance / 100) * essencePrice(out.id) };
  });
  const essenceValue = essences.reduce((sum, e) => sum + e.value, 0);
  const sellValue = item.cost * 0.5;
  const compSell = compValue * 0.5;
  return {
    compValue,
    unknown,
    sellValue,
    compSell,
    essences,
    essenceValue,
    profSell: unknown === 0 && sellValue > compSell,
    profDis: unknown === 0 && essenceValue > compSell,
  };
}

/** Where an item drops: a room and the copies expected per full clear. */
export interface DropSource {
  room: string;
  avg: number;
}

/**
 * Item -> every room it drops in, with the expected copies per full clear at
 * `difficulty`: `locFarm` for every room, inverted.
 *
 * The partner wiki counted only the ordinary pool; this goes through
 * `poolFor`, so on hard the hard-only rows count too.
 */
export function dropSourceIndex(
  monsters: readonly Monster[],
  locations: LocationsFile,
  difficulty: Difficulty | undefined,
): Map<string, DropSource[]> {
  const rooms = new Set<string>();
  for (const m of monsters) for (const room of m.locations) if (isShownRoom(room)) rooms.add(room);
  const index = new Map<string, DropSource[]>();
  for (const room of [...rooms].sort()) {
    for (const [id, rec] of locFarm(monsters, locations, room, difficulty).items) {
      if (rec.avg <= 0) continue;
      let list = index.get(id);
      if (list === undefined) index.set(id, (list = []));
      list.push({ room, avg: rec.avg });
    }
  }
  return index;
}

/**
 * The rooms `id` drops in, most per clear first. With `maxLevel`, rooms above
 * that level are left out — the reader is looking for where to farm at the
 * item's own level. `roomLevel` returns undefined for a room it does not know,
 * which is then skipped.
 */
export function itemDropRooms(
  index: ReadonlyMap<string, readonly DropSource[]>,
  id: string,
  roomLevel: (room: string) => number | undefined,
  maxLevel: number | null,
): DropSource[] {
  const per = new Map<string, number>();
  for (const s of index.get(id) ?? []) {
    const level = roomLevel(s.room);
    if (level === undefined) continue;
    if (maxLevel !== null && level > maxLevel) continue;
    per.set(s.room, (per.get(s.room) ?? 0) + s.avg);
  }
  return [...per.entries()]
    .map(([room, avg]) => ({ room, avg }))
    .sort((a, b) => b.avg - a.avg || (a.room < b.room ? -1 : 1));
}

export interface CraftFarm {
  /** Rooms by the sum, over the components, of copies per clear ÷ copies needed. */
  rooms: { room: string; score: number; items: string[] }[];
  /** Components no allowed room drops but that can be crafted. */
  craftOnly: string[];
}

/**
 * Where to farm a craft's direct components: the partner wiki's `farmFor`.
 * A room's score adds, for each component it drops, the copies per clear
 * divided by the copies the craft needs — so a room that covers more of the
 * recipe, faster, ranks higher.
 */
export function craftFarm(
  item: CraftItem,
  index: ReadonlyMap<string, readonly DropSource[]>,
  lookup: CraftLookup,
  roomLevel: (room: string) => number | undefined,
  maxLevel: number | null,
): CraftFarm {
  const per = new Map<string, { room: string; score: number; items: string[] }>();
  const craftOnly: string[] = [];
  for (const need of item.needs) {
    const k = needCount(need);
    const rooms = itemDropRooms(index, need.id, roomLevel, maxLevel);
    if (rooms.length === 0) {
      if (isCraftable(lookup(need.id)) && !craftOnly.includes(need.id)) craftOnly.push(need.id);
      continue;
    }
    for (const s of rooms) {
      const rec = per.get(s.room) ?? { room: s.room, score: 0, items: [] };
      rec.score += s.avg / k;
      if (!rec.items.includes(need.id)) rec.items.push(need.id);
      per.set(s.room, rec);
    }
  }
  return {
    rooms: [...per.values()].sort((a, b) => b.score - a.score || (a.room < b.room ? -1 : 1)),
    craftOnly,
  };
}

/** What a craft page's facts are built from. */
export interface CraftFactsInput {
  name: string;
  level: number;
  /** The game's name for the quality (`ak_quality_<n>`), when it has one. */
  qualityName: string | undefined;
  components: number;
  /** Craft cost at game prices — no exchange prices, which only the reader's browser has. */
  craftCost: number | null;
  /** What unlocks the craft, by name; null when nothing has to. */
  unlock: { kind: 'talent' | 'recipe'; name: string } | null;
}

/**
 * A craft page's name, facts line and description: the page's `<head>` and
 * the server's card, one sentence for both.
 */
export function craftPageFacts(input: CraftFactsInput, lang: CraftLang): { name: string; facts: string; description: string } {
  const n = (value: number) => new Intl.NumberFormat(CRAFT_LOCALE[lang], { maximumFractionDigits: 0 }).format(value);
  const s = CRAFT_FACTS[lang];
  const bits: string[] = [];
  if (input.level > 0) bits.push(s.level(input.level));
  if (input.qualityName !== undefined && input.qualityName !== '') bits.push(input.qualityName);
  bits.push(s.components(input.components));
  if (input.craftCost !== null) bits.push(s.cost(n(Math.round(input.craftCost))));
  const unlock =
    input.unlock === null ? s.free : input.unlock.kind === 'talent' ? s.talent(input.unlock.name) : s.recipe(input.unlock.name);
  return { name: input.name, facts: bits.join(' · '), description: s.sentence(input.name, input.components, unlock) };
}

type CraftLang = 'en' | 'ru' | 'zh';

const CRAFT_LOCALE: Record<CraftLang, string> = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };

interface CraftFactsStrings {
  level: (level: number) => string;
  components: (count: number) => string;
  cost: (amount: string) => string;
  free: string;
  talent: (name: string) => string;
  recipe: (name: string) => string;
  sentence: (name: string, components: number, unlock: string) => string;
}

function ruForm(n: number, one: string, few: string, many: string): string {
  const rule = new Intl.PluralRules('ru-RU').select(n);
  return rule === 'one' ? one : rule === 'few' ? few : many;
}

const CRAFT_FACTS: Record<CraftLang, CraftFactsStrings> = {
  en: {
    level: (level) => `Lv. ${level}`,
    components: (count) => `${count} ${count === 1 ? 'component' : 'components'}`,
    cost: (amount) => `craft ${amount} gold`,
    free: 'no recipe needed',
    talent: (name) => `unlocked by the talent ${name}`,
    recipe: (name) => `unlocked by ${name}`,
    sentence: (name, count, unlock) =>
      `How to craft ${name} in Age of Weapons 5: the full tree of its ${count} ${count === 1 ? 'component' : 'components'} (${unlock}), what it costs, and where to farm it.`,
  },
  ru: {
    level: (level) => `ур. ${level}`,
    components: (count) => `${count} ${ruForm(count, 'составляющая', 'составляющие', 'составляющих')}`,
    cost: (amount) => `крафт ${amount} зол.`,
    free: 'формула не нужна',
    talent: (name) => `открывается талантом «${name}»`,
    recipe: (name) => `открывается предметом «${name}»`,
    sentence: (name, count, unlock) =>
      `Как скрафтить «${name}» в Age of Weapons 5: полное дерево из ${count} ${ruForm(count, 'составляющей', 'составляющих', 'составляющих')} (${unlock}), сколько стоит и где фармить.`,
  },
  zh: {
    level: (level) => `${level}级`,
    components: (count) => `${count} 种材料`,
    cost: (amount) => `制作 ${amount} 金币`,
    free: '无需图纸',
    talent: (name) => `由天赋「${name}」解锁`,
    recipe: (name) => `由「${name}」解锁`,
    sentence: (name, count, unlock) => `Age of Weapons 5「${name}」制作方法：${count} 种材料的完整制作树（${unlock}）、花费与刷取地点。`,
  },
};
