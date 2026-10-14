import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { PoolsFile } from './pools.ts';
import { chestPoolShares, gachaByItem, mallByItem, type SourcesFile } from './sources.ts';

/** Mall and treasure-chest indexes, against the emitted `wiki/sources.json`. */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/sources.json'), 'utf8')) as SourcesFile;

test('a boxed display twin is listed as packed', () => {
  const m = mallByItem(sources);
  assert.deepEqual(m['item_YP200'], [{ pack: '5', price: 150, count: 1, packed: true }]);
  assert.deepEqual(m['item_P200'], [{ pack: '5', price: 150, count: 1, packed: false }]);
});

test('a display row equal to a reward is not repeated', () => {
  const m = mallByItem(sources);
  assert.equal(m['item_pet_001']?.length, 1);
});

test('a display count that differs is its own row', () => {
  const weekly = mallByItem(sources)['item_M315']!.filter((r) => r.pack === '18');
  assert.deepEqual(weekly.map((r) => [r.count, r.packed]).sort(), [[18, false], [20, true]]);
});

test('chest pool shares sum to one', () => {
  for (const c of sources.gacha) {
    if (c.pools.length === 0) continue;
    const sum = chestPoolShares(c).reduce((s, x) => s + x.share, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, c.id);
  }
});

test('gachaByItem inverts chest pools', () => {
  const pools: PoolsFile = {
    schema: 1,
    generatedAt: '',
    ruleset: 's2',
    pools: { T001: { id: 'T001', kind: 'treasure', level: 3, entries: [['item_a', 1]] } },
  };
  const out = gachaByItem({ ...sources, gacha: [{ id: '9', keyCost: 1, pools: [['T001', 5]], hidden: false }] }, pools);
  assert.deepEqual(out, { item_a: [{ chest: '9', pools: ['T001'] }] });
});
