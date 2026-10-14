import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  heroByShort,
  heroFallbackSeason,
  heroPageFacts,
  heroRuneCount,
  runeTierSeasons,
  type HeroesWikiFile,
  type HeroesWikiLocale,
  type RuneFamily,
  type RulesetId,
  type WikiAbility,
  type WikiHero,
} from './progression.ts';

const DATA = join(fileURLToPath(new URL('.', import.meta.url)), '../../public/data/wiki');
const read = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;

const hero = (over: Partial<WikiHero>): WikiHero => ({
  id: 'npc_dota_hero_x',
  profession: 'x',
  short: 'x',
  tree: 'tree1',
  seasons: ['s1', 's2', 's3'],
  abilities: [],
  ...over,
});

const ability = (id: string, runes: number, seasons?: RulesetId[]): WikiAbility => ({
  id,
  slot: 'q',
  tags: [],
  texture: id,
  runes: Array.from({ length: runes }, (_, i): RuneFamily => ({ base: `item_G${i}`, tiers: [[`item_G${i}`, 1]] })),
  ...(seasons === undefined ? {} : { seasons }),
});

test('a hero is found by its short id, and its runes are the families of all its abilities', () => {
  const file: HeroesWikiFile = {
    schema: 1,
    generatedAt: '',
    season: 's2',
    genericRunes: 0,
    heroes: [hero({ abilities: [ability('a', 2), ability('b', 3)] })],
  };
  assert.equal(heroByShort(file, 'x')?.id, 'npc_dota_hero_x');
  assert.equal(heroByShort(file, 'npc_dota_hero_x'), undefined);
  assert.equal(heroRuneCount(file.heroes[0]!), 5);
});

test('a rune tier has seasons of its own only when its tuple has a third element', () => {
  const family: RuneFamily = { base: 'item_G1', rulesets: ['s3'], tiers: [['item_G1', 1], ['item_G1_2', 2, ['s2', 's3']]] };
  assert.deepEqual(runeTierSeasons(family, family.tiers[0]!), ['s3']);
  assert.deepEqual(runeTierSeasons(family, family.tiers[1]!), ['s2', 's3']);
  assert.equal(runeTierSeasons({ base: 'b', tiers: [['b', 1]] }, ['b', 1]), undefined);
});

test('the fallback season is the hero’s own when they miss the file’s, else a lacking ability’s', () => {
  assert.equal(heroFallbackSeason(hero({ seasons: ['s3'] }), 's2'), 's3');
  assert.equal(heroFallbackSeason(hero({ abilities: [ability('a', 0)] }), 's2'), null);
  assert.equal(heroFallbackSeason(hero({ abilities: [ability('a', 0, ['s3'])] }), 's2'), 's3');
});

test('the facts are role, archetype and the ability count, in the reader’s language', () => {
  const h = hero({ abilities: [ability('a', 1), ability('b', 1)] });
  const ru = heroPageFacts(h, { name: 'Акс', role: 'Воин', archetype: 'Сила · Контратака' }, 'Axe', 'ru');
  assert.equal(ru.name, 'Акс');
  assert.equal(ru.facts, 'Воин · Сила · Контратака · 2 способности');
  assert.match(ru.description, /2 руны/);
  assert.equal(heroPageFacts(h, undefined, 'Axe', 'en').facts, '2 abilities');
  assert.equal(heroPageFacts(h, undefined, 'Axe', 'en').name, 'Axe');
  assert.equal(heroPageFacts(h, undefined, undefined, 'zh').name, 'x');
});

test('every emitted hero has a URL-safe short id and facts in every language; Dragon Knight falls back to s3', () => {
  const file = read<HeroesWikiFile>('heroes-wiki.json');
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const locale = read<HeroesWikiLocale>(`locale.${lang}.heroes-wiki.json`);
    for (const h of file.heroes) {
      assert.match(h.short, /^[a-z0-9_]+$/);
      const facts = heroPageFacts(h, locale.heroes[h.id], undefined, lang);
      assert.ok(facts.name !== '' && facts.facts !== '' && facts.description !== '', `${h.short} ${lang}`);
    }
  }
  const dk = heroByShort(file, 'dragon_knight');
  if (dk !== undefined) assert.equal(heroFallbackSeason(dk, file.season), 's3');
});
