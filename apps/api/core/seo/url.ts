/**
 * How a page's address is written, per language.
 *
 * One rule, used by the canonical link, the `hreflang` set, the sitemap and the
 * prerendered `og:url` — because the moment two of them disagree, a crawler has
 * two URLs for one page and splits its signals between them.
 *
 * **The bare path is English and is also `x-default`.** The alternative — a
 * `?lang=en` on every English URL — makes the address somebody actually shares
 * a third variant that canonicalises somewhere else, which is the duplicate
 * this is meant to avoid.
 */

import type { SeoLang } from 'aow5-shared/seo';
import { DEFAULT_LANG } from './lang.ts';

/** The query parameter the whole site carries its language in. Mirrors `LANG_PARAM` in the webapp. */
export const LANG_QUERY = 'lang';

export function localizedUrl(origin: string, path: string, lang: SeoLang): string {
  return lang === DEFAULT_LANG ? `${origin}${path}` : `${origin}${path}?${LANG_QUERY}=${lang}`;
}
