import type { CoreData } from 'aow5-shared/data';
import {
  dropChance,
  monsterInSeason,
  monsterTypeGroup,
  monsterTypeRank,
  poolFor,
  spawnsOf,
  totalWeight,
  type Difficulty,
  type DifficultyKey,
  type Hunter,
  type LocationsFile,
  type Monster,
  type MonstersFile,
  type MonstersLocale,
  type MonsterTypeGroup,
  type PoolEntry,
} from 'aow5-shared/wiki';

/**
 * The monsters section's data, joined once per load: the S2 view of every
 * listed unit, the rooms they live in, who comes as a hunter where, and the
 * filters' arithmetic.
 *
 * JSX-free so the page and its pieces share it without a cycle, and so every
 * expensive walk is a plain function the page can memoise by its inputs.
 */

/** A room as this section shows it. The level is the one players see (`MapInfo.tier`). */
export interface Room {
  code: string;
  name: string;
  level: number;
  dlc: boolean;
  gold: number;
  bosses: readonly string[];
}

export interface HunterAt {
  code: string;
  hunter: Hunter;
}

export interface Model {
  monsters: Monster[];
  byId: Map<string, Monster>;
  names: Record<string, string>;
  difficulties: Difficulty[];
  difficultyNames: MonstersLocale['difficulties'];
  rooms: Map<string, Room>;
  /** Rooms some listed unit lives in, lowest level first: the location select. */
  roomOptions: Room[];
  hunters: Map<string, HunterAt[]>;
  /** Rooms with an overview image and bounds, in id order. */
  mapped: string[];
  locations: LocationsFile;
  groups: MonstersFile['groups'];
  ruleset: string;
  built: string;
}

export function buildModel(file: MonstersFile, locale: MonstersLocale, locations: LocationsFile, core: CoreData, lang: string): Model {
  const rooms = new Map<string, Room>();
  for (const map of core.maps.maps) {
    rooms.set(map.id, { code: map.id, name: map.name, level: map.tier, dlc: map.isDlc, gold: map.gold, bosses: map.bosses });
  }
  const levelOf = (code: string) => rooms.get(code)?.level ?? 99;

  // The season's view, listed units only, rooms lowest first — so a unit's
  // "own" room (the one a per-location average is counted in) is its easiest.
  const monsters = file.monsters
    .map((m) => monsterInSeason(m))
    .filter((m) => monsterTypeGroup(m.type) !== undefined)
    .map((m) => ({ ...m, locations: [...m.locations].sort((a, b) => levelOf(a) - levelOf(b) || (a < b ? -1 : 1)) }));

  const names = locale.names;
  const collator = new Intl.Collator(lang);
  const roomOptions = [...rooms.values()]
    .filter((room) => monsters.some((m) => m.locations.includes(room.code)))
    .sort((a, b) => a.level - b.level || collator.compare(a.name, b.name));

  const hunters = new Map<string, HunterAt[]>();
  for (const [code, loc] of Object.entries(locations.locations)) {
    for (const hunter of loc.hunters) {
      const list = hunters.get(hunter.id) ?? [];
      list.push({ code, hunter });
      hunters.set(hunter.id, list);
    }
  }

  const mapped = Object.values(locations.locations)
    .filter((loc) => loc.overview !== undefined && loc.bounds !== null)
    .map((loc) => loc.id)
    .sort();

  return {
    monsters,
    byId: new Map(monsters.map((m) => [m.id, m])),
    names,
    difficulties: file.difficulties,
    difficultyNames: locale.difficulties,
    rooms,
    roomOptions,
    hunters,
    mapped,
    locations,
    groups: file.groups,
    ruleset: file.ruleset,
    built: file.generatedAt,
  };
}

export const nameOf = (model: Model, id: string): string => model.names[id] ?? id;

/** The lowest level of a unit's rooms, for the "by location" sort. */
export function roomLevel(model: Model, m: Monster): number {
  const levels = m.locations.map((code) => model.rooms.get(code)?.level).filter((l): l is number => l !== undefined);
  return levels.length > 0 ? Math.min(...levels) : 99;
}

// --- pools under the current toggles ------------------------------------------

export interface Pools {
  /** The ordinary pool at the difficulty, recipes dropped when asked. */
  ordinary: Map<string, PoolEntry[]>;
  /** The first-kill pool, recipes dropped when asked. */
  first: Map<string, PoolEntry[]>;
  /** What the filters work on: `first` in guaranteed mode, else `ordinary`. */
  active: Map<string, PoolEntry[]>;
}

