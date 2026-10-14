import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DIRS, loadConfig } from './lib/paths.ts';
import { Vpk } from './lib/vpk.ts';
import { readRulesetTable } from './lib/ruleset.ts';
import { check, info, step } from './lib/log.ts';
import { sortKeys } from './lib/writeJson.ts';
import type { PoolsFile } from '../../packages/aow5-shared/src/wiki/pools.ts';
import {
  eliteComboRange,
  endlessBossWaves,
  endlessFloorStats,
  PARTNER_CHEST_REWARD,
  spawnShares,
  tierMonsterPool,
  type SkyFile,
} from '../../packages/aow5-shared/src/wiki/sky.ts';
import {
  ancientPrice,
  exchangePoints,
  regularPrice,
  talentKeys,
  type VendorsFile,
  type VendorsLocale,
} from '../../packages/aow5-shared/src/wiki/vendors.ts';
import { gachaByItem, mallByItem, type SourcesFile, type SourcesLocale } from '../../packages/aow5-shared/src/wiki/sources.ts';

/**
 * Golden check for step 08c: our sky / vendors / sources against the partner
 * wiki's v1.507 snapshot (`aow-wiki-site/data/{greed,vendors,sources}.js`).
 *
 * Soft by design — it reports every difference and exits 0, because some are
 * expected (the pak moved on; the partner curated). Each kind of difference is
 * explained in the step's report. Run: `node parser/tools/08c-wiki-sky-vendors.golden.ts`.
 */

step('08c golden · partner snapshot vs our extract');

const PARTNER = process.env.AOW_PARTNER_DIR ?? path.resolve(import.meta.dirname, '../../../aow-wiki-site/data'); // a clone beside this repo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
function partner(name: string): Any {
  const ctx = { window: {} as Any };
  vm.runInNewContext(fs.readFileSync(path.join(PARTNER, `${name}.js`), 'utf8'), ctx);
  return ctx.window.AOW[name];
}
const OUT = path.join(DIRS.publicData, 'wiki');
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')) as T;

const sky = read<SkyFile>('sky.json');
const vendors = read<VendorsFile>('vendors.json');
const sources = read<SourcesFile>('sources.json');
const vendorsRu = read<VendorsLocale>('locale.ru.vendors.json');
const sourcesRu = read<SourcesLocale>('locale.ru.sources.json');
const G = partner('greed');
const V = partner('vendors');
const S = partner('sources');

const diffs: string[] = [];
function same(label: string, ours: unknown, theirs: unknown): void {
  // Key order is not a difference.
  const a = JSON.stringify(sortKeys(ours));
  const b = JSON.stringify(sortKeys(theirs));
  if (a === b) check(true, label);
  else {
    diffs.push(label);
    check(false, `${label}\n        ours:    ${a.slice(0, 300)}\n        partner: ${b.slice(0, 300)}`);
  }
}
const setDiff = (label: string, ours: string[], theirs: string[]): void => {
  const o = new Set(ours);
  const t = new Set(theirs);
  same(`${label}: only ours / only partner`, [[...o].filter((x) => !t.has(x)).sort(), [...t].filter((x) => !o.has(x)).sort()], [[], []]);
};

