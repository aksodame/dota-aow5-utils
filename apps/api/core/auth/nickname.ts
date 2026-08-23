/**
 * The name people sign in with, and the one everybody else reads.
 *
 * One name, not a login plus a display name. Two would mean two things to
 * moderate and two to render, and the display one would become the
 * impersonation surface with none of the uniqueness protection on the other.
 *
 * ## Cyrillic is allowed, and that is the whole difficulty
 *
 * Most of this site's readers write Russian, so an ASCII-only rule would tell
 * half of them to invent a transliteration — and with no password recovery,
 * forgetting how you spelled your own name is losing the account. So Cyrillic
 * is in, and everything below follows from letting it in.
 */
import { MAX_NICKNAME, MIN_NICKNAME } from 'aow5-api-contract';
import { stripControl, textLength } from '../builds/validate.ts';

const LATIN = /^[A-Za-z]$/;
const CYRILLIC = /^[А-Яа-яЁё]$/;
const DIGIT = /^[0-9]$/;
const SEPARATOR = /^[_-]$/;

/**
 * Names nobody may hold, checked against the *key* so that every casing and
 * every `ё` spelling collapses to one entry.
 */
const RESERVED = new Set([
  'admin',
  'administrator',
  'root',
  'moderator',
  'mod',
  'support',
  'staff',
  'system',
  'official',
  'api',
  'me',
  'null',
  'undefined',
  'anonymous',
  'guest',
  'deleted',
  'removed',
  'aow5',
  'aow',
  'dota',
  // The same words the audience would actually try.
  'админ',
  'администратор',
  'модератор',
  'поддержка',
  'система',
  'гость',
  'удален',
]);

/**
 * The value the unique index is built on.
 *
 * **Not** SQLite's `NOCASE`, and not its `lower()`: both fold ASCII only, so
 * with either of them `Вася` and `вася` would be two separate accounts that
 * render identically on a build card — an impersonation hole aimed squarely at
 * the largest part of this audience. JavaScript's `toLowerCase` is full-Unicode,
 * so the folding happens here and the database just enforces uniqueness on the
 * result.
 *
 * `ё` folds to `е` deliberately. In Russian practice the two are written
 * interchangeably, which makes `Пётр` and `Петр` a ready-made impersonation
 * pair. The cost is that only one person can hold that name; the `ё` is kept in
 * `nickname` itself and is what gets displayed.
 */
export function nicknameKey(nickname: string): string {
  return nickname.normalize('NFC').toLowerCase().replaceAll('ё', 'е');
}

export type NicknameVerdict = { ok: true; nickname: string; key: string } | { ok: false; error: string };

/**
 * Checks a nickname somebody typed, and returns the form to store.
 *
 * Normalising to NFC first is what makes `й` work: composed (U+0439) and
 * decomposed (U+0438 U+0306) are the same name, and only one of them is a
 * single code point the whitelist below would accept.
 */
export function checkNickname(raw: unknown): NicknameVerdict {
  if (typeof raw !== 'string') return { ok: false, error: 'required' };

  const nickname = stripControl(raw).trim().normalize('NFC');
  const length = textLength(nickname);
  if (length < MIN_NICKNAME) return { ok: false, error: 'too-short' };
  if (length > MAX_NICKNAME) return { ok: false, error: 'too-long' };

  const characters = [...nickname];
  let sawLatin = false;
  let sawCyrillic = false;
  let sawLetter = false;

  for (const [index, character] of characters.entries()) {
    const isLatin = LATIN.test(character);
    const isCyrillic = CYRILLIC.test(character);
    const isDigit = DIGIT.test(character);
    const isSeparator = SEPARATOR.test(character);

    if (!isLatin && !isCyrillic && !isDigit && !isSeparator) return { ok: false, error: 'bad-character' };
    if (isLatin) sawLatin = true;
    if (isCyrillic) sawCyrillic = true;
    if (isLatin || isCyrillic) sawLetter = true;

    if (isSeparator) {
      // A name that opens or closes on punctuation reads as a typo, and a
      // doubled separator is the cheapest way to make two names look alike.
      if (index === 0 || index === characters.length - 1) return { ok: false, error: 'bad-separator' };
      if (SEPARATOR.test(characters[index - 1]!)) return { ok: false, error: 'bad-separator' };
    }
  }

  if (!sawLetter) return { ok: false, error: 'no-letter' };

  /*
   * One script per name — the homoglyph defence, and the reason it is worth ten
   * lines.
   *
   * Latin `a` and Cyrillic `а` are different code points that render
   * identically, so without this rule `аdmin` (Cyrillic а, Latin dmin) is a
   * name anybody can take. Requiring a single script kills that outright,
   * because `d`, `m`, `i` and `n` have no Cyrillic lookalikes.
   *
   * What it does not close: short words spelled entirely from the confusable
   * set — `сор` and `cop`, `хек` and `xek`. Closing those properly means a full
   * Unicode confusables table, which is a data file and a dependency-shaped
   * thing for a threat this site does not have. The residual is real and small,
   * and there is a test that documents it rather than pretending otherwise.
   */
  if (sawLatin && sawCyrillic) return { ok: false, error: 'mixed-script' };

  const key = nicknameKey(nickname);
  if (RESERVED.has(key)) return { ok: false, error: 'reserved' };
  // Leaves room for a future "delete my account" that renames rather than drops.
  if (/^(deleted|removed)[_-]?\d*$/.test(key)) return { ok: false, error: 'reserved' };

  return { ok: true, nickname, key };
}
