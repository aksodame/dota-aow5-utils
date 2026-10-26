import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { Vpk } from './lib/vpk.ts';
import { findChild, parseKv, type KvObject } from './lib/kv.ts';
import { extractPublishData } from './lib/publishData.ts';
import { readRulesetTable } from './lib/ruleset.ts';
import { scriptText } from './lib/hudScript.ts';
import { writeJson } from './lib/writeJson.ts';
import { check, exitIfFailed, fail, info, ok, step, warn } from './lib/log.ts';
import type { PoolEntry, RulesetId } from '../../packages/aow5-shared/src/wiki/pools.ts';
import type {
  Combo,
  ComboMember,
  EndlessRow,
  SkyFile,
  SkyFloor,
  SkyLocale,
  SkyShopOffer,
  SkyTier,
  SpawnPool,
  TalentEffect,
} from '../../packages/aow5-shared/src/wiki/sky.ts';
import type {
  ExchangeOffer,
  RegularStock,
  VendorRefresh,
  VendorsFile,
  VendorsLocale,
} from '../../packages/aow5-shared/src/wiki/vendors.ts';
import type { MallPack, SourcesFile, SourcesLocale, TreasureChest } from '../../packages/aow5-shared/src/wiki/sources.ts';

/**
 * Step 08c — the wiki's Skyfall Realm, vendors and paid sources.
 *
 * Emits, under `public/data/wiki/`:
 *
 *   sky.json       the Greed Cave ("Skyfall Realm"): tiers, floors, shops,
 *                  spawn pools, wave combos, endless reward rows, stat curve
 *   vendors.json   the regular, ancient and guild merchants' stock and timers
 *   sources.json   the sponsor shop's bundles and the treasure chests
 *   locale.<lang>.{sky,vendors,sources}.json
 *
 * Read straight from the VPK. Tables are the plain KV under `scripts/npc/`
 * (each cross-checked against its Panorama publish payload, so a pak whose two
 * copies disagree fails here rather than shipping one of them). Three plain
 * Lua files carry what no table does — the greed cave's floor map, stat curve
 * and coin chances (`my_game_axe/greed_cave/config.lua`) and which pool a shop
 * chest opens (`abilities/items/item_greed_cave_chests.lua`). Each is checked
 * for the addon's `XDecrypt` wrapper first; nothing encrypted is read.
 *
 * The vendors' timers and counters come from the client bundle
 * (`hud/script.vjs_c`), which is minified, so every pattern anchors on the
 * net-table names and object shapes the minifier cannot rename. Those are the
 * client's *fallbacks* — what it shows before the server's state arrives.
 *
 * Constants that only the encrypted server code knows are not emitted; the
 * partner wiki's figures for them sit in the shared modules as `PARTNER_*`.
 */

ensureDirs();
const cfg = loadConfig();
step('08c · wiki: sky, vendors, sources');

const OUT = path.join(DIRS.publicData, 'wiki');
const DATA = 'panorama/layout/custom_game/vendor/data';
const RULESETS: RulesetId[] = ['s1', 's2', 's3'];
const PRIMARY: RulesetId = 's2';
/*
 * The same stamp step 07 writes — the pak's own mtime — not the clock: a
 * re-run on an unchanged pak has to leave the tree clean, and a wall-clock
 * stamp would dirty every file this step writes.
 */
const generatedAt = new Date(
  (JSON.parse(fs.readFileSync(path.join(DIRS.cache, 'vpk-index.json'), 'utf8')) as { vpkMtimeMs: number }).vpkMtimeMs,
).toISOString();

const vpk = Vpk.open(cfg.vpkPath);

type Row = Record<string, unknown>;
type Table = Record<string, Row>;

// --- readers ----------------------------------------------------------------

/** A `scripts/npc/<table>.txt` CSV export, cross-checked against its publish payload. */
function kvTable(table: string, payloadName = table): Record<string, KvObject> {
  const txt = `scripts/npc/${table}.txt`;
  const { root } = parseKv(vpk.readPath(txt));
  const rows = (findChild(root, 'CSVContent') ?? root) as Record<string, KvObject>;
  const vjs = `${DATA}/${payloadName}.vjs_c`;
  const payload = extractPublishData(vpk.readPath(vjs), `@/json/${payloadName}.json`, vjs) as Table;
  const a = Object.keys(rows).sort().join(',');
  const b = Object.keys(payload).sort().join(',');
  check(a === b, `${table}: ${Object.keys(rows).length} rows, same ids as its publish payload`);
  return rows;
}

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

const num = (v: unknown, label: string): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) {
    fail(`${label}: not a number: ${JSON.stringify(v)}`);
    return 0;
  }
  return n;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v));

/** `a:1|b:2` -> `[['a', 1], ['b', 2]]`. A malformed part fails. */
function pairs(v: unknown, label: string): [string, number][] {
  const s = str(v);
  if (s === '') return [];
  return s.split('|').map((part) => {
    const at = part.lastIndexOf(':');
    if (at <= 0) {
      fail(`${label}: malformed pair ${JSON.stringify(part)}`);
      return ['', 0] as [string, number];
    }
    return [part.slice(0, at).trim(), num(part.slice(at + 1), `${label} ${part}`)] as [string, number];
  });
}

// --- the greed cave's config.lua ---------------------------------------------

const CONFIG_LUA = 'scripts/vscripts/my_game_axe/greed_cave/config.lua';
const configLua = plainLua(CONFIG_LUA);

