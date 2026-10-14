import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { Vpk } from './lib/vpk.ts';
import { extractPublishData } from './lib/publishData.ts';
import { readRulesetManifest, readRulesetTable } from './lib/ruleset.ts';
import { parseRichText } from './lib/richtext.ts';
import { writeJson } from './lib/writeJson.ts';
import { check, checkSoft, exitIfFailed, fail, info, ok, step, warn } from './lib/log.ts';
import type { Pool, PoolBody, PoolEntry, PoolsFile, PoolsLocale, RulesetId, TreasureTier } from '../../packages/aow5-shared/src/wiki/pools.ts';
import type {
  ChestRef,
  ContainerInfo,
  ItemExtra,
  ItemSourceFile,
  ItemsExtraFile,
  ItemsExtraLocale,
  LifeSoulInfo,
  SeasonalPatch,
  SoulSkill,
  TowerChest,
  Wearable,
} from '../../packages/aow5-shared/src/wiki/items-extra.ts';
import type { CraftEntry, CraftFile, CraftUnlock } from '../../packages/aow5-shared/src/wiki/craft.ts';

/**
 * Step 08d — the wiki's item supplement, its pools and its craft unlocks.
 *
 * Emits, under `public/data/wiki/`:
 *
 *   pools.json        every `ak_drop_pools` and `ak_treasure_pool` row
 *   craft.json        what unlocks each craft: a recipe item or a talent node
 *   items-extra.json  per-item facts `items.full.json` does not carry, the
 *                     magic-tower chests, the Life Soul skills, the cosmetics,
 *                     and per-season patches to the item table
 *   locale.<lang>.pools.json / locale.<lang>.items-extra.json
 *
 * Everything is read straight from the VPK, not from step 02's cache, because
 * the season tree under `vendor/data/rulesets/` is the part that matters here
 * and step 02 only lifts one table out of it. Every ruleset file is a *full*
 * copy of its table (the manifest's `overriddenRows` says which rows moved), so
 * "the S2 value" is simply the row in `rulesets/s2/<table>.vjs_c`. The base
 * `vendor/data/<table>.vjs_c` is what `items.full.json` describes, and the
 * seasonal patches are the difference between the two.
 *
 * Three facts live in no table, only in code, and are read from **plain**
 * (unencrypted) Lua shipped in the pak. Each file is checked for the addon's
 * `XDecrypt` wrapper first; nothing encrypted is ever read:
 *
 *   - which pool a container opens, its chance and gold
 *     (`abilities/items/item_p300.lua`, `abilities/items/item_greed_cave_chests.lua`);
 *   - a soul skill's damage segments, aim, cast time and point range
 *     (`shared/player_boss_transform.lua`).
 */

ensureDirs();
const cfg = loadConfig();
step('08d · wiki: items-extra, pools, craft');

const OUT = path.join(DIRS.publicData, 'wiki');
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

/** Plain Lua, refusing anything wrapped in the addon's encryption. */
function plainLua(p: string): string {
  const text = vpk.readPath(p).toString('utf8');
  if (/XDecrypt/.test(text)) {
    fail(`${p} is encrypted (XDecrypt); this step only reads plain Lua`);
    exitIfFailed();
  }
  return text;
}

// --- coercion ---------------------------------------------------------------

