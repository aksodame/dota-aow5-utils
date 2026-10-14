import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  dropAvg,
  dropChance,
  dropCount,
  locFarm,
  monsterInSeason,
  poolFor,
  spawnWeight,
  spawnsOf,
  totalWeight,
  type Difficulty,
  type LocationsFile,
  type Monster,
  type MonstersFile,
  type PoolEntry,
} from './monsters.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki', file), 'utf8')) as T;
const monstersFile = read<MonstersFile>('monsters.json');
const locationsFile = read<LocationsFile>('locations.json');

/** The partner snapshot's difficulty table (s2, v1.507) — the same as the pak's today. */
const DIFF: Record<'easy' | 'normal' | 'hard', Difficulty> = {
  easy: { key: 'easy', dropCountBonusPct: -40, difficultyBonusPct: -35 },
  normal: { key: 'normal', dropCountBonusPct: -10, difficultyBonusPct: 0 },
  hard: { key: 'hard', dropCountBonusPct: 50, difficultyBonusPct: 200 },
};

/*
 * monster_11014 (Hell Bear, M002) exactly as the partner snapshot has it: the
 * expected numbers below are what the partner's own farm.js returns for it,
 * so they pin the port to the page people already read.
 */
const RECIPES = new Set([
  'item_YP057', 'item_1121', 'item_1136', 'item_1148', 'item_1153', 'item_1155', 'item_1230', 'item_1234',
  'item_1301', 'item_1303', 'item_1455', 'item_YP008', 'item_YP009', 'item_YP010', 'item_YP006',
]);
const POOL: PoolEntry[] = [
  ['item_YP057', 30], ['item_1121', 32], ['item_1136', 22], ['item_1148', 24], ['item_1153', 32], ['item_1155', 20],
  ['item_1230', 28], ['item_1234', 26], ['item_1301', 24], ['item_1303', 10], ['item_1455', 24], ['item_YP008', 17],
  ['item_YP009', 10], ['item_YP010', 4], ['item_YP006', 17], ['item_0124', 40], ['item_0127', 59], ['item_0128', 18],
  ['item_0130', 9], ['item_0132', 40], ['item_0134', 36], ['item_0135', 36], ['item_0140', 40], ['item_0142', 30],
  ['item_0146', 40], ['item_0156', 9], ['item_0166', 40], ['item_0299', 62], ['item_0114', 60], ['item_0115', 10],
  ['item_0118', 4], ['item_0129', 20], ['item_M104', 61], ['item_M105', 80], ['item_M106', 38], ['item_M108', 20],
  ['item_M113', 84], ['item_M514', 16], ['item_2000', 10], ['item_2001', 10], ['item_2004', 10], ['item_M109', 28],
  ['item_M111', 8], ['item_G100', 7], ['item_P000', 115], ['item_P004', 58], ['item_G400', 13],
];
const bear: Monster = {
  id: 'monster_11014',
  source: 'ak_monster',
  type: 'monster_elite',
  level: 2,
  locations: ['M002'],
  gold: 10,
  consideredHero: false,
  dropRatePct: 100,
  dropMin: 2,
  dropMax: 3,
  pool: POOL,
  poolHard: [['item_YP057', 10]],
  poolFirst: [],
};
const isRecipe = (id: string): boolean => RECIPES.has(id);
const weightOf = (pool: PoolEntry[], id: string): number => pool.find(([i]) => i === id)?.[1] ?? 0;
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('dropCount: floor the bounds, scale the cap by the difficulty, average the two', () => {
  assert.deepEqual(dropCount(bear, DIFF.easy), { lo: 2, cap: 2, avg: 2 });
  assert.deepEqual(dropCount(bear, DIFF.normal), { lo: 2, cap: 3, avg: 2.5 });
  assert.deepEqual(dropCount(bear, DIFF.hard), { lo: 2, cap: 5, avg: 3.5 });
  assert.deepEqual(dropCount({ dropMin: 1, dropMax: 1 }, undefined), { lo: 1, cap: 1, avg: 1 });
});

test('poolFor merges the hard pool by adding weights, and only on hard', () => {
  assert.equal(totalWeight(poolFor(bear, 'normal')), 1431);
  const hard = poolFor(bear, 'hard');
  assert.equal(totalWeight(hard), 1441);
  assert.equal(weightOf(hard, 'item_YP057'), 40);
  assert.equal(hard.length, POOL.length);
  assert.equal(totalWeight(poolFor(bear, 'hard', { noRecipes: true, isRecipe })), 1111);
  assert.throws(() => poolFor(bear, 'normal', { noRecipes: true }));
});