/** `____exports.NAME = <expr>` as a number; `8 * 3600` style products are evaluated. */
function luaConst(name: string): number {
  const m = new RegExp(`____exports\\.${name} = ([\\d.]+(?: \\* [\\d.]+)*)\\s*$`, 'm').exec(configLua);
  if (!m) {
    fail(`${CONFIG_LUA}: constant ${name} not found — the config was reorganised`);
    return 0;
  }
  return m[1]!.split('*').reduce((p, x) => p * Number(x), 1);
}

function luaString(name: string): string {
  const m = new RegExp(`____exports\\.${name} = "([^"]*)"`).exec(configLua);
  if (!m) fail(`${CONFIG_LUA}: string ${name} not found`);
  return m?.[1] ?? '';
}

/** The `--- comment` line just above a constant, for the coin amounts the config only states in prose. */
function luaComment(name: string): string {
  const m = new RegExp(`--- ([^\\n]*)\\n____exports\\.${name} =`).exec(configLua);
  if (!m) fail(`${CONFIG_LUA}: no comment above ${name}`);
  return m?.[1] ?? '';
}

/** The body of a Lua table literal assigned to `lhs`, balanced on braces. */
function luaTableBody(lhs: string): string {
  const at = configLua.indexOf(`${lhs} = {`);
  if (at < 0) {
    fail(`${CONFIG_LUA}: ${lhs} not found`);
    return '';
  }
  let depth = 0;
  const start = configLua.indexOf('{', at);
  for (let i = start; i < configLua.length; i++) {
    if (configLua[i] === '{') depth++;
    else if (configLua[i] === '}' && --depth === 0) return configLua.slice(start + 1, i);
  }
  fail(`${CONFIG_LUA}: ${lhs} does not close`);
  return '';
}

/** `[1] = { ... }, [2] = { ... }` -> index -> inner text. */
function luaIndexed(body: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /\[(\d+)\] = \{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < body.length && depth > 0; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') depth--;
    }
    out.set(Number(m[1]), body.slice(re.lastIndex, i - 1));
    re.lastIndex = i;
  }
  return out;
}

const luaField = (body: string, field: string, label: string): number => {
  const m = new RegExp(`\\b${field} = ([\\d.]+)`).exec(body);
  if (!m) fail(`${label}: field ${field} missing`);
  return Number(m?.[1] ?? 0);
};

const luaStringField = (body: string, field: string): string | undefined =>
  new RegExp(`\\b${field} = "([^"]*)"`).exec(body)?.[1];

// --- sky: config ---------------------------------------------------------------

const maxFloorByTier = new Map<number, number>();
for (const m of luaTableBody('____exports.GREED_CAVE_MAX_FLOOR_BY_TIER').matchAll(/\[(\d+)\] = (\d+)/g)) {
  maxFloorByTier.set(Number(m[1]), Number(m[2]));
}

const baseTargets = luaTableBody('local GREED_CAVE_MONSTER_BASE_ATTRIBUTE_TARGETS');
const targetOf = (kind: 'normal' | 'elite' | 'boss') => {
  const m = new RegExp(`${kind} = \\{([^}]*)\\}`).exec(baseTargets);
  if (!m) fail(`${CONFIG_LUA}: base attribute target ${kind} missing`);
  const body = m?.[1] ?? '';
  return {
    anchor: luaField(body, 'anchorFloor', kind),
    hp: luaField(body, 'health', kind),
    atk: luaField(body, 'attack', kind),
    growth: luaField(body, 'growthRate', kind),
  };
};
const targets = { normal: targetOf('normal'), elite: targetOf('elite'), boss: targetOf('boss') };
check(
  targets.normal.growth === targets.elite.growth &&
    targets.elite.growth === targets.boss.growth &&
    targets.normal.anchor === targets.elite.anchor &&
    targets.elite.anchor === targets.boss.anchor,
  'greed cave: the three monster kinds share one anchor floor and growth rate',
);

const attrByTier = luaIndexed(luaTableBody('____exports.GREED_CAVE_MONSTER_ATTRIBUTE_BY_TIER'));
const poolByTierFloor = luaIndexed(luaTableBody('____exports.GREED_CAVE_MONSTER_POOL_BY_TIER_FLOOR'));
const compassBody = luaTableBody('____exports.GREED_CAVE_COMPASS_ITEM_BY_TIER');
const compassByTier = new Map<number, string>();
for (const m of compassBody.matchAll(/\[(\d+)\] = "([^"]+)"/g)) compassByTier.set(Number(m[1]), m[2]!);

function floorsOf(tier: number): SkyFloor[] {
  const body = poolByTierFloor.get(tier);
  if (body === undefined) {
    fail(`${CONFIG_LUA}: no floor -> pool map for tier ${tier}`);
    return [];
  }
  const out: SkyFloor[] = [];
  for (const m of body.matchAll(/\[(\d+)\] = \{([^}]*)\}/g)) {
    const f: SkyFloor = { floor: Number(m[1]) };
    for (const kind of ['normal', 'elite', 'boss'] as const) {
      const id = luaStringField(m[2]!, kind);
      if (id !== undefined) f[kind] = id;
    }
    out.push(f);
  }
  return out.sort((a, b) => a.floor - b.floor);
}