const asArray = (v: unknown): string[] => {
  if (v === undefined || v === null || v === '') return [];
  // Empty elements occur (item_G106_3's gem_value has six) and mean nothing.
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

const optNum = (v: unknown, label: string): number | undefined => (v === undefined ? undefined : num(v, label));

/** `["id:12", "id2:3.5"]` -> tuples. A missing weight is a shape change, not a default. */
function parseWeighted(v: unknown, label: string): [string, number][] {
  const out: [string, number][] = [];
  for (const entry of asArray(v)) {
    const colon = entry.lastIndexOf(':');
    if (colon <= 0) {
      fail(`${label}: entry without a weight: ${entry}`);
      continue;
    }
    out.push([entry.slice(0, colon).trim(), num(entry.slice(colon + 1), `${label} ${entry}`)]);
  }
  return out;
}

/** `Needs`: a missing count means one, as step 04 reads it. */
function parseNeeds(v: unknown): [string, number][] {
  return asArray(v).map((entry) => {
    const colon = entry.lastIndexOf(':');
    if (colon <= 0) return [entry.trim(), 1];
    const count = Number(entry.slice(colon + 1));
    return [entry.slice(0, colon).trim(), Number.isFinite(count) && count > 0 ? count : 1];
  });
}

function parsePairs(v: unknown, label: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of parseWeighted(v, label)) out[k] = n;
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// --- the ruleset manifest ---------------------------------------------------

const manifest = readRulesetManifest(vpk.readPath(`${DATA}/rulesets/manifest.vjs_c`), 'rulesets/manifest.vjs_c');
const manifestIds = manifest.seasons.map((s) => s.id);
check(
  same([...manifestIds].sort(), RULESETS),
  `ruleset manifest names exactly ${RULESETS.join(', ')} (got ${manifestIds.join(', ')})`,
);

/**
 * A table in every ruleset, and the base copy. Every ruleset must carry every
 * base row: a season dropping a row would be a new kind of override this step
 * does not understand yet.
 */
function tableBySeason(table: string): { base: Table; seasons: Record<RulesetId, Table> } {
  const base = baseTable(table);
  const seasons = {} as Record<RulesetId, Table>;
  for (const r of RULESETS) {
    seasons[r] = seasonTable(r, table);
    const missing = Object.keys(base).filter((id) => !(id in seasons[r]));
    if (missing.length > 0) fail(`${table}: ruleset ${r} lacks ${missing.length} base row(s): ${missing.slice(0, 5).join(', ')}`);
  }
  return { base, seasons };
}

// === pools ==================================================================

const DROP_KEYS = new Set(['items', 'Level']);
const TREASURE_KEYS = new Set(['items', 'Level', 'base_weight', 'target', 'min_count', 'max_count', 'weight_curve']);

function poolBody(id: string, row: Row, kind: Pool['kind']): PoolBody {
  const allowed = kind === 'drop' ? DROP_KEYS : TREASURE_KEYS;
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) fail(`${kind} pool ${id}: unknown field ${key}`);
  }
  const entries: PoolEntry[] = parseWeighted(row['items'], `pool ${id}`);
  const body: PoolBody = { level: num(row['Level'], `pool ${id} Level`), entries };
  if (kind === 'treasure') {
    const tier: TreasureTier = { baseWeight: num(row['base_weight'], `pool ${id} base_weight`) };
    if (row['target'] !== undefined) tier.target = parseWeighted(row['target'], `pool ${id} target`);
    const minCount = optNum(row['min_count'], `pool ${id} min_count`);
    const maxCount = optNum(row['max_count'], `pool ${id} max_count`);
    const weightCurve = optNum(row['weight_curve'], `pool ${id} weight_curve`);
    if (minCount !== undefined) tier.minCount = minCount;
    if (maxCount !== undefined) tier.maxCount = maxCount;
    if (weightCurve !== undefined) tier.weightCurve = weightCurve;
    body.treasure = tier;
  }
  return body;
}

const pools: Record<string, Pool> = {};
const seasonalPoolCount: Record<string, number> = {};
for (const [table, kind] of [
  ['ak_drop_pools', 'drop'],
  ['ak_treasure_pool', 'treasure'],
] as const) {
  const { seasons } = tableBySeason(table);
  for (const [id, row] of Object.entries(seasons[PRIMARY])) {
    if (pools[id] !== undefined) fail(`pool id ${id} appears in two tables`);
    const primary = poolBody(id, row, kind);
    const pool: Pool = { id, kind, ...primary };
    for (const r of RULESETS) {
      if (r === PRIMARY) continue;
      const other = seasons[r][id];
      if (other === undefined) {
        fail(`${table} ${id}: absent from ruleset ${r}`);
        continue;
      }
      const body = poolBody(id, other, kind);
      if (!same(body, primary)) {
        pool.bySeason ??= {};
        pool.bySeason[r] = body;
        seasonalPoolCount[r] = (seasonalPoolCount[r] ?? 0) + 1;
      }
    }
    pools[id] = pool;
  }
}
const poolCount = Object.keys(pools).length;
checkSoft(poolCount, 76, 'pools (65 drop + 11 treasure)');
info(`pools differing from s2: ${Object.entries(seasonalPoolCount).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'}`);

// === the item tables =========================================================

const ITEM_TABLES: ItemSourceFile[] = [
  'ak_items',
  'ak_items_equip',
  'ak_items_potion',
  'ak_items_stone',
  'ak_items_formula',
  'ak_items_change',
  'ak_gems',
];

