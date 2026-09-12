import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_BODY, MAX_COMMENT, MAX_PRICE, MAX_REFERRAL, MAX_TITLE } from 'aow5-api-contract';
import {
  countLinks,
  normaliseLine,
  normalisePrice,
  normaliseReferral,
  normaliseTier,
  stripControl,
  textLength,
  validateCommentBody,
  validateBuildFields,
} from './validate.ts';

const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(27);
const BELL = String.fromCharCode(7);

test('a Cyrillic title gets the same budget as an English one', () => {
  assert.equal(textLength('привет'), 6);
  assert.equal(textLength('hello'), 5);
  // The case that made counting code points necessary rather than length.
  assert.equal(textLength('👍'), 1, 'a surrogate pair is one character to a person');
  assert.equal('👍'.length, 2, 'and two to String.length, which is the bug');
});

test('a title is trimmed and its whitespace flattened', () => {
  const result = validateBuildFields({ title: '  Axe   jungle\n\nroute  ' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields.title, 'Axe jungle route');
});

test("a body keeps the author's paragraphs", () => {
  const result = validateBuildFields({ title: 't', body: 'first\n\nsecond' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields.body, 'first\n\nsecond');
});

test('an empty or whitespace-only title is refused', () => {
  for (const title of ['', '   ', '\n\t', undefined, 42, null]) {
    const result = validateBuildFields({ title });
    assert.equal(result.ok, false, `expected ${JSON.stringify(title)} to be refused`);
    if (result.ok) return;
    assert.ok(result.errors['title']);
  }
});

test('each field is held to its published limit', () => {
  const long = (n: number) => 'a'.repeat(n);
  assert.equal(validateBuildFields({ title: long(MAX_TITLE) }).ok, true);
  assert.equal(validateBuildFields({ title: long(MAX_TITLE + 1) }).ok, false);
  assert.equal(validateBuildFields({ title: 't', body: long(MAX_BODY + 1) }).ok, false);
});

test('control characters never reach a row', () => {
  const result = validateBuildFields({ title: `clean${NUL}er${ESC}[31m` });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields.title, 'cleaner[31m');
  assert.equal(stripControl(`a${BELL}b`), 'ab');
  assert.equal(stripControl('keep\nthis\ttoo'), 'keep\nthis\ttoo');
});

test('a language field is ignored rather than stored', () => {
  // There used to be one. It was inferred from whichever language the reader
  // had the site set to, which is not the language anybody wrote in — so it
  // split the pool of builds by a guess. An old client still sending it must
  // not be an error, it just has no effect.
  const result = validateBuildFields({ title: 't', lang: 'de' } as { title: string });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal('lang' in result.fields, false);
});

test('every broken field is reported at once, not one per round trip', () => {
  const result = validateBuildFields({ title: '', body: 'a'.repeat(MAX_BODY + 1) });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.errors).sort(), ['body', 'title']);
});

test('a summary field is ignored rather than stored', () => {
  // There was one, between the title and the notes. What went into it was
  // either the title again or the first line of the notes, so it went. An old
  // client still sending it must not be an error.
  const result = validateBuildFields({ title: 't', summary: 'gone' } as { title: string });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal('summary' in result.fields, false);
});

test('normaliseLine leaves an already-tidy string alone', () => {
  assert.equal(normaliseLine('Axe jungle route'), 'Axe jungle route');
});

test('a comment must say something and stay within its limit', () => {
  assert.equal(validateCommentBody('nice build').ok, true);
  assert.equal(validateCommentBody('   ').ok, false);
  assert.equal(validateCommentBody('').ok, false);
  assert.equal(validateCommentBody(null).ok, false);
  assert.equal(validateCommentBody('a'.repeat(MAX_COMMENT)).ok, true);
  assert.equal(validateCommentBody('a'.repeat(MAX_COMMENT + 1)).ok, false);
});

test('links in a comment are counted, so an advert can be capped', () => {
  assert.equal(countLinks('no links here'), 0);
  assert.equal(countLinks('see https://x.example and http://y.example'), 2);
  assert.equal(countLinks('www.a.example www.b.example www.c.example'), 3);
  assert.equal(countLinks('HTTPS://SHOUTY.example'), 1, 'case must not be an escape hatch');
});

test('a referral code is uppercased, tidied, and capped', () => {
  const upper = normaliseReferral('  00ejt3t3 ');
  assert.equal(upper.ok && upper.referral, '00EJT3T3');

  /*
   * A code pasted out of chat arrives wrapped, and a code with a control
   * character in it is somebody's clipboard rather than their intent. The
   * break closes up rather than becoming a space: a code is one eight-character
   * token, so a space inside one is damage — and at a cap of eight, collapsing
   * it would have made this paste too long to accept.
   */
  const pasted = normaliseReferral(`00EJ
T3T3${ESC}`);
  assert.equal(pasted.ok && pasted.referral, '00EJT3T3');

  // Nothing given, and nothing that is a string, both mean "no code".
  const missing = normaliseReferral(undefined);
  assert.equal(missing.ok && missing.referral, '');
  const wrongType = normaliseReferral(42);
  assert.equal(wrongType.ok && wrongType.referral, '');

  assert.equal(normaliseReferral('A'.repeat(MAX_REFERRAL)).ok, true);
  assert.equal(normaliseReferral('A'.repeat(MAX_REFERRAL + 1)).ok, false);
});

test('a price is a whole, non-negative number within the cap', () => {
  assert.deepEqual(normalisePrice(1_500_000_000), { ok: true, price: 1_500_000_000 });
  assert.deepEqual(normalisePrice(MAX_PRICE), { ok: true, price: MAX_PRICE });
  assert.deepEqual(normalisePrice(0), { ok: true, price: 0 });

  // Absence, in each of the three shapes a client can express it.
  for (const empty of [undefined, null, '']) {
    assert.deepEqual(normalisePrice(empty), { ok: true, price: 0 }, String(empty));
  }

  // Refused rather than clamped or rounded: storing a different number from
  // the one somebody typed is worse than telling them it was wrong.
  for (const bad of [-1, 1.5, MAX_PRICE + 1, Number.NaN, Number.POSITIVE_INFINITY, 'lots', {}]) {
    const result = normalisePrice(bad);
    assert.equal(result.ok, false, String(bad));
    if (!result.ok) assert.ok(result.errors['price'], `${String(bad)} says why`);
  }
});

test('a numeric string is accepted, because a form field is text', () => {
  assert.deepEqual(normalisePrice('250000'), { ok: true, price: 250_000 });
});

test('a tier is one of the ten keys, as a string or a number', () => {
  for (const tier of ['1', '5', '9', 'event'] as const) {
    assert.deepEqual(normaliseTier(tier), { ok: true, tier }, tier);
  }
  // A client holding the tier as a number should not have to know the wire
  // wants a string.
  assert.deepEqual(normaliseTier(5), { ok: true, tier: '5' });
});

test('no tier is a real answer, because a draft may not have picked one', () => {
  for (const empty of [undefined, null, '']) {
    assert.deepEqual(normaliseTier(empty), { ok: true, tier: null }, String(empty));
  }
});

test('anything else is refused rather than guessed at', () => {
  // `'10'` is not tier 1 and `'Event'` is not `'event'`; guessing which the
  // caller meant is how a build ends up filed where nobody looks.
  for (const bad of [0, -1, 10, 90, 1.5, '10', 'Event', 'EVENT', 'high', Number.NaN, {}]) {
    const result = normaliseTier(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    if (!result.ok) assert.ok(result.errors['tier'], `${JSON.stringify(bad)} says why`);
  }
});