const endlessTier = luaConst('GREED_CAVE_ENDLESS_COMPASS_TIER');
const endlessDataTier = luaConst('GREED_CAVE_ENDLESS_MONSTER_DATA_TIER');
check(endlessTier === endlessDataTier, `greed cave: the endless compass tier and monster data tier agree (${endlessTier})`);

/** `普通怪掉落 30 分洞窟币的概率。` -> 30. The only place the alternative amounts are stated. */
function coinAmountIn(name: string): number {
  const m = /(\d+) 分洞窟币/.exec(luaComment(name));
  if (!m) fail(`${CONFIG_LUA}: ${name}'s comment no longer states a coin amount`);
  return Number(m?.[1] ?? 0);
}

const deathRetainM = /GetGreedCaveDeathCoinRetainMultiplier\(self, floor\)\s*return ([\d.]+)/.exec(configLua);
check(deathRetainM !== null, 'greed cave: death retain multiplier found');

// --- sky: shops, chests ---------------------------------------------------------

const CHESTS_LUA = 'scripts/vscripts/abilities/items/item_greed_cave_chests.lua';
const chestsLua = plainLua(CHESTS_LUA);
const chestPool = new Map<string, string>();
for (const m of chestsLua.matchAll(/function (item_\w+)\.prototype\.GetDropPoolId\(self\)\s*return "([^"]+)"/g)) {
  chestPool.set(m[1]!, m[2]!);
}
/** Which base class each chest extends, and what each base's `GetRewardCount` returns. */
const chestParent = new Map<string, string>();
for (const m of chestsLua.matchAll(/__TS__ClassExtends\((\w+), (\w+)\)/g)) chestParent.set(m[1]!, m[2]!);
const rewardCount = new Map<string, number>();
for (const m of chestsLua.matchAll(/function (\w+)\.prototype\.GetRewardCount\(self\)\s*return (\d+)/g)) {
  rewardCount.set(m[1]!, Number(m[2]));
}
function drawsOf(cls: string): number | undefined {
  for (let c: string | undefined = cls; c !== undefined; c = chestParent.get(c)) {
    const n = rewardCount.get(c);
    if (n !== undefined) return n;
  }
  return undefined;
}
check(chestPool.size > 0, `${CHESTS_LUA}: ${chestPool.size} chest -> pool bindings`);

const shopRows = kvTable('ak_greed_cave_shop_pools');
const shopsByTier = new Map<number, SkyShopOffer[]>();
for (const [id, row] of Object.entries(shopRows)) {
  const tier = num(row['Tier'], `${id} Tier`);
  const itemId = str(row['ItemName']);
  const prefix = `GC_SHOP_T${tier}_`;
  check(id.startsWith(prefix), `${id}: id carries its tier prefix`);
  const offer: SkyShopOffer = {
    id,
    kind: id.slice(prefix.length),
    itemId,
    count: num(row['ItemCount'], `${id} ItemCount`),
    priceMin: num(row['PriceMin'], `${id} PriceMin`),
    priceMax: num(row['PriceMax'], `${id} PriceMax`),
    weight: num(row['Weight'], `${id} Weight`),
    priceTierMultiplier: num(row['PriceTierMultiplier'] ?? 1, `${id} PriceTierMultiplier`),
  };
  const pool = chestPool.get(itemId);
  if (pool !== undefined) offer.poolId = pool;
  else warn(`${id}: ${itemId} opens no pool in ${CHESTS_LUA}`);
  const draws = drawsOf(itemId);
  if (draws !== undefined) offer.draws = draws;
  const list = shopsByTier.get(tier) ?? [];
  list.push(offer);
  shopsByTier.set(tier, list);
}

// --- sky: spawn pools, combos, endless rows --------------------------------------

const spawnRows = kvTable('ak_greed_cave_monster_pools');
const spawnPools: SpawnPool[] = [];
for (const [id, row] of Object.entries(spawnRows)) {
  const level = num(row['Level'], `${id} Level`);
  const tier = level >= 1 && level <= 3 ? (level as 1 | 2 | 3) : null;
  spawnPools.push({ id, level, tier, endless: level === endlessDataTier, entries: pairs(row['items'], id) as PoolEntry[] });
}
spawnPools.sort((a, b) => (a.id < b.id ? -1 : 1));
const spawnIds = new Set(spawnPools.map((p) => p.id));
for (const p of spawnPools) {
  for (const [ref] of p.entries) {
    if (ref.startsWith('GCM_')) check(spawnIds.has(ref), `${p.id}: nested pool ${ref} exists`);
    else if (!ref.startsWith('monster_')) fail(`${p.id}: entry ${ref} is neither a monster nor a pool`);
  }
}

const comboRows = kvTable('ak_greed_cave_monster_combos');
const combos: Combo[] = [];
for (const [id, row] of Object.entries(comboRows)) {
  const kind = str(row['Kind']);
  if (kind !== 'elite' && kind !== 'boss') {
    fail(`${id}: unknown combo kind ${JSON.stringify(kind)}`);
    continue;
  }
  const members: ComboMember[] = str(row['Members'])
    .split('|')
    .map((part) => {
      const at = part.indexOf(':');
      const bits = part.slice(at + 1).split(',');
      const role = bits[3]?.trim();
      if (at <= 0 || bits.length < 3 || bits.length > 4 || (role !== undefined && role !== 'elite' && role !== 'normal')) {
        fail(`${id}: malformed member ${JSON.stringify(part)}`);
      }
      return [
        part.slice(0, at),
        num(bits[0], `${id} x`),
        num(bits[1], `${id} y`),
        num(bits[2], `${id} z`),
        role === 'elite' || role === 'normal' ? role : null,
      ] as ComboMember;
    });
  combos.push({
    id,
    tier: num(row['Tier'], `${id} Tier`),
    floor: num(row['Floor'], `${id} Floor`),
    kind,
    weight: num(row['Weight'], `${id} Weight`),
    members,
  });
}
combos.sort((a, b) => a.tier - b.tier || a.floor - b.floor || (a.id < b.id ? -1 : 1));

