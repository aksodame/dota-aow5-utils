/**
 * What every page of the site says about itself.
 *
 * One pure function — `pageMeta` — with two very different callers:
 *
 *   * the SPA, which writes the result into `document.title` and a handful of
 *     `<meta>` elements as the reader navigates, and
 *   * the API's prerenderer, which writes the same result into a small HTML
 *     document for crawlers, who do not run JavaScript and would otherwise see
 *     the one hardcoded title in `index.html` on all seven routes.
 *
 * Keeping it pure is what lets both use it: it takes facts and returns strings,
 * touches no DOM, reads no `window`, and does no I/O. The two callers differ
 * only in where the facts come from — the browser has them from the API
 * response it already fetched, the server has them from the row.
 */

import { tierLabel, type TierKey } from '../data/tiers.ts';
import { formatGold } from '../format/gold.ts';
import { clampWidth, oneLine } from './text.ts';
import { SEO_STRINGS, type SeoLang } from './strings.ts';

/**
 * How much room a title and a description actually get.
 *
 * Widths, not character counts — see `text.ts`. Google truncates a title at
 * roughly 580 CSS pixels and a description at roughly 920, which at their
 * rendering works out near these numbers; Discord and Telegram are more
 * generous and clip rather than penalise. Erring short is free, and erring long
 * ends a sentence with an ellipsis somebody else chose.
 */
export const TITLE_BUDGET = 60;
/**
 * How much of the author's title an embed gets.
 *
 * Wider than the search budget and spent on one thing. A search result is a
 * line of text where the brand has to survive the cut, so `TITLE_BUDGET` pays
 * for the brand out of the same sixty characters; a Discord or Slack card draws
 * the site name on a line of its own above the title and the facts underneath
 * it, so both are already there and the title's whole job is to be the author's
 * sentence. Discord wraps its title over two lines at roughly this width and
 * cuts what does not fit — which is what "— Фант…" was.
 */
export const SOCIAL_TITLE_BUDGET = 90;
export const DESCRIPTION_BUDGET = 155;

/** The facts a build's own page, card and description are written from. */
export interface BuildFacts {
  slug: string;
  /** The author's title, exactly as stored. May be empty on a draft. */
  title: string;
  /** The author's notes. Plain text — newlines and all. */
  body: string;
  /** The hero's name in the reader's language, or null when the build names none. */
  hero: string | null;
  /** The rooms it names, in the reader's language. Often empty. */
  maps: readonly string[];
  tier: TierKey | null;
  /** Gold. `0` means the author did not say. */
  price: number;
  /** The headline ability's name in the reader's language, or null. */
  spell: string | null;
  /** The author's display name. */
  author: string;
  likeCount: number;
  commentCount: number;
  /** Seconds. Null on a draft. */
  publishedAt: number | null;
  updatedAt: number;
}

/** Which page to describe. Everything but `build` is a static route. */
export type MetaTarget =
  | { kind: 'browse' }
  | { kind: 'mine' }
  | { kind: 'edit' }
  | { kind: 'view' }
  | { kind: 'settings' }
  | { kind: 'tracker' }
  | { kind: 'build'; build: BuildFacts }
  /**
   * A build page whose build could not be loaded — deleted, never existed, or
   * the request failed.
   *
   * Its own case rather than falling back to `browse`, because the canonical
   * URL must stay the one that was asked for: a crawler told that
   * `/builds/gone` canonicalises to `/` would merge the two.
   */
  | { kind: 'missing'; slug: string };

export interface PageMeta {
  lang: SeoLang;
  /** The full `<title>`, brand included. */
  title: string;
  /**
   * The title an OpenGraph card shows, which is not the same string.
   *
   * `title` is written for a search result, where the brand and the hero have
   * to ride along because nothing else on the line says them. A card says them
   * elsewhere — `og:site_name` is drawn above the title and the facts are the
   * first sentence of the description — so repeating them here spends the one
   * line the reader actually reads on things already on screen, and pushes the
   * author's own words out of it.
   */
  socialTitle: string;
  description: string;
  /** The site-root-relative path this page canonicalises to. Never carries a query. */
  path: string;
  /** The card image, as a site-root-relative path. */
  image: string;
  imageAlt: string;
  /** OpenGraph's `og:type`. A build is an `article`; everything else is a `website`. */
  type: 'website' | 'article';
  /**
   * Whether to ask crawlers to stay away.
   *
   * True for the four routes that are either private or meaningless without
   * state: the editor, my creations, settings, and a loadout that lives
   * entirely in a URL fragment a crawler will not send. Indexing those costs
   * crawl budget and puts empty pages in results.
   */
  noindex: boolean;
  siteName: string;
  /** Seconds. Only on a build, and only once published. */
  publishedAt?: number;
  /** Seconds. Only on a build. */
  modifiedAt?: number;
}

