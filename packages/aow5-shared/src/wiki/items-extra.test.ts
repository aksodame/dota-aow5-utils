import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { PoolsFile } from './pools.ts';
import {
  chestVariants,
  containerChance,
  containersOf,
  seasonalPatch,
  soulCooldownAt,
  soulFragmentCost,
  sourceFileOf,
  type ItemsExtraFile,
  type LifeSoulInfo,
} from './items-extra.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki', file), 'utf8')) as T;
const extra = read<ItemsExtraFile>('items-extra.json');
const pools = read<PoolsFile>('pools.json');

const soul: LifeSoulInfo = {
  source: 'x',
  cooldown: 425,
  cdrPct: 10,
  maxUpgrade: 9,
  fragmentStep: 3,
  dismantleBase: 6,
  rulesets: ['s2'],
};

test('soul cooldown compounds per upgrade and stops at the cap', () => {
  assert.equal(soulCooldownAt(soul, 0), 425);
  assert.ok(Math.abs(soulCooldownAt(soul, 1) - 382.5) < 1e-9);
  // 425 x 0.9^9 = 164.7..., which the partner wiki shows as 165.
  assert.equal(Math.round(soulCooldownAt(soul, 9)), 165);
  assert.equal(soulCooldownAt(soul, 20), soulCooldownAt(soul, 9));
  assert.equal(soulCooldownAt(soul, -3), 425);
  assert.equal(soulCooldownAt(soul, Number.NaN), 425);
});

test('soul fragment cost grows with the level', () => {
  assert.equal(soulFragmentCost(soul, 0), 3);
  assert.equal(soulFragmentCost(soul, 4), 15);
});

test('a container chance is gate x at-least-one-of-draws', () => {
  const file: PoolsFile = {
    schema: 1,
    generatedAt: '',
    ruleset: 's2',
    pools: {
      P: {
        id: 'P',
        kind: 'drop',
        level: 1,
        entries: [
          ['a', 1],
          ['b', 3],
        ],
      },
    },
  };
  assert.equal(containerChance({ pool: 'P', chance: 28, draws: 1 }, file, 'a'), 0.28 * 0.25);
  assert.equal(containerChance({ pool: 'P', chance: 100, draws: 2 }, file, 'a'), 1 - 0.75 ** 2);
  assert.equal(containerChance({ pool: 'missing', chance: 100, draws: 1 }, file, 'a'), 0);
});

test('the tier-1 treasure chest is what the addon says it is', () => {
  const c = extra.items['item_P300']?.container;
  assert.ok(c);
  assert.equal(c.pool, 'P600');
  assert.equal(c.chance, 28);
  assert.deepEqual(c.gold, [150, 240]);
  assert.equal(sourceFileOf(extra, 'item_P300'), 'ak_items');
  assert.equal(sourceFileOf(extra, 'item_0099'), 'ak_items_equip');
  assert.equal(sourceFileOf(extra, 'no_such_item'), undefined);
});

test('every container and chest points at a pool that exists', () => {
  for (const [id, e] of Object.entries(extra.items)) {
    if (e.container) assert.ok(pools.pools[e.container.pool], `${id} -> ${e.container.pool}`);
  }
  for (const chest of Object.values(extra.chests)) {
    assert.ok(pools.pools[chest.pool], `${chest.id} -> ${chest.pool}`);
    const variants = chestVariants(extra, chest.id);
    assert.equal(variants[0], chest.items.normal);
    for (const item of variants) assert.equal(extra.items[item]?.chest?.chest, chest.id);
  }
});

test('containersOf finds the rune bags for a rune', () => {
  const found = containersOf(extra, pools, 'item_G100');
  assert.ok(found.length > 0);
  for (const f of found) assert.ok(f.chance > 0 && f.chance <= 1);
});

test('every life soul has a skill, and S2 patches exist where the README says', () => {
  for (const [id, e] of Object.entries(extra.items)) {
    if (e.soul) assert.ok(extra.soulSkills[e.soul.source], `${id} -> ${e.soul.source}`);
  }
  assert.ok(seasonalPatch(extra, 'item_0599')?.level !== undefined);
  assert.equal(seasonalPatch(extra, 'item_0599', 's1'), undefined);
});