const endlessRows = kvTable('ak_greed_cave_endless_config');
const endless: EndlessRow[] = [];
for (const [id, row] of Object.entries(endlessRows)) {
  const groups = pairs(row['items'], `${id} items`);
  const lists: Record<string, PoolEntry[]> = {};
  const known = new Set(['items', 'Level', 'PoolType']);
  for (const [group] of groups) {
    // `equipment` -> `EquipmentItems`, as step 04 reads it. A group with no
    // column (`none`, `shop_slot`, `bag_slot`) is a slot, not a list.
    const field = `${group.charAt(0).toUpperCase()}${group.slice(1)}Items`;
    known.add(field);
    if (row[field] !== undefined) lists[group] = pairs(row[field], `${id} ${field}`) as PoolEntry[];
  }
  const extra: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) {
    if (known.has(k)) continue;
    if (/Items$/.test(k)) fail(`${id}: item list ${k} belongs to no group in "items"`);
    else extra[k] = num(v, `${id} ${k}`);
  }
  const rec: EndlessRow = { id, kind: str(row['PoolType']), level: num(row['Level'], `${id} Level`), groups, lists };
  if (Object.keys(extra).length > 0) rec.extra = extra;
  endless.push(rec);
}
endless.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.level - b.level));

// --- talents ---------------------------------------------------------------------

const talentsBySeason = new Map<RulesetId, Table>();
for (const r of RULESETS) talentsBySeason.set(r, seasonTable(r, 'ak_talent'));

function talentEffects(ruleset: RulesetId, keyTest: (key: string) => boolean): TalentEffect[] {
  const out: TalentEffect[] = [];
  for (const [id, row] of Object.entries(talentsBySeason.get(ruleset)!)) {
    const data = row['player_data'];
    const list = Array.isArray(data) ? data.map(String) : data === undefined ? [] : [String(data)];
    for (const entry of list) {
      const at = entry.lastIndexOf(':');
      if (at <= 0) continue;
      const key = entry.slice(0, at);
      if (keyTest(key)) out.push([id, key, num(entry.slice(at + 1), `${id} ${entry}`)]);
    }
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
}

/** Season-invariant talent lists only; a season that differs is reported and fails. */
function stableTalents(label: string, keyTest: (key: string) => boolean): TalentEffect[] {
  const primary = talentEffects(PRIMARY, keyTest);
  for (const r of RULESETS) {
    if (r === PRIMARY) continue;
    check(
      JSON.stringify(talentEffects(r, keyTest)) === JSON.stringify(primary),
      `${label}: ${r} talents match ${PRIMARY}`,
    );
  }
  check(primary.length > 0, `${label}: ${primary.length} talent effect(s)`);
  return primary;
}

// --- sky: assemble -----------------------------------------------------------------

const tiers: SkyTier[] = [];
for (const tier of [1, 2, 3] as const) {
  const body = attrByTier.get(tier);
  if (body === undefined) {
    fail(`${CONFIG_LUA}: no attribute block for tier ${tier}`);
    continue;
  }
  const label = `tier ${tier}`;
  const floors = floorsOf(tier);
  const maxFloor = maxFloorByTier.get(tier) ?? 0;
  check(floors.length === maxFloor, `${label}: ${floors.length} floors mapped, max floor ${maxFloor}`);
  for (const f of floors) {
    if (f.normal !== undefined) check(spawnIds.has(f.normal), `${label} floor ${f.floor}: normal pool ${f.normal} exists`);
  }
  tiers.push({
    tier,
    maxFloor,
    compassItem: compassByTier.get(tier) ?? '',
    attr: {
      mult: luaField(body, 'difficultyMultiplier', label),
      move: luaField(body, 'movementSpeedBonusPct', label),
      aspd: luaField(body, 'attackSpeedBonusPct', label),
      armor: luaField(body, 'armor', label),
      mr: luaField(body, 'magicResistance', label),
    },
    floors,
    shop: (shopsByTier.get(tier) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1)),
  });
}
check(
  [...shopsByTier.keys()].every((t) => t >= 1 && t <= 3),
  'greed cave shop: every row is for tier 1-3',
);

const endlessFloors = floorsOf(endlessTier);
for (const f of endlessFloors) {
  if (f.normal !== undefined) check(spawnIds.has(f.normal), `endless floor ${f.floor}: pool ${f.normal} exists`);
}

const normalBossCoin = coinAmountIn('GREED_CAVE_NORMAL_MONSTER_BOSS_COIN_REWARD_CHANCE_PCT');
const normalEliteCoin = coinAmountIn('GREED_CAVE_NORMAL_MONSTER_ELITE_COIN_REWARD_CHANCE_PCT');
const eliteBossCoin = coinAmountIn('GREED_CAVE_ELITE_MONSTER_BOSS_COIN_REWARD_CHANCE_PCT');
check(normalBossCoin === eliteBossCoin, `greed cave coins: a "boss" roll is ${normalBossCoin} for normals and elites alike`);