// --- sky ---------------------------------------------------------------------------
for (const tier of [1, 2, 3] as const) {
  const t = sky.tiers.find((x) => x.tier === tier)!;
  const p = G.tiers[tier];
  same(
    `sky tier ${tier} shop`,
    t.shop.map((s) => [s.id, s.kind, s.itemId, s.poolId, s.priceMin, s.priceMax, s.weight, s.count]).sort(),
    p.shops.map((s: Any) => [s.id, s.kind, s.itemId, s.poolId, s.priceMin, s.priceMax, s.weight, s.count]).sort(),
  );
  const pool = tierMonsterPool(sky, tier);
  same(
    `sky tier ${tier} monsters (= first floor's normal pool)`,
    pool ? spawnShares(pool).map((m) => [m.id, m.weight, m.share, m.pool]) : null,
    p.monsters.map((m: Any) => [m.id, m.weight, m.share, m.pool]),
  );
  const cr = p.chestReward;
  same(`sky tier ${tier} chest pool (partner constant)`, PARTNER_CHEST_REWARD.poolByTier[tier], cr.poolId);
  same(`sky tier ${tier} max floor`, t.maxFloor, G.scaling.tierScale.maxFloors[tier - 1]);
  same(`sky tier ${tier} attr`, [t.attr.mult, t.attr.move, t.attr.aspd], [G.scaling.tierScale.tiers[tier - 1].mult, G.scaling.tierScale.tiers[tier - 1].move, G.scaling.tierScale.tiers[tier - 1].aspd]);
}
const c = sky.coins;
same(
  'sky coins',
  { normal: { lucky: c.normal.lucky, luckyPct: c.normal.luckyPct, bonus: c.normal.bonus, bonusPct: c.normal.bonusPct }, elite: c.elite, boss: c.boss, deathRetain: c.deathRetain },
  { normal: { lucky: G.coins.normal.lucky, luckyPct: G.coins.normal.luckyPct, bonus: G.coins.normal.bonus, bonusPct: G.coins.normal.bonusPct }, elite: G.coins.elite, boss: G.coins.boss, deathRetain: G.coins.deathRetain },
);
const er = eliteComboRange(sky);
same('sky wave counts', { ...sky.waveCounts, eliteMin: er.min, eliteMax: er.max }, {
  normalTotal: G.waveCounts.normalTotal,
  maxAlive: G.waveCounts.maxAlive,
  eliteTotal: G.waveCounts.eliteTotal,
  bossFollowupPct: G.waveCounts.bossFollowupPct,
  eliteMin: G.waveCounts.eliteMin,
  eliteMax: G.waveCounts.eliteMax,
});
const ts = sky.scaling.tierScale;
same('sky tier scale', [ts.anchor, ts.growth, ts.normal, ts.elite, ts.boss], [G.scaling.tierScale.anchor, G.scaling.tierScale.growth, G.scaling.tierScale.normal, G.scaling.tierScale.elite, G.scaling.tierScale.boss]);
same('sky endless growth', [sky.scaling.endless.hpGrowth, sky.scaling.endless.atkGrowth], [G.scaling.growth.hp, G.scaling.growth.atk]);
let floorBad = 0;
for (const pf of G.scaling.floors) {
  const f = endlessFloorStats(sky, pf.floor);
  if (JSON.stringify([f.normal, f.elite, f.boss, f.armor, f.mr, f.move, f.aspd]) !== JSON.stringify([pf.normal, pf.elite, pf.boss, pf.armor, pf.mr, pf.move, pf.aspd])) floorBad++;
}
same(`sky endless floor stats, ${G.scaling.floors.length} floors: mismatching floors`, floorBad, 0);

const waves = endlessBossWaves(sky);
same(
  'sky endless waves',
  waves.map((w) => [w.wave, w.boss, w.level, w.poolId, w.equipment, w.stones]),
  G.endless.waves.map((w: Any) => [w.wave, w.boss, w.level, w.poolId, w.equipment.map((e: Any) => [e.id, e.weight]), w.stones.map((e: Any) => [e.id, e.weight])]),
);
same('sky endless monster pools', sky.endless.floorPools.map((f) => f.normal).filter((x, i, a) => x && a.indexOf(x) === i), G.endless.monsterPools.map((p: Any) => p.id));
same(
  'sky spawn pools',
  sky.spawnPools.map((p) => [p.id, p.tier, p.endless, p.level, spawnShares(p).map((m) => [m.id, m.weight, m.share, m.pool])]),
  [...G.spawnPools]
    .sort((a: Any, b: Any) => (a.id < b.id ? -1 : 1))
    .map((p: Any) => [p.id, p.tier, p.endless, p.level, p.monsters.map((m: Any) => [m.id, m.weight, m.share, m.pool])]),
);
const comboKey = (id: string, tier: number, floor: number, kind: string, weight: number, members: unknown) => JSON.stringify([id, tier, floor, kind, weight, members]);
setDiff(
  'sky combos',
  sky.combos.map((x) => comboKey(x.id, x.tier, x.floor, x.kind, x.weight, x.members.map(([id, mx, my, , role]) => [id, role, mx, my]))),
  G.combos.map((x: Any) => comboKey(x.id, x.tier, x.floor, x.kind, x.weight, x.members.map((m: Any) => [m.id, m.role, m.x, m.y]))),
);

// --- vendors ------------------------------------------------------------------------
const pr = V.regular;
for (const level of Object.keys(pr.pool.byLevel)) {
  setDiff(`vendors regular level ${level}`, vendors.regular.byLevel[level] ?? [], pr.pool.byLevel[level].map((i: Any) => i.id));
}
const allRegular = Object.values(pr.pool.byLevel).flat() as Any[];
setDiff('vendors regular precious', vendors.regular.precious, allRegular.filter((i) => i.precious).map((i) => i.id));
same(
  'vendors regular prices (our formula over partner cost)',
  allRegular.filter((i) => {
    const p = regularPrice(i.cost, i.precious);
    return p.min !== i.priceMin || p.max !== i.priceMax || (i.precious && p.precious !== i.pricePrecious);
  }).map((i) => i.id),
  [],
);
same('vendors regular refresh', [vendors.regular.refresh.baseSec, vendors.regular.refresh.maxReductionPct, vendors.regular.refresh.manualItem, vendors.regular.refresh.manualLimit], [pr.refresh.baseSec, pr.refresh.maxReductionPct, pr.refresh.manualItem, pr.refresh.manualLimit]);
same('vendors regular talent keys', talentKeys(vendors.regular.talents).sort(), [...pr.talentKeys].sort());

