import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWikiPage, wikiSectionLinks } from '../wiki-pages.ts';
import './faq.ts';

test('the FAQ resolves a topic, a tab, and nothing else', () => {
  const topic = resolveWikiPage('faq', ['drop'], 'ru');
  assert.ok(topic);
  assert.equal(topic.facts.path.join('/'), 'drop');
  assert.ok(topic.facts.description.length > 0);
  assert.ok(resolveWikiPage('faq', ['drop', 'luck'], 'en'));
  assert.equal(resolveWikiPage('faq', ['no_such_topic'], 'en'), undefined);
  assert.equal(resolveWikiPage('faq', ['drop', 'luck', 'x'], 'zh'), undefined);
});

test('the FAQ lists every topic and tab in every language', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const links = wikiSectionLinks('faq', lang);
    assert.ok(links.some((link) => link.href === '/wiki/faq/drop/luck'));
    assert.ok(links.every((link) => link.text.length > 0 && !link.text.includes('**')));
  }
});
