import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLUG_ALPHABET, SLUG_LENGTH } from 'aow5-api-contract';
import { generateSlug, isSlug } from './slug.ts';

test('a slug is the agreed length and drawn from the agreed alphabet', () => {
  for (let i = 0; i < 500; i += 1) {
    const slug = generateSlug();
    assert.equal(slug.length, SLUG_LENGTH);
    for (const char of slug) assert.ok(SLUG_ALPHABET.includes(char), `unexpected glyph ${char}`);
  }
});

test('the alphabet leaves out the glyphs people misread', () => {
  // 0/O and I/l are the pairs that get transcribed wrong off a screenshot or
  // read aloud in voice chat; - and _ wrap badly in chat clients.
  for (const char of '0OIl-_') assert.ok(!SLUG_ALPHABET.includes(char), `${char} should not be in the alphabet`);
  assert.equal(new Set(SLUG_ALPHABET).size, SLUG_ALPHABET.length, 'no glyph appears twice');
});

test('generated slugs do not collide in any quantity this site will produce', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i += 1) seen.add(generateSlug());
  assert.equal(seen.size, 20_000);
});

test('every glyph is reachable, so the draw is not quietly truncated', () => {
  // Rejection sampling is easy to get wrong in the direction of never emitting
  // the tail of the alphabet. 40k characters is far more than enough to see all 58.
  const seen = new Set<string>();
  for (let i = 0; i < 4000; i += 1) for (const char of generateSlug()) seen.add(char);
  assert.equal(seen.size, SLUG_ALPHABET.length);
});

test('isSlug accepts what generateSlug produces and rejects what a URL can carry', () => {
  assert.ok(isSlug(generateSlug()));
  for (const bad of ['', 'ab', 'a'.repeat(17), 'has space', 'has/slash', '../etc', 'O0Il', 'abc-def', 'ünïcode']) {
    assert.equal(isSlug(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});
