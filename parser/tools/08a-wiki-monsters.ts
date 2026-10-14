import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { Vpk } from './lib/vpk.ts';
import { extractPublishData } from './lib/publishData.ts';
import { readRulesetTable } from './lib/ruleset.ts';
import { scriptText } from './lib/hudScript.ts';
import { readEntityLump, type Kv3Value, type MapEntity } from './lib/kv3bin.ts';
import { decodeVtex, encodePng, readVtexInfo } from './lib/vtex.ts';
import { hasHan } from './lib/han.ts';
import { writeJson } from './lib/writeJson.ts';
import { check, exitIfFailed, fail, info, ok, step, warn } from './lib/log.ts';
import type {
  Bounds,
  Difficulty,
  DifficultyKey,
  Hunter,
  Location,
  LocationsFile,
  Minigame,
  MinigameReward,
  MinigamesFile,
  MinigamesLocale,
  MinigameText,
  Monster,
  MonsterGroup,
  MonsterSeasonPatch,
  MonsterSource,
  MonstersFile,
  MonstersLocale,
  PoolEntry,
  RulesetId,
  SpawnPoint,
} from '../../packages/aow5-shared/src/wiki/monsters.ts';

/**
 * Step 08a — the wiki's monsters, their rooms' spawn maps, and the minigames.
 *
 * Emits, under `public/data/wiki/`:
 *
 *   monsters.json     every unit with loot: stats, drop rate and count, the
 *                     ordinary / hard-mode / first-kill pools, guard groups,
 *                     and the difficulty table
 *   locations.json    per room: the map's bounds, its overview image, every
 *                     spawn point and every hunter tracker
 *   minigames.json    the minigames' stage rewards and units
 *   locale.<lang>.monsters.json / locale.<lang>.minigames.json
 *
 * and the minimap overviews to `public/icons/maps/overview/<room>.png`.
 *
 * Sources, all plain surface files:
 *
 *   - `vendor/data/rulesets/<s>/ak_monster`, `ak_breakable`,
 *     `ak_room_difficulty_modes` — full per-season copies (see 08d's note);
 *     S2 is primary, and a field S1 or S3 sets differently goes to `bySeason`.
 *     **Not** `scripts/npc/seasons/s2/ak_monster.txt`: that KV file holds one
 *     row (monster_10000 at ten times its health) that no ruleset copy agrees
 *     with, and the client's codex reads the ruleset — so does this.
 *   - `vendor/data/ak_tree`, `ak_monster_groups`, `ak_rooms`,
 *     `ak_mini_game_rewards` — not seasonal.
 *   - the compiled maps. Each room is a nested `maps/<map>.vpk`; its
 *     `entities/default_ents.vents_c` is binary KeyValues3 (read by
 *     `lib/kv3bin.ts`), and the level designers name every placement
 *     `"[PR#]<room>,<Kind>,<unit>"` with the spawn rules as entity
 *     attributes. Which map is which room is the HUD's own minimap table in
 *     `hud/script.vjs_c`.
 *   - locale tokens from step 03's cache.
 *
 * Fails loudly when a table, a map or a token naming scheme is not the shape
 * this was written against.
 */

ensureDirs();
const cfg = loadConfig();
step('08a · wiki: monsters, locations, minigames');

const OUT = path.join(DIRS.publicData, 'wiki');
const OVERVIEW_DIR = path.join(DIRS.publicIcons, 'maps', 'overview');
const MAP_CACHE = path.join(DIRS.cache, 'maps');
const DATA = 'panorama/layout/custom_game/vendor/data';
const RULESETS: RulesetId[] = ['s1', 's2', 's3'];
const PRIMARY: RulesetId = 's2';

const vpk = Vpk.open(cfg.vpkPath);

type Row = Record<string, unknown>;
type Table = Record<string, Row>;

function baseTable(table: string): Table {
  const p = `${DATA}/${table}.vjs_c`;
  return extractPublishData(vpk.readPath(p), `@/json/${table}.json`, p) as Table;
}