const pa = V.ancient;
setDiff('vendors ancient accepts', vendors.ancient.accepts, pa.accepts.map((i: Any) => i.id));
same(
  'vendors ancient coin prices',
  pa.accepts.filter((i: Any) => {
    const p = ancientPrice(i.cost);
    return p.coinMin !== i.coinMin || p.coinMax !== i.coinMax || p.sellGold !== i.gold;
  }).map((i: Any) => i.id),
  [],
);
same('vendors ancient refresh', [vendors.ancient.refresh.baseSec, vendors.ancient.refresh.maxReductionPct, vendors.ancient.currencyItem], [pa.refresh.baseSec, pa.refresh.maxReductionPct, 'item_M512']);
same('vendors ancient talent keys', talentKeys(vendors.ancient.talents).sort(), [...pa.talentKeys].sort());

const pg = V.guild;
same('vendors guild exchange offers', vendors.guild.exchange.offers, pg.exchange.offers.map((o: Any) => [o.id, o.stock]).sort((a: Any, b: Any) => (a[0] < b[0] ? -1 : 1)));
same(
  'vendors guild exchange points',
  pg.exchange.offers.filter((o: Any) => exchangePoints(o.id, o.cost, o.quality) !== o.points).map((o: Any) => o.id),
  [],
);
const gt = vendors.guild.tasks;
same(
  'vendors guild tasks',
  [gt.targetCount, gt.rewardPoints, gt.slotStart, gt.slotMax, gt.dailyLimit, vendors.guild.exchange.refresh.dailyLimit, gt.refresh.dailyLimit, gt.refresh.item],
  [pg.tasks.targetCount, pg.tasks.rewardPoints, pg.tasks.slotStart, pg.tasks.slotMax, pg.tasks.dailyLimit, pg.exchange.refreshLimit, pg.refresh.manualLimit, pg.refresh.manualItem],
);
same('vendors guild talent keys', talentKeys(vendors.guild.talents), ['merchant_daily_task_reward_bonus']);
same('vendors ru names', [vendorsRu.vendors.regular, vendorsRu.vendors.ancient, vendorsRu.vendors.guild], [pr.name, pa.name, pg.name]);
same('vendors ru order levels', Object.values(vendorsRu.orderLevels), pg.levels.map((l: Any) => l.name));

// --- sources ------------------------------------------------------------------------
const ours = mallByItem(sources, (p) => String(p.price));
const theirs: Record<string, Any[]> = S.mall;
setDiff('sources mall items', Object.keys(ours), Object.keys(theirs));
for (const id of Object.keys(theirs)) {
  same(
    `sources mall ${id} (price,count,packed)`,
    (ours[id] ?? []).map((r) => [r.price, r.count, r.packed]).sort(),
    theirs[id]!.map((r: Any) => [r.price, r.count, r.packed]).sort(),
  );
}
const packNames = new Set(Object.values(theirs).flat().map((r: Any) => r.pack));
const ruNames = new Set(Object.values(sourcesRu.packs));
info(`partner pack labels found in our ru locale: ${[...packNames].filter((n) => ruNames.has(n)).length}/${packNames.size}`);

// Treasure pools come from step 08d's pools.json when present, else straight from the pak.
let pools: PoolsFile;
const poolsPath = path.join(OUT, 'pools.json');
if (fs.existsSync(poolsPath)) pools = JSON.parse(fs.readFileSync(poolsPath, 'utf8')) as PoolsFile;
else {
  const cfg = loadConfig();
  const vpk = Vpk.open(cfg.vpkPath);
  const p = 'panorama/layout/custom_game/vendor/data/rulesets/s2/ak_treasure_pool.vjs_c';
  const t = readRulesetTable(vpk.readPath(p), 'ak_treasure_pool', p) as Record<string, Any>;
  pools = { schema: 1, generatedAt: '', ruleset: 's2', pools: {} };
  for (const [id, row] of Object.entries(t)) {
    const items = Array.isArray(row.items) ? row.items : row.items ? String(row.items).split('|') : [];
    pools.pools[id] = { id, kind: 'treasure', level: Number(row.Level), entries: items.map((s: string) => [s.split(':')[0], Number(s.split(':')[1])]) };
  }
}
const gacha = gachaByItem({ ...sources, gacha: sources.gacha.filter((c) => c.id === '1') }, pools);
same(
  'sources gacha (chest 1)',
  Object.fromEntries(Object.entries(gacha).sort()),
  Object.fromEntries(Object.entries(S.gacha as Record<string, Any>).sort()),
);
same('sources ru chest name', sourcesRu.chests['1'] !== undefined, true);

info(`${diffs.length} difference(s): ${diffs.join('; ') || 'none'}`);
