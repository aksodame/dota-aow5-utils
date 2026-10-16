import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  chestPayout,
  endlessDrops,
  expectedRun,
  isSkySubtab,
  skyPageFacts,
  skyPageItems,
  tierMonsters,
  SKY_SUBTABS,
  eliteComboRange,
  endlessBossSpans,
  endlessBossWaves,
  endlessFloorStats,
  endlessMerchantSpans,
  endlessSpanLabel,
  isPoolRef,
  spawnShares,
  tierFloorStats,
  tierMonsterPool,
  type SkyFile,
} from './sky.ts';

/**
 * The Skyfall Realm logic against the emitted `wiki/sky.json`. The floor
 * numbers are spot checks taken from the partner wiki's table, which the
 * formula reproduces in full (see the 08c golden check).
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const sky = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/sky.json'), 'utf8')) as SkyFile;

test('three tiers, each with a floor map as long as its max floor', () => {
  assert.deepEqual(sky.tiers.map((t) => t.tier), [1, 2, 3]);
  for (const t of sky.tiers) assert.equal(t.floors.length, t.maxFloor);
});

test('every boss floor is a third floor', () => {
  for (const t of sky.tiers) for (const f of t.floors) assert.equal(f.boss !== undefined, f.floor % 3 === 0, `tier ${t.tier} floor ${f.floor}`);
});

test('every spawn-pool reference resolves', () => {
  const ids = new Set(sky.spawnPools.map((p) => p.id));
  for (const p of sky.spawnPools) for (const [ref] of p.entries) if (isPoolRef(ref)) assert.ok(ids.has(ref), ref);
});

test('spawn shares sum to about 100%', () => {
  for (const p of sky.spawnPools) {
    const sum = spawnShares(p).reduce((s, m) => s + m.share, 0);
    assert.ok(Math.abs(sum - 100) < 1, `${p.id}: ${sum}`);
  }
});

test('a tier lists its first floor normal pool', () => {
  assert.equal(tierMonsterPool(sky, 1)?.id, 'GCM_T1_NORMAL');
});

test('endless floor stats match the partner table', () => {
  assert.deepEqual(endlessFloorStats(sky, 1).normal, { hp: 9596, atk: 532 });
  assert.deepEqual(endlessFloorStats(sky, 16).normal, { hp: 250936, atk: 13305 });
  const f50 = endlessFloorStats(sky, 50);
  assert.deepEqual(f50.boss, { hp: 471800945, atk: 775971 });
  assert.equal(f50.armor, 218);
  assert.equal(f50.mr, 95);
});

test('tier 3 floor 1 equals endless floor 1', () => {
  assert.deepEqual(tierFloorStats(sky, 3, 1), endlessFloorStats(sky, 1));
});

test('endless boss waves come every third floor', () => {
  const waves = endlessBossWaves(sky);
  assert.ok(waves.length > 0);
  for (const w of waves) assert.equal(w.wave, w.level * 3);
  assert.ok(waves.every((w) => w.equipment.length > 0));
});

// The wiki prints a pool's span, not the single wave it opens on: the server
// takes the highest `Level` at or below `floor(floor / 3)`, so level 8 is
// dealt on waves 24 through 29 — the row the 24 marks. A drop on wave 27 is
// therefore the same list, not a contradiction (16.10.2026).
test('a reward pool serves every floor up to the next pool', () => {
  const spans = endlessBossSpans(sky);
  assert.deepEqual(spans[0], { level: 1, from: 3, to: 5 });
  assert.deepEqual(
    spans.find((s) => s.level === 8),
    { level: 8, from: 24, to: 29 },
  );
  assert.deepEqual(spans.at(-1), { level: 16, from: 48, to: null });
  // Each pool ends on the floor before the next begins — no gaps, no overlaps.
  for (let i = 1; i < spans.length; i++) assert.equal(spans[i]!.from, spans[i - 1]!.to! + 1);
});

test('the merchant ladder stops a step shorter than the boss one', () => {
  const spans = endlessMerchantSpans(sky);
  assert.deepEqual(
    spans.find((s) => s.level === 8),
    { level: 8, from: 24, to: 29 },
  );
  assert.deepEqual(spans.at(-1), { level: 15, from: 45, to: null });
  assert.ok(spans.length < endlessBossSpans(sky).length);
});

test('a wave carries the span of its pool, and the deepest span is open', () => {
  const wave = endlessBossWaves(sky).find((w) => w.level === 8);
  assert.equal(endlessSpanLabel(wave!.wave, wave!.to), '24–29');
  assert.equal(endlessSpanLabel(48, null), '48+');
  const drop = endlessDrops(sky).find((d) => d.waves.some((w) => w.wave === 24));
  assert.ok(drop!.waves.some((w) => w.to === 29));
});

test('elite combos hold two to five monsters', () => {
  assert.deepEqual(eliteComboRange(sky), { min: 2, max: 5 });
});

test('chest payout follows the reward tiers', () => {
  assert.deepEqual(chestPayout(0), { level: 1, draws: 0, coinsMin: 0, coinsMax: 0 });
  const p = chestPayout(800);
  assert.equal(p.level, 3);
  assert.equal(p.draws, Math.floor(800 / 70) + 3);
});

const pools = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/pools.json'), 'utf8')) as {
  pools: Record<string, { entries: [string, number][] }>;
};

test('a full run earns what the partner stated', () => {
  const want = [
    [1, 9, 895, 15, 13424],
    [2, 12, 1254, 20, 18810],
    [3, 15, 1533, 24, 22998],
  ] as const;
  for (const [tier, floors, crystals, draws, coins] of want) {
    const run = expectedRun(sky, tier);
    assert.equal(run.floors, floors);
    assert.equal(Math.round(run.crystals), crystals);
    assert.equal(run.level, 3);
    assert.equal(run.draws, draws);
    assert.equal(run.coins, coins);
  }
});

test('a tier lists its bosses first and its first floor pool among its monsters', () => {
  const list = tierMonsters(sky, 1);
  assert.ok(list[0]?.kinds.includes('boss'));
  const ids = new Set(list.map((m) => m.id));
  for (const [id] of tierMonsterPool(sky, 1)?.entries ?? []) assert.ok(ids.has(id), id);
  // tier 2's first pool nests tier 1's: those monsters are there, marked nested
  assert.ok(tierMonsters(sky, 2).some((m) => m.nested));
});

test('endless drops index every reward row', () => {
  const drops = endlessDrops(sky);
  assert.ok(drops.length > 0);
  for (let i = 1; i < drops.length; i++) assert.ok(drops[i - 1]!.best >= drops[i]!.best);
  for (const d of drops) for (const w of d.waves) assert.ok(w.chance > 0 && w.chance <= 1);
  assert.ok(drops.some((d) => d.kind === 'stones'));
});

test('every sub-tab has facts in every language, and nothing else does', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    for (const key of SKY_SUBTABS) {
      const f = skyPageFacts(sky, null, pools, [key], lang);
      assert.ok(f && f.name && f.facts && f.description, `${lang} ${key}`);
    }
    assert.equal(skyPageFacts(sky, null, pools, ['tier4'], lang), undefined);
    assert.equal(skyPageFacts(sky, null, pools, [], lang), undefined);
    assert.equal(skyPageFacts(sky, null, pools, ['tier1', 'x'], lang), undefined);
  }
  assert.ok(isSkySubtab('scaling'));
  assert.equal(isSkySubtab('nope'), false);
});

test('a tier card shows its chest pool, heaviest first', () => {
  const items = skyPageItems(sky, pools, 'tier1');
  assert.equal(items.length, 6);
  assert.deepEqual(skyPageItems(sky, pools, 'spawns'), []);
  assert.ok(skyPageItems(sky, pools, 'endless').length > 0);
});
