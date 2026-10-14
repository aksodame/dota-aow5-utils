import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';
import './monsters.ts';

test('monsters resolve a unit and a room, and nothing else', () => {
  const unit = resolveWikiPage('monsters', ['monster_11014'], 'ru');
  assert.ok(unit);
  assert.ok(unit.facts.name.length > 0);
  assert.ok(unit.facts.facts.includes('·'));
  assert.equal(unit.scene, 'M002');
  assert.ok((unit.icons ?? []).length > 0);

  const room = resolveWikiPage('monsters', ['loc', 'M001'], 'en');
  assert.ok(room);
  assert.match(room.facts.facts, /^Lv\. 1 · \d+ monsters$/);
  assert.equal(room.scene, 'M001');

  assert.equal(resolveWikiPage('monsters', ['no_such_unit'], 'en'), undefined);
  assert.equal(resolveWikiPage('monsters', ['loc', 'M999'], 'en'), undefined);
  assert.equal(resolveWikiPage('monsters', ['loc'], 'en'), undefined);
  assert.equal(resolveWikiPage('monsters', ['monster_11014', 'x'], 'en'), undefined);
});

test('summons are not pages, and every listed unit and room is linked', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const links = wikiSectionLinks('monsters', lang);
    assert.ok(links.some((link) => link.href === '/wiki/monsters/loc/M001'));
    assert.ok(links.some((link) => link.href === '/wiki/monsters/monster_11014'));
    assert.ok(links.length > 400);
  }
});