/** Item id -> its table and its row in each ruleset and in the base copy. */
const itemRows = new Map<string, { src: ItemSourceFile; base: Row | undefined; seasons: Partial<Record<RulesetId, Row>> }>();
const shadowed: string[] = [];
for (const table of ITEM_TABLES) {
  const { base, seasons } = tableBySeason(table);
  const ids = new Set([...Object.keys(base), ...RULESETS.flatMap((r) => Object.keys(seasons[r]))]);
  for (const id of ids) {
    const earlier = itemRows.get(id);
    if (earlier !== undefined) {
      // `npc_items_custom` merges the tables in this order and the later row
      // wins — item_2014 is a material in ak_items and a class-change token
      // in ak_items_change, and items.full.json has the latter. Same here.
      shadowed.push(`${id} (${earlier.src} -> ${table})`);
    }
    const perSeason: Partial<Record<RulesetId, Row>> = {};
    for (const r of RULESETS) if (seasons[r][id] !== undefined) perSeason[r] = seasons[r][id];
    itemRows.set(id, { src: table, base: base[id], seasons: perSeason });
  }
}
info(`${itemRows.size} item rows across ${ITEM_TABLES.length} tables`);
if (shadowed.length > 0) warn(`defined in two tables, later one kept as npc_items_custom does: ${shadowed.join(', ')}`);

/** The S2 row, or the base one for an item S2 does not carry. */
const primaryRow = (id: string): Row | undefined => itemRows.get(id)?.seasons[PRIMARY] ?? itemRows.get(id)?.base;

const extras: Record<string, ItemExtra> = {};
const extraOf = (id: string): ItemExtra => {
  if (!itemRows.has(id)) fail(`${id} is referenced but is in no item table`);
  return (extras[id] ??= {});
};

const tables = Object.fromEntries(ITEM_TABLES.map((t) => [t, [] as string[]])) as Record<ItemSourceFile, string[]>;
for (const [id, { src }] of itemRows) {
  tables[src].push(id);
  const row = primaryRow(id)!;
  const e: ItemExtra = {};
  if (num(row['ItemSellableInAncient'] ?? 0, `${id} ItemSellableInAncient`) === 1) e.sellableAncient = true;
  const exchange = num(row['ExchangeInventory'] ?? 0, `${id} ExchangeInventory`);
  if (exchange !== 0) e.exchangeInventory = exchange;
  const useMax = optNum(row['use_max'], `${id} use_max`);
  if (useMax !== undefined) e.useMax = useMax;
  if (typeof row['target_ability'] === 'string' && row['target_ability'] !== '') e.gemTarget = row['target_ability'];
  if (row['hero_data'] !== undefined) {
    const data = parsePairs(row['hero_data'], `${id} hero_data`);
    if (Object.keys(data).length > 0) e.gemData = data;
  }
  if (Object.keys(e).length > 0) extras[id] = e;
}
for (const ids of Object.values(tables)) ids.sort();

// --- seasonal patches --------------------------------------------------------

/**
 * Field -> how to read it. Only fields `items.full.json` emits are patched; a
 * season changing anything else (IsDLC, particles) is not something a page
 * shows.
 */
const PATCHED: { key: keyof SeasonalPatch; read: (row: Row, id: string) => unknown }[] = [
  { key: 'level', read: (r, id) => optNum(r['Level'], `${id} Level`) },
  { key: 'quality', read: (r, id) => optNum(r['ItemQuality'], `${id} ItemQuality`) },
  { key: 'cost', read: (r, id) => optNum(r['ItemCost'], `${id} ItemCost`) },
  { key: 'timeCost', read: (r, id) => optNum(r['TimeCost'], `${id} TimeCost`) },
  { key: 'useMax', read: (r, id) => optNum(r['use_max'], `${id} use_max`) },
  { key: 'needs', read: (r) => parseNeeds(r['Needs']) },
  { key: 'values', read: (r) => r['AbilityValues'] ?? {} },
  { key: 'cooldown', read: (r, id) => optNum(r['AbilityCooldown'], `${id} AbilityCooldown`) },
  { key: 'gemValues', read: (r, id) => parsePairs(r['gem_value'], `${id} gem_value`) },
  { key: 'gemData', read: (r, id) => parsePairs(r['hero_data'], `${id} hero_data`) },
];

