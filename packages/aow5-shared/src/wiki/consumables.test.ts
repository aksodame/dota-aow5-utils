import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ItemsExtraFile } from './items-extra.ts';
import type { PoolsFile } from './pools.ts';
import {
  chestDraws,
  chestVariantDraws,
  consumableCategory,
  consumableFactsInput,
  consumableName,
  consumablePageFacts,
  consumablePool,
  consumableUseMax,
  inConsumables,
  towerChestOf,
} from './consumables.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', file), 'utf8')) as T;
const extra = read<ItemsExtraFile>('wiki/items-extra.json');
const full = read<Record<string, { id: string; type: string; flags?: { inGame?: number } }>>('items.full.json');

test('containers and tower chests open their pools', () => {
  assert.equal(consumablePool(extra, 'item_P300'), 'P600');
  assert.equal(consumablePool(extra, 'item_MTB001_hard'), 'MT_CHEST_mine_1');
  assert.equal(consumablePool(extra, 'item_MTC001'), 'MT_CHEST_mine_1');
  assert.equal(consumableCategory(extra, 'item_P300'), 'container');
  assert.equal(towerChestOf(extra, 'item_MTC001')?.ref.variant, 'temporary');
});

test('a use cap makes an item single-use, the potions file makes it a consumable', () => {
  assert.equal(consumableUseMax(extra, 'item_M500'), 20);
  assert.equal(consumableCategory(extra, 'item_M500'), 'limited');
  assert.equal(inConsumables(extra, { id: 'item_M500', type: 'material' }), true);
  // A sword is not.
  assert.equal(inConsumables(extra, { id: 'item_0218', type: 'equip' }), false);
});

// 189 when the partner counted them; v1.509's drink — item_P275 «Бесконечный
// купаж» — makes 190. The number is the guard: it moves only when the pack gains
// or loses a consumable, which is what a data refresh is for.
test('the rule picks the partner wiki’s 190 in-game consumables', () => {
  const ids = Object.values(full).filter((item) => item.flags?.inGame === 1 && inConsumables(extra, item));
  assert.equal(ids.length, 190);
  assert.ok(ids.some((item) => item.id === 'item_P275'), 'the v1.509 drink is one of them');
});

test('tower chest draws: easy 70 %, hard 150 %, rounded', () => {
  const chest = extra.chests.mine_1!;
  assert.deepEqual(chestDraws(chest), { easy: 4, normal: 5, hard: 8 });
  assert.equal(chestVariantDraws(chest, 'temporary'), undefined);
  assert.equal(chestVariantDraws(chest, 'hard'), 8);
});

test('page facts read in each language', () => {
  const input = {
    name: 'Tier 1 Treasure Chest',
    category: 'container' as const,
    level: 1,
    cost: 300,
    pool: { name: 'P600', size: 12 },
    chance: 28,
    draws: 1,
    gold: [150, 240] as [number, number],
  };
  const en = consumablePageFacts(input, 'en');
  assert.equal(en.facts, 'Container · Lv. 1 · 300 gold');
  assert.match(en.description, /150–240 gold and a 28% chance of a draw from P600/);
  assert.match(consumablePageFacts(input, 'ru').description, /с шансом 28 %/);
  assert.match(consumablePageFacts({ ...input, pool: undefined, gold: undefined, category: 'plain' }, 'zh').description, /消耗品/);
});

test('names fall back to the pool, and the facts input carries the S2 numbers', () => {
  const poolNames = { MT_CHEST_mine_1: 'Mine Tower Chest Level 1' };
  assert.equal(consumableName(extra, 'item_MTC001', undefined, poolNames), 'Mine Tower Chest Level 1');
  assert.equal(consumableName(extra, 'item_M550', undefined, poolNames), 'item_M550');
  assert.equal(consumableName(extra, 'item_P300', 'Tier 1 Treasure Chest', poolNames), 'Tier 1 Treasure Chest');

  const pools = read<PoolsFile>('wiki/pools.json');
  const input = consumableFactsInput(extra, pools, { id: 'item_MTB001_hard', name: 'x', level: 10, cost: 0 }, { pools: poolNames, towers: { mine: 'Mine Tower' } });
  assert.deepEqual(input.chest, { tower: 'Mine Tower', level: 1, variant: 'hard' });
  assert.equal(input.draws, 8);
  assert.equal(input.pool?.name, 'Mine Tower Chest Level 1');
});
