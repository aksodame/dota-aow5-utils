/**
 * Monsters, the rooms they live in, and the farming arithmetic over both —
 * `wiki/monsters.json`, `wiki/locations.json`, `wiki/minigames.json` and their
 * `locale.<lang>.monsters.json` / `locale.<lang>.minigames.json`.
 *
 * Where the numbers come from (all plain surface files of the workshop pak;
 * nothing encrypted is read):
 *
 *   - a monster's stats and drops: the season's `rulesets/<s>/ak_monster` and
 *     `ak_breakable` tables, plus `ak_tree` for the room "trees" that summon
 *     guard groups (`ak_monster_groups`);
 *   - difficulties: `rulesets/<s>/ak_room_difficulty_modes`;
 *   - spawn points and hunters: the compiled maps themselves — every room is a
 *     nested `maps/map_<n>.vpk` whose entity lump names each placement
 *     `"<room>,<Kind>,<unit>"` and carries the designer's `Probability`,
 *     `count`, `Rarity`, … as entity attributes;
 *   - which map is which room: the HUD's own minimap table.
 *
 * Primary values are the S2 ruleset's. A season whose copy of a row differs
 * carries the differing fields under `bySeason`; `monsterInSeason` applies
 * them.
 *
 * The farm maths (`dropCount` … `locFarm`) is a port of the partner wiki's
 * `farm.js`, so a number shown here and there agrees for the same inputs.
 */

import { PRIMARY_RULESET, type PoolEntry, type RulesetId } from './pools.ts';

export type { PoolEntry, RulesetId } from './pools.ts';

// --- monsters.json ------------------------------------------------------------

/**
 * The addon's own `UnitType`, verbatim. The ones a reader meets are
 * `monster_normal`, `monster_elite`, `monster_miniboss`, `monster_boss`,
 * `building` (towers and room "trees"), `destructible` (crates, chests — every
 * `ak_breakable` row), `summoned` (boss adds) and `monster_trap`.
 */
export type UnitType = string;

/** Which table a row was read from. */
export type MonsterSource = 'ak_monster' | 'ak_breakable' | 'ak_tree';

/** The fields a season may change. Only the ones that differ are present. */
export interface MonsterSeasonPatch {
  dropRatePct?: number;
  dropMin?: number;
  dropMax?: number;
  pool?: PoolEntry[];
  poolHard?: PoolEntry[];
  poolFirst?: PoolEntry[];
  locations?: string[];
}

/**
 * One unit that can be killed or broken for loot.
 *
 * Stats are optional because the tables are: a crate has health and nothing
 * else, a tree has no attack rate. An absent stat is "the table does not say",
 * never zero.
 */
export interface Monster {
  id: string;
  source: MonsterSource;
  type: UnitType;
  /** `Level`; absent on the room trees, which have none. */
  level?: number;
  /**
   * Rooms the unit appears in: the table's `Appear`, plus any room whose
   * `Bosses` names it. Empty for a unit placed nowhere (summons, unused rows).
   */
  locations: string[];
  /** `Appear` values that are not rooms — a minigame id such as `MG003`. */
  appearOther?: string[];
  exp?: number;
  gold?: number;
  hp?: number;
  mana?: number;
  damage?: number;
  armor?: number;
  magicResist?: number;
  moveSpeed?: number;
  attackRange?: number;
  /** Seconds between attacks (`Custom_AttackRate`). */
  attackRate?: number;
  attackSpeed?: number;
  healthRegen?: number;
  manaRegen?: number;
  stunResist?: number;
  debuffResist?: number;
  critChance?: number;
  consideredHero: boolean;
  /** Chance in percent that a kill drops anything at all (`DropRate`). */
  dropRatePct: number;
  /** How many draws a drop makes, before the difficulty's bonus. See `dropCount`. */
  dropMin: number;
  dropMax: number;
  /** `DropPoolId`: the ordinary pool, `[itemId, weight]`. */
  pool: PoolEntry[];
  /** `DiffDropPool`: added to `pool` on hard difficulty. See `poolFor`. */
  poolHard: PoolEntry[];
  /** `first_drop`: the first-kill pool. */
  poolFirst: PoolEntry[];
  /** A room tree's guard groups (`MonsterGroups`), keys of `MonstersFile.groups`. */
  groups?: string[];
  bySeason?: Partial<Record<RulesetId, MonsterSeasonPatch>>;
}