const seasonal: ItemsExtraFile['seasonal'] = {};
const patchCounts: Record<string, number> = {};
for (const [id, { base, seasons }] of itemRows) {
  if (base === undefined) {
    // An item only a ruleset defines has no base row to patch; its whole row
    // would have to be emitted, which no pak has needed yet.
    fail(`${id}: defined in a ruleset but not in the base table`);
    continue;
  }
  for (const r of RULESETS) {
    const row = seasons[r];
    if (row === undefined) continue;
    const patch: Record<string, unknown> = {};
    for (const { key, read } of PATCHED) {
      const was = read(base, id);
      const now = read(row, id);
      if (!same(was, now) && now !== undefined) patch[key] = now;
    }
    if (Object.keys(patch).length > 0) {
      (seasonal[id] ??= {})[r] = patch as SeasonalPatch;
      patchCounts[r] = (patchCounts[r] ?? 0) + 1;
    }
  }
}
info(`seasonal item patches: ${RULESETS.map((r) => `${r} ${patchCounts[r] ?? 0}`).join(', ')}`);
checkEqual0(patchCounts['s1'] ?? 0, 's1 patches (s1 is the base season)');

function checkEqual0(n: number, label: string): void {
  // Not a failure: the manifest calls s1 the base season, so a patch there is
  // news worth a warning rather than a broken build.
  if (n === 0) ok(`${label}: 0`);
  else warn(`${label}: ${n}`);
}

// --- items.full agreement ----------------------------------------------------

/**
 * items.full.json is built from `npc_items_custom`, which should be the merge
 * of these base tables. If the two disagree, the seasonal patches above are
 * patches against the wrong thing — so that is a failure.
 */
const itemsFullPath = path.join(DIRS.publicData, 'items.full.json');
const itemsFull = JSON.parse(fs.readFileSync(itemsFullPath, 'utf8')) as Record<
  string,
  { level: number; cost: number; quality: number; produces?: string; type: string }
>;
{
  const disagree: string[] = [];
  for (const [id, { base }] of itemRows) {
    const full = itemsFull[id];
    if (full === undefined || base === undefined) continue;
    if (Number(base['Level'] ?? full.level) !== full.level || Number(base['ItemCost'] ?? full.cost) !== full.cost) {
      disagree.push(id);
    }
  }
  check(disagree.length === 0, `base tables agree with items.full.json on Level/ItemCost (${disagree.slice(0, 5).join(', ')})`);
  const notInFull = [...itemRows.keys()].filter((id) => itemsFull[id] === undefined);
  check(notInFull.length === 0, `every table item is in items.full.json (${notInFull.slice(0, 5).join(', ')})`);
}

// === containers (plain Lua) ==================================================

interface LuaClass {
  name: string;
  parent: string;
  /** Single-statement `return <expr>` methods, by name. */
  returns: Map<string, string>;
  /** Whole method bodies, for the one multi-line method read (GetGold). */
  bodies: Map<string, string>;
}

/**
 * The TypeScriptToLua output the addon ships: one `__TS__Class()` per item,
 * `__TS__ClassExtends(child, parent)`, and methods written as
 * `function X.prototype.M(self) … end`.
 */
