import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewriteCitations, toArchive } from './citations.ts';
import { parseMarkdown, type Inline } from './markdown.ts';
import { ARCHIVE_URL } from './links.ts';

/*
 * A citation that does not resolve is worse than no citation: a reader who
 * follows one into an empty Discord concludes the quote was invented. These
 * pin the rewrite that keeps every link in the document openable by anyone.
 */

const REAL = 'https://discord.com/channels/1506616781824069665/1538942459688525895/1544684628013621248';

function hrefs(nodes: Inline[]): string[] {
  return nodes.flatMap((n) => {
    if (n.kind === 'link') return [n.href, ...hrefs(n.children)];
    if (n.kind === 'strong' || n.kind === 'em') return hrefs(n.children);
    return [];
  });
}

test('a permalink becomes a link into the archive, keyed on channel and message', () => {
  assert.equal(toArchive(REAL), `${ARCHIVE_URL}/view#1538942459688525895/1544684628013621248`);
});

test('the canary and app hostnames are the same link', () => {
  const canary = REAL.replace('discord.com', 'canary.discord.com');
  const app = REAL.replace('discord.com', 'discordapp.com');
  assert.equal(toArchive(canary), toArchive(REAL));
  assert.equal(toArchive(app), toArchive(REAL));
});

test('the public rules channel keeps its Discord link', () => {
  // Section 10 asks the reader to go and check the server's own rules. That is
  // the one citation anyone can verify at the source, so it must not be
  // redirected to a mirror.
  const rules = 'https://discord.com/channels/1506616781824069665/1506616783111716986/1545433998212202589';
  assert.equal(toArchive(rules), null);

  const blocks = rewriteCitations(parseMarkdown(`see [rule 5](${rules})`));
  const [p] = blocks;
  assert.deepEqual(p?.kind === 'paragraph' ? hrefs(p.children) : [], [rules]);
});

test('anything that is not a message permalink is left alone', () => {
  for (const href of [
    'https://github.com/aksodame/dota-aow5-utils',
    'https://discord.com/channels/@me/123/456',
    'https://discord.com/invite/abcdef',
    'https://example.test/discord.com/channels/1/2/3',
  ]) {
    assert.equal(toArchive(href), null, href);
  }
});

test('rewrites the links inside a quote, which is where the citations live', () => {
  const source = [
    '> **я это нашел**',
    '>',
    '> — Rebilion, 02.09.2026 12:25',
    `> [1](${REAL})`,
  ].join('\n');

  const [quote] = rewriteCitations(parseMarkdown(source));
  assert.equal(quote?.kind, 'quote');
  const inner = quote?.kind === 'quote' ? quote.children : [];
  const found = inner.flatMap((b) => (b.kind === 'paragraph' ? hrefs(b.children) : []));
  assert.deepEqual(found, [`${ARCHIVE_URL}/view#1538942459688525895/1544684628013621248`]);
});

test('rewrites links in paragraphs and list items too', () => {
  const blocks = rewriteCitations(parseMarkdown(`see [this](${REAL})\n\n- and [that](${REAL})`));
  const found = blocks.flatMap((b) => {
    if (b.kind === 'paragraph') return hrefs(b.children);
    if (b.kind === 'list') return b.items.flatMap(hrefs);
    return [];
  });
  assert.equal(found.length, 2);
  assert.ok(found.every((h) => h.startsWith(ARCHIVE_URL)), found.join(' '));
});

test('leaves an off-site link in the document untouched', () => {
  const blocks = rewriteCitations(parseMarkdown('a [repo](https://github.com/aksodame/dota-aow5-utils) link'));
  const [p] = blocks;
  assert.deepEqual(p?.kind === 'paragraph' ? hrefs(p.children) : [], [
    'https://github.com/aksodame/dota-aow5-utils',
  ]);
});
