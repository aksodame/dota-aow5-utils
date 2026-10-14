import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  dropAvg,
  dropChance,
  locFarm,
  locationFactsInput,
  locationPageFacts,
  monsterFactsInput,
  monsterPageFacts,
  monsterRoomAverages,
  monsterSpawnGroups,
  monsterTypeGroup,
  monsterTypeRank,
  poolFor,
  roomLoot,
  spawnWeight,
  spawnsOf,
  topMonsterDrops,
  totalWeight,
  type Difficulty,
  type LocationsFile,
  type Monster,
  type MonstersFile,
  type SpawnPoint,
} from './monsters.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki', file), 'utf8')) as T;
const monstersFile = read<MonstersFile>('monsters.json');
const locationsFile = read<LocationsFile>('locations.json');
const hard = monstersFile.difficulties.find((d) => d.key === 'hard') as Difficulty;

const point = (chance: number, count = 1): SpawnPoint => ({ x: 0, y: 0, chance, count, kind: 'Monster' });

test('type groups: buildings are elites, breakables are containers, summons and traps are not listed', () => {
  assert.equal(monsterTypeGroup('building'), 'elite');
  assert.equal(monsterTypeGroup('destructible'), 'container');
  assert.equal(monsterTypeGroup('summoned'), undefined);
  assert.equal(monsterTypeGroup('monster_trap'), undefined);
  assert.ok(monsterTypeRank('monster_boss') < monsterTypeRank('monster_miniboss'));
  assert.ok(monsterTypeRank('monster_normal') < monsterTypeRank('destructible'));
  assert.equal(monsterTypeRank('summoned'), 99);
});

test('monsterSpawnGroups folds points by chance, most likely first', () => {
  const groups = monsterSpawnGroups([point(50), point(50, 2), point(100), point(50)]);
  assert.deepEqual(groups, [
    { chance: 100, count: 1, points: 1 },
    { chance: 50, count: 4, points: 3 },
  ]);
});

test('roomLoot agrees with locFarm and folds the clear chance as 1 − Π(1 − c)^kills', () => {
  const loot = roomLoot(monstersFile.monsters, locationsFile, 'M001', hard);
  const farm = locFarm(monstersFile.monsters, locationsFile, 'M001', hard);
  assert.equal(loot.length, farm.items.size);
  for (const item of loot) {
    const f = farm.items.get(item.id)!;
    assert.ok(Math.abs(f.avg - item.avg) < 1e-9);
    assert.ok(Math.abs(f.chance - item.best) < 1e-12);
    assert.ok(item.clear >= item.best - 1e-12 || item.kills < 1, `${item.id}: a clear is at least one kill when kills ≥ 1`);
    assert.ok(item.clear <= 1);
  }
  for (let i = 1; i < loot.length; i++) assert.ok(loot[i - 1]!.best >= loot[i]!.best);

  // One item by hand.
  const one = loot[0]!;
  let miss = 1;
  for (const m of monstersFile.monsters) {
    if (!m.locations.includes('M001')) continue;
    const pool = poolFor(m, 'hard');
    const entry = pool.find(([id]) => id === one.id);
    if (entry === undefined) continue;
    miss *= Math.pow(1 - dropChance(m, entry[1], totalWeight(pool), hard), spawnWeight(spawnsOf(locationsFile, m.id, 'M001')));
  }
  assert.ok(Math.abs(one.clear - (1 - miss)) < 1e-12);
});

test('monsterRoomAverages is the per-kill average times the spawn weight', () => {
  const m = monstersFile.monsters.find((x) => spawnsOf(locationsFile, x.id, 'M001').length > 0 && x.pool.length > 0) as Monster;
  const points = spawnsOf(locationsFile, m.id, 'M001');
  const avgs = monsterRoomAverages(m, points, hard);
  const pool = poolFor(m, 'hard');
  const [id, weight] = pool[0]!;
  assert.ok(Math.abs(avgs.get(id)! - dropAvg(m, weight, totalWeight(pool), hard) * spawnWeight(points)) < 1e-12);
});

test('topMonsterDrops returns distinct ids, best first, capped', () => {
  const boss = monstersFile.monsters.find((m) => m.type === 'monster_boss' && m.pool.length > 6) as Monster;
  const top = topMonsterDrops([boss], hard, 6);
  assert.equal(top.length, 6);
  assert.equal(new Set(top).size, 6);
});

test('page facts: the same sentence in each language, rooms lowest first', () => {
  const m: Monster = {
    ...monstersFile.monsters[0]!,
    id: 'x',
    type: 'monster_boss',
    level: 7,
    locations: ['B', 'A'],
    pool: [['i1', 1], ['i2', 1]],
    poolHard: [['i3', 1]],
  };
  const rooms: Record<string, { name: string; level: number }> = { A: { name: 'Alpha', level: 1 }, B: { name: 'Beta', level: 5 } };
  const input = monsterFactsInput(m, { x: 'Hell Bear' }, (code) => rooms[code]);
  assert.deepEqual(input.rooms, ['Alpha', 'Beta']);
  assert.equal(input.drops, 3);
  const en = monsterPageFacts(input, 'en');
  assert.equal(en.facts, 'Boss · Lv. 7 · Alpha, Beta');
  assert.match(en.description, /Hell Bear, boss \(Lv\. 7\)/);
  assert.equal(monsterPageFacts(input, 'ru').facts, 'Босс · ур. 7 · Alpha, Beta');
  assert.match(monsterPageFacts(input, 'ru').description, /3 предмета/);

  const loc = locationFactsInput(monstersFile.monsters, 'M001', {}, { name: 'Mine', level: 1, bosses: [] });
  assert.ok(loc.monsters > 5);
  assert.equal(locationPageFacts(loc, 'en').facts, `Lv. 1 · ${loc.monsters} monsters`);
});
