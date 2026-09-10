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
  return { name: `${slug}.${updatedAt}.${lang}`, family: slug, generation: `${slug}.${updatedAt}` };
}

/**
 * The key for the site's own card.
 *
 * No generation of its own: it is keyed by nothing but its language, so it has
 * no older versions to supersede. It is allowed to go stale instead, which is
 * why its response is cached for a day rather than for a year.
 */
export function siteCardKey(lang: string): CardKey {
  return { name: `site.${lang}`, family: 'site', generation: 'site' };
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
