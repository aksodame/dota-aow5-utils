import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryShare, poolInSeason, poolShares, poolsContaining, poolTotal, type Pool, type PoolsFile } from './pools.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const emitted = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/pools.json'), 'utf8')) as PoolsFile;

const pool: Pool = {
  id: 'X',
  kind: 'drop',
  level: 1,
  entries: [
    ['a', 3],
    ['b', 1],
    ['a', 1],
  ],
  bySeason: { s3: { level: 2, entries: [['c', 2.5]] } },
};

test('shares are weight over total, and a duplicated row counts twice', () => {
  assert.equal(poolTotal(pool), 5);
  assert.equal(entryShare(pool, 'a'), 0.8);
  assert.equal(entryShare(pool, 'b'), 0.2);
  assert.equal(entryShare(pool, 'missing'), 0);
  assert.equal(entryShare({ level: 1, entries: [] }, 'a'), 0);
  assert.deepEqual(
    poolShares(pool).map((r) => r.id),
    ['a', 'a', 'b'],
  );
});

test('a season with its own copy replaces the whole pool', () => {
  assert.equal(poolInSeason(pool), pool);
  assert.equal(poolInSeason(pool, 's1'), pool);
  assert.deepEqual(poolInSeason(pool, 's3').entries, [['c', 2.5]]);
});

test('poolsContaining inverts the pools, best share first', () => {
  const file: PoolsFile = {
    schema: 1,
    generatedAt: '',
    ruleset: 's2',
    pools: { X: pool, Y: { id: 'Y', kind: 'drop', level: 1, entries: [['a', 1]] } },
  };
  assert.deepEqual(poolsContaining(file, 'a'), [
    { pool: 'Y', share: 1 },
    { pool: 'X', share: 0.8 },
  ]);
  assert.deepEqual(poolsContaining(file, 'c', 's3'), [{ pool: 'X', share: 1 }]);
});

test('the emitted pools are well-formed', () => {
  assert.equal(emitted.ruleset, 's2');
  const ids = Object.keys(emitted.pools);
  assert.ok(ids.length >= 70, `only ${ids.length} pools`);
  for (const p of Object.values(emitted.pools)) {
    for (const body of [p, ...Object.values(p.bySeason ?? {})]) {
      for (const [id, weight] of body.entries) {
        assert.equal(typeof id, 'string');
        assert.ok(Number.isFinite(weight) && weight > 0, `${p.id}: ${id} weight ${weight}`);
      }
    }
    if (p.kind === 'treasure') assert.ok(p.treasure !== undefined, `${p.id} has its treasure numbers`);
  }
  assert.ok(emitted.pools['P600']!.entries.length > 0);
});
