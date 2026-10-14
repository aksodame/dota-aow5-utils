import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WIKI_SEGMENT } from '../seo/wiki.ts';
import { faqPage, faqPageFacts, faqPaths, faqPlain, faqSearchText, type FaqDoc } from './faq.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

const doc: FaqDoc = {
  sections: [
    { key: 'pets', title: 'Pets', blocks: [{ type: 'note', text: 'n' }, { type: 'text', text: 'Feed **them** [[item:item_1|Bone]].' }] },
    {
      key: 'drop',
      title: 'Drop',
      subs: [
        { key: 'drop', title: 'Base', blocks: [{ type: 'text', text: 'First `x`.' }] },
        { key: 'luck', title: 'Luck', blocks: [{ type: 'table', head: ['A'], rows: [['Lucky row']] }] },
      ],
    },
  ],
};

test('faqPage resolves topics and tabs, the first tab by default', () => {
  assert.equal(faqPage(doc, [])?.section.key, 'pets');
  assert.equal(faqPage(doc, ['drop'])?.sub?.key, 'drop');
  assert.equal(faqPage(doc, ['drop', 'luck'])?.blocks[0]?.type, 'table');
  assert.equal(faqPage(doc, ['nope']), undefined);
  assert.equal(faqPage(doc, ['drop', 'nope']), undefined);
  assert.equal(faqPage(doc, ['pets', 'x']), undefined);
  assert.equal(faqPage(doc, ['drop', 'luck', 'x']), undefined);
});

test('faqPageFacts names the topic, the tab and the first paragraph in plain words', () => {
  assert.deepEqual(faqPageFacts(doc, ['pets']), { name: 'Pets', facts: '', description: 'Feed them Bone.' });
  assert.deepEqual(faqPageFacts(doc, ['drop']), { name: 'Drop', facts: 'Base · Luck', description: 'First x.' });
  assert.deepEqual(faqPageFacts(doc, ['drop', 'luck']), { name: 'Drop', facts: 'Luck', description: '' });
  assert.equal(faqPageFacts(doc, ['nope']), undefined);
});

test('search text holds values, not block types', () => {
  const text = faqSearchText(doc.sections[1]!);
  assert.ok(text.includes('lucky row'));
  assert.ok(!text.includes('table'));
});

test('faqPlain strips every kind of markup', () => {
  assert.equal(faqPlain('a **b** `c` [[monster:m_1|Wolf]] [[talent:t/n|Node]]'), 'a b c Wolf Node');
});

for (const lang of ['ru', 'en', 'zh']) {
  const file = path.join(ROOT, 'content', `faq.${lang}.json`);
  if (!fs.existsSync(file)) continue;
  test(`content/faq.${lang}.json: every address is a well-formed, resolvable segment`, () => {
    const real = JSON.parse(fs.readFileSync(file, 'utf8')) as FaqDoc;
    const paths = faqPaths(real);
    assert.ok(paths.length > 0);
    for (const p of paths) {
      for (const part of p) assert.match(part, WIKI_SEGMENT);
      assert.ok(faqPageFacts(real, p), p.join('/'));
    }
  });
}
