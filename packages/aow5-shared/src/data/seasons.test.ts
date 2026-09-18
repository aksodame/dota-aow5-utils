import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { HeroesData } from '../types/heroes.ts';
import {
  DEFAULT_SEASON,
  LATEST_SEASON,
  SEASON_KEYS,
  isHeroInSeason,
  parseSeason,
  seasonHeroes,
  seasonsOfHero,
} from './seasons.ts';

/**
 * The hand-written pools, against the heroes the game actually ships.
 *
 * Read from the emitted `heroes.json` rather than a fixture: a pool naming a
 * hero the data no longer offers is a season whose filter finds nothing and
 * whose editor offers a hero it cannot draw, and that drift is what this is for.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const heroes = (JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/heroes.json'), 'utf8')) as HeroesData).heroes;
const byId = new Map(heroes.map((hero) => [hero.id, hero]));

test('every season hero exists and is playable', () => {
  for (const season of SEASON_KEYS) {
    for (const id of seasonHeroes(season)) {
      assert.ok(byId.has(id), `S${season} names ${id}, which heroes.json does not have`);
      assert.ok(byId.get(id)!.playable, `S${season} names ${id}, which is not playable`);
    }
  }
});

test('the pools are the ones the seasons were announced with', () => {
  const short = (season: 1 | 2) => seasonHeroes(season).map((id) => id.replace('npc_dota_hero_', ''));
  assert.deepEqual(short(1), ['lina', 'phantom_assassin', 'axe']);
  assert.deepEqual(short(2), ['void_spirit', 'drow_ranger', 'axe']);
  assert.deepEqual(seasonsOfHero('npc_dota_hero_axe'), [1, 2], 'Axe is in both');
  assert.equal(isHeroInSeason('npc_dota_hero_drow_ranger', 1), false);
  assert.equal(isHeroInSeason('npc_dota_hero_lina', 2), false);
  assert.deepEqual(seasonsOfHero('npc_dota_hero_crystal_maiden'), []);
});

test('the default is the original game and the latest is the last listed', () => {
  assert.equal(DEFAULT_SEASON, 1);
  assert.equal(LATEST_SEASON, SEASON_KEYS[SEASON_KEYS.length - 1]);
});

test('a season parses from what a query string or a form sends, and nothing else', () => {
  assert.equal(parseSeason('1'), 1);
  assert.equal(parseSeason(2), 2);
  assert.equal(parseSeason('s2'), 2);
  assert.equal(parseSeason('S1'), 1);
  for (const bad of ['3', '0', '', 'two', '1.0', null, undefined, 3, 1.5]) {
    assert.equal(parseSeason(bad), null, JSON.stringify(bad));
  }
});
