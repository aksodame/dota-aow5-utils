import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LANGUAGES } from '../i18n/strings.ts';
import {
  LETTERS,
  PREFERRED_LETTER_LANG,
  SUPPORT_EMAIL,
  composeHref,
  letterText,
  type LetterLinks,
} from './mail.ts';

/*
 * The letter is a template on a public page: nobody reviews it again before it
 * is sent, and a reader who copies it cannot tell that a link came out empty.
 * So what is pinned here is the part that would ship broken and silently — a
 * missing language, an unfilled link, a `mailto:` a client cannot parse.
 */

const LINKS: LetterLinks = {
  report: 'https://aow5.example/report',
  archive: 'https://archive.example',
};

test('every language the site offers has a letter', () => {
  for (const lang of LANGUAGES) {
    const letter = LETTERS[lang];
    assert.ok(letter !== undefined, `no letter for ${lang}`);
    assert.ok(letter.subject.trim().length > 0, `empty subject for ${lang}`);
    assert.ok(letter.body(LINKS).length > 500, `suspiciously short body for ${lang}`);
  }
});

test('the language the recipient is most likely to read is one of them', () => {
  assert.ok(LANGUAGES.includes(PREFERRED_LETTER_LANG));
});

test('each letter carries both links, filled in', () => {
  for (const lang of LANGUAGES) {
    const body = LETTERS[lang].body(LINKS);
    assert.ok(body.includes(LINKS.report), `${lang} does not link the report`);
    assert.ok(body.includes(LINKS.archive), `${lang} does not link the archive`);
  }
});

test('nothing is left as a placeholder', () => {
  for (const lang of LANGUAGES) {
    const text = letterText(LETTERS[lang], LINKS);
    assert.doesNotMatch(text, /\$\{|\{report\}|\{archive\}|TODO/, `${lang} has an unfilled marker`);
  }
});

test('every letter is signed and says who is writing', () => {
  for (const lang of LANGUAGES) {
    const body = LETTERS[lang].body(LINKS);
    assert.match(body, /@i_love_http/, `${lang} is unsigned`);
  }
});

test('the letters are actually different texts', () => {
  const bodies = LANGUAGES.map((lang) => LETTERS[lang].body(LINKS));
  assert.equal(new Set(bodies).size, bodies.length);
});

test('the mailto carries the address, the subject and the body', () => {
  const href = composeHref(LETTERS.en, LINKS);
  assert.ok(href.startsWith(`mailto:${SUPPORT_EMAIL}?`));

  const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
  assert.equal(query.get('subject'), LETTERS.en.subject);
  assert.equal(query.get('body'), LETTERS.en.body(LINKS));
});

test('the mailto encodes spaces as %20, not as +', () => {
  // `+` in a mailto body reaches the composer as a literal plus, which turns
  // every space in the letter into one.
  const href = composeHref(LETTERS.en, LINKS);
  assert.ok(!href.includes('+'), 'a raw + survived into the mailto');
  assert.ok(href.includes('%20'));
});

test('the copied text leads with the subject', () => {
  const text = letterText(LETTERS.ru, LINKS);
  assert.ok(text.startsWith(LETTERS.ru.subject));
  assert.ok(text.endsWith(LETTERS.ru.body(LINKS)));
});