/** The default card, drawn by the API and shared by every route but a build's. */
export const SITE_CARD = '/api/og/site.png';

/**
 * A build's own card, at a URL that changes when the card does.
 *
 * The version is `updated_at`, and it is in the **path** rather than only in the
 * server's cache key — which is where it used to be alone, and that was a
 * promise the server could not keep. The response says
 * `max-age=31536000, immutable`, every cache between here and a reader believes
 * it, and the bytes at that address quietly became different ones the moment an
 * author fixed a typo. The old picture then outlived the edit everywhere it had
 * already been shared: Discord's CDN, a browser, a proxy.
 *
 * With the version here the two agree. An edit produces a *different* address,
 * so anything that re-reads the page gets a picture it has never seen, and the
 * old address keeps the old picture for as long as anybody still points at it —
 * which is exactly what `immutable` is for.
 *
 * The version is optional because links already shared do not have one, and
 * those URLs still have to answer; see the route, which drops `immutable` for
 * them because for them it would still be a lie.
 *
 * ## The language, after the version
 *
 * The card has words on it and is drawn once per language, so the language
 * belongs in the address for the same reason the version does. Without it
 * every language shares one URL and the server picks from `Accept-Language` —
 * which works for a browser and not at all for the things that actually fetch
 * this. A scraper sends no useful `Accept-Language`, and whatever it is served
 * first is what its CDN then shows everybody: one Russian scrape and the
 * English preview is Russian everywhere the link is posted, permanently, at an
 * address that promised to be `immutable`.
 *
 * It goes *after* the version so the path reads in narrowing order — which
 * build, which revision of it, which language — and so the parser can keep
 * taking the numeric part as the version wherever it sits.
 *
 * Also optional, and for the same reason as the version: URLs shared before it
 * existed still have to answer. The route falls back to `Accept-Language` for
 * those, exactly as it always did.
 */
export function buildCardPath(slug: string, version?: number, lang?: SeoLang): string {
  if (version === undefined) return `/api/og/builds/${slug}.png`;
  const versioned = `/api/og/builds/${slug}.${version}`;
  return lang === undefined ? `${versioned}.png` : `${versioned}.${lang}.png`;
}

/**
 * The facts about a build, as a list: `Axe · T6 · Frozen Plain · 12 400 gold`.
 *
 * Everything the author did not fill in is simply absent rather than rendered
 * as "unknown" — a card that spends a line saying a field is empty is a card
 * with less room for the fields that are not.
 *
 * Shared by the description and by the card, so the two say the same things in
 * the same order — and typed to the five fields it reads rather than to a whole
 * `BuildFacts`, so a caller that has only those (the crawler's link list, which
 * would otherwise decode a payload per row for a spell it does not show) can
 * pass them without inventing the rest.
 */
export type FactFields = Pick<BuildFacts, 'hero' | 'tier' | 'maps' | 'spell' | 'price'>;

export function buildFactLine(build: FactFields, lang: SeoLang): string {
  const strings = SEO_STRINGS[lang];
  const parts: string[] = [];
  if (build.hero !== null) parts.push(build.hero);
  if (build.tier !== null) parts.push(tierLabel(build.tier, strings.event));
  // Two rooms fit; a guide that names five is filed under its tier, which the
  // previous part already said.
  if (build.maps.length > 0) parts.push(build.maps.slice(0, 2).join(', '));
  if (build.spell !== null) parts.push(build.spell);
  /*
   * `12.4k`, not `12 400`. The compact form is what a browse row, a build page
   * and the editor all show, and a card that spelled the number out would be
   * the one surface quoting a build's price differently from every other.
   */
  if (build.price > 0) parts.push(`${formatGold(build.price)} ${strings.gold}`);
  return parts.join(strings.factSep);
}

/**
 * A build's `<title>`: the author's words first, then what it is.
 *
 * The author's title leads because it is the only part that distinguishes this
 * build from the next one, and a title that is clipped should be clipped in its
 * least useful half. The brand goes last for the same reason — a tab strip of
 * eight tabs all beginning "AOW5 Builds —" tells a reader nothing.
 */
export function buildTitle(build: BuildFacts, lang: SeoLang): string {
  const strings = SEO_STRINGS[lang];
  const own = oneLine(build.title) === '' ? strings.untitled : oneLine(build.title);
  /*
   * The hero and the tier, and not the rest.
   *
   * A title has room for about sixty characters before a search result cuts it,
   * and the author's own words have first claim on them. The full fact line —
   * rooms, ability, price — routinely spends all of it and leaves the title
   * ending in an ellipsis in every language; these two are the pair somebody
   * scanning results is actually filtering on, and they are short. The rest is
   * in the description, which has two and a half times the budget.
   */
  const facts = buildFactLine({ ...build, maps: [], spell: null, price: 0 }, lang);
  // The brand is never clipped away: it is what makes a shared link recognisable
  // in a list of search results. So the budget is spent on the rest.
  const tail = `${strings.sep}${strings.brand}`;
  const head = facts === '' ? own : `${own}${strings.sep}${facts}`;
  return `${clampWidth(head, TITLE_BUDGET)}${tail}`;
}

