/**
 * Checking the parts of a build that are not the board.
 *
 * Pure and framework-free, so it is tested rather than trusted. The limits come
 * from `aow5-api-contract`, which is also what the site's character counters
 * read — a limit enforced here and displayed from a different constant is a
 * user typing happily into a field that is about to be rejected.
 */
import { MAX_BODY, MAX_COMMENT, MAX_PRICE, MAX_REFERRAL, MAX_TIER, MAX_TITLE, MIN_TIER } from 'aow5-api-contract';
import { isTierKey, type TierKey } from 'aow5-shared/data';

export interface BuildFields {
  title: string;
  body: string;
}

export type FieldErrors = Record<string, string>;

/**
 * Counts characters the way a person would.
 *
 * `String.length` counts UTF-16 code units, so an emoji costs two while a
 * Cyrillic letter costs one — a Russian title would get a different budget from
 * an English one for no reason a writer could see. Spreading the string counts
 * code points instead.
 */
export function textLength(value: string): number {
  return [...value].length;
}

/**
 * Trims, and flattens the whitespace that only exists to take up room.
 *
 * Newlines and runs of spaces in a *title* are either accidental or an attempt
 * to push a card out of shape, so they collapse. `body` is left alone — its
 * line breaks are the author's.
 */
export function normaliseLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Drops control characters, which mean nothing in text somebody typed.
 *
 * A NUL truncates the string in anything C-backed that later reads it, and an
 * escape sequence in a title eventually reaches a maintainer's terminal through
 * a log line. Tab and newline are kept — they are real punctuation in a body.
 */
export function stripControl(value: string): string {
  return [...value].filter((char) => char >= ' ' || char === '\n' || char === '\t').join('');
}

/**
 * A referral code, as it gets stored.
 *
 * Uppercased rather than left as typed, because the code is compared and
 * retyped by eye — `00ejt3t3` and `00EJT3T3` are one code, and storing both
 * shapes would make two builds by the same author look like two authors. The
 * same normalisation runs in the browser so the field shows exactly what will
 * be saved; this is the copy that decides, because the browser's cannot.
 *
 * Nothing is assumed about the alphabet: the game documents the format nowhere
 * beyond "a short code", so anything printable is allowed through and only the
 * length is enforced.
 *
 * Whitespace is *removed* rather than collapsed. A code is one eight-character
 * token, so a space inside one is always damage — a line break from a chat
 * client, a wrap in a screenshot's caption — and collapsing it to a single
 * space made an eight-character code nine characters long and refused it.
 */
export function normaliseReferral(input: unknown): { ok: true; referral: string } | { ok: false; errors: FieldErrors } {
  const referral = typeof input === 'string' ? stripControl(input).replace(/\s+/gu, '').toUpperCase() : '';
  if (textLength(referral) > MAX_REFERRAL) {
    return { ok: false, errors: { referral: `Referral codes are at most ${MAX_REFERRAL} characters.` } };
  }
  return { ok: true, referral };
}

/**
 * What a guide is filed under: `'1'`..`'9'`, or `'event'`.
 *
 * Absent is `null` — a draft may not have chosen one yet — and the *publish*
 * path is what insists on a value. Anything else is refused rather than
 * coerced: `'10'` is not tier 1 and `'Event'` is not `'event'`, and guessing
 * which the caller meant is how a build ends up filed somewhere nobody looks.
 *
 * Digits arrive as strings because a form field is text. A *number* is accepted
 * too and normalised, since a client that has the tier as a number should not
 * have to know the wire wants a string.
 */
export function normaliseTier(
  input: unknown,
): { ok: true; tier: TierKey | null } | { ok: false; errors: FieldErrors } {
  if (input === undefined || input === null || input === '') return { ok: true, tier: null };

  const key = typeof input === 'number' && Number.isInteger(input) ? String(input) : input;
  if (!isTierKey(key)) {
    return { ok: false, errors: { tier: `Pick a tier from ${MIN_TIER} to ${MAX_TIER}, or Event.` } };
  }
  return { ok: true, tier: key };
}

/**
 * A price, as it gets stored.
 *
 * Refused rather than clamped when it is out of range. A referral code is
 * trimmed because a paste picks up whitespace and the author meant the code;
 * a price of nine billion is not a typo the server can silently correct into
 * four, and quietly storing a different number than somebody typed is worse
 * than telling them.
 *
 * Absent is `0`, which is also what "I would rather not say" stores as — see
 * the column. Fractions are refused rather than rounded for the same reason:
 * gold is an integer in this game, so a fractional one is a client bug worth
 * hearing about.
 */
export function normalisePrice(input: unknown): { ok: true; price: number } | { ok: false; errors: FieldErrors } {
  if (input === undefined || input === null || input === '') return { ok: true, price: 0 };
  const price = typeof input === 'number' ? input : Number(input);

  if (!Number.isFinite(price) || !Number.isInteger(price)) {
    return { ok: false, errors: { price: 'A price is a whole number of gold.' } };
  }
  if (price < 0) return { ok: false, errors: { price: 'A price cannot be negative.' } };
  if (price > MAX_PRICE) {
    return { ok: false, errors: { price: `Prices are at most ${MAX_PRICE.toLocaleString('en')} gold.` } };
  }
  return { ok: true, price };
}

/**
 * There is deliberately no language field.
 *
 * It existed, was inferred from whichever language the *reader* had the site
 * set to — which is not the language anyone wrote in — and then split an
 * already-small pool of builds by that guess. Removing it removed a filter that
 * was wrong more often than it was useful.
 */
export function validateBuildFields(input: {
  title?: unknown;
  body?: unknown;
}): { ok: true; fields: BuildFields } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const title = typeof input.title === 'string' ? normaliseLine(stripControl(input.title)) : '';
  if (title === '') errors['title'] = 'A build needs a title.';
  else if (textLength(title) > MAX_TITLE) errors['title'] = `Titles are at most ${MAX_TITLE} characters.`;

  // Newlines survive here; the author's paragraphs are the point.
  const body = typeof input.body === 'string' ? stripControl(input.body).trim() : '';
  if (textLength(body) > MAX_BODY) errors['body'] = `Builds are at most ${MAX_BODY} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, fields: { title, body } };
}

export function validateCommentBody(input: unknown): { ok: true; body: string } | { ok: false; errors: FieldErrors } {
  const body = typeof input === 'string' ? stripControl(input).trim() : '';
  if (body === '') return { ok: false, errors: { body: 'Say something first.' } };
  if (textLength(body) > MAX_COMMENT) {
    return { ok: false, errors: { body: `Comments are at most ${MAX_COMMENT} characters.` } };
  }
  return { ok: true, body };
}

/**
 * How many links a comment may carry.
 *
 * Not a spam filter — it is the cheapest rule that makes a comment useless as
 * an advertisement while leaving "here is the VOD, here is the other build"
 * perfectly possible.
 */
export const MAX_LINKS_PER_COMMENT = 2;

export function countLinks(value: string): number {
  return (value.match(/https?:\/\/|www\./gi) ?? []).length;
}
