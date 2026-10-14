import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';
import './vendors.ts';

test('vendors resolve each merchant and guild tab, and nothing else', () => {
  const regular = resolveWikiPage('vendors', ['regular'], 'en');
  assert.ok(regular);
  assert.ok(regular.facts.facts.includes('Gold'));
  assert.ok((regular.icons ?? []).length > 0);
  assert.ok(resolveWikiPage('vendors', ['ancient'], 'ru'));
  assert.ok(resolveWikiPage('vendors', ['guild'], 'zh'));
  assert.ok(resolveWikiPage('vendors', ['guild', 'exchange'], 'en'));
  assert.equal(resolveWikiPage('vendors', ['guild', 'nope'], 'en'), undefined);
  assert.equal(resolveWikiPage('vendors', ['someone'], 'en'), undefined);
});

test('vendors list four pages in every language', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const links = wikiSectionLinks('vendors', lang);
    assert.equal(links.length, 4);
    assert.ok(links.some((link) => link.href === '/wiki/vendors/guild/exchange'));
  }
});
