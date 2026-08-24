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
 * A referral code, in characters.
 *
 * The game does not document the format beyond "a short code you type into a
 * box", so nothing here assumes an alphabet or a length — only a ceiling, so a
 * field meant to hold eight characters cannot be used to store a paragraph.
 */
export const MAX_REFERRAL = 32;

/**
 * A nickname, in **code points** rather than UTF-16 units.
 *
 * The same rule the title counter follows, and for the same reason: counting
 * `String.length` would give a Cyrillic name a different budget from a Latin
 * one, which no writer could see or predict.
 */
export const MIN_NICKNAME = 3;
export const MAX_NICKNAME = 24;

/**
 * A password, also in code points.
 *
 * The floor is deliberately modest. There is no password recovery on this site,
 * so a rule that makes people invent something they will not remember costs
 * more than it buys; length is the only requirement, because every composition
 * rule ever written has produced `Password1!`.
 *
 * The ceiling is for storage and sanity, **not** a defence: scrypt's cost does
 * not depend on how long the input is, so a long password is not a way to make
 * the server work harder.
 */
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

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

/**
 * The most rows `GET /builds` will hand back in one response, whatever is asked
 * for. A ceiling, not the page the site draws — see `BUILDS_PER_PAGE`.
 */
export const PAGE_SIZE = 20;

/**
 * How many builds the browse page shows at once.
 *
 * Small on purpose. The list is one card per build with no thumbnail, so twenty
 * of them is a wall of near-identical rows that nobody reads to the bottom of;
 * five is a glance. It is a *request* rather than a rule — the server clamps it
 * to `PAGE_SIZE` — which is what keeps this number changeable without a deploy
 * of both halves.
 */
export const BUILDS_PER_PAGE = 5;

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
