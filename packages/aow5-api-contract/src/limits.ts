/**
 * The numbers both sides enforce.
 *
 * They live here, in one file neither the site nor the API owns, so that the
 * character counter under a title input and the rejection that would follow it
 * cannot drift apart. A limit changed on one side only is a user typing happily
 * into a field that is about to 400.
 */

/** Published or draft, per account. The cap is structural — see the API's schema. */
export const MAX_BUILDS_PER_USER = 5;

export const MAX_TITLE = 80;
export const MAX_BODY = 8000;
export const MAX_COMMENT = 2000;

/**
 * The encoded board, in characters.
 *
 * The web app's README puts the worst case — nine sections, every slot filled,
 * names and descriptions at their caps — well under 3 kB. 4096 leaves room for
 * a codec version that grows the payload without letting anyone store a novel
 * in a field that is supposed to hold a build.
 */
export const MAX_PAYLOAD_CHARS = 4096;

/** Characters in a build's public id, the `<slug>` in `/g/<slug>`. */
export const SLUG_LENGTH = 10;

/**
 * Slugs are base58: base64url minus the glyphs that get misread aloud or in a
 * screenshot (`0`/`O`, `I`/`l`) and minus `-`/`_`, which line-wrap badly in
 * chat clients. 58^10 is ~4.3e17, so collisions are not a thing we plan for.
 */
export const SLUG_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const PAGE_SIZE = 20;

/**
 * How long after posting a comment may still be edited, in **seconds**.
 *
 * Seconds because every timestamp on the wire and in the database is unix
 * seconds, and one unit throughout is worth more than the convenience of
 * milliseconds in one place.
 *
 * Bounded rather than open-ended: a comment is part of somebody else's page,
 * and rewriting one after people have replied changes what they appear to be
 * replying to.
 */
export const COMMENT_EDIT_WINDOW_SECONDS = 15 * 60;
