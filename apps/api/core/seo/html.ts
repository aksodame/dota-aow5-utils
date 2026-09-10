/**
 * The copy of a page that a crawler gets.
 *
 * This site is a single-page app with no server rendering, so `index.html` is
 * one static `<head>` for all seven routes. A browser fixes that a moment after
 * boot — see `useDocumentMeta` in the webapp — but a link scraper does not run
 * JavaScript at all. Facebook, Discord, Telegram, Slack, WhatsApp, Twitter and
 * VK fetch the document, read the tags that are *in* it, and leave. Which is
 * why every shared build link previewed identically before this existed.
 *
 * Caddy routes those user agents here and nobody else (see infra/Caddyfile), so
 * what this returns is never what a person sees. That is a shape worth being
 * careful with — serving crawlers something different from readers is cloaking
 * if the content disagrees — so the body below carries the *same* title, facts
 * and notes the React page renders, rather than being an empty shell that
 * exists only to hold meta tags.
 *
 * Pure, and deliberately string-based: there is no DOM on the server and
 * pulling in a template engine to emit forty lines of head would be a
 * dependency per line.
 */

import { HREFLANG, OG_LOCALE, type PageMeta } from 'aow5-shared/seo';
import { localizedUrl } from './url.ts';
import { DEFAULT_LANG, otherLangs } from './lang.ts';

/** The card's dimensions. Fixed, and stated in the tags so a scraper can lay out before it fetches. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * Escapes text for a text node.
 *
 * `&` first, or the escapes this introduces get escaped again. Angle brackets
 * are what actually close a tag; the quotes are here because the same function
 * is used for attribute values through `attr`, and one escaper with one rule is
 * easier to be sure about than two with two.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Link {
  href: string;
  text: string;
}

export interface PrerenderInput {
  meta: PageMeta;
  /** The site's own origin, scheme included. From `SITE_ORIGIN`. */
  origin: string;
  /**
   * The page's visible heading — a build's own title, or the route's name.
   *
   * Separate from `meta.title`, which carries the brand and the facts because a
   * tab and a search result need them. An `<h1>` that repeats the brand is one
   * a crawler scores lower, not higher.
   */
  heading: string;
  /** Paragraphs of real page text. A build's facts line and the author's notes. */
  paragraphs?: readonly string[];
  /**
   * Links onward.
   *
   * The reason the browse route renders any: build pages are reachable from
   * nothing but a client-side list and the sitemap, and a sitemap is a hint
   * rather than a crawl path. A page of real links is the path.
   */
  links?: readonly Link[];
}

function tag(name: string, attrs: Record<string, string | number | undefined>): string {
  const rendered = Object.entries(attrs)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${escapeHtml(String(value))}"`)
    .join('');
  return `<${name}${rendered} />`;
}

const meta = (attrs: Record<string, string | number | undefined>): string => tag('meta', attrs);

/** An ISO-8601 timestamp from the seconds the database stores. */
function iso(seconds: number | undefined): string | undefined {
  return seconds === undefined ? undefined : new Date(seconds * 1000).toISOString();
}

/**
 * Every tag that describes the page, in one list.
 *
 * Split out from the document so it can be asserted on directly, and because
 * the ordering below is the one thing here that is easy to get subtly wrong:
 * `og:image` must follow `og:title` for the scrapers that stop reading after
 * the first image they can pair with a title.
 */
export function headTags(input: PrerenderInput): string[] {
  const { meta: page, origin } = input;
  const canonical = localizedUrl(origin, page.path, page.lang);
  const image = `${origin}${page.image}`;

  const tags: string[] = [
    `<title>${escapeHtml(page.title)}</title>`,
    meta({ name: 'description', content: page.description }),
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
  ];

  /*
   * One URL per language, plus `x-default`.
   *
   * The bare path is English *and* the default, which is what makes the set
   * consistent: a link with no `?lang=` is one page rather than a duplicate of
   * the English one, and the two languages that need a parameter each get their
   * own address. Only on indexable pages — telling a crawler about three
   * translations of a page you also asked it not to index is noise.
   */
  if (!page.noindex) {
    for (const lang of [DEFAULT_LANG, ...otherLangs(DEFAULT_LANG)]) {
      tags.push(
        `<link rel="alternate" hreflang="${HREFLANG[lang]}" href="${escapeHtml(localizedUrl(origin, page.path, lang))}" />`,
      );
    }
    tags.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${origin}${page.path}`)}" />`);
  } else {
    // `follow`, not `none`: the editor and the account pages are not worth
    // indexing, but the links on them still lead somewhere that is.
    tags.push(meta({ name: 'robots', content: 'noindex, follow' }));
  }

  tags.push(
    meta({ property: 'og:site_name', content: page.siteName }),
    meta({ property: 'og:type', content: page.type }),
    meta({ property: 'og:url', content: canonical }),
    meta({ property: 'og:title', content: page.title }),
    meta({ property: 'og:description', content: page.description }),
    meta({ property: 'og:image', content: image }),
    // Spelled out because several scrapers reserve the layout box before they
    // fetch the bytes, and one that guesses wrong shows a letterboxed card.
    meta({ property: 'og:image:type', content: 'image/png' }),
    meta({ property: 'og:image:width', content: CARD_WIDTH }),
    meta({ property: 'og:image:height', content: CARD_HEIGHT }),
    meta({ property: 'og:image:alt', content: page.imageAlt }),
    meta({ property: 'og:locale', content: OG_LOCALE[page.lang] }),
  );

  for (const other of otherLangs(page.lang)) {
    tags.push(meta({ property: 'og:locale:alternate', content: OG_LOCALE[other] }));
  }

  if (page.type === 'article') {
    tags.push(
      meta({ property: 'article:published_time', content: iso(page.publishedAt) }),
      meta({ property: 'article:modified_time', content: iso(page.modifiedAt) }),
    );
  }

  tags.push(
    // `summary_large_image` rather than `summary`: the card is 1200×630 and the
    // small variant crops it to a square thumbnail, which cuts the title off.
    meta({ name: 'twitter:card', content: 'summary_large_image' }),
    meta({ name: 'twitter:title', content: page.title }),
    meta({ name: 'twitter:description', content: page.description }),
    meta({ name: 'twitter:image', content: image }),
    meta({ name: 'twitter:image:alt', content: page.imageAlt }),
  );

  return tags;
}

/** The whole document. */
export function renderPrerender(input: PrerenderInput): string {
  const { meta: page } = input;
  const body: string[] = [`<h1>${escapeHtml(input.heading)}</h1>`];

  for (const paragraph of input.paragraphs ?? []) {
    if (paragraph.trim() !== '') body.push(`<p>${escapeHtml(paragraph)}</p>`);
  }

  for (const link of input.links ?? []) {
    body.push(`<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a></p>`);
  }

  return [
    '<!doctype html>',
    `<html lang="${HREFLANG[page.lang]}">`,
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    ...headTags(input),
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