export function buildPools(
  model: Model,
  diff: DifficultyKey,
  noRecipes: boolean,
  guaranteed: boolean,
  isRecipe: (id: string) => boolean,
): Pools {
  const ordinary = new Map<string, PoolEntry[]>();
  const first = new Map<string, PoolEntry[]>();
  for (const m of model.monsters) {
    ordinary.set(m.id, poolFor(m, diff, { noRecipes, isRecipe }));
    first.set(m.id, noRecipes ? m.poolFirst.filter(([id]) => !isRecipe(id)) : m.poolFirst);
  }
  return { ordinary, first, active: guaranteed ? first : ordinary };
}

// --- the left list -------------------------------------------------------------

export type SortKey = 'level' | 'name' | 'location' | 'drops';

export interface Filters {
  q: string;
  loc: string;
  type: MonsterTypeGroup | '';
  guaranteed: boolean;
}

/**
 * The units the left-hand filters let through, before the item filter — the
 * middle column's items are built from this, so picking an item never drops
 * itself out of the list it was picked from.
 */
export function baseMonsters(model: Model, pools: Pools, f: Filters): Monster[] {
  const q = f.q.trim().toLowerCase();
  return model.monsters.filter((m) => {
    if (f.loc !== '' && !m.locations.includes(f.loc)) return false;
    if (f.type !== '' && monsterTypeGroup(m.type) !== f.type) return false;
    if (f.guaranteed && (pools.first.get(m.id)?.length ?? 0) === 0) return false;
    if (q !== '' && !(nameOf(model, m.id).toLowerCase().includes(q) || m.id.includes(q))) return false;
    return true;
  });
}

/** AND: every picked item is in the unit's pool; OR: at least one is. */
export function matchesItems(pool: readonly PoolEntry[], picked: readonly string[], mode: 'and' | 'or'): boolean {
  if (picked.length === 0) return true;
  const ids = new Set(pool.map(([id]) => id));
  return mode === 'and' ? picked.every((id) => ids.has(id)) : picked.some((id) => ids.has(id));
}

/** The type is always the first key — boss → mini-boss → elite → normal → container — then the chosen sort. */
export function sortMonsters(model: Model, pools: Pools, list: Monster[], sort: SortKey, compare: (a: string, b: string) => number): Monster[] {
  const name = (m: Monster) => nameOf(model, m.id);
  const by: Record<SortKey, (a: Monster, b: Monster) => number> = {
    level: (a, b) => (a.level ?? 0) - (b.level ?? 0) || compare(name(a), name(b)),
    name: (a, b) => compare(name(a), name(b)),
    location: (a, b) => roomLevel(model, a) - roomLevel(model, b) || compare(name(a), name(b)),
    drops: (a, b) => (pools.ordinary.get(b.id)?.length ?? 0) - (pools.ordinary.get(a.id)?.length ?? 0),
  };
  return [...list].sort((a, b) => monsterTypeRank(a.type) - monsterTypeRank(b.type) || by[sort](a, b));
}

// --- the middle list -------------------------------------------------------------

/** Item -> how many of `monsters` have it in their active pool. */
export function itemSources(monsters: readonly Monster[], pools: Pools): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of monsters) {
    for (const [id] of pools.active.get(m.id) ?? []) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Per-kill chance of every row of the unit's ordinary pool at the difficulty. */
export function chancesOf(m: Monster, pool: readonly PoolEntry[], difficulty: Difficulty | undefined): Map<string, number> {
  const total = totalWeight(pool);
  const out = new Map<string, number>();
  for (const [id, weight] of pool) out.set(id, (out.get(id) ?? 0) + dropChance(m, weight, total, difficulty));
  return out;
}

/** The rooms of a unit that the map data places it in. */
export function spawnRooms(model: Model, m: Monster): string[] {
  return m.locations.filter((code) => spawnsOf(model.locations, m.id, code).length > 0);
}

/**
 * Averages under 0.01 read as `<0.01`, not `0.00` — after a rebalance souls
 * drop so rarely that rounding turned them into zeros. Ten and over get one
 * decimal, the rest two.
 */
export function qty(value: number, format: (value: number, digits: number) => string): string {
  if (value > 0 && value < 0.01) return `<${format(0.01, 2)}`;
  return value >= 10 ? format(value, 1) : format(value, 2);
}