test('dropChance / dropAvg reproduce the partner page for monster_11014', () => {
  // [difficulty, chance of item_YP057, avg of item_YP057, chance of item_0127 with recipes excluded]
  const cases: ['easy' | 'normal' | 'hard', number, number, number][] = [
    ['easy', 0.04148921675918238, 0.041928721174004195, 0.10339044705550648],
    ['normal', 0.05158971763588538, 0.052410901467505246, 0.12752256774896653],
    ['hard', 0.0938302911042912, 0.09715475364330325, 0.17385575271999343],
  ];
  for (const [d, chance, avg, noRecipeChance] of cases) {
    const pool = poolFor(bear, d);
    const total = totalWeight(pool);
    close(dropChance(bear, weightOf(pool, 'item_YP057'), total, DIFF[d]), chance);
    close(dropAvg(bear, weightOf(pool, 'item_YP057'), total, DIFF[d]), avg);
    const lean = poolFor(bear, d, { noRecipes: true, isRecipe });
    close(dropChance(bear, weightOf(lean, 'item_0127'), totalWeight(lean), DIFF[d]), noRecipeChance);
  }
  assert.equal(dropChance(bear, 1, 0, DIFF.normal), 0);
});

test('spawnWeight sums count × chance, and a unit with no points counts once', () => {
  // The partner's M001: monster_10001 at 2, 3 and 3 copies, each 50%.
  assert.equal(
    spawnWeight([
      { x: 0, y: 0, chance: 50, count: 2, kind: 'SpawnPoint' },
      { x: 0, y: 0, chance: 50, count: 3, kind: 'SpawnPoint' },
      { x: 0, y: 0, chance: 50, count: 3, kind: 'SpawnPoint' },
    ]),
    4,
  );
  assert.equal(spawnWeight([]), 1);
  assert.deepEqual(spawnsOf(locationsFile, 'monster_10001', 'M001').length, 3);
  assert.equal(spawnWeight(spawnsOf(locationsFile, 'monster_10001', 'M001')), 4);
});

test('the emitted files are wired together', () => {
  const ids = new Set(monstersFile.monsters.map((m) => m.id));
  for (const loc of Object.values(locationsFile.locations)) {
    for (const id of Object.keys(loc.spawns)) assert.ok(ids.has(id), `${loc.id} places unknown ${id}`);
    for (const h of loc.hunters) assert.ok(ids.has(h.id), `${loc.id} hunter of unknown ${h.id}`);
  }
  for (const g of Object.values(monstersFile.groups)) for (const [id] of g.monsters) assert.ok(ids.has(id));
  assert.deepEqual(
    monstersFile.difficulties.map((d) => d.key),
    ['easy', 'normal', 'hard'],
  );
});

test('locFarm over the emitted data gives a sane clear of M001', () => {
  const normal = monstersFile.difficulties.find((d) => d.key === 'normal');
  const hard = monstersFile.difficulties.find((d) => d.key === 'hard');
  const a = locFarm(monstersFile.monsters, locationsFile, 'M001', normal);
  const b = locFarm(monstersFile.monsters, locationsFile, 'M001', hard);
  assert.ok(a.gold > 100 && Number.isFinite(a.gold));
  assert.equal(a.gold, b.gold, 'gold does not depend on difficulty');
  const ore = a.items.get('item_M001');
  assert.ok(ore !== undefined && ore.avg > 0 && ore.chance > 0 && ore.chance <= 1);
  assert.ok((b.items.get('item_M001')?.avg ?? 0) > ore.avg, 'hard draws more');
});

test('monsterInSeason applies only the differing fields', () => {
  const m: Monster = { ...bear, bySeason: { s1: { pool: [['x', 1]] } } };
  assert.deepEqual(monsterInSeason(m, 's1').pool, [['x', 1]]);
  assert.equal(monsterInSeason(m, 's1').dropMax, 3);
  assert.equal(monsterInSeason(m, 's3'), m);
  const seasonal = monstersFile.monsters.find((x) => x.bySeason?.s1?.pool);
  assert.ok(seasonal, 'some unit has an S1 pool of its own');
});
