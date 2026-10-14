import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { useAssetsDir } from '../item-data.ts';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';
import './craft.ts';

// The recipes are read from `items.full.json` on disk.
useAssetsDir(path.resolve(fileURLToPath(import.meta.url), '../../../../../../packages/aow5-shared/public'));

test('a craftable item resolves with its level, components, cost and unlock', () => {
  const page = resolveWikiPage('craft', ['item_M008'], 'en');
  assert.ok(page);
  assert.match(page.facts.facts, /components · craft [\d,]+ gold$/);
  assert.match(page.facts.description, /unlocked by the talent/);
  assert.ok(page.icons?.[0]);
  assert.ok((page.icons?.length ?? 0) > 1);
});

test('an item that is not crafted, and deeper paths, do not resolve', () => {
  assert.equal(resolveWikiPage('craft', ['item_M009'], 'ru'), undefined);
  assert.equal(resolveWikiPage('craft', ['item_M008', 'x'], 'zh'), undefined);
  assert.equal(resolveWikiPage('craft', ['item_0191'], 'en'), undefined); // has a recipe, not in the game
});

test('the section lists every craftable item', () => {
  const links = wikiSectionLinks('craft', 'ru');
  assert.ok(links.length > 300);
  assert.ok(links.some((link) => link.href === '/wiki/craft/item_M008'));
});