const sky: SkyFile = {
  schema: 1,
  generatedAt,
  ruleset: PRIMARY,
  roomId: luaString('GREED_CAVE_ROOM_ID'),
  dailyLimit: luaConst('GREED_CAVE_DAILY_COMPASS_LIMIT'),
  reviveCount: luaConst('GREED_CAVE_DEFAULT_REVIVE_COUNT'),
  shopOfferCount: luaConst('GREED_CAVE_SHOP_OFFER_COUNT'),
  tiers,
  coins: {
    // The constants are named for what the alternative roll is worth: a
    // normal monster's "boss coin" chance gives a boss's amount, its "elite
    // coin" chance an elite's. So those two are also the elite and boss bases.
    normal: {
      lucky: normalBossCoin,
      luckyPct: luaConst('GREED_CAVE_NORMAL_MONSTER_BOSS_COIN_REWARD_CHANCE_PCT'),
      bonus: normalEliteCoin,
      bonusPct: luaConst('GREED_CAVE_NORMAL_MONSTER_ELITE_COIN_REWARD_CHANCE_PCT'),
    },
    elite: {
      amount: normalEliteCoin,
      lucky: eliteBossCoin,
      luckyPct: luaConst('GREED_CAVE_ELITE_MONSTER_BOSS_COIN_REWARD_CHANCE_PCT'),
    },
    boss: { amount: eliteBossCoin },
    deathRetain: Number(deathRetainM?.[1] ?? 0),
  },
  waveCounts: {
    normalTotal: luaConst('GREED_CAVE_NORMAL_TOTAL'),
    maxAlive: luaConst('GREED_CAVE_NORMAL_MAX_ALIVE'),
    eliteTotal: luaConst('GREED_CAVE_ELITE_TOTAL'),
    bossFollowupPct: luaConst('GREED_CAVE_BOSS_FOLLOWUP_HEALTH_TRIGGER_PCT'),
  },
  scaling: {
    tierScale: {
      anchor: targets.normal.anchor,
      growth: targets.normal.growth,
      normal: { hp: targets.normal.hp, atk: targets.normal.atk },
      elite: { hp: targets.elite.hp, atk: targets.elite.atk },
      boss: { hp: targets.boss.hp, atk: targets.boss.atk },
    },
    normalEliteMult: {
      hp: luaConst('GREED_CAVE_NORMAL_ELITE_HEALTH_MULTIPLIER'),
      atk: luaConst('GREED_CAVE_NORMAL_ELITE_ATTACK_MULTIPLIER'),
    },
    endless: {
      curveTier: luaConst('GREED_CAVE_ENDLESS_COMBAT_TIER') as 1 | 2 | 3,
      softStart: luaConst('GREED_CAVE_ENDLESS_SOFT_SCALING_START_FLOOR'),
      hpGrowth: luaConst('GREED_CAVE_ENDLESS_HEALTH_GROWTH_RATE'),
      atkGrowth: luaConst('GREED_CAVE_ENDLESS_ATTACK_GROWTH_RATE'),
      armorPer3: luaConst('GREED_CAVE_ENDLESS_ARMOR_PER_THREE_FLOORS'),
      mrPer3: luaConst('GREED_CAVE_ENDLESS_MAGIC_RESISTANCE_PER_THREE_FLOORS'),
      mrCap: luaConst('GREED_CAVE_ENDLESS_MAGIC_RESISTANCE_CAP'),
      valueCap: luaConst('GREED_CAVE_ENDLESS_ATTRIBUTE_VALUE_CAP'),
    },
  },
  spawnPools,
  combos,
  endless: {
    compassItem: compassByTier.get(endlessTier) ?? '',
    combatTier: luaConst('GREED_CAVE_ENDLESS_COMBAT_TIER'),
    deepDataFloor: luaConst('GREED_CAVE_ENDLESS_DEEP_MONSTER_DATA_FLOOR'),
    joinMaxFloor: luaConst('GREED_CAVE_ENDLESS_JOIN_MAX_FLOOR'),
    baseBagCapacity: luaConst('GREED_CAVE_ENDLESS_BASE_BAG_CAPACITY'),
    dailyLimit: luaConst('GREED_CAVE_ENDLESS_DAILY_COMPASS_LIMIT'),
    floorPools: endlessFloors,
    rows: endless,
  },
  talents: stableTalents('sky', (k) => k.startsWith('greed_cave_')),
};
check(sky.endless.rows.some((r) => r.kind === 'boss_reward'), 'endless: boss reward rows present');
info(
  `sky: ${tiers.length} tiers, ${spawnPools.length} spawn pools, ${combos.length} combos, ${endless.length} endless rows`,
);

// --- vendors: items per season ------------------------------------------------------

/**
 * The item table per season. `npc_items_custom` is the merged base; each
 * ruleset ships full copies of the per-kind tables, and a row there replaces
 * the base row's fields. A season's own row wins, as in the client.
 */
