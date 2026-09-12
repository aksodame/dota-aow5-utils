/**
 * What the document says about itself, kept in step with the route.
 *
 * The browser half of the pair described in `aow5-shared/seo`. The server half
 * renders the same `PageMeta` into a document for crawlers, who do not run
 * JavaScript; this one writes it into the live document for people, who do.
 *
 * **It matters for more than crawlers.** A tab strip, a bookmark, a history
 * entry and a browser's back-button menu are all `document.title`, and every
 * page of this site was `AOW5 Builds` — eight tabs of a build list that could
 * not be told apart, and a bookmark for a guide that said nothing about which
 * guide. That is what this fixes first; the meta tags underneath it are for the
 * scrapers that follow a link somebody shared before Caddy has routed them to
 * the prerenderer.
 *
 * Writes are idempotent and keyed by selector, so a re-render with the same
 * values touches nothing and the tags never accumulate duplicates.
 */

import { useEffect } from 'react';
import {
  HREFLANG,
  OG_LOCALE,
  SEO_LANGS,
  pageMeta,
  type BuildFacts,
  type MetaTarget,
  type PageMeta,
  type SeoLang,
} from 'aow5-shared/seo';
import type { BuildDetail } from 'aow5-api-contract';
import type { CoreData } from 'aow5-shared/data';
import { ABILITY_SLOTS } from 'aow5-shared/types';
import type { BuildState } from 'aow5-shared/codec';
import { mainSpellKey } from '@/lib/preview';
import { LANG_PARAM, type Lang } from '@/i18n/strings';
import { BASE } from '@/lib/routes';

/**
 * The absolute URL for a path in a given language.
 *
 * Mirrors `localizedUrl` on the server, and must keep mirroring it: the
 * canonical the browser writes and the canonical the prerenderer writes are for
 * the same page, and a crawler that sees two different ones has two pages.
 *
 * The bare path is English *and* `x-default`, so a link with no `?lang=` — the
 * one people actually share — is a page rather than a duplicate of one.
 */
function localizedUrl(path: string, lang: SeoLang): string {
  const origin = window.location.origin;
  return lang === 'en' ? `${origin}${path}` : `${origin}${path}?${LANG_PARAM}=${lang}`;
}

/** Finds or creates one element, identified by the attribute that makes it unique. */
function upsert(tag: 'meta' | 'link', key: 'name' | 'property' | 'rel', value: string, extra?: string): Element {
  const selector = extra === undefined ? `${tag}[${key}="${value}"]` : `${tag}[${key}="${value}"][hreflang="${extra}"]`;
  const found = document.head.querySelector(selector);
  if (found !== null) return found;

  const created = document.createElement(tag);
  created.setAttribute(key, value);
  if (extra !== undefined) created.setAttribute('hreflang', extra);
  document.head.appendChild(created);
  return created;
}

function setMeta(key: 'name' | 'property', name: string, content: string | null): void {
  if (content === null) {
    // Removed rather than emptied: an `og:image` with no content is a tag a
    // scraper tries to fetch and fails on, where an absent one falls back.
    document.head.querySelector(`meta[${key}="${name}"]`)?.remove();
    return;
  }
  upsert('meta', key, name).setAttribute('content', content);
}

/**
 * Applies one `PageMeta` to the document.
 *
 * Exported separately from the hook so it can be called once at boot, before
 * React has mounted, if that ever becomes worth doing — and so the hook stays
 * three lines of dependency bookkeeping.
 */
