import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { useAssetsDir } from '../item-data.ts';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';
import './consumables.ts';

// The hidden items' records are read from `items.full.json` on disk.
useAssetsDir(path.resolve(fileURLToPath(import.meta.url), '../../../../../../packages/aow5-shared/public'));

test('a container resolves with its gold, its chance and its pool', () => {
  const page = resolveWikiPage('consumables', ['item_P300'], 'en');
  assert.ok(page);
  assert.match(page.facts.facts, /^Container · Lv\. 1/);
  assert.match(page.facts.description, /150–240 gold and a 28% chance/);
  assert.ok((page.icons?.length ?? 0) > 1);
});

test('hidden tower chests resolve; non-consumables and deeper paths do not', () => {
  assert.ok(resolveWikiPage('consumables', ['item_MTC001'], 'ru'));
  assert.ok(resolveWikiPage('consumables', ['item_MTB001_hard'], 'zh'));
  assert.equal(resolveWikiPage('consumables', ['item_0218'], 'en'), undefined);
  assert.equal(resolveWikiPage('consumables', ['item_P300', 'x'], 'en'), undefined);
});

test('the section lists every consumable the page lists', () => {
  const links = wikiSectionLinks('consumables', 'ru');
  assert.equal(links.length, 207); // 189 before v1.509's drink, 190 before the S3 pak
  assert.ok(links.some((link) => link.href === '/wiki/consumables/item_MTC001'));
});