function readLuaClasses(text: string, source: string): { classes: Map<string, LuaClass>; locals: Map<string, string> } {
  const classes = new Map<string, LuaClass>();
  for (const m of text.matchAll(/__TS__ClassExtends\((\w+),\s*(?:____exports\.)?(\w+)\)/g)) {
    classes.set(m[1]!, { name: m[1]!, parent: m[2]!, returns: new Map(), bodies: new Map() });
  }
  for (const m of text.matchAll(/^function (\w+)\.prototype\.(\w+)\(self[^)]*\)\n([\s\S]*?)^end$/gm)) {
    const cls = classes.get(m[1]!);
    if (cls === undefined) continue;
    const body = m[3]!;
    cls.bodies.set(m[2]!, body);
    const single = /^\s*return (.+)\s*$/.exec(body);
    if (single && body.trim().split('\n').length === 1) cls.returns.set(m[2]!, single[1]!.trim());
  }
  const locals = new Map<string, string>();
  for (const m of text.matchAll(/^local (\w+) = ([\d.]+|"[^"]*"|true|false)$/gm)) locals.set(m[1]!, m[2]!);
  check(classes.size > 0, `${source}: ${classes.size} Lua classes`);
  return { classes, locals };
}

function luaValue(expr: string, locals: Map<string, string>, label: string): string | number | boolean {
  const resolved = locals.get(expr) ?? expr;
  if (/^"[^"]*"$/.test(resolved)) return resolved.slice(1, -1);
  if (resolved === 'true') return true;
  if (resolved === 'false') return false;
  const n = Number(resolved);
  if (Number.isFinite(n)) return n;
  fail(`${label}: cannot read Lua return value ${expr}`);
  return 0;
}

const containers: Record<string, ContainerInfo> = {};
const missingPools: string[] = [];
for (const file of [
  'scripts/vscripts/abilities/items/item_p300.lua',
  'scripts/vscripts/abilities/items/item_greed_cave_chests.lua',
]) {
  const { classes, locals } = readLuaClasses(plainLua(file), file);

  const lookup = (cls: LuaClass, method: string): { cls: LuaClass; expr?: string; body?: string } | undefined => {
    for (let c: LuaClass | undefined = cls; c !== undefined; c = classes.get(c.parent)) {
      if (c.returns.has(method)) return { cls: c, expr: c.returns.get(method) };
      if (c.bodies.has(method)) return { cls: c, body: c.bodies.get(method) };
    }
    return undefined;
  };

  for (const cls of classes.values()) {
    if (!cls.name.startsWith('item_')) continue;
    const label = `${file}: ${cls.name}`;
    const poolExpr = lookup(cls, 'GetDropPoolId')?.expr;
    if (poolExpr === undefined) {
      fail(`${label}: no GetDropPoolId`);
      continue;
    }
    const pool = String(luaValue(poolExpr, locals, `${label} GetDropPoolId`));
    const chanceExpr = lookup(cls, 'GetItemChance')?.expr;
    // The Greed Cave chests have no chance gate: OpenChest draws GetRewardCount times.
    const chance = chanceExpr === undefined ? 100 : Number(luaValue(chanceExpr, locals, `${label} GetItemChance`));
    const drawsExpr = lookup(cls, 'GetRewardCount')?.expr;
    const draws = drawsExpr === undefined ? 1 : Number(luaValue(drawsExpr, locals, `${label} GetRewardCount`));
    const info: ContainerInfo = { pool, chance, draws };

    const goldFlag = lookup(cls, 'IsGetGold')?.expr;
    if (goldFlag !== undefined && luaValue(goldFlag, locals, `${label} IsGetGold`) === true) {
      const body = lookup(cls, 'GetGold')?.body ?? '';
      const m = /GetItemKeyValues\("ItemCost"\)[\s\S]*RandomInt\(value \* ([\d.]+), value \* ([\d.]+)\)/.exec(body);
      if (m === null) {
        fail(`${label}: IsGetGold is true but GetGold is not the cost-scaled RandomInt it used to be`);
      } else {
        const cost = num(primaryRow(cls.name)?.['ItemCost'], `${cls.name} ItemCost`);
        info.gold = [Math.floor(cost * Number(m[1])), Math.floor(cost * Number(m[2]))];
      }
    }

    if (pools[pool] === undefined) {
      missingPools.push(`${cls.name} -> ${pool}`);
      continue;
    }
    if (!itemRows.has(cls.name)) {
      fail(`${label}: container class has no item row`);
      continue;
    }
    containers[cls.name] = info;
  }
}
if (missingPools.length > 0) {
  // item_P313 opens P639, which no drop-pool table defines — the server would
  // find the pool empty and refuse to open it. Reported, not emitted.
  warn(`containers whose pool does not exist (skipped): ${missingPools.join(', ')}`);
}
for (const [id, c] of Object.entries(containers)) extraOf(id).container = c;
info(`${Object.keys(containers).length} containers`);

// === magic-tower chests ======================================================

const chests: Record<string, TowerChest> = {};
{
  const table = baseTable('ak_magic_tower_chests');
  const KNOWN = new Set([
    'checkpointId', 'towerId', 'level', 'itemId', 'temporaryItemId', 'equipment', 'gem', 'fragments',
    'relicChance', 'dropPoolId', 'dropCount', 'easyItemId', 'hardItemId',
  ]);
  for (const [id, row] of Object.entries(table)) {
    for (const key of Object.keys(row)) if (!KNOWN.has(key)) fail(`ak_magic_tower_chests ${id}: unknown field ${key}`);
    const str = (k: string): string | undefined => (typeof row[k] === 'string' && row[k] !== '' ? (row[k] as string) : undefined);
    const chest: TowerChest = {
      id,
      tower: str('towerId') ?? '',
      level: num(row['level'], `${id} level`),
      checkpoint: str('checkpointId') ?? '',
      pool: str('dropPoolId') ?? '',
      count: num(row['dropCount'], `${id} dropCount`),
      equipment: num(row['equipment'] ?? 0, `${id} equipment`),
      gem: num(row['gem'] ?? 0, `${id} gem`),
      fragments: num(row['fragments'] ?? 0, `${id} fragments`),
      relicChance: num(row['relicChance'] ?? 0, `${id} relicChance`),
      items: { normal: str('itemId') ?? '' },
    };
    if (str('easyItemId')) chest.items.easy = str('easyItemId');
    if (str('hardItemId')) chest.items.hard = str('hardItemId');
    if (str('temporaryItemId')) chest.items.temporary = str('temporaryItemId');
    check(pools[chest.pool] !== undefined, `chest ${id} pool ${chest.pool} exists`);
    chests[id] = chest;
    for (const [variant, itemId] of Object.entries(chest.items) as [ChestRef['variant'], string][]) {
      if (!itemRows.has(itemId)) {
        fail(`chest ${id}: ${variant} item ${itemId} is in no item table`);
        continue;
      }
      extraOf(itemId).chest = { chest: id, variant };
    }
  }
  info(`${Object.keys(chests).length} magic-tower chests`);
}

// === life souls ==============================================================

const soulSkills: Record<string, SoulSkill> = {};
{
  const souls = {} as Record<RulesetId, Table>;
  const bosses = {} as Record<RulesetId, Table>;
  for (const r of RULESETS) {
    souls[r] = seasonTable(r, 'ak_life_souls');
    bosses[r] = seasonTable(r, 'ak_player_boss_abilities');
  }

  const lua = plainLua('scripts/vscripts/shared/player_boss_transform.lua');
  /** `____exports.NAME = { k = v, … }` -> raw value strings by key. */
  const luaTable = (name: string): Map<string, string> => {
    const m = new RegExp(`____exports\\.${name} = \\{\\n([\\s\\S]*?)\\n\\}`).exec(lua);
    const out = new Map<string, string>();
    if (m === null) {
      fail(`player_boss_transform.lua: no ${name} table`);
      return out;
    }
    for (const line of m[1]!.split('\n')) {
      const kv = /^\s*(\w+) = (.+?),?\s*$/.exec(line);
      if (kv) out.set(kv[1]!, kv[2]!);
    }
    return out;
  };
  const segments = luaTable('PLAYER_BOSS_DAMAGE_SEGMENTS');
  const aim = luaTable('PLAYER_BOSS_AIM');
  const moves = luaTable('PLAYER_BOSS_MOVE_REQUIREMENTS');
  const rangeMatch = /____exports\.PLAYER_BOSS_POINT_RANGE = ([\d.]+)/.exec(lua);
  if (rangeMatch === null) fail('player_boss_transform.lua: no PLAYER_BOSS_POINT_RANGE');
  const pointRange = Number(rangeMatch?.[1] ?? 0);

  const SOUL_KEYS = new Set(['SourceMove', 'BaseCooldown', 'CooldownReductionPct', 'MaxUpgrade', 'FragmentStep', 'DismantleBase']);
  const soulIds = new Set(RULESETS.flatMap((r) => Object.keys(souls[r])));
  for (const id of soulIds) {
    const rulesets = RULESETS.filter((r) => souls[r][id] !== undefined);
    const row = souls[PRIMARY][id] ?? souls[rulesets[0]!][id]!;
    for (const key of Object.keys(row)) if (!SOUL_KEYS.has(key)) fail(`ak_life_souls ${id}: unknown field ${key}`);
    for (const r of rulesets) if (!same(souls[r][id], row)) warn(`ak_life_souls ${id}: ${r} differs from ${PRIMARY}; ${PRIMARY} emitted`);
    if (!itemRows.has(id)) {
      fail(`life soul ${id} is in no item table`);
      continue;
    }
    const soul: LifeSoulInfo = {
      source: String(row['SourceMove']),
      cooldown: num(row['BaseCooldown'], `${id} BaseCooldown`),
      cdrPct: num(row['CooldownReductionPct'], `${id} CooldownReductionPct`),
      maxUpgrade: num(row['MaxUpgrade'], `${id} MaxUpgrade`),
      fragmentStep: num(row['FragmentStep'], `${id} FragmentStep`),
      dismantleBase: num(row['DismantleBase'], `${id} DismantleBase`),
      rulesets,
    };
    extraOf(id).soul = soul;

    if (soulSkills[soul.source] !== undefined) continue;
    const bossRuleset = rulesets.includes(PRIMARY) ? PRIMARY : rulesets[0]!;
    const boss = bosses[bossRuleset][soul.source];
    if (boss === undefined) {
      fail(`${id}: soul skill ${soul.source} is not in ${bossRuleset} ak_player_boss_abilities`);
      continue;
    }
    const move = /castDuration = ([\d.]+)/.exec(moves.get(soul.source) ?? '');
    const seg = segments.get(soul.source);
    const aimValue = aim.get(soul.source);
    if (move === null || seg === undefined || aimValue === undefined) {
      fail(`${soul.source}: player_boss_transform.lua lacks its segments, aim or cast duration`);
      continue;
    }
    soulSkills[soul.source] = {
      id: soul.source,
      ability: String(boss['PlayerAbility']),
      bossUnit: String(boss['BossUnit']),
      window: num(boss['MaxDuration'], `${soul.source} MaxDuration`),
      segments: num(seg, `${soul.source} segments`),
      aim: aimValue.replace(/^"|"$/g, ''),
      cast: num(move[1], `${soul.source} castDuration`),
      pointRange,
      damagePct: num(boss['DamagePct'], `${soul.source} DamagePct`),
      secondaryDamagePct: num(boss['SecondaryDamagePct'], `${soul.source} SecondaryDamagePct`),
      damageType: String(boss['DamageType']),
      enterDuration: num(boss['EnterDuration'], `${soul.source} EnterDuration`),
      exitDuration: num(boss['ExitDuration'], `${soul.source} ExitDuration`),
    };
  }
  checkSoft(Object.values(extras).filter((e) => e.soul).length, 30, 'life souls');
  info(`${Object.keys(soulSkills).length} soul skills`);
}

// === wearables ===============================================================

const wearables: Record<string, Wearable> = {};
{
  const table = baseTable('ak_items_wearable');
  for (const [id, row] of Object.entries(table)) {
    const w: Wearable = {
      quality: num(row['ItemQuality'], `${id} ItemQuality`),
      heroes: String(row['used_by_heroes'] ?? ''),
      kind: String(row['wearable_kind'] ?? ''),
      enabled: num(row['enabled'] ?? 0, `${id} enabled`) === 1,
    };
    if (typeof row['display_slot'] === 'string' && row['display_slot'] !== '') w.slot = row['display_slot'];
    if (num(row['is_initial'] ?? 0, `${id} is_initial`) === 1) w.initial = true;
    if (num(row['is_in_treasure_pool'] ?? 0, `${id} is_in_treasure_pool`) === 1) w.inTreasurePool = true;
    wearables[id] = w;
  }
  checkSoft(Object.keys(wearables).length, 454, 'wearables');
}

// --- every pooled item resolves ------------------------------------------------

{
  const unknown = new Set<string>();
  for (const pool of Object.values(pools)) {
    for (const body of [pool, ...Object.values(pool.bySeason ?? {})]) {
      for (const [id] of body.entries) if (!itemRows.has(id) && wearables[id] === undefined) unknown.add(`${pool.id}:${id}`);
    }
  }
  // Not fatal: pools have referenced ids the item table dropped before, and
  // the page shows the id. Listed so a new one is noticed.
  if (unknown.size > 0) warn(`${unknown.size} pool entr(ies) name no known item: ${[...unknown].slice(0, 10).join(', ')}`);
  else ok('every pool entry is a known item or wearable');
}

// === craft ===================================================================

const craftItems: Record<string, CraftEntry> = {};
{
  const unlocks = {} as Record<RulesetId, Map<string, CraftUnlock>>;
  const talents = tableBySeason('ak_talent').seasons;
  const formulas = tableBySeason('ak_items_formula').seasons;
  for (const r of RULESETS) {
    const map = new Map<string, CraftUnlock>();
    const get = (id: string): CraftUnlock => {
      let u = map.get(id);
      if (u === undefined) map.set(id, (u = {}));
      return u;
    };
    for (const [recipe, row] of Object.entries(formulas[r])) {
      const made = typeof row['item'] === 'string' ? row['item'] : undefined;
      if (made === undefined) {
        fail(`${r} ak_items_formula ${recipe}: no item field`);
        continue;
      }
      (get(made).recipes ??= []).push(recipe);
    }
    for (const [node, row] of Object.entries(talents[r])) {
      for (const made of asArray(row['formula'])) {
        // Usually one; item_P048 is named by both T244 and T255.
        (get(made).talents ??= []).push({ node, tree: String(row['type']) });
      }
    }
    for (const u of map.values()) {
      u.recipes?.sort();
      u.talents?.sort((a, b) => (a.node < b.node ? -1 : 1));
    }
    unlocks[r] = map;
  }

  const crafted = new Set<string>();
  for (const [id, { seasons, base }] of itemRows) {
    const row = seasons[PRIMARY] ?? base;
    if (row !== undefined && parseNeeds(row['Needs']).length > 0) crafted.add(id);
  }
  for (const r of RULESETS) for (const id of unlocks[r].keys()) crafted.add(id);

  for (const id of [...crafted].sort()) {
    if (!itemRows.has(id)) fail(`craft: ${id} is unlocked but is in no item table`);
    const primary = unlocks[PRIMARY].get(id) ?? {};
    const entry: CraftEntry = { ...primary };
    for (const r of RULESETS) {
      if (r === PRIMARY) continue;
      const other = unlocks[r].get(id) ?? {};
      if (!same(other, primary)) (entry.bySeason ??= {})[r] = other;
    }
    craftItems[id] = entry;
  }
  info(
    `${Object.keys(craftItems).length} craftable items; ` +
      `${Object.values(craftItems).filter((e) => e.recipes).length} with a recipe, ` +
      `${Object.values(craftItems).filter((e) => e.talents).length} with a talent`,
  );
}

// === locale ==================================================================

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

const coverage: string[] = [];
const towerIds = [...new Set(Object.values(chests).map((c) => c.tower))].sort();
for (const lang of Object.keys(tokens)) {
  const t = tokens[lang]!;

  const poolNames: Record<string, string> = {};
  for (const id of Object.keys(pools)) {
    const name = t[id.toLowerCase()];
    if (name !== undefined && name.trim() !== '') poolNames[id] = name.trim();
  }

  const loc: ItemsExtraLocale = { schema: 1, lang, qualities: {}, wearables: {}, towers: {}, soulSkills: {} };
  // The partner wiki's `meta.qualityRu`, which is the game's own `ak_quality_<n>`.
  for (let q = 0; q <= 9; q++) {
    const name = t[`ak_quality_${q}`];
    if (name !== undefined && name.trim() !== '') loc.qualities[String(q)] = name.trim();
  }
  for (const id of Object.keys(wearables)) {
    const name = t[id.toLowerCase()];
    if (name !== undefined && name.trim() !== '') loc.wearables[id] = name.trim();
  }
  for (const tower of towerIds) {
    const name = t[`magic_tower_name_${tower}`];
    if (name !== undefined) loc.towers[tower] = name.trim();
  }
  for (const skill of Object.values(soulSkills)) {
    const entry: { name?: string; desc?: ReturnType<typeof parseRichText>['nodes'] } = {};
    const name = t[`dota_tooltip_ability_${skill.ability}`];
    const desc = t[`dota_tooltip_ability_${skill.ability}_description`];
    if (name !== undefined) entry.name = name.trim();
    if (desc !== undefined) {
      const parsed = parseRichText(desc, false);
      if (parsed.issues.length > 0) warn(`${lang} ${skill.ability} description: ${parsed.issues.map((i) => i.detail).join('; ')}`);
      entry.desc = parsed.nodes;
    }
    loc.soulSkills[skill.id] = entry;
  }

  const poolLocale: PoolsLocale = { schema: 1, lang, names: poolNames };
  writeJson(path.join(OUT, `locale.${lang}.pools.json`), poolLocale);
  writeJson(path.join(OUT, `locale.${lang}.items-extra.json`), loc);
  coverage.push(
    `${lang}: pools ${Object.keys(poolNames).length}/${Object.keys(pools).length}, ` +
      `wearables ${Object.keys(loc.wearables).length}/${Object.keys(wearables).length}, ` +
      `towers ${Object.keys(loc.towers).length}/${towerIds.length}, ` +
      `qualities ${Object.keys(loc.qualities).join('')}, ` +
      `soul skills ${Object.values(loc.soulSkills).filter((s) => s.name).length}/${Object.keys(soulSkills).length}`,
  );
}
for (const line of coverage) info(`locale ${line}`);

// === write ===================================================================

const generatedAt = new Date().toISOString();

const poolsFile: PoolsFile = { schema: 1, generatedAt, ruleset: PRIMARY, pools };
const craftFile: CraftFile = { schema: 1, generatedAt, ruleset: PRIMARY, items: craftItems };
const extraFile: ItemsExtraFile = {
  schema: 1,
  generatedAt,
  ruleset: PRIMARY,
  tables,
  items: extras,
  chests,
  soulSkills,
  wearables,
  seasonal,
};

writeJson(path.join(OUT, 'pools.json'), poolsFile);
writeJson(path.join(OUT, 'craft.json'), craftFile);
writeJson(path.join(OUT, 'items-extra.json'), extraFile);

for (const f of ['pools.json', 'craft.json', 'items-extra.json']) {
  ok(`wrote wiki/${f} (${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1)} KB)`);
}
vpk.close();
exitIfFailed();
