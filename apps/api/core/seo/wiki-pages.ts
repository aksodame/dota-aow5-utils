/**
 * What the server knows about a page of the wiki, read from the same emitted
 * tables the browser reads.
 *
 * One resolver per section. Each takes the segments after the section name —
 * exactly as the URL has them — and answers with the page's facts and the
 * pictures its card is drawn from, or `undefined` for an address that names
 * nothing. The controller turns `undefined` into a 404 with a canonical of its
 * own, the way a deleted build is answered.
 *
 * The facts here and the facts the section's React page hands `useDocumentMeta`
 * must be the same sentence, or the tab a reader sees and the preview a scraper
 * sees describe two different pages. Both are built by the functions in
 * `aow5-shared/wiki`, which is where that sentence is written.
 */

import type { SeoLang, WikiPageFacts, WikiSection } from 'aow5-shared/seo';

export interface WikiPageCard {
  facts: WikiPageFacts;
  /** A room whose painted scene goes behind the card, by room code. */
  scene?: string | null;
  /** 16:9 art for the portrait slot, as an asset path `CardService.icon` reads. */
  portrait?: string | null;
  /** Up to six icons for the card's row, as asset paths. */
  icons?: readonly (string | null)[];
  /** `T6`-style chip, when the page has a tier or level worth one. */
  tier?: string | null;
}

export interface WikiLink {
  href: string;
  text: string;
}

/** A section's pages: one resolver for a single page, one lister for the section's prerendered index. */
export interface WikiSectionSource {
  page(path: readonly string[], lang: SeoLang): WikiPageCard | undefined;
  /** Every page in the section, as links — the only way a crawler reaches them. */
  links(lang: SeoLang): WikiLink[];
}

const SOURCES = new Map<WikiSection, WikiSectionSource>();

/** Called once per section at module load, by the module that knows that section's tables. */
export function registerWikiSection(section: WikiSection, source: WikiSectionSource): void {
  SOURCES.set(section, source);
}

export function resolveWikiPage(section: WikiSection, path: readonly string[], lang: SeoLang): WikiPageCard | undefined {
  return SOURCES.get(section)?.page(path, lang);
}

export function wikiSectionLinks(section: WikiSection, lang: SeoLang): WikiLink[] {
  return SOURCES.get(section)?.links(lang) ?? [];
}
