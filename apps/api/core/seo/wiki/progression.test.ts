import assert from 'node:assert/strict';
import test from 'node:test';
import './progression.ts';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';

test('progression pages resolve with facts and icons', () => {
  const tree = resolveWikiPage('progression', ['tree1'], 'en');
  assert.ok(tree?.facts.name);
  const node = resolveWikiPage('progression', ['tree1', 'T002'], 'ru');
  assert.ok(node?.facts.facts.includes('×'));
  assert.equal(node?.icons?.[0], 'icons/talents/' + 'icon_m7.png');
  assert.ok(resolveWikiPage('progression', ['heroes', 'axe'], 'zh'));
  assert.ok(resolveWikiPage('progression', ['heroes'], 'en'));
  assert.equal(resolveWikiPage('progression', ['tree20'], 'en'), undefined);
  assert.equal(resolveWikiPage('progression', ['heroes', 'pudge'], 'en'), undefined);
});

test('every listed page resolves', () => {
  const links = wikiSectionLinks('progression', 'en');
  assert.ok(links.length > 700);
  for (const link of links) {
    const path = link.href.split('/wiki/progression/')[1]!.split('/');
    assert.ok(resolveWikiPage('progression', path, 'en'), link.href);
  }
});
