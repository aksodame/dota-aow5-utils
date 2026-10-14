import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';
import './heroes.ts';

test('a hero page resolves by short id, with the hero art and ability icons', () => {
  const axe = resolveWikiPage('heroes', ['axe'], 'ru');
  assert.ok(axe);
  assert.equal(axe.facts.name, 'Акс');
  assert.match(axe.facts.facts, /способност/);
  assert.equal(axe.portrait, 'icons/heroes/axe.png');
  assert.ok(axe.icons !== undefined && axe.icons.length > 0 && axe.icons.length <= 6);
  assert.ok(axe.icons.every((icon) => icon !== null && icon.startsWith('icons/abilities')));
});

test('Dragon Knight, who the builder has no art for, still has a page', () => {
  const dk = resolveWikiPage('heroes', ['dragon_knight'], 'en');
  assert.ok(dk);
  assert.equal(dk.facts.name, 'Dragon Knight');
  assert.equal(dk.portrait, null);
});

test('anything else under heroes is not a page', () => {
  assert.equal(resolveWikiPage('heroes', ['npc_dota_hero_axe'], 'en'), undefined);
  assert.equal(resolveWikiPage('heroes', ['axe', 'x'], 'en'), undefined);
  assert.equal(resolveWikiPage('heroes', [], 'en'), undefined);
});

test('every hero is listed in every language', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const links = wikiSectionLinks('heroes', lang);
    assert.ok(links.some((link) => link.href === '/wiki/heroes/axe'));
    assert.ok(links.length >= 7);
    assert.ok(links.every((link) => link.text.length > 0));
  }
});
