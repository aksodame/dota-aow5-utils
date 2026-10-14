/**
 * Which page a URL names, decided on the server.
 *
 * A second implementation of `matchRoute` from the webapp's `lib/routes.ts`,
 * and that duplication is deliberate rather than an oversight. The client's
 * copy reads `window.location` and is compiled into the SPA bundle; this one
 * parses a string out of a request header and is compiled into the API. Sharing
 * it would mean moving the route table into `aow5-shared`, which would make the
 * *shape of the site's URLs* a published contract of the data package — and the
 * table is six literals.
 *
 * What must not drift is the behaviour, which is pinned by tests on both sides:
 * six static paths, two dynamic segments, the wiki, and anything unrecognised
 * falling through to the browse page rather than to an error.
 *
 * The wiki's section list is *not* duplicated: it is declared once in
 * `aow5-shared/seo`, because the card renderer needs it too.
 */

import { isSlug } from '../builds/slug.ts';
import {
  DEFAULT_WIKI_SECTION,
  WIKI_DEPTH,
  WIKI_PREFIX,
  WIKI_SEGMENT,
  isWikiSection,
  type WikiSection,
} from 'aow5-shared/seo';

/** The static routes, keyed by the path segment that names them. Mirrors `ROUTES`. */
const STATIC: Record<string, Exclude<RouteName, 'build' | 'item' | 'wiki'>> = {
  '': 'browse',
  me: 'mine',
  edit: 'edit',
  view: 'view',
  settings: 'settings',
  tracker: 'tracker',
};

export type RouteName = 'browse' | 'mine' | 'edit' | 'view' | 'settings' | 'tracker' | 'build' | 'item' | 'wiki';

export type RouteMatch =
  | { route: Exclude<RouteName, 'build' | 'item' | 'wiki'>; lang: string | undefined }
  | { route: 'wiki'; section: WikiSection; path: string[]; lang: string | undefined }
  | { route: 'build'; slug: string; lang: string | undefined }
  | { route: 'item'; itemId: string; lang: string | undefined };

/** Mirrors `BUILD_PREFIX`. */
const BUILD_PREFIX = 'builds';

/** Mirrors `ITEM_PREFIX`: an item's page is the wiki's `items` section plus its id. */
const ITEM_PREFIX = `${WIKI_PREFIX}/items`;

/** Mirrors the webapp's `ITEM_ID`. */
const ITEM_ID = /^item_[A-Za-z0-9_]{1,40}$/;

/**
 * Parses a request URI — path and query, as Caddy passes it on.
 *
 * Everything about this is defensive, because the input is a header. A URI that
 * does not parse, names no route, or carries a malformed slug all end the same
 * way: the browse page, which is what an unrecognised path renders on the
 * client too.
 */
export function matchPath(uri: string): RouteMatch {
  let pathname = uri;
  let lang: string | undefined;

  try {
    // Resolved against a placeholder origin so a bare path parses. The origin
    // is thrown away — only the path and one query parameter are read — so it
    // does not matter that it is not this site's.
    const url = new URL(uri, 'http://x');
    pathname = url.pathname;
    lang = url.searchParams.get('lang') ?? undefined;
  } catch {
    // A URI with something in it that `URL` refuses. Strip the query by hand
    // and carry on with the path; there is no language to read out of it.
    pathname = uri.split('?')[0] ?? '/';
  }

  const tail = decodeTail(pathname);

  if (tail.startsWith(`${BUILD_PREFIX}/`)) {
    const slug = tail.slice(BUILD_PREFIX.length + 1);
    // A malformed slug is not a build page, the same way it is not one on the
    // client — it falls through rather than rendering an error for a path that
    // was probably never a link.
    if (isSlug(slug)) return { route: 'build', slug, lang };
    return { route: 'browse', lang };
  }

  if (tail.startsWith(`${ITEM_PREFIX}/`)) {
    const itemId = tail.slice(ITEM_PREFIX.length + 1);
    if (ITEM_ID.test(itemId)) return { route: 'item', itemId, lang };
    return { route: 'browse', lang };
  }

  if (tail === WIKI_PREFIX || tail.startsWith(`${WIKI_PREFIX}/`)) {
    const [section = DEFAULT_WIKI_SECTION, ...path] = tail.split('/').slice(1);
    if (!isWikiSection(section)) return { route: 'browse', lang };
    if (path.length > WIKI_DEPTH || !path.every((part) => WIKI_SEGMENT.test(part))) return { route: 'browse', lang };
    return { route: 'wiki', section, path, lang };
  }

  return { route: STATIC[tail] ?? 'browse', lang };
}

/** The path with its surrounding slashes gone, percent-decoded where it can be. */
function decodeTail(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  try {
    return decodeURIComponent(trimmed);
  } catch {
    // A stray `%` makes this throw. The raw form matches no route and falls
    // through to browse, which is the right answer for it anyway.
    return trimmed;
  }
}