export function applyMeta(meta: PageMeta): void {
  const url = localizedUrl(meta.path, meta.lang);
  const image = `${window.location.origin}${meta.image}`;

  document.title = meta.title;
  document.documentElement.lang = HREFLANG[meta.lang];

  setMeta('name', 'description', meta.description);
  // Absent means "index it", which is the default and the common case — so the
  // tag is removed rather than set to `index` on the pages that want indexing.
  setMeta('name', 'robots', meta.noindex ? 'noindex, follow' : null);

  upsert('link', 'rel', 'canonical').setAttribute('href', url);

  /*
   * One URL per language, plus `x-default` — and none at all on a page that
   * asked not to be indexed, which is what the prerenderer does too. Telling a
   * crawler about three translations of a page you have also told it to skip is
   * noise, and the two implementations differing would be a thing to explain
   * later.
   *
   * Removed rather than left behind on the way *into* a noindex route: these
   * are upserted by selector and would otherwise survive from the previous
   * page, still pointing at it.
   */
  const alternates: Array<[tag: string, href: string]> = [
    ...SEO_LANGS.map((lang): [string, string] => [HREFLANG[lang], localizedUrl(meta.path, lang)]),
    ['x-default', `${window.location.origin}${meta.path}`],
  ];
  for (const [tag, href] of alternates) {
    if (meta.noindex) document.head.querySelector(`link[rel="alternate"][hreflang="${tag}"]`)?.remove();
    else upsert('link', 'rel', 'alternate', tag).setAttribute('href', href);
  }

  setMeta('property', 'og:site_name', meta.siteName);
  setMeta('property', 'og:type', meta.type);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:title', meta.socialTitle);
  setMeta('property', 'og:description', meta.description);
  setMeta('property', 'og:image', image);
  setMeta('property', 'og:image:alt', meta.imageAlt);
  setMeta('property', 'og:locale', OG_LOCALE[meta.lang]);

  setMeta('name', 'twitter:title', meta.socialTitle);
  setMeta('name', 'twitter:description', meta.description);
  setMeta('name', 'twitter:image', image);
  setMeta('name', 'twitter:image:alt', meta.imageAlt);
}

/**
 * Describes the current page.
 *
 * Called by `App` for every route but a build's, and by `BuildPage` for that
 * one — because a build's meta needs the build, which only that component has,
 * and only after a request. Two callers rather than one so the shell does not
 * have to know about a fetch it does not make.
 *
 * `null` means "somebody else owns the head right now". `App` passes it for the
 * build route, and `BuildPage` passes it while its request is still in flight —
 * so the tab keeps whatever it said until there is something true to replace it
 * with, rather than flashing the site name for the length of a round trip.
 */
export function useDocumentMeta(target: MetaTarget | null, lang: Lang): void {
  /*
   * The dependency is the target's *content*, not its identity.
   *
   * Every caller rebuilds the object on each render — a build page does it from
   * props, the shell from a route match — so an identity dependency would write
   * the same dozen strings into the head on every keystroke in the search box.
   */
  const key = target === null ? '' : JSON.stringify(target);

  useEffect(() => {
    if (target === null) return;
    applyMeta(pageMeta(target, lang, BASE));
  }, [key, lang]);
}

/**
 * The facts a build's title, description and card are written from.
 *
 * The browser's counterpart to `SeoService.factsFor`, and the reason both exist
 * rather than one: the names come from `CoreData`, which this side already has
 * loaded and the server reaches by a different route entirely. What must not
 * differ is the *result*, which is why they feed the same `pageMeta`.
 */
export function factsOfBuild(
  build: BuildDetail,
  core: CoreData,
  decoded: BuildState | null,
  lang: Lang,
): BuildFacts {
  /*
   * The ability in the slot the author called the headline.
   *
   * `mainSpellKey` is the one answer to "which of the seven is *the* spell",
   * shared with the browse row and the build page — so the card, the tab and
   * the tile on the page cannot ring different abilities.
   */
  const key = decoded === null ? null : mainSpellKey(decoded.spells, core, build.mainSpell);
  const at = key === null ? -1 : ABILITY_SLOTS.indexOf(key);
  const value = at < 0 || decoded === null ? null : decoded.spells[at];
  const spell = value?.k === 'id' ? (core.heroes.spells.get(value.id)?.name ?? null) : null;

  return {
    slug: build.slug,
    title: build.title,
    body: build.body,
    hero: build.heroId === null ? null : (core.heroes.byHero.get(build.heroId)?.names[lang] ?? null),
    maps: build.maps
      .map((id) => core.maps.byId.get(id)?.name)
      .filter((name): name is string => name !== undefined),
    tier: build.tier,
    price: build.price,
    spell,
    author: build.author.nickname,
    likeCount: build.likeCount,
    commentCount: build.commentCount,
    publishedAt: build.publishedAt,
    updatedAt: build.updatedAt,
  };
}
