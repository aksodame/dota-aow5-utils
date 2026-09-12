/**
 * The numbers both sides enforce.
 *
 * They live here, in one file neither the site nor the API owns, so that the
 * character counter under a title input and the rejection that would follow it
 * cannot drift apart. A limit changed on one side only is a user typing happily
 * into a field that is about to 400.
 */

/**
 * Published or draft, per account, before anything is linked.
 *
 * The cap is structural rather than a check — every build takes a numbered slot
 * and a partial unique index refuses a second build in one — so raising it is a
 * migration, which is why the ceiling below is stated once and enforced by the
 * database as well.
 */
export const MAX_BUILDS_PER_USER = 5;

/**
 * What each linked provider adds to that.
 *
 * Not a reward for being trustworthy — it is the same argument the comment queue
 * makes, read the other way. The cap exists because an account costs nothing to
 * open, so five builds a *person* is really "five builds per free account". A
 * linked Steam or Discord account is the one thing on this site that is
 * genuinely scarce, so somebody who has attached one has already paid the price
 * the cap was collecting.
 */
export const BUILDS_PER_LINKED_PROVIDER = 5;

/**
 * The most any account can reach: the base plus both providers.
 *
 * Stated here because the slot column is checked against it in the schema —
 * a build's slot is `0..MAX_BUILDS_CEILING - 1`, and the two must agree or the
 * database refuses a build the service thought was allowed.
 */
export const MAX_BUILDS_CEILING = MAX_BUILDS_PER_USER + 2 * BUILDS_PER_LINKED_PROVIDER;

/**
 * A YouTube id, in characters.
 *
 * Eleven today — `dQw4w9WgXcQ` — and the field takes fifteen so an id that
 * grows a character or two does not need a deploy on both sides to be typed.
 * The *field* is an id rather than a link now: it fits in a share URL's query,
 * and a box that accepts a whole address is a box people paste tracking
 * parameters and playlists into.
 */
export const MAX_VIDEO_ID = 15;

export const MAX_TITLE = 80;
export const MAX_BODY = 8000;
export const MAX_COMMENT = 2000;

/**
 * A referral code, in characters.
 *
 * Eight, which is what the game issues — `00EJT3T3` is the shape of every one
 * of them. The ceiling used to be 32 on the argument that the format is not
 * documented, but a box four times the size of the only value anybody will ever
 * type is a box that invites a paragraph and accepts a typo silently.
 *
 * Still a *ceiling* rather than an exact length: a code is optional, and a
 * half-typed one on its way to eight is not an error to shout about.
 */
export const MAX_REFERRAL = 8;

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
 * The tiers a guide can be written for.
 *
 * A *bound*, not a lookup: the real list comes from the extracted map table,
 * which is where a new tier would appear first. This is here so a hand-made
 * request cannot store tier 400, and so the editor and the server agree on the
 * range without one of them importing the game data.
 *
 * Authored rather than derived from the map, since a guide may name a tier and
 * no particular room — several tiers have two, and advice that holds for both
 * should not have to pick one.
 */
export const MIN_TIER = 1;
export const MAX_TIER = 9;

/**
 * What a build may claim to cost, in gold.
 *
 * Four billion, which is a limit on what is *believable* rather than on what
 * fits: SQLite stores 64-bit integers and JavaScript is exact to 2^53, so
 * nothing here is near a storage edge. It sits just under 4,294,967,295 — what
 * an unsigned 32-bit column holds — so the number stays portable if this is
 * ever stored somewhere narrower than SQLite.
 *
 * Zero is not a price, it is the absence of one. A build that genuinely costs
 * nothing does not exist in this game, so the two never need telling apart.
 */
export const MAX_PRICE = 4_000_000_000;

/**
 * A Steam persona, in **code points** rather than UTF-16 units.
 *
 * Not validated on the way in — it is whatever Steam says somebody is called —
 * only capped, so a display name cannot be used to store a paragraph. Counting
 * code points rather than `String.length` is what gives a Cyrillic name the
 * same budget as a Latin one.
 */
export const MAX_PERSONA = 64;

/**
 * The encoded loadout, in characters.
 *
 * A full v7 build — every slot filled, every spell chosen, a title at its cap —
 * is a little over 100 characters. 4096 is enormous headroom, kept rather than
 * tightened so a future codec that grows the payload does not need both halves
 * redeployed; it is a ceiling against someone storing a novel in a field meant
 * to hold a build, not an estimate of one.
 */
export const MAX_PAYLOAD_CHARS = 4096;

/** Characters in a build's public id, the `<slug>` in `/builds/<slug>`. */
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
 * The list is now one row per build carrying a hero portrait, the main spell
 * and the gear beside it, which is scannable in a way a wall of text rows was
 * not — so the page shows a screenful rather than a glance. It is a *request*
 * rather than a rule — the server clamps it to `PAGE_SIZE` — which is what
 * keeps this number changeable without a deploy of both halves.
 */
export const BUILDS_PER_PAGE = 10;

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

/**
 * How many items a build may write a reforge priority for.
 *
 * One per loadout slot, which is what the codec carries — so this is the
 * loadout's own size restated, not a policy. The editor only offers the gear
 * slots, but the cap is the whole board: a plan is keyed by slot index, and a
 * limit narrower than the board would refuse a legal one for no reason.
 */
export const MAX_PRIORITY_ITEMS = 15;

/**
 * Stats an item may rank.
 *
 * The busiest equipment in the game lists a handful; twenty-four is room for
 * whatever a rebalance adds, and a ceiling on somebody storing a list rather
 * than a priority.
 */
export const MAX_PRIORITY_STATS = 24;

/**
 * The free line beside an item's stats, in characters.
 *
 * It exists because the interesting half of some items is a *passive*, whose
 * numbers are not stats at all — "the shield part matters, the damage does not"
 * is advice no set of controls can express and a sentence can. Short, because
 * the long version is the build's notes.
 */
export const MAX_PRIORITY_NOTE = 400;

/**
 * The highest reforge level a plan may name.
 *
 * The game's own ceiling. Stated here as well as in the emitted roll tables
 * because this package has no runtime dependencies — the tables are the truth,
 * and this is the bound the wire enforces without loading them.
 */
export const MAX_REFORGE_LEVEL = 9;

/**
 * How far down the list of reachable rolls a target may point.
 *
 * A rolled stat has at most six outcomes, so a rank past this is a client that
 * has miscounted rather than a plan anybody made — see `BuildStatPriority`.
 */
export const MAX_STAT_RANK = 9;