const ITEM_TABLES = ['ak_items', 'ak_items_equip', 'ak_items_potion', 'ak_items_formula', 'ak_items_stone', 'ak_gems', 'ak_items_change'];
const baseItems = extractPublishData(vpk.readPath(cfg.itemsPayloadPath), '@/json/npc_items_custom.json', cfg.itemsPayloadPath) as Table;
const itemsBySeason = new Map<RulesetId, Table>();
for (const r of RULESETS) {
  const merged: Table = {};
  for (const [id, row] of Object.entries(baseItems)) if (row && typeof row === 'object') merged[id] = { ...row };
  for (const t of ITEM_TABLES) {
    for (const [id, row] of Object.entries(seasonTable(r, t))) {
      if (row && typeof row === 'object') merged[id] = { ...(merged[id] ?? {}), ...row };
    }
  }
  itemsBySeason.set(r, merged);
}

const flag = (row: Row, k: string): number => Number(row[k] ?? 0) || 0;

function regularStock(r: RulesetId): RegularStock {
  const byLevel: Record<string, string[]> = {};
  const precious: string[] = [];
  for (const [id, row] of Object.entries(itemsBySeason.get(r)!)) {
    // The pool the regular merchant restocks from: everything sellable that
    // is in the game. Grouped by `Level`, which is the shop level it needs.
    if (flag(row, 'ItemSellable') !== 1 || flag(row, 'is_item_in_game') !== 1) continue;
    const level = String(Math.max(1, flag(row, 'Level')));
    (byLevel[level] ??= []).push(id);
    if (row['Subclass'] === 'precious') precious.push(id);
  }
  for (const l of Object.values(byLevel)) l.sort();
  return { byLevel, precious: precious.sort() };
}

function ancientAccepts(r: RulesetId): string[] {
  return Object.entries(itemsBySeason.get(r)!)
    .filter(([, row]) => flag(row, 'ItemSellableInAncient') === 1)
    .map(([id]) => id)
    .sort();
}