/**
 * The same build, titled for a card rather than for a search result.
 *
 * The author's words and nothing else. Everything `buildTitle` appends — the
 * hero, the tier, the brand — is drawn by the card itself: `og:site_name` is a
 * line above this one, and `buildDescription` opens with the fact line. An
 * embed that spends its title on them shows the reader "Фантом Ассасин ·
 * Событие — Сборки AOW5" twice and the guide's name once, truncated.
 *
 * Still clamped. A title is author-written and there is no upper bound on what
 * somebody will type; the cut simply happens later here than in a search result.
 */
export function buildSocialTitle(build: BuildFacts, lang: SeoLang): string {
  const strings = SEO_STRINGS[lang];
  const own = oneLine(build.title) === '' ? strings.untitled : oneLine(build.title);
  return clampWidth(own, SOCIAL_TITLE_BUDGET);
}

/**
 * A build's description: the facts, then as much of the author's notes as fit.
 *
 * The facts come first deliberately. A reader scanning a search result or a
 * Discord embed wants "is this the hero and the tier I am playing" answered
 * before they want prose, and notes are frequently a paragraph about one item.
 * When there are no notes the facts are the whole description, which is still a
 * useful sentence.
 */
export function buildDescription(build: BuildFacts, lang: SeoLang): string {
  const strings = SEO_STRINGS[lang];
  const facts = buildFactLine(build, lang);
  const notes = oneLine(build.body);
  const attribution = `${strings.by} ${build.author}`;

  const lead = facts === '' ? strings.routes.build.description : `${facts}.`;
  const full = notes === '' ? `${lead} ${attribution}.` : `${lead} ${notes}`;
  return clampWidth(oneLine(full), DESCRIPTION_BUDGET);
}

/**
 * Everything a page says about itself, in one language.
 *
 * `base` is the site's root path — Vite's `BASE_URL`, which is `/` on the real
 * domain and `/sub/` on a subpath build. Paths are returned root-relative and
 * the caller makes them absolute against its own origin, because only the
 * caller knows it: the browser has `location.origin` and the server has
 * `SITE_ORIGIN`, and neither should be guessing the other's.
 */
export function pageMeta(target: MetaTarget, lang: SeoLang, base = '/'): PageMeta {
  const strings = SEO_STRINGS[lang];
  const at = (path: string): string => `${base}${path}`;
  const common = { lang, siteName: strings.brand, imageAlt: strings.brand };

  if (target.kind === 'build') {
    const build = target.build;
    return {
      ...common,
      title: buildTitle(build, lang),
      socialTitle: buildSocialTitle(build, lang),
      description: buildDescription(build, lang),
      path: at(`builds/${build.slug}`),
      image: buildCardPath(build.slug, build.updatedAt, lang),
      imageAlt: `${strings.cardAlt}: ${oneLine(build.title) || strings.untitled}`,
      type: 'article',
      noindex: false,
      // Spread rather than set to null, so the tag is absent on a draft instead
      // of present and empty.
      ...(build.publishedAt !== null ? { publishedAt: build.publishedAt } : {}),
      modifiedAt: build.updatedAt,
    };
  }

  const site = { ...common, image: SITE_CARD, type: 'website' as const };

  switch (target.kind) {
    case 'missing':
      return {
        ...site,
        title: `${strings.untitled}${strings.sep}${strings.brand}`,
        socialTitle: strings.untitled,
        description: strings.routes.build.description,
        path: at(`builds/${target.slug}`),
        // A page that has nothing on it should not be in an index, and this one
        // is served with a 404 besides.
        noindex: true,
      };
    case 'browse':
      return {
        ...site,
        title: `${strings.brand}${strings.sep}${strings.routes.browse.title}`,
        socialTitle: strings.routes.browse.title,
        description: strings.routes.browse.description,
        path: base,
        noindex: false,
      };
    case 'tracker':
      return {
        ...site,
        title: `${strings.routes.tracker.title}${strings.sep}${strings.brand}`,
        socialTitle: strings.routes.tracker.title,
        description: strings.routes.tracker.description,
        path: at('tracker'),
        noindex: false,
      };
    default: {
      // The four private-or-stateless routes. They share every property but
      // their own two strings and their path, so they share a branch.
      const route = strings.routes[target.kind];
      return {
        ...site,
        title: `${route.title}${strings.sep}${strings.brand}`,
        socialTitle: route.title,
        description: route.description,
        path: at(target.kind === 'mine' ? 'me' : target.kind),
        noindex: true,
      };
    }
  }
}
