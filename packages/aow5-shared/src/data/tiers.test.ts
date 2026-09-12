import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { MapsData } from '../types/maps.ts';
import { TIER_KEYS, categoryOfMap, isOffered, listedMaps, listedTiers, tierLabel, tierShort } from './tiers.ts';

/**
 * The site's curation, against the rooms the game actually ships.
 *
 * Worth a test because this table is the one place the API and the site have to
 * agree: the server refuses a build whose tier disagrees with its rooms, so a
 * room the site offers under a category the server computes differently is a
 * save nobody can complete. Everything here reads the emitted `maps.json`
 * rather than a fixture — a curation entry for a room that no longer exists is
 * exactly the drift this is for.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const maps = (JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/maps.json'), 'utf8')) as MapsData).maps;
const byId = new Map(maps.map((map) => [map.id, map]));

test('every curated room is a room that exists', () => {
  // The overrides are keyed by id, so a typo or a removed room would otherwise
  // be a line that silently does nothing.
  for (const id of ['M010', 'M013', 'M014', 'G001', 'M015', 'M021', 'M022']) {
    assert.ok(byId.has(id), `${id} is named in the curation but not in maps.json`);
  }
});

test('the corrections put three rooms where they are played, not where the data says', () => {
  const at = (id: string) => categoryOfMap(byId.get(id)!);
  assert.equal(at('M010'), '7', 'Ender Shrine sits at 8 in the data');
  assert.equal(at('M014'), '5', 'Ender Thunder Mountain sits at 8 in the data');
  assert.equal(at('M013'), '8', 'Shrine of Desire sits at 9 in the data');
});

test('event content is event content whatever tier the data gives it', () => {
  for (const id of ['G001', 'M015', 'M021', 'M022']) {
    assert.equal(categoryOfMap(byId.get(id)!), 'event', id);
  }
});

test('an uncurated room keeps the tier the game gave it', () => {
  const plain = maps.find((map) => !['M010', 'M013', 'M014', 'G001', 'M015', 'M021', 'M022'].includes(map.id))!;
  assert.equal(categoryOfMap(plain), String(plain.tier));
});

test('every room is offered, and the list is ordered by category then name', () => {
  const listed = listedMaps(maps.map((map) => ({ ...map, name: map.id })));
  assert.equal(listed.length, maps.filter((map) => isOffered(map)).length);

  for (let i = 1; i < listed.length; i += 1) {
    const before = TIER_KEYS.indexOf(categoryOfMap(listed[i - 1]!));
    const after = TIER_KEYS.indexOf(categoryOfMap(listed[i]!));
    assert.ok(before <= after, `${listed[i - 1]!.id} then ${listed[i]!.id}`);
  }
});

test('only tiers with a room behind them are offered', () => {
  /*
   * The reason T9 is not a chip: the curation moved the Shrine of Desire down
   * to 8, and nothing else in the game is a ninth-tier room. If the addon ships
   * one, this test fails and the chip comes back — which is the notification,
   * not a regression.
   */
  const offered = listedTiers(maps);
  assert.ok(!offered.includes('9'), 'no room is at tier 9 today');
  assert.deepEqual(offered, ['1', '2', '3', '4', '5', '6', '7', '8', 'event']);

  for (const map of maps) {
    if (!isOffered(map)) continue;
    assert.ok(offered.includes(categoryOfMap(map)), `${map.id} is offered under a tier that is not`);
  }
});

test('a category is a mark where space is short and a word where it is not', () => {
  assert.equal(tierShort('7'), 'T7');
  assert.equal(tierShort('event'), 'E');
  assert.equal(tierLabel('7', 'Event'), 'T7', 'a numbered tier is the same in every language');
  assert.equal(tierLabel('event', 'Событие'), 'Событие');
});