/** One guard group a room tree can summon: `[monsterId, weight]` rows. */
export interface MonsterGroup {
  id: string;
  monsters: [monsterId: string, weight: number][];
  /** The designer's own label (`di_tu1`, pinyin for "map 1"). Not localised by the game. */
  note: string;
}

export type DifficultyKey = 'easy' | 'normal' | 'hard';

/** One room difficulty (`ak_room_difficulty_modes`). */
export interface Difficulty {
  key: DifficultyKey;
  /** Percent added to the cap of a drop's draw count. See `dropCount`. */
  dropCountBonusPct: number;
  /** Percent added to monster strength. */
  difficultyBonusPct: number;
  bySeason?: Partial<Record<RulesetId, { dropCountBonusPct?: number; difficultyBonusPct?: number }>>;
}

/** `wiki/monsters.json`. */
export interface MonstersFile {
  schema: 1;
  generatedAt: string;
  ruleset: RulesetId;
  /** Sorted by id. */
  monsters: Monster[];
  groups: Record<string, MonsterGroup>;
  /** In the game's own selection order: easy, normal, hard. */
  difficulties: Difficulty[];
}

/**
 * `wiki/locale.<lang>.monsters.json`. Room names are not here — they are in
 * the builder's `locale.<lang>.maps.json` already. Item names are in
 * `locale.<lang>.names.json`.
 */
export interface MonstersLocale {
  schema: 1;
  lang: string;
  /** Unit id -> name. A unit the game never names is absent; show the id. */
  names: Record<string, string>;
  /**
   * `UnitType` -> the label the game's codex filters by. Only the types the
   * codex names are present (`monster_boss` is labelled with the literal
   * "boss" in the game itself, so it has none).
   */
  types: Record<string, string>;
  difficulties: Partial<Record<DifficultyKey, string>>;
}

// --- locations.json -----------------------------------------------------------

/** How a unit came to be at a spawn point: the entity's kind in the map. */
export type SpawnKind = 'Boss' | 'Monster' | 'SpawnPoint' | 'Breakable' | 'ResourcePoint' | 'ChestNPC' | string;

/** One place a unit can appear, in world units (the map's own coordinates). */
export interface SpawnPoint {
  x: number;
  y: number;
  /** Percent chance the point is populated at all on a run. */
  chance: number;
  /** Copies spawned when it is. */
  count: number;
  kind: SpawnKind;
  /**
   * `'rarity'`: the map placed a *family* of breakables (`dest_1` with
   * `Rarity: 2`), and this is one member's share of it. **The rule is not in
   * the pak** — it lives in the encrypted server code. It is the partner
   * wiki's documented rule (one of the variants `rarity-1 … rarity+1` that
   * exist, uniformly), and it reproduces all 2,500 of their such points.
   */
  via?: 'rarity';
}

/**
 * A hunter tracker: a point that periodically sends a wave of `id` after the
 * player. Only the attributes the map sets are known; `null` means the map
 * leaves it to the server's default, which is in encrypted code.
 */
