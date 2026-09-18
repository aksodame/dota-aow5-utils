import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSeason } from './season.ts';

const AXE = 'npc_dota_hero_axe';
const LINA = 'npc_dota_hero_lina';
const DROW = 'npc_dota_hero_drow_ranger';
const VOID = 'npc_dota_hero_void_spirit';
const CM = 'npc_dota_hero_crystal_maiden';

test('a hero is accepted in the seasons that offer it and refused in the others', () => {
  assert.deepEqual(resolveSeason(1, LINA, null), { ok: true, season: 1 });
  assert.deepEqual(resolveSeason(2, VOID, null), { ok: true, season: 2 });
  assert.deepEqual(resolveSeason(1, AXE, null), { ok: true, season: 1 });
  assert.deepEqual(resolveSeason(2, AXE, null), { ok: true, season: 2 });
  for (const [season, hero] of [[2, LINA], [1, DROW], [1, VOID]] as const) {
    const result = resolveSeason(season, hero, null);
    assert.equal(result.ok, false, `${hero} in S${season}`);
    if (!result.ok) assert.match(result.errors['season']!, new RegExp(`S${season}`));
  }
});

test('a create that says nothing gets the first season its hero is in', () => {
  assert.deepEqual(resolveSeason(undefined, LINA, null), { ok: true, season: 1 });
  assert.deepEqual(resolveSeason(undefined, DROW, null), { ok: true, season: 2 });
  assert.deepEqual(resolveSeason(undefined, AXE, null), { ok: true, season: 1 });
  assert.deepEqual(resolveSeason(undefined, null, null), { ok: true, season: 1 });
});

test('an update that says nothing keeps the stored season, and is judged against the new hero', () => {
  assert.deepEqual(resolveSeason(undefined, AXE, 2), { ok: true, season: 2 });
  // Swapping the S2 build's hero to Lina without moving the season is a pair that disagrees.
  assert.equal(resolveSeason(undefined, LINA, 2).ok, false);
});

test('a build with no hero, or one no season lists, may sit in any season', () => {
  assert.deepEqual(resolveSeason(2, null, null), { ok: true, season: 2 });
  assert.deepEqual(resolveSeason(2, CM, null), { ok: true, season: 2 });
});

test('a season that does not exist is refused rather than guessed', () => {
  for (const bad of [3, 0, '3', 'two', null, '']) {
    assert.equal(resolveSeason(bad, null, null).ok, false, JSON.stringify(bad));
  }
  // What a form or a query string sends is fine.
  assert.deepEqual(resolveSeason('2', null, null), { ok: true, season: 2 });
});
