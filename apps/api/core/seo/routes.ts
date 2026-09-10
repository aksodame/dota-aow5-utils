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
 * six static paths, one dynamic segment, and anything unrecognised falling
 * through to the browse page rather than to an error.
 */

import { isSlug } from '../builds/slug.ts';

/** The static routes, keyed by the path segment that names them. Mirrors `ROUTES`. */
const STATIC: Record<string, Exclude<RouteName, 'build'>> = {
  '': 'browse',
  me: 'mine',
  edit: 'edit',
  view: 'view',
  settings: 'settings',
  tracker: 'tracker',
};

export type RouteName = 'browse' | 'mine' | 'edit' | 'view' | 'settings' | 'tracker' | 'build';

export type RouteMatch =
  | { route: Exclude<RouteName, 'build'>; lang: string | undefined }
  | { route: 'build'; slug: string; lang: string | undefined };

/** Mirrors `BUILD_PREFIX`. */
const BUILD_PREFIX = 'builds';

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