export interface Hunter {
  id: string;
  x: number;
  y: number;
  /** `RandomProbability`: percent chance a wave comes. */
  waveChance: number | null;
  minCount: number | null;
  maxCount: number | null;
  /** `StartDelay`, seconds. */
  startDelay: number | null;
  /**
   * Attributes the map sets that are not read above, verbatim. Notably
   * `StartDlay`, a misspelling several rooms carry — the server reads
   * `StartDelay`, so those rooms get the default delay.
   */
  other?: Record<string, number | string>;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** One room's map. */
export interface Location {
  /** Room id (`M001`). */
  id: string;
  /** The compiled map read (`map_1`). */
  map: string;
  /** Other maps the HUD also files under this room (`map_1_s2`), not read. */
  alternates?: string[];
  /** World rectangle the map picture covers (the map's fog bounds). */
  bounds: Bounds | null;
  /**
   * The room's map, under `icons/maps/overview/` — the wiki author's
   * in-game screenshot, covering exactly `bounds`. Absent for a room that
   * has none.
   */
  overview?: string;
  /** Unit id -> every point it can appear at. */
  spawns: Record<string, SpawnPoint[]>;
  hunters: Hunter[];
}

/** `wiki/locations.json`. */
export interface LocationsFile {
  schema: 1;
  generatedAt: string;
  locations: Record<string, Location>;
}

// --- minigames.json -----------------------------------------------------------

export interface MinigameReward {
  stage: number;
  /** Share of the game's score needed for the stage, `0..1`. */
  threshold: number;
  gold?: number;
  /** A formula the server evaluates, e.g. `hero_level_squared*15`. */
  goldFormula?: string;
  luck?: number;
}

export interface Minigame {
  id: string;
  rewards: MinigameReward[];
  /** Units whose `Appear` is this game. */
  monsters: string[];
}

/** `wiki/minigames.json`. */
export interface MinigamesFile {
  schema: 1;
  generatedAt: string;
  games: Minigame[];
}

/** One minigame's text, every field as the game ships it (tags stripped). */
export interface MinigameText {
  /** The short name, from the rules card's "Minigame Rules · <name>" or the tracker title. */
  name?: string;
  /** The task tracker's title. */
  task?: string;
  instructor?: string;
  rules?: string;
  /** Rule-card variants, by the game's key (`facing`, `running`, …). */
  variants: Record<string, string>;
  /** Per-round goals, by key. */
  goals: Record<string, string>;
  /** Task tracker lines, by key. */
  hud: Record<string, string>;
  /** Victory banner lines. */
  victory: string[];
}

/** `wiki/locale.<lang>.minigames.json`. */
export interface MinigamesLocale {
  schema: 1;
  lang: string;
  games: Record<string, MinigameText>;
}

// --- season -------------------------------------------------------------------

/** The monster as one season sees it. */
export function monsterInSeason(m: Monster, ruleset: RulesetId = PRIMARY_RULESET): Monster {
  const patch = m.bySeason?.[ruleset];
  return patch === undefined ? m : { ...m, ...patch };
}

// --- farm maths (port of the partner's farm.js) -------------------------------

/** Every point `unitId` can appear at in `room`. Empty when the room has no map data. */
export function spawnsOf(locations: LocationsFile, unitId: string, room: string): SpawnPoint[] {
  return locations.locations[room]?.spawns[unitId] ?? [];
}

/**
 * Copies of a unit expected per visit: the sum of `count × chance` over its
 * points. A unit with no points (a room without map data) counts as one.
 */
export function spawnWeight(points: readonly SpawnPoint[]): number {
  if (points.length === 0) return 1;
  let sum = 0;
  for (const p of points) sum += p.count * (p.chance / 100);
  return sum;
}

export function totalWeight(pool: readonly PoolEntry[]): number {
  let total = 0;
  for (const [, weight] of pool) total += weight;
  return total;
}

export interface PoolOptions {
  /**
   * Drop recipe items from the pool. A recipe drops once and then leaves the
   * pool, so a returning player's real pool is the one without them — and the
   * other items' shares grow accordingly.
   */
  noRecipes?: boolean;
  /** Tells a recipe item. Required when `noRecipes` is set. */
  isRecipe?: (itemId: string) => boolean;
}

/**
 * The pool a kill draws from at a difficulty. On hard the `poolHard` rows are
 * merged in — the server's `MergeDropSpecs`, which adds the weights of an item
 * present in both.
 */
export function poolFor(m: Monster, difficulty: DifficultyKey, options: PoolOptions = {}): PoolEntry[] {
  let pool: PoolEntry[];
  if (difficulty !== 'hard' || m.poolHard.length === 0) {
    pool = m.pool;
  } else {
    const acc = new Map<string, number>();
    for (const [id, w] of m.pool) acc.set(id, (acc.get(id) ?? 0) + w);
    for (const [id, w] of m.poolHard) acc.set(id, (acc.get(id) ?? 0) + w);
    pool = [...acc.entries()];
  }
  if (options.noRecipes) {
    const isRecipe = options.isRecipe;
    if (isRecipe === undefined) throw new Error('poolFor: noRecipes needs isRecipe');
    pool = pool.filter(([id]) => !isRecipe(id));
  }
  return pool;
}

/** How many draws one drop makes: uniformly `lo … cap`, `avg` being their mean. */
export interface DropCount {
  lo: number;
  cap: number;
  avg: number;
}

/**
 * The server's `resolveSourceDropCount`: `lo = floor(DropMin)`,
 * `hi = floor(DropMax)`, `cap = ceil(hi × (1 + bonus/100))`, then a uniform
 * integer in `lo … cap`.
 */
export function dropCount(m: Pick<Monster, 'dropMin' | 'dropMax'>, difficulty: Difficulty | undefined): DropCount {
  const mult = Math.max(0, 1 + (difficulty?.dropCountBonusPct ?? 0) / 100);
  const lo = Math.max(0, Math.floor(m.dropMin));
  const hi = Math.max(lo, Math.floor(m.dropMax));
  const cap = Math.max(lo, Math.ceil(hi * mult));
  return { lo, cap, avg: (lo + cap) / 2 };
}

/**
 * Chance one kill yields at least one of an item with `weight` in a pool
 * totalling `total`: the drop happens at `dropRatePct`, then each of the
 * (average) draws picks independently — `1 − (1 − share)^draws`.
 */
export function dropChance(
  m: Pick<Monster, 'dropRatePct' | 'dropMin' | 'dropMax'>,
  weight: number,
  total: number,
  difficulty: Difficulty | undefined,
): number {
  if (!total) return 0;
  const rate = m.dropRatePct / 100;
  return rate * (1 - Math.pow(1 - weight / total, dropCount(m, difficulty).avg));
}

/** Expected copies of an item per kill: rate × draws × share. */
export function dropAvg(
  m: Pick<Monster, 'dropRatePct' | 'dropMin' | 'dropMax'>,
  weight: number,
  total: number,
  difficulty: Difficulty | undefined,
): number {
  if (!total) return 0;
  const rate = m.dropRatePct / 100;
  return rate * dropCount(m, difficulty).avg * (weight / total);
}

export interface FarmItem {
  id: string;
  /** Expected copies per full clear. */
  avg: number;
  /** The best single-kill chance among the units that drop it. */
  chance: number;
  /** Expected kills of units that can drop it. */
  kills: number;
}

export interface LocationFarm {
  room: string;
  /** Expected gold from kills per full clear. */
  gold: number;
  items: Map<string, FarmItem>;
}

/**
 * What a full clear of `room` yields: gold, and for each item the expected
 * count. Every unit listed in the room (`Monster.locations`) is killed as many
 * times as `spawnWeight` expects; a unit the map does not place counts once.
 */
export function locFarm(
  monsters: readonly Monster[],
  locations: LocationsFile,
  room: string,
  difficulty: Difficulty | undefined,
  options: PoolOptions = {},
): LocationFarm {
  const items = new Map<string, FarmItem>();
  const key = difficulty?.key ?? 'normal';
  let gold = 0;
  for (const m of monsters) {
    if (!m.locations.includes(room)) continue;
    const kills = spawnWeight(spawnsOf(locations, m.id, room));
    if (!kills) continue;
    gold += (m.gold ?? 0) * kills;
    const pool = poolFor(m, key, options);
    const total = totalWeight(pool);
    for (const [id, weight] of pool) {
      const rec = items.get(id) ?? { id, avg: 0, chance: 0, kills: 0 };
      rec.avg += dropAvg(m, weight, total, difficulty) * kills;
      rec.chance = Math.max(rec.chance, dropChance(m, weight, total, difficulty));
      rec.kills += kills;
      items.set(id, rec);
    }
  }
  return { room, gold, items };
}

// --- the section's list, its badges and its drop tables ------------------------

/**
 * The five groups the section files a unit under, strongest first.
 *
 * The partner wiki's own grouping: towers and room trees (`building`) sit with
 * the elites — it was asked for, there is no button of their own — and every
 * breakable is a "container".
 */
export type MonsterTypeGroup = 'boss' | 'miniboss' | 'elite' | 'normal' | 'container';

export const MONSTER_TYPE_GROUPS: readonly MonsterTypeGroup[] = ['boss', 'miniboss', 'elite', 'normal', 'container'];

const GROUP_OF_TYPE: Record<string, MonsterTypeGroup> = {
  monster_boss: 'boss',
  monster_miniboss: 'miniboss',
  monster_elite: 'elite',
  building: 'elite',
  monster_normal: 'normal',
  destructible: 'container',
};

/**
 * The group a unit is listed under, or `undefined` for one the section does
 * not list: boss adds (`summoned`) and traps (`monster_trap`), which are in the
 * tables but are never something a player goes out to kill for loot — the
 * partner's list never had them.
 */
export function monsterTypeGroup(type: UnitType): MonsterTypeGroup | undefined {
  return GROUP_OF_TYPE[type];
}

/** Position in the list: boss → mini-boss → elite → normal → container, then anything else. */
export function monsterTypeRank(type: UnitType): number {
  const group = monsterTypeGroup(type);
  return group === undefined ? 99 : MONSTER_TYPE_GROUPS.indexOf(group);
}

/**
 * A unit's points grouped by spawn chance, most likely first — the "6×50%" of
 * a spawn line: how many copies appear at that chance, and from how many
 * points.
 */
export function monsterSpawnGroups(points: readonly SpawnPoint[]): { chance: number; count: number; points: number }[] {
  const groups = new Map<number, { chance: number; count: number; points: number }>();
  for (const p of points) {
    const rec = groups.get(p.chance) ?? { chance: p.chance, count: 0, points: 0 };
    rec.count += p.count;
    rec.points += 1;
    groups.set(p.chance, rec);
  }
  return [...groups.values()].sort((a, b) => b.chance - a.chance);
}

/**
 * Expected copies of each item if every spawn of this one unit in a room is
 * killed: the per-kill average × `spawnWeight`. Only this unit — the room's
 * other units are not in it.
 */
export function monsterRoomAverages(
  m: Monster,
  points: readonly SpawnPoint[],
  difficulty: Difficulty | undefined,
  options: PoolOptions = {},
): Map<string, number> {
  const out = new Map<string, number>();
  const kills = spawnWeight(points);
  const pool = poolFor(m, difficulty?.key ?? 'normal', options);
  const total = totalWeight(pool);
  for (const [id, weight] of pool) out.set(id, (out.get(id) ?? 0) + dropAvg(m, weight, total, difficulty) * kills);
  return out;
}

/** One item of a room's loot table. */
export interface RoomLootItem {
  id: string;
  /** The best single-kill chance among the room's units. */
  best: number;
  /**
   * Chance a full clear yields at least one: `1 − Π (1 − chance)^kills` over
   * every unit that drops it, `kills` being that unit's `spawnWeight`.
   */
  clear: number;
  /** Expected copies per full clear. */
  avg: number;
  /** Expected kills of the units that drop it. */
  kills: number;
  /** Who drops it and at what single-kill chance, best first. */
  from: { monster: string; chance: number }[];
}

/**
 * A room's whole loot table from the ordinary pools — the guaranteed first
 * drop is not in it — best single-kill chance first. The partner's "loot of
 * the location"; `locFarm` is the same walk without the per-unit breakdown.
 */
export function roomLoot(
  monsters: readonly Monster[],
  locations: LocationsFile,
  room: string,
  difficulty: Difficulty | undefined,
  options: PoolOptions = {},
): RoomLootItem[] {
  const items = new Map<string, RoomLootItem & { miss: number }>();
  const key = difficulty?.key ?? 'normal';
  for (const m of monsters) {
    if (!m.locations.includes(room)) continue;
    const kills = spawnWeight(spawnsOf(locations, m.id, room));
    const pool = poolFor(m, key, options);
    const total = totalWeight(pool);
    for (const [id, weight] of pool) {
      const chance = dropChance(m, weight, total, difficulty);
      let rec = items.get(id);
      if (rec === undefined) {
        rec = { id, best: 0, clear: 0, avg: 0, kills: 0, from: [], miss: 1 };
        items.set(id, rec);
      }
      rec.best = Math.max(rec.best, chance);
      rec.miss *= Math.pow(1 - chance, kills);
      rec.avg += dropAvg(m, weight, total, difficulty) * kills;
      rec.kills += kills;
      rec.from.push({ monster: m.id, chance });
    }
  }
  return [...items.values()]
    .map(({ miss, ...rec }) => ({ ...rec, clear: 1 - miss, from: rec.from.sort((a, b) => b.chance - a.chance) }))
    .sort((a, b) => b.best - a.best || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The items most likely to drop from any of `monsters` in one kill, best
 * first — the icons on a monster's or a room's card.
 */
export function topMonsterDrops(monsters: readonly Monster[], difficulty: Difficulty | undefined, limit: number): string[] {
  const best = new Map<string, number>();
  const key = difficulty?.key ?? 'normal';
  for (const m of monsters) {
    const pool = poolFor(m, key);
    const total = totalWeight(pool);
    for (const [id, weight] of pool) {
      const chance = dropChance(m, weight, total, difficulty);
      if (chance > (best.get(id) ?? 0)) best.set(id, chance);
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([id]) => id);
}

// --- the sentence a page says about itself ------------------------------------

type MonsterLang = 'en' | 'ru' | 'zh';

/** The badge on a unit, per language. The partner's own words in Russian. */
export const MONSTER_TYPE_NAMES: Record<MonsterLang, Record<MonsterTypeGroup, string>> = {
  en: { boss: 'Boss', miniboss: 'Mini-boss', elite: 'Elite', normal: 'Normal', container: 'Container' },
  ru: { boss: 'Босс', miniboss: 'Мини-босс', elite: 'Элитный', normal: 'Обычный', container: 'Контейнер' },
  zh: { boss: 'BOSS', miniboss: '头目', elite: '精英', normal: '小怪', container: '可破坏物' },
};

/** What `monsterPageFacts` needs, already resolved to names in the reader's language. */
export interface MonsterFactsInput {
  name: string;
  type: UnitType;
  level?: number;
  /** Room names, lowest level first. */
  rooms: string[];
  /** Distinct items in the hard-difficulty pool. */
  drops: number;
}

/** What `locationPageFacts` needs. */
export interface LocationFactsInput {
  name: string;
  level: number;
  monsters: number;
  bosses: string[];
  /** Distinct items in the room's ordinary pools. */
  drops: number;
}

interface MonsterFactsStrings {
  level: (level: number) => string;
  monsters: (count: number) => string;
  monster: (name: string, kind: string, level: string, rooms: string, drops: number) => string;
  location: (name: string, level: number, monsters: number, bosses: string, drops: number) => string;
}

/** Russian's three plural forms, for the two sentences here. */
function ru3(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const MONSTER_FACTS: Record<MonsterLang, MonsterFactsStrings> = {
  en: {
    level: (level) => `Lv. ${level}`,
    monsters: (count) => `${count} ${count === 1 ? 'monster' : 'monsters'}`,
    monster: (name, kind, level, rooms, drops) =>
      `${name}, ${kind.toLowerCase()}${level === '' ? '' : ` (${level})`} in Age of Weapons 5${rooms === '' ? '' : `, found in ${rooms}`}: stats, spawns and the ${drops} ${drops === 1 ? 'item' : 'items'} it can drop, with chances per difficulty.`,
    location: (name, level, monsters, bosses, drops) =>
      `${name}, a level ${level} location in Age of Weapons 5: ${monsters} ${monsters === 1 ? 'monster' : 'monsters'}${bosses === '' ? '' : ` (bosses: ${bosses})`} and ${drops} ${drops === 1 ? 'item' : 'items'} in its loot, with the chance per full clear.`,
  },
  ru: {
    level: (level) => `ур. ${level}`,
    monsters: (count) => `${count} ${ru3(count, 'монстр', 'монстра', 'монстров')}`,
    monster: (name, kind, level, rooms, drops) =>
      `${name} — ${kind.toLowerCase()}${level === '' ? '' : ` (${level})`} в Age of Weapons 5${rooms === '' ? '' : `, локации: ${rooms}`}. Характеристики, спавны и ${drops} ${ru3(drops, 'предмет', 'предмета', 'предметов')} в дропе с шансами по сложностям.`,
    location: (name, level, monsters, bosses, drops) =>
      `${name} — локация ${level}-го уровня в Age of Weapons 5: ${monsters} ${ru3(monsters, 'монстр', 'монстра', 'монстров')}${bosses === '' ? '' : ` (боссы: ${bosses})`} и ${drops} ${ru3(drops, 'предмет', 'предмета', 'предметов')} в луте с шансом за зачистку.`,
  },
  zh: {
    level: (level) => `${level}级`,
    monsters: (count) => `${count} 种怪物`,
    monster: (name, kind, level, rooms, drops) =>
      `${name}：Age of Weapons 5 中的${kind}${level === '' ? '' : `（${level}）`}${rooms === '' ? '' : `，出现于${rooms}`}。属性、刷新点及 ${drops} 件掉落物品，附各难度的掉落几率。`,
    location: (name, level, monsters, bosses, drops) =>
      `${name}：Age of Weapons 5 中的 ${level} 级地图，共 ${monsters} 种怪物${bosses === '' ? '' : `（BOSS：${bosses}）`}，可掉落 ${drops} 件物品，附每次清图的掉落几率。`,
  },
};

const LIST_SEPARATOR: Record<MonsterLang, string> = { en: ', ', ru: ', ', zh: '、' };

/** A unit's page: its title, short facts and one-sentence description — the same in the tab and on the card. */
export function monsterPageFacts(input: MonsterFactsInput, lang: MonsterLang): { name: string; facts: string; description: string } {
  const s = MONSTER_FACTS[lang];
  const group = monsterTypeGroup(input.type);
  const kind = group === undefined ? input.type : MONSTER_TYPE_NAMES[lang][group];
  const level = input.level === undefined ? '' : s.level(input.level);
  const bits = [kind];
  if (level !== '') bits.push(level);
  if (input.rooms.length > 0) bits.push(input.rooms.join(LIST_SEPARATOR[lang]));
  return {
    name: input.name,
    facts: bits.join(' · '),
    description: s.monster(input.name, kind, level, input.rooms.join(LIST_SEPARATOR[lang]), input.drops),
  };
}

/** A room's loot page: its title, short facts and one-sentence description. */
export function locationPageFacts(input: LocationFactsInput, lang: MonsterLang): { name: string; facts: string; description: string } {
  const s = MONSTER_FACTS[lang];
  return {
    name: input.name,
    facts: [s.level(input.level), s.monsters(input.monsters)].join(' · '),
    description: s.location(input.name, input.level, input.monsters, input.bosses.join(LIST_SEPARATOR[lang]), input.drops),
  };
}

/**
 * Everything both page sentences need from the tables, so the browser and the
 * server cannot resolve them differently: the season's view of each unit, the
 * listed units only, room names and levels from the caller's own map table.
 */
export function monsterFactsInput(
  m: Monster,
  names: Record<string, string>,
  room: (code: string) => { name: string; level: number } | undefined,
): MonsterFactsInput {
  const rooms = m.locations
    .map((code) => room(code))
    .filter((r): r is { name: string; level: number } => r !== undefined)
    .sort((a, b) => a.level - b.level);
  const input: MonsterFactsInput = {
    name: names[m.id] ?? m.id,
    type: m.type,
    rooms: rooms.map((r) => r.name),
    drops: poolFor(m, 'hard').length,
  };
  if (m.level !== undefined) input.level = m.level;
  return input;
}

/** The same for a room: who lives there and how many distinct items its ordinary pools hold. */
export function locationFactsInput(
  monsters: readonly Monster[],
  code: string,
  names: Record<string, string>,
  room: { name: string; level: number; bosses: readonly string[] },
): LocationFactsInput {
  const here = monsters.filter((m) => m.locations.includes(code) && monsterTypeGroup(m.type) !== undefined);
  const items = new Set<string>();
  for (const m of here) for (const [id] of poolFor(m, 'hard')) items.add(id);
  return {
    name: room.name,
    level: room.level,
    monsters: here.length,
    bosses: room.bosses.filter((id) => here.some((m) => m.id === id)).map((id) => names[id] ?? id),
    drops: items.size,
  };
}