function seasonTable(ruleset: RulesetId, table: string): Table {
  const p = `${DATA}/rulesets/${ruleset}/${table}.vjs_c`;
  return readRulesetTable(vpk.readPath(p), table, p) as Table;
}

// --- coercion ---------------------------------------------------------------

const asArray = (v: unknown): string[] => {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
};

const num = (v: unknown, label: string): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) {
    fail(`${label}: not a number: ${JSON.stringify(v)}`);
    return 0;
  }
  return n;
};

const optNum = (v: unknown, label: string): number | undefined =>
  v === undefined || v === null || v === '' ? undefined : num(v, label);

/**
 * Pool rows that carry no weight. A handful of `first_drop`s are a bare id
 * (`item_P000`); the test copy of the table writes the same rows as
 * `item_P000:1`, but the published one does not, and a default is not ours
 * to pick. They are left out of the pool and listed in the run's output.
 */
const unweighted = new Set<string>();

/** `["id:12", "id2:3.5"]` -> tuples, in table order. */
function parseWeighted(v: unknown, label: string): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const entry of asArray(v)) {
    const colon = entry.lastIndexOf(':');
    if (colon <= 0) {
      // Labels start with the ruleset; the same row in three seasons is one finding.
      unweighted.add(`${label.replace(/^s\d\//, '')} ${entry}`);
      continue;
    }
    out.push([entry.slice(0, colon).trim(), num(entry.slice(colon + 1), `${label} ${entry}`)]);
  }
  return out;
}

// === monsters ================================================================

const rooms = baseTable('ak_rooms');
const roomIds = new Set(Object.keys(rooms));
check(roomIds.size > 0 && 'M001' in rooms, `ak_rooms has ${roomIds.size} rooms`);

/** Rooms that list a unit as a boss — a boss row sometimes has no `Appear` (M021's). */
const bossOf = new Map<string, string[]>();
for (const [room, row] of Object.entries(rooms)) {
  for (const boss of asArray(row['Bosses'])) bossOf.set(boss, [...(bossOf.get(boss) ?? []), room]);
}

const season: Record<RulesetId, { monster: Table; breakable: Table; difficulty: Table }> = {} as never;
for (const r of RULESETS) {
  season[r] = {
    monster: seasonTable(r, 'ak_monster'),
    breakable: seasonTable(r, 'ak_breakable'),
    difficulty: seasonTable(r, 'ak_room_difficulty_modes'),
  };
}
const trees = baseTable('ak_tree');
const groupsTable = baseTable('ak_monster_groups');

for (const r of RULESETS) {
  for (const t of ['monster', 'breakable'] as const) {
    const a = Object.keys(season[PRIMARY][t]).sort().join();
    const b = Object.keys(season[r][t]).sort().join();
    check(a === b, `${r} ak_${t === 'monster' ? 'monster' : 'breakable'} has the same rows as ${PRIMARY}`);
  }
}

/** The stat columns, table name -> emitted name. Only present columns are emitted. */
const STATS: [string, keyof Monster][] = [
  ['Exp', 'exp'],
  ['Gold', 'gold'],
  ['Custom_StatusHealth', 'hp'],
  ['Custom_StatusMana', 'mana'],
  ['Custom_AttackDamage', 'damage'],
  ['Custom_ArmorPhysical', 'armor'],
  ['Custom_MagicResistance', 'magicResist'],
  ['Custom_MovementSpeed', 'moveSpeed'],
  ['Custom_AttackRange', 'attackRange'],
  ['Custom_AttackRate', 'attackRate'],
  ['Custom_AttackSpeed', 'attackSpeed'],
  ['Custom_StatusHealthRegen', 'healthRegen'],
  ['Custom_StatusManaRegen', 'manaRegen'],
  ['Custom_StunResistance', 'stunResist'],
  ['Custom_DebuffResistance', 'debuffResist'],
  ['Custom_AttackCritChance', 'critChance'],
];

/** Fields a season can move, in the order they are compared. */
const SEASONAL: (keyof MonsterSeasonPatch)[] = ['dropRatePct', 'dropMin', 'dropMax', 'pool', 'poolHard', 'poolFirst', 'locations'];