function exchangeOffers(r: RulesetId): ExchangeOffer[] {
  return Object.entries(itemsBySeason.get(r)!)
    .filter(([, row]) => flag(row, 'ExchangeInventory') > 0)
    .map(([id, row]) => [id, flag(row, 'ExchangeInventory')] as ExchangeOffer)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** `bySeason` holding only the seasons whose value differs from the primary one. */
function bySeason<T>(of: (r: RulesetId) => T): Partial<Record<RulesetId, T>> | undefined {
  const primary = JSON.stringify(of(PRIMARY));
  const out: Partial<Record<RulesetId, T>> = {};
  for (const r of RULESETS) {
    if (r === PRIMARY) continue;
    const v = of(r);
    if (JSON.stringify(v) !== primary) out[r] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// --- vendors: the client bundle's fallbacks ----------------------------------------

const hud = scriptText(vpk.readPath(cfg.hudScriptPath));

function hudMatch(re: RegExp, what: string): RegExpExecArray | null {
  const m = re.exec(hud);
  if (!m) fail(`HUD bundle: ${what} not found — the client was reorganised`);
  return m;
}

const n = (s: string | undefined): number => Number(s ?? NaN);

/** The refresh block a shop panel computes from its `refresh_<player>` net table entry. */
function shopRefresh(ns: string): VendorRefresh {
  const m = hudMatch(
    new RegExp(
      `\\w+\\("${ns}",\`refresh_\\$\\{\\w+\\}\`\\)\\|\\|\\{\\}[\\s\\S]{0,200}?interval_sec\\)\\|\\|function\\(\\w+\\)\\{if\\(null==\\w+\\|\\|Number\\.isNaN\\(\\w+\\)\\)return ([\\de.]+);const \\w+=Math\\.max\\(0,Math\\.min\\((\\d+),Math\\.floor\\(\\w+\\)\\)\\);return Math\\.floor\\(([\\de.]+)\\*\\(100-\\w+\\)\\/100\\)\\}\\(Number\\(\\w+\\.shop_time\\)\\)[\\s\\S]{0,300}?manual_refresh_cost_item_id\\|\\|"(item_\\w+)"[\\s\\S]{0,120}?manual_refresh_next_cost\\)\\|\\|(\\d+)\\)\\)[\\s\\S]{0,120}?manual_refresh_daily_limit\\)\\|\\|(\\d+)\\)`,
    ),
    `${ns} refresh block`,
  );
  check(n(m?.[1]) === n(m?.[3]), `${ns}: refresh fallback and base agree (${m?.[1]})`);
  return {
    baseSec: n(m?.[3]),
    maxReductionPct: n(m?.[2]),
    manualItem: m?.[4] ?? '',
    manualCost: n(m?.[5]),
    manualLimit: n(m?.[6]),
  };
}

const ancientCurrency = hudMatch(/\w+\("ancient_shop",`refresh_\$\{\w+\}`\)[\s\S]{0,600}?currency_item_id\|\|"(item_\w+)"/, 'ancient currency');

const guildTaskRefresh = hudMatch(
  /\{day:0,count:0,dailyLimit:(\d+),nextCost:(\d+),costItemId:"(item_\w+)",canRefresh:!0\}/,
  'guild order refresh defaults',
);
const guildExchange = hudMatch(
  /\{day:0,points:0,refreshCount:0,refreshDailyLimit:(\d+),nextCost:(\d+),costItemId:"(item_\w+)",canRefresh:!0,nextRefreshAt:0,offers:\{\}\}/,
  'guild exchange defaults',
);
const guildDaily = hudMatch(/\{day:0,completedCount:0,targetCount:(\d+),rewardPoints:(\d+),claimed:!1\}/, 'guild daily target');
const guildSlots = hudMatch(
  /\{unlockedCount:\d+,maxSlots:(\d+),initialSlots:(\d+),nextSlotNumber:\d+,nextUnlockCost:(\d+),nextUnlockItemCosts:\{\},canUnlock:!0,points:0,completionDay:0,slotCompletedCounts:\{\},slotDailyCompletionLimit:(\d+)\}/,
  'guild order slots',
);

const vendors: VendorsFile = {
  schema: 1,
  generatedAt,
  ruleset: PRIMARY,
  regular: {
    ...regularStock(PRIMARY),
    refresh: shopRefresh('shop'),
    talents: stableTalents('regular vendor', (k) => /^shop_/.test(k)),
  },
  ancient: {
    currencyItem: ancientCurrency?.[1] ?? '',
    refresh: shopRefresh('ancient_shop'),
    accepts: ancientAccepts(PRIMARY),
    talents: stableTalents('ancient vendor', (k) => /^ancient_shop_|^shop_time$/.test(k)),
  },
  guild: {
    tasks: {
      targetCount: n(guildDaily?.[1]),
      rewardPoints: n(guildDaily?.[2]),
      slotMax: n(guildSlots?.[1]),
      slotStart: n(guildSlots?.[2]),
      nextUnlockCost: n(guildSlots?.[3]),
      dailyLimit: n(guildSlots?.[4]),
      refresh: { item: guildTaskRefresh?.[3] ?? '', dailyLimit: n(guildTaskRefresh?.[1]), cost: n(guildTaskRefresh?.[2]) },
    },
    exchange: {
      refresh: { item: guildExchange?.[3] ?? '', dailyLimit: n(guildExchange?.[1]), cost: n(guildExchange?.[2]) },
      offers: exchangeOffers(PRIMARY),
    },
    talents: stableTalents('guild vendor', (k) => k.startsWith('merchant_')),
  },
};
const regularSeasons = bySeason(regularStock);
if (regularSeasons) vendors.regular.bySeason = regularSeasons;
const ancientSeasons = bySeason((r) => ({ accepts: ancientAccepts(r) }));
if (ancientSeasons) vendors.ancient.bySeason = ancientSeasons;
const exchangeSeasons = bySeason((r) => ({ offers: exchangeOffers(r) }));
if (exchangeSeasons) vendors.guild.bySeason = exchangeSeasons;

for (const [label, v] of [
  ['regular refresh', vendors.regular.refresh],
  ['ancient refresh', vendors.ancient.refresh],
] as const) {
  check(Object.values(v).every((x) => x !== '' && !Number.isNaN(x)), `${label}: every field read`);
}
const regularCount = Object.values(vendors.regular.byLevel).flat().length;
info(
  `vendors: regular ${regularCount} items over ${Object.keys(vendors.regular.byLevel).length} levels, ancient ${vendors.ancient.accepts.length}, exchange ${vendors.guild.exchange.offers.length}` +
    `; seasons differing: regular ${Object.keys(regularSeasons ?? {}).join(',') || '-'}, ancient ${Object.keys(ancientSeasons ?? {}).join(',') || '-'}, exchange ${Object.keys(exchangeSeasons ?? {}).join(',') || '-'}`,
);
for (const id of ['npc_7', 'npc_8', 'npc_11']) {
  check(vpk.readPath('scripts/npc/ak_units.txt').toString('utf8').includes(`"${id}"`), `ak_units defines ${id}`);
}

// --- sources: mall and treasure chests -------------------------------------------------

/** A list field arrives as `a:1|b:2` in KV. */
const itemCounts = (v: unknown, label: string) => pairs(v, label) as [string, number][];

const mallRows = kvTable('ak_shop_list');
const mall: MallPack[] = [];
const packTips = new Map<string, string>();
for (const [id, row] of Object.entries(mallRows)) {
  const rewards = itemCounts(row['reward_items'], `${id} reward_items`);
  const display = itemCounts(row['reward_items_frontend'], `${id} reward_items_frontend`);
  const pack: MallPack = {
    id,
    price: num(row['amout'], `${id} amout`),
    limit: num(row['limit'] ?? 0, `${id} limit`),
    rewards,
    giftPack: num(row['gift_pack_show'] ?? 0, `${id} gift_pack_show`) === 1,
    quality: num(row['shop_item_quality'] ?? 0, `${id} shop_item_quality`),
  };
  if (display.length > 0 && JSON.stringify(display) !== JSON.stringify(rewards)) pack.display = display;
  const tips = str(row['shop_item_tips']);
  if (tips !== '') packTips.set(id, tips);
  mall.push(pack);
}
mall.sort((a, b) => Number(a.id) - Number(b.id));

const treasureRows = kvTable('ak_treasure');
const gacha: TreasureChest[] = [];
for (const [id, row] of Object.entries(treasureRows)) {
  const chest: TreasureChest = {
    id,
    keyCost: num(row['key_cost'], `${id} key_cost`),
    pools: pairs(row['random_pool'], `${id} random_pool`),
    hidden: num(row['is_hide'] ?? 0, `${id} is_hide`) === 1,
  };
  if (row['pity_count'] !== undefined) {
    chest.pity = {
      quality: num(row['pity_quality'], `${id} pity_quality`),
      count: num(row['pity_count'], `${id} pity_count`),
      softStart: num(row['soft_pity_start'], `${id} soft_pity_start`),
      softStartRate: num(row['soft_pity_start_rate'], `${id} soft_pity_start_rate`),
      softStep: num(row['soft_pity_step'], `${id} soft_pity_step`),
      softMaxRate: num(row['soft_pity_max_rate'], `${id} soft_pity_max_rate`),
    };
    if (row['special_pity_pool'] !== undefined) chest.pity.specialPool = str(row['special_pity_pool']);
    if (row['special_pity_count'] !== undefined) chest.pity.specialCount = num(row['special_pity_count'], `${id} special_pity_count`);
  }
  gacha.push(chest);
}
gacha.sort((a, b) => Number(a.id) - Number(b.id));
const treasurePools = baseTable('ak_treasure_pool');
for (const c of gacha) for (const [p] of c.pools) check(p in treasurePools, `treasure ${c.id}: pool ${p} exists`);

const sources: SourcesFile = { schema: 1, generatedAt, ruleset: PRIMARY, mall, gacha };
info(`sources: ${mall.length} mall packs, ${gacha.length} treasure chests`);

// --- locales -----------------------------------------------------------------------------

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

const coverage: Record<string, { found: number; missing: string[] }> = {};
function tok(lang: string, key: string): string | undefined {
  const v = tokens[lang]?.[key.toLowerCase()];
  const c = (coverage[lang] ??= { found: 0, missing: [] });
  if (v === undefined || v === '') c.missing.push(key);
  else c.found++;
  return v === '' ? undefined : v;
}
/** Drops keys whose value is undefined, so locale files carry only what the game ships. */
function defined<T extends Record<string, string | undefined>>(o: T): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, string>;
}

const SHOP_KIND_TOKENS: Record<string, string> = {
  MATERIAL: 'greed_cave_材料箱子',
  EQUIP_NORMAL: 'greed_cave_普通装备箱子',
  EQUIP_LEGENDARY: 'greed_cave_传说装备箱子',
  EQUIP_MYTHIC: 'greed_cave_神话装备箱子',
};

for (const lang of cfg.languages) {
  const skyLocale: SkyLocale = {
    schema: 1,
    lang,
    names: defined({
      realm: tok(lang, 'greed_cave_倾天秘境'),
      endless: tok(lang, 'greed_cave_无尽倾天秘境'),
      tierTitle: tok(lang, 'greed_cave_X阶倾天秘境'),
      shop: tok(lang, 'greed_cave_秘境商店'),
      merchant: tok(lang, 'greed_cave_先祖行商'),
      crystals: tok(lang, 'greed_cave_秘晶'),
      ancientCoins: tok(lang, 'season_shop_远古币'),
      floor: tok(lang, 'greed_cave_层数'),
    }),
    shopKinds: defined(Object.fromEntries(Object.entries(SHOP_KIND_TOKENS).map(([k, t]) => [k, tok(lang, t)]))),
  };
  writeJson(path.join(OUT, `locale.${lang}.sky.json`), skyLocale);

  const vendorsLocale: VendorsLocale = {
    schema: 1,
    lang,
    vendors: defined({
      regular: tok(lang, 'shop_黑心商贩'),
      ancient: tok(lang, 'ancient_shop_远古商贩'),
      guild: tok(lang, 'merchant_panel_会馆商人'),
    }),
    currencies: defined({
      gold: tok(lang, 'season_shop_金币'),
      ancientCoins: tok(lang, 'season_shop_远古币'),
      bountyGold: tok(lang, 'merchant_panel_x悬赏金币'),
      points: tok(lang, 'merchant_panel_积分兑换'),
    }),
    orderLevels: defined({
      '1': tok(lang, 'merchant_panel_普通'),
      '2': tok(lang, 'merchant_panel_进阶'),
      '3': tok(lang, 'merchant_panel_稀有'),
      '4': tok(lang, 'merchant_panel_大师'),
    }),
    labels: defined({
      shopLevel: tok(lang, 'shop_商店等级x'),
      needsShopLevel: tok(lang, 'shop_需要x级商店'),
      restockEvery: tok(lang, 'ancient_shop_每x分钟刷新库存'),
    }),
  };
  writeJson(path.join(OUT, `locale.${lang}.vendors.json`), vendorsLocale);

  const packs: Record<string, string> = {};
  for (const p of mall) {
    const name = tok(lang, `shop_item_${p.id}_name`) ?? packTips.get(p.id);
    if (name !== undefined) packs[p.id] = name;
  }
  const chests: Record<string, string> = {};
  for (const c of gacha) {
    const name = tok(lang, `treasure_${c.id}_name`);
    if (name !== undefined) chests[c.id] = name;
  }
  const sourcesLocale: SourcesLocale = { schema: 1, lang, packs, chests };
  writeJson(path.join(OUT, `locale.${lang}.sources.json`), sourcesLocale);
}

for (const [lang, c] of Object.entries(coverage)) {
  info(`locale ${lang}: ${c.found} strings${c.missing.length ? `; no token for ${c.missing.join(', ')}` : ''}`);
}

writeJson(path.join(OUT, 'sky.json'), sky);
writeJson(path.join(OUT, 'vendors.json'), vendors);
writeJson(path.join(OUT, 'sources.json'), sources);
for (const f of ['sky.json', 'vendors.json', 'sources.json']) {
  ok(`wrote wiki/${f} (${fs.statSync(path.join(OUT, f)).size} bytes)`);
}

exitIfFailed();
