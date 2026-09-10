/**
 * Everything the site says *about* a page, rather than on it.
 *
 * Its own subpath export because it has two consumers with nothing else in
 * common: the SPA, which writes the result into the document as the reader
 * navigates, and the API's prerenderer, which writes the same result into a
 * document crawlers can read without running any JavaScript. See `meta.ts`.
 */

export {
  DESCRIPTION_BUDGET,
  SITE_CARD,
  TITLE_BUDGET,
  buildCardPath,
  buildDescription,
  buildFactLine,
  buildTitle,
  pageMeta,
  type BuildFacts,
  type FactFields,
  type MetaTarget,
  type PageMeta,
} from './meta.ts';

export {
  HREFLANG,
  OG_LOCALE,
  SEO_LANGS,
  SEO_STRINGS,
  isSeoLang,
  type SeoLang,
  type SeoStrings,
} from './strings.ts';

export { clampWidth, oneLine, textWidth, wrapWidth } from './text.ts';

/** Re-exported so a caller building a card or a description needs one import, not two. */
export { formatGold, formatGoldExact } from '../format/gold.ts';
