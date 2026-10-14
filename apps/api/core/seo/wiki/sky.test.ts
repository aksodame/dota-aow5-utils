import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';
import './sky.ts';

test('the Sky resolves each sub-tab, and nothing else', () => {
  const tier = resolveWikiPage('sky', ['tier2'], 'ru');
  assert.ok(tier);
  assert.equal(tier.tier, 'T2');
  assert.ok(tier.facts.description.length > 0);
  assert.ok((tier.icons ?? []).length > 0 && (tier.icons ?? []).every((icon) => icon !== null));
  for (const key of ['tier1', 'tier3', 'endless', 'spawns', 'combos', 'scaling']) assert.ok(resolveWikiPage('sky', [key], 'en'), key);
  assert.equal(resolveWikiPage('sky', ['tier4'], 'en'), undefined);
  assert.equal(resolveWikiPage('sky', ['tier1', 'x'], 'zh'), undefined);
});

test('the Sky lists its seven pages in every language', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const links = wikiSectionLinks('sky', lang);
    assert.equal(links.length, 7);
    assert.ok(links.some((link) => link.href === '/wiki/sky/endless'));
  }
});