function buildMonster(id: string, row: Row, source: MonsterSource, label: string): Monster {
  const appear = asArray(row['Appear']);
  const locations = [...new Set([...appear.filter((a) => roomIds.has(a)), ...(bossOf.get(id) ?? [])])].sort();
  const other = appear.filter((a) => !roomIds.has(a));

  // The codex types every breakable `destructible` itself (most rows carry it,
  // the treasure chests do not); anything else must say what it is.
  const type = String(row['UnitType'] ?? (source === 'ak_breakable' ? 'destructible' : ''));
  if (type === '') fail(`${label}: no UnitType`);

  const m: Monster = {
    id,
    source,
    type,
    locations,
    consideredHero: Number(row['ConsideredHero'] ?? 0) === 1,
    dropRatePct: num(row['DropRate'] ?? 0, `${label} DropRate`),
    dropMin: num(row['DropMin'] ?? 0, `${label} DropMin`),
    dropMax: num(row['DropMax'] ?? 0, `${label} DropMax`),
    pool: parseWeighted(row['DropPoolId'], `${label} DropPoolId`),
    poolHard: parseWeighted(row['DiffDropPool'], `${label} DiffDropPool`),
    poolFirst: parseWeighted(row['first_drop'], `${label} first_drop`),
  };
  const level = optNum(row['Level'], `${label} Level`);
  if (level !== undefined) m.level = level;
  if (other.length > 0) m.appearOther = other;
  for (const [col, key] of STATS) {
    // A destructible's only stat is its health: the codex shows none for
    // them, and the attack columns on a crate are template filler.
    if (source === 'ak_breakable' && key !== 'hp') continue;
    const v = optNum(row[col], `${label} ${col}`);
    if (v !== undefined) (m as unknown as Record<string, number>)[key] = v;
  }
  const groups = asArray(row['MonsterGroups']);
  if (groups.length > 0) m.groups = groups;
  return m;
}

const monsters: Monster[] = [];
for (const [table, source] of [
  ['monster', 'ak_monster'],
  ['breakable', 'ak_breakable'],
] as const) {
  for (const [id, row] of Object.entries(season[PRIMARY][table])) {
    const m = buildMonster(id, row, source, `${PRIMARY}/${source}/${id}`);
    for (const r of RULESETS) {
      if (r === PRIMARY) continue;
      const other = buildMonster(id, season[r][table][id]!, source, `${r}/${source}/${id}`);
      const patch: MonsterSeasonPatch = {};
      for (const key of SEASONAL) {
        if (JSON.stringify(other[key]) !== JSON.stringify(m[key])) (patch as Record<string, unknown>)[key] = other[key];
      }
      if (Object.keys(patch).length > 0) (m.bySeason ??= {})[r] = patch;
    }
    monsters.push(m);
  }
}
for (const [id, row] of Object.entries(trees)) monsters.push(buildMonster(id, row, 'ak_tree', `ak_tree/${id}`));

const dupes = monsters.map((m) => m.id).filter((id, i, all) => all.indexOf(id) !== i);
check(dupes.length === 0, `unit ids are unique across ak_monster, ak_breakable and ak_tree${dupes.length ? `: ${dupes.join(', ')}` : ''}`);
monsters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const unitIds = new Set(monsters.map((m) => m.id));

const groups: Record<string, MonsterGroup> = {};
for (const [id, row] of Object.entries(groupsTable)) {
  const members = parseWeighted(row['Monsters'], `ak_monster_groups/${id}`);
  for (const [mid] of members) if (!unitIds.has(mid)) fail(`group ${id} names unknown unit ${mid}`);
  groups[id] = { id, monsters: members, note: String(row['dec'] ?? '') };
}
for (const m of monsters) for (const g of m.groups ?? []) if (!(g in groups)) fail(`${m.id} names unknown group ${g}`);

