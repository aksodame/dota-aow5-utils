/**
 * The three languages of the hand-written content have to stay in step.
 *
 * The text is translated, the *structure* is not: a section, its sub-tabs, the
 * shape of every block (a table with four columns and three rows stays a table
 * with four columns and three rows) and the list of patchnote versions are the
 * same in Russian, English and Chinese. This is the test that notices when one
 * language gained a paragraph, a row or a whole release and the other two did
 * not — a mistake that is invisible in review and obvious on the published page.
 *
 * Only files that exist in three languages are checked. `guild-orders.json` is
 * single-language by design and is left alone.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FaqBlock, FaqDoc } from './faq.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const CONTENT = path.join(ROOT, 'content');
const LANGS = ['ru', 'en', 'zh'] as const;

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(CONTENT, file), 'utf8')) as T;

/** What a block *is*, with the words taken out. */
function blockShape(block: FaqBlock): string {
  switch (block.type) {
    case 'text':
    case 'note':
      return block.type;
    case 'list':
      return `list:${block.items.length}`;
    case 'table':
      return `table:${block.head.length}x${block.rows.length}`;
    case 'columns':
      return `columns:${block.cols.map((col) => `${col.head.length}x${col.rows.length}`).join('|')}`;
    case 'kv':
      return `kv:${block.items.length}`;
    // Pool ids are game data, not prose: they must match literally.
    case 'pools':
      return `pools:${block.pools.map((pool) => pool.id).join('|')}`;
  }
}

/** Sections, tabs and block shapes — the part of the FAQ that is not translated. */
function faqShape(doc: FaqDoc): unknown {
  return doc.sections.map((section) => ({
    key: section.key,
    blocks: (section.blocks ?? []).map(blockShape),
    subs: (section.subs ?? []).map((sub) => ({ key: sub.key, blocks: sub.blocks.map(blockShape) })),
  }));
}

interface Patchnote {
  version: string;
  date: string;
  game: string[];
  wiki: string[];
}
interface Patchnotes {
  notes: Patchnote[];
}

/** Releases, their dates and how many bullets each of the two lists carries. */
function notesShape(doc: Patchnotes): unknown {
  return doc.notes.map((note) => ({
    version: note.version,
    date: note.date,
    game: note.game.length,
    wiki: note.wiki.length,
  }));
}

test('the FAQ has the same sections, tabs and block shapes in all three languages', () => {
  const [ru, ...rest] = LANGS.map((lang) => faqShape(read<FaqDoc>(`faq.${lang}.json`)));
  for (const [index, shape] of rest.entries()) {
    assert.deepEqual(shape, ru, `faq.${LANGS[index + 1]}.json does not match faq.ru.json`);
  }
});

test('every patchnote release is present in all three languages, with the same date and the same number of entries', () => {
  const [ru, ...rest] = LANGS.map((lang) => notesShape(read<Patchnotes>(`patchnotes.${lang}.json`)));
  for (const [index, shape] of rest.entries()) {
    assert.deepEqual(shape, ru, `patchnotes.${LANGS[index + 1]}.json does not match patchnotes.ru.json`);
  }
});
