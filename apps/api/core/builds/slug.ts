/**
 * The public id in `/g/<slug>`.
 *
 * Random rather than sequential, for two reasons that have nothing to do with
 * security: `/g/1` invites a scraper to walk the whole table, and it announces
 * how many builds the site has, which is not a number a new site wants to
 * publish.
 */
import { randomBytes } from 'node:crypto';
import { SLUG_ALPHABET, SLUG_LENGTH } from 'aow5-api-contract';

/**
 * The largest multiple of the alphabet that fits in a byte.
 *
 * 256 is not a multiple of 58, so `byte % 58` would hand the first fourteen
 * glyphs a little more probability than the rest. Drawing again on anything at
 * or above this cutoff removes the bias entirely and costs, on average, about
 * one extra byte in eleven.
 */
const UNBIASED_CEILING = Math.floor(256 / SLUG_ALPHABET.length) * SLUG_ALPHABET.length;

export function generateSlug(length: number = SLUG_LENGTH): string {
  let out = '';
  while (out.length < length) {
    // Ask for what is still missing plus a margin, so the common case is one
    // syscall rather than one per character.
    for (const byte of randomBytes((length - out.length) * 2)) {
      if (byte >= UNBIASED_CEILING) continue;
      out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Whether a path segment could be a slug.
 *
 * Deliberately a shape check and not a lookup: it is what stops a malformed URL
 * reaching the database at all. The web app applies the same rule in
 * `src/lib/routes.ts`, which is why the length is a range rather than an
 * equality — a slug length changed here must not orphan links already shared.
 */
export function isSlug(value: string): boolean {
  if (value.length < 4 || value.length > 16) return false;
  for (const char of value) if (!SLUG_ALPHABET.includes(char)) return false;
  return true;
}