// Item ids are checked against the builder's index, softly: the addon's pools
// reference ids it never shipped (`item_392`, `P015`), and those are its bugs.
{
  const index = JSON.parse(fs.readFileSync(path.join(DIRS.publicData, 'items.index.json'), 'utf8')) as { rows: unknown[][] };
  const known = new Set(index.rows.map((r) => String(r[1])));
  const unknown = new Set<string>();
  for (const m of monsters) for (const [id] of [...m.pool, ...m.poolHard, ...m.poolFirst]) if (!known.has(id)) unknown.add(id);
  if (unknown.size > 0) warn(`${unknown.size} pool item id(s) not in items.index.json: ${[...unknown].sort().join(', ')}`);
}
if (unweighted.size > 0) warn(`${unweighted.size} pool row(s) without a weight, left out: ${[...unweighted].join('; ')}`);

const DIFFICULTY_ORDER: DifficultyKey[] = ['easy', 'normal', 'hard'];
const difficulties: Difficulty[] = DIFFICULTY_ORDER.map((key) => {
  const row = season[PRIMARY].difficulty[key];
  if (row === undefined) {
    fail(`ak_room_difficulty_modes has no ${key}`);
    return { key, dropCountBonusPct: 0, difficultyBonusPct: 0 };
  }
  const d: Difficulty = {
    key,
    dropCountBonusPct: num(row['DropCountBonusPct'], `difficulty ${key}`),
    difficultyBonusPct: num(row['DifficultyBonusPct'], `difficulty ${key}`),
  };
  for (const r of RULESETS) {
    const o = season[r].difficulty[key];
    if (r === PRIMARY || o === undefined) continue;
    const patch: { dropCountBonusPct?: number; difficultyBonusPct?: number } = {};
    const dc = num(o['DropCountBonusPct'], `${r} difficulty ${key}`);
    const db = num(o['DifficultyBonusPct'], `${r} difficulty ${key}`);
    if (dc !== d.dropCountBonusPct) patch.dropCountBonusPct = dc;
    if (db !== d.difficultyBonusPct) patch.difficultyBonusPct = db;
    if (Object.keys(patch).length > 0) (d.bySeason ??= {})[r] = patch;
  }
  return d;
});
check(Object.keys(season[PRIMARY].difficulty).length === 3, 'exactly three difficulties');

