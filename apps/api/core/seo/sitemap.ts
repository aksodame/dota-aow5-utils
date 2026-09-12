/**
 * The sitemap, as a string.
 *
 * Pure so it can be asserted on: the failure mode of a sitemap is not a crash,
 * it is being quietly malformed and silently ignored by every crawler that
 * reads it — which looks exactly like having no sitemap at all.
 *
 * Only the pages worth crawling go in: the browse root, the tracker page, and
 * every published build. The editor, my-creations and settings are `noindex`
 * (see `pageMeta`), and listing a page you have asked not to be indexed is a
 * contradiction crawlers report as an error. `/view` is left out for a
 * different reason — a shared loadout lives entirely in the URL fragment, which
 * is never sent to a server, so every `/view` URL is the same empty page.
 */

import { SEO_LANGS, type SeoLang } from 'aow5-shared/seo';
import { localizedUrl } from './url.ts';
import { DEFAULT_LANG } from './lang.ts';
import { escapeHtml } from './html.ts';

export interface SitemapEntry {
  /** Root-relative, as `PageMeta.path` gives it. */
  path: string;
  /** Seconds. Omitted where the page has no meaningful one. */
  lastmod?: number;
  /**
   * A hint, not a promise — crawlers treat it as one and so should anyone
   * reading this. Included because the spread between the browse root and a
   * two-year-old build is real and worth stating.
   */
  changefreq?: 'daily' | 'weekly' | 'monthly';
  /** 0.0–1.0, relative *within this file only*. It says nothing to other sites. */
  priority?: string;
}

/**
 * One `<url>` per page, with an `xhtml:link` per language inside it.
 *
 * The alternates go inside each entry rather than getting three entries per
 * page: that is what the protocol asks for, and it is what tells a crawler the
 * three are translations of one page rather than three pages that happen to
 * look alike.
 */
function entry(origin: string, item: SitemapEntry): string {
  const lines = [`  <url>`, `    <loc>${escapeHtml(localizedUrl(origin, item.path, DEFAULT_LANG))}</loc>`];

  for (const lang of SEO_LANGS) {
    const href = escapeHtml(localizedUrl(origin, item.path, lang));
    lines.push(`    <xhtml:link rel="alternate" hreflang="${hreflangOf(lang)}" href="${href}" />`);
  }
  lines.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(`${origin}${item.path}`)}" />`,
  );

  if (item.lastmod !== undefined) {
    // Date only. The spec accepts a full timestamp, but a build's `updated_at`
    // changes when its author fixes a typo, and a lastmod that moves by seconds
    // is a lastmod crawlers learn to distrust.
    lines.push(`    <lastmod>${new Date(item.lastmod * 1000).toISOString().slice(0, 10)}</lastmod>`);
  }
  if (item.changefreq !== undefined) lines.push(`    <changefreq>${item.changefreq}</changefreq>`);
  if (item.priority !== undefined) lines.push(`    <priority>${item.priority}</priority>`);

  lines.push('  </url>');
  return lines.join('\n');
}

/** The sitemap's own spelling of a language tag. Same values as `HREFLANG`, kept local so this file has one import fewer. */
function hreflangOf(lang: SeoLang): string {
  return lang === 'zh' ? 'zh-Hans' : lang;
}

export function renderSitemap(origin: string, entries: readonly SitemapEntry[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.map((item) => entry(origin, item)),
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * `robots.txt`.
 *
 * Served by the API rather than shipped as a static file for one reason: it has
 * to name the sitemap by absolute URL, and the only thing that knows this
 * deployment's origin is the deployment. A checked-in file would either hardcode
 * a domain or omit the line that makes the sitemap discoverable.
 *
 * The disallowed paths are the `noindex` ones, said a second time and earlier.
 * `noindex` is only learned by fetching the page; this stops the fetch. They are
 * not secret — everything behind them needs a session anyway — so this is about
 * crawl budget rather than about access.
 */
export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Disallow: /edit',
    'Disallow: /me',
    'Disallow: /settings',
    'Disallow: /view',
    'Disallow: /api/',
    // The cards are served to scrapers by URL from a meta tag; nothing is
    // served by crawling them, and there are as many as there are builds.
    'Allow: /api/og/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}
