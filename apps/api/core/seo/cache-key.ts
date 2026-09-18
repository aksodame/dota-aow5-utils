/**
 * What a rendered card is filed under, and which files it replaces.
 *
 * Pure, and split out from `CardService` because the rule is not obvious and
 * getting it wrong is invisible: the cache still answers every request, it just
 * re-renders on most of them. The first version of this keyed a file as
 * `<slug>.<updatedAt>` and deleted everything sharing the slug — then the
 * language was appended to the key, and every file became a sibling that every
 * other file superseded. Two scrapers in different languages evicted each other
 * forever, which reads exactly like a cache that works.
 *
 * The rule is one sentence: **a card supersedes the cards for older versions of
 * the same build, and nothing else.** Other languages of the same version are
 * peers, not predecessors.
 */

/**
 * What the renderer draws, as a number that changes when it changes.
 *
 * A card on disk is a *render*, not a fact about a build — and a cache key made
 * only of facts cannot tell that the renderer has been fixed. That is not
 * hypothetical: every card was once rendered with an empty font database, and
 * the fix shipped, and every scrape kept serving the same wordless picture,
 * because the build had not been edited and the key had not changed. Somebody
 * had to know to delete the directory by hand.
 *
 * **Bump this whenever the output changes** — the layout, the palette, the font
 * stack, the renderer's options. Old files are then a different generation and
 * are evicted by `stale` the first time each build is scraped again.
 *
 * 2: fonts found by directory rather than through fontconfig, which is what put
 * words back on the card.
 * 3: the headline ability drawn as an icon before its name; the wordmark sized
 * from the file rather than from a remembered ratio; and two item icons that
 * resvg refused to decode, stripped of the two megabytes of metadata that made
 * them undecodable — every card holding one had a black tile where the item was.
 * 4: the tracker page stopped sharing the site card and got one of its own, and
 * the site card's title changed with the route's — it says Farm tracker now,
 * because that is what the page's own heading says.
 * 5: a teal season chip before the tier's blue one, as the build page draws it.
 */
export const CARD_VERSION = 5;

export interface CardKey {
  /** The file, without its extension. Unique per build, version and language. */
  name: string;
  /** Every card for this build, as a filename prefix. */
  family: string;
  /** Every card for *this version* of it. What survives an eviction. */
  generation: string;
}

/**
 * The key for one build's card.
 *
 * `updatedAt` is in it so an edited build gets a new key rather than a stale
 * hit — which is also what makes the response safe to serve `immutable`. The
 * language is in it because the card has words on it: without it a Russian
 * scrape and an English one share a file, and whichever arrives first decides
 * what everybody sees.
 */
export function buildCardKey(slug: string, updatedAt: number, lang: string): CardKey {
  // The version sits inside the generation rather than beside the language, so
  // a renderer change supersedes the old files instead of accumulating beside
  // them: `stale` evicts everything in the family that is not this generation,
  // and the old version is exactly that.
  const generation = `${slug}.${updatedAt}v${CARD_VERSION}`;
  return { name: `${generation}.${lang}`, family: slug, generation };
}

/**
 * The key for the site's own card.
 *
 * No generation of its own beyond the renderer's: it is keyed by nothing but its
 * language, so it has no older versions of a *build* to supersede. It is allowed
 * to go stale instead, which is why its response is cached for a day rather than
 * for a year.
 */
export function siteCardKey(lang: string): CardKey {
  // Versioned like a build's, and for the stronger reason: this card is keyed by
  // nothing else at all, so without it a renderer fix could never reach the one
  // picture every non-build page shares. Its generation carries the version too,
  // which means a bump also evicts the previous version's files rather than
  // leaving one orphan per language behind.
  const generation = `site.v${CARD_VERSION}`;
  return { name: `${generation}.${lang}`, family: 'site', generation };
}

/**
 * The key for the tracker page's card.
 *
 * Keyed exactly like the site's, and for the same reason: language and the
 * renderer's version, because there is no row underneath it that can change.
 *
 * What *can* change is the session it draws, which is a constant in
 * `aow5-shared/overlay` — so editing that session counts as a renderer change
 * and wants `CARD_VERSION` bumped with it. Without the bump every scrape keeps
 * serving the evening the old constant described, and nothing on the page would
 * say so.
 */
export function trackerCardKey(lang: string): CardKey {
  const generation = `tracker.v${CARD_VERSION}`;
  return { name: `${generation}.${lang}`, family: 'tracker', generation };
}

/**
 * Which files in the cache directory this key replaces.
 *
 * Everything in the same family that is not in the same generation. The key's
 * own file is never returned, and neither is an unrelated build whose slug
 * merely starts with the same characters — the separator is part of both
 * prefixes, so `BG7g` does not match `BG7gfLz`.
 */
export function stale(files: readonly string[], key: CardKey): string[] {
  return files.filter((file) => file.startsWith(`${key.family}.`) && !file.startsWith(`${key.generation}.`));
}