{
  const byType: Record<string, number> = {};
  for (const m of monsters) byType[m.type] = (byType[m.type] ?? 0) + 1;
  info(`types: ${Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  const seasonal = monsters.filter((m) => m.bySeason);
  info(`${seasonal.length} unit(s) differ by season: ${RULESETS.map((r) => `${r} ${seasonal.filter((m) => m.bySeason?.[r]).length}`).join(', ')}`);
}
ok(`${monsters.length} units, ${Object.keys(groups).length} guard groups`);

// === locations ===============================================================

/**
 * The HUD's minimap table — `map_1:{roomId:"M001",mapName:"map_1",…}` — is
 * the game's own answer to which compiled map a room is. Read out of the
 * minified bundle by shape, like step 04d does.
 */
const hud = scriptText(vpk.readPath(cfg.hudScriptPath));
const roomMaps = new Map<string, string[]>();
for (const match of hud.matchAll(/[\w"-]+:\{roomId:"(\w+)",mapName:"([\w-]+)"/g)) {
  const [, room, map] = match as unknown as [string, string, string];
  if (!/^[MG]\d{3}$/.test(room)) continue; // the hubs' entries name a variable, not a room
  const list = roomMaps.get(room) ?? [];
  if (!list.includes(map)) list.push(map);
  roomMaps.set(room, list);
}
check(roomMaps.size >= 10 && roomMaps.has('M001'), `HUD minimap table names ${roomMaps.size} rooms`);

/** The map a room is filed under: `map_<n>` for `M00n` when listed, else the first. */
function primaryMap(room: string, maps: string[]): string {
  const want = `map_${Number(room.slice(1))}`;
  return maps.includes(want) ? want : maps[0]!;
}

fs.mkdirSync(MAP_CACHE, { recursive: true });
/** The nested map pak goes to disk because `Vpk` reads by path, and is removed once read. */
function mapEntities(map: string): MapEntity[] | null {
  const entry = vpk.get(`maps/${map}.vpk`);
  if (!entry) return null;
  const file = path.join(MAP_CACHE, `${map}.vpk`);
  fs.writeFileSync(file, vpk.read(entry));
  const inner = Vpk.open(file);
  try {
    const lump = inner.get(`maps/${map}/entities/default_ents.vents_c`);
    if (!lump) return null;
    return readEntityLump(inner.read(lump));
  } finally {
    inner.close();
    fs.unlinkSync(file);
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const attrNum = (a: Record<string, Kv3Value>, key: string): number | null => {
  const v = a[key];
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Kinds that place a unit. Every other kind (Door, Teleport, Rune, Trap, …) is scenery. */
const SPAWN_KINDS = new Set(['Boss', 'Monster', 'SpawnPoint', 'Breakable', 'ResourcePoint', 'ChestNPC']);
const breakables = season[PRIMARY].breakable;
/** `dest_1` for `dest_1_0` … `dest_1_6`. */
const breakableFamilies = new Set(Object.keys(breakables).map((b) => b.replace(/_\d+$/, '')));

function bounds(world: Record<string, Kv3Value> | undefined): Bounds | null {
  const min = String(world?.['_dotatilegrid_fogbounds_min'] ?? '').split(/\s+/).map(Number);
  const max = String(world?.['_dotatilegrid_fogbounds_max'] ?? '').split(/\s+/).map(Number);
  if (min.length < 2 || max.length < 2 || [...min, ...max].some((n) => !Number.isFinite(n))) return null;
  return { minX: min[0]!, minY: min[1]!, maxX: max[0]!, maxY: max[1]! };
}

const locations: Record<string, Location> = {};
const unknownKinds = new Set<string>();
let rarityPoints = 0;
/** Breakable families placed with no `Rarity`: which variant spawns is the server's default, so they are not placed. */
const noRarity: string[] = [];

for (const [room, maps] of [...roomMaps.entries()].sort()) {
  const map = primaryMap(room, maps);
  const ents = mapEntities(map);
  if (ents === null) {
    fail(`${room}: maps/${map}.vpk or its entity lump is missing`);
    continue;
  }
  const spawns: Record<string, SpawnPoint[]> = {};
  const hunters: Hunter[] = [];
  const add = (id: string, p: SpawnPoint): void => {
    (spawns[id] ??= []).push(p);
  };

  for (const e of ents) {
    const name = String(e.values['targetname'] ?? '');
    if (!name.startsWith('[PR#]')) continue;
    const [prefix, kind, target] = name.slice(5).split(',');
    if (prefix !== room || kind === undefined || target === undefined) continue;
    const origin = e.values['origin'];
    if (!Array.isArray(origin) || origin.length < 2) {
      fail(`${room} ${name}: no origin`);
      continue;
    }
    const x = round1(Number(origin[0]));
    const y = round1(Number(origin[1]));
    const a = e.attributes;

    if (kind === 'HunterTracker') {
      const other: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(a)) {
        if (!['RandomProbability', 'MinCount', 'MaxCount', 'StartDelay'].includes(k)) other[k] = typeof v === 'number' ? v : String(v);
      }
      const h: Hunter = {
        id: target,
        x,
        y,
        waveChance: attrNum(a, 'RandomProbability'),
        minCount: attrNum(a, 'MinCount'),
        maxCount: attrNum(a, 'MaxCount'),
        startDelay: attrNum(a, 'StartDelay'),
      };
      if (Object.keys(other).length > 0) h.other = other;
      if (!unitIds.has(target)) fail(`${room}: hunter of unknown unit ${target}`);
      hunters.push(h);
      continue;
    }
    if (!SPAWN_KINDS.has(kind)) {
      if (unitIds.has(target)) unknownKinds.add(kind);
      continue;
    }

    const chance = attrNum(a, 'Probability') ?? 100;
    const count = attrNum(a, 'count') ?? 1;
    const rarity = attrNum(a, 'Rarity');

    if (unitIds.has(target)) {
      add(target, { x, y, chance, count, kind });
      continue;
    }
    /*
     * A breakable family: `dest_1` with `Rarity: r` is one of the variants
     * `dest_1_<r-1>` … `dest_1_<r+1>` that exist. See `SpawnPoint.via` for
     * where the rule comes from.
     */
    if (kind === 'Breakable' && rarity !== null) {
      const variants = [rarity - 1, rarity, rarity + 1].map((r) => `${target}_${r}`).filter((v) => v in breakables);
      if (variants.length === 0) {
        fail(`${room}: breakable family ${target} rarity ${rarity} has no variants`);
        continue;
      }
      for (const v of variants) add(v, { x, y, chance: round2(chance / variants.length), count, kind, via: 'rarity' });
      rarityPoints++;
      continue;
    }
    if (kind === 'Breakable' && breakableFamilies.has(target)) {
      noRarity.push(`${room} ${target} @${x},${y}`);
      continue;
    }
    fail(`${room}: ${kind} names unknown unit ${target}`);
  }

  const world = ents.find((e) => e.values['classname'] === 'worldspawn')?.values;
  const loc: Location = { id: room, map, bounds: bounds(world), spawns, hunters };
  const alternates = maps.filter((m) => m !== map);
  if (alternates.length > 0) loc.alternates = alternates;
  if (Object.keys(spawns).length > 0 && loc.bounds === null) fail(`${room}: ${map} has spawns but no fog bounds`);
  locations[room] = loc;
}
/*
 * A unit the map places is in that room even when its row has no `Appear` —
 * the room trees have none, and room_tree_002 stands in M001. Only the
 * primary season's `locations` are extended: placement is not seasonal.
 */
{
  let added = 0;
  for (const l of Object.values(locations)) {
    for (const id of Object.keys(l.spawns)) {
      const m = monsters.find((x) => x.id === id)!;
      if (!m.locations.includes(l.id)) {
        m.locations = [...m.locations, l.id].sort();
        added++;
      }
    }
  }
  info(`${added} unit-room pair(s) known only from map placement`);
}
if (unknownKinds.size > 0) warn(`entity kinds that name a unit but are not read as spawns: ${[...unknownKinds].join(', ')}`);
info(`${rarityPoints} breakable-family point(s) expanded by rarity`);
if (noRarity.length > 0) warn(`${noRarity.length} breakable-family point(s) with no Rarity, not placed: ${noRarity.join('; ')}`);
for (const loc of Object.values(locations)) {
  const points = Object.values(loc.spawns).reduce((s, l) => s + l.length, 0);
  info(`  ${loc.id}  ${loc.map}${loc.alternates ? ` (+${loc.alternates.join(', ')})` : ''}  ${Object.keys(loc.spawns).length} units, ${points} points, ${loc.hunters.length} hunter(s)`);
}
check(
  Object.values(locations).filter((l) => Object.keys(l.spawns).length > 0).length >= 14,
  'at least the fourteen playable rooms have spawn points',
);

// --- overviews ----------------------------------------------------------------

/*
 * The minimap's overview art, `panorama/images/custom_game/maps/<map>_png`.
 * Most are plain DXT5 — not the YCoCg the portal art is, which turns these
 * purple — and two (`map_10`, `map_12`) are format 18, a PNG file carried
 * whole inside the resource. Both keep their alpha: the HUD draws them over
 * a dark panel.
 */
fs.mkdirSync(OVERVIEW_DIR, { recursive: true });
{
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const written = new Set<string>();
  for (const loc of Object.values(locations)) {
    if (Object.keys(loc.spawns).length === 0) continue;
    const entry = vpk.get(`${cfg.mapImageDir}/${loc.map}_png.vtex_c`);
    if (!entry) {
      warn(`${loc.id}: no overview image for ${loc.map}`);
      continue;
    }
    const buf = vpk.read(entry);
    const vt = readVtexInfo(buf);
    let png: Buffer | null = null;
    if (vt?.format === 18) {
      const at = buf.indexOf(PNG, vt.dataOffset);
      if (at >= 0) png = buf.subarray(at);
    } else {
      const decoded = decodeVtex(buf, { ycocg: false });
      if (decoded.ok) png = encodePng(decoded.image);
      else fail(`${loc.id}: overview ${loc.map}: ${decoded.reason}`);
    }
    if (png === null) {
      fail(`${loc.id}: overview ${loc.map} could not be read`);
      continue;
    }
    const file = `${loc.id}.png`;
    fs.writeFileSync(path.join(OVERVIEW_DIR, file), png);
    loc.overview = file;
    written.add(file);
  }
  for (const file of fs.readdirSync(OVERVIEW_DIR)) {
    if (file.endsWith('.png') && !written.has(file)) {
      fs.unlinkSync(path.join(OVERVIEW_DIR, file));
      warn(`removed orphaned overview ${file}`);
    }
  }
  ok(`${written.size} overview image(s)`);
}

// === minigames ===============================================================

const tokens: Record<string, Record<string, string>> = {};
for (const lang of cfg.languages) {
  const file = path.join(DIRS.cache, `tokens.${lang}.json`);
  if (!fs.existsSync(file)) {
    fail(`missing cache/tokens.${lang}.json; run 03-parse-locales first`);
    continue;
  }
  tokens[lang] = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
}
exitIfFailed();

const rewardsTable = baseTable('ak_mini_game_rewards');
const gameIds = new Set<string>();
for (const row of Object.values(rewardsTable)) gameIds.add(String(row['mini_game_id']));
// Games without rewards (MG001) are known only by their text tokens.
for (const key of Object.keys(tokens[cfg.baseLanguage] ?? tokens['en'] ?? {})) {
  const m = /^(?:hud_mg|hud_task_tracker_mg|milestone_prompt_mg)(\d{3})_/.exec(key);
  if (m) gameIds.add(`MG${m[1]}`);
}

const games: Minigame[] = [...gameIds].sort().map((id) => {
  const stages = new Map<number, MinigameReward>();
  for (const row of Object.values(rewardsTable)) {
    if (row['mini_game_id'] !== id) continue;
    const stage = num(row['stage'], `${id} stage`);
    const r = stages.get(stage) ?? { stage, threshold: num(row['threshold_ratio'], `${id} threshold`) };
    const type = String(row['reward_type']);
    if (type === 'gold') {
      if (row['reward_formula'] !== undefined) r.goldFormula = String(row['reward_formula']);
      else r.gold = num(row['reward_amount'], `${id} gold`);
    } else if (type === 'daily_luck') {
      r.luck = num(row['reward_amount'], `${id} luck`);
    } else {
      fail(`${id}: unknown reward_type ${type}`);
    }
    stages.set(stage, r);
  }
  return {
    id,
    rewards: [...stages.values()].sort((a, b) => a.stage - b.stage),
    monsters: monsters.filter((m) => m.appearOther?.includes(id)).map((m) => m.id),
  };
});
check(games.length >= 5, `${games.length} minigames (${games.map((g) => g.id).join(', ')})`);

const plain = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

function minigameText(t: Record<string, string>, id: string): MinigameText {
  const n = id.slice(2); // "001"
  const guide = `hud_mg${n}_guide_`;
  const task = `hud_mg${n}_task_`;
  const tracker = `hud_task_tracker_mg${n}_`;
  const victory = `milestone_prompt_mg${n}_victory`;
  const out: MinigameText = { variants: {}, goals: {}, hud: {}, victory: [] };

  const archetype = t[`${guide}archetype`];
  const title = t[`${tracker}title`] ?? t[`${task}title`];
  // "Minigame Rules · Maze": the name is what follows the dot.
  const dot = archetype?.lastIndexOf('·') ?? -1;
  const name = archetype !== undefined && dot >= 0 ? archetype.slice(dot + 1).trim() : title;
  if (name !== undefined) out.name = plain(name);
  if (t[`${tracker}title`] !== undefined) out.task = plain(t[`${tracker}title`]!);
  if (t[`${guide}display_name`] !== undefined) out.instructor = plain(t[`${guide}display_name`]!);
  if (t[`${guide}description`] !== undefined) out.rules = plain(t[`${guide}description`]!);

  for (const [key, value] of Object.entries(t)) {
    if (key.startsWith(`${guide}description_`)) out.variants[key.slice(`${guide}description_`.length)] = plain(value);
    else if (key.startsWith(task) && key !== `${task}title`) out.goals[key.slice(task.length)] = plain(value);
    else if (key.startsWith(tracker) && key !== `${tracker}title`) out.hud[key.slice(tracker.length)] = plain(value);
  }
  // Title, then name, then status — the order the banner shows them.
  for (const suffix of ['_title', '', '_name', '_status']) {
    const v = t[`${victory}${suffix}`];
    if (v !== undefined && !out.victory.includes(plain(v))) out.victory.push(plain(v));
  }
  return out;
}

// === locale ==================================================================

/*
 * The codex's own type filter (`illustrated_小怪` "Normal Monster", …) maps
 * these unit types; `monster_head`/`monster_leader` share the miniboss label
 * there but no row uses them. Breakables are the codex's "destructible".
 */
const TYPE_TOKENS: Record<string, string> = {
  monster_normal: 'illustrated_小怪',
  monster_elite: 'illustrated_精英',
  monster_miniboss: 'illustrated_头目',
  destructible: 'illustrated_破坏物',
};
const DIFFICULTY_TOKENS: Record<DifficultyKey, string> = {
  easy: 'room_selection_简单',
  normal: 'room_selection_普通',
  hard: 'room_selection_困难',
};

const coverage: string[] = [];
for (const lang of Object.keys(tokens)) {
  const t = tokens[lang]!;
  const names: Record<string, string> = {};
  for (const m of monsters) {
    // Tokens are case-insensitive in the engine; two chests are keyed `npc_treasure_m007`.
    const v = t[m.id] ?? t[m.id.toLowerCase()];
    if (v !== undefined && v.trim() !== '') names[m.id] = v.trim();
  }
  const types: Record<string, string> = {};
  for (const [type, token] of Object.entries(TYPE_TOKENS)) {
    if (t[token] !== undefined) types[type] = t[token]!;
    else fail(`${lang}: missing ${token}`);
  }
  const diffs: Partial<Record<DifficultyKey, string>> = {};
  for (const [key, token] of Object.entries(DIFFICULTY_TOKENS) as [DifficultyKey, string][]) {
    if (t[token] !== undefined) diffs[key] = t[token]!;
    else fail(`${lang}: missing ${token}`);
  }
  const monsterLocale: MonstersLocale = { schema: 1, lang, names, types, difficulties: diffs };

  const gameText: Record<string, MinigameText> = {};
  for (const g of games) gameText[g.id] = minigameText(t, g.id);
  const minigameLocale: MinigamesLocale = { schema: 1, lang, games: gameText };

  writeJson(path.join(OUT, `locale.${lang}.monsters.json`), monsterLocale);
  writeJson(path.join(OUT, `locale.${lang}.minigames.json`), minigameLocale);

  const han = lang === cfg.baseLanguage ? 0 : Object.values(names).filter((v) => hasHan(v)).length;
  const unnamedGames = games.filter((g) => gameText[g.id]?.name === undefined).length;
  coverage.push(
    `${lang}: ${Object.keys(names).length}/${monsters.length} unit names` +
      (han > 0 ? ` (${han} still Chinese)` : '') +
      `, ${games.length - unnamedGames}/${games.length} minigame names`,
  );
}
for (const line of coverage) info(line);

// === write ===================================================================

const generatedAt = new Date().toISOString();
const monstersFile: MonstersFile = { schema: 1, generatedAt, ruleset: PRIMARY, monsters, groups, difficulties };
const locationsFile: LocationsFile = { schema: 1, generatedAt, locations };
const minigamesFile: MinigamesFile = { schema: 1, generatedAt, games };

writeJson(path.join(OUT, 'monsters.json'), monstersFile);
writeJson(path.join(OUT, 'locations.json'), locationsFile);
writeJson(path.join(OUT, 'minigames.json'), minigamesFile);
for (const f of ['monsters.json', 'locations.json', 'minigames.json']) {
  info(`wrote wiki/${f} (${Math.round(fs.statSync(path.join(OUT, f)).size / 1024)} kB)`);
}

vpk.close();
exitIfFailed();
