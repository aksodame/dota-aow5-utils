/**
 * The route table and the pure functions over it.
 *
 * Split out of `router.tsx` so it can be tested: `node --test` strips types
 * but not JSX, so anything that has to be verified lives in a file with none.
 * What is verified here is the part that can silently break a link somebody
 * already shared.
 */

export const ROUTES = {
  landing: '',
  /**
   * The planner.
   *
   * Called "Builds" everywhere a person can see, but the **path stays
   * `builder`**: every board shared since the site launched points at it, and a
   * rename would break all of them for a word. The label and the URL are
   * allowed to disagree; the URL is a promise and the label is not.
   */
  planner: 'builder',
  /** Published builds, browsable and searchable. */
  builds: 'builds',
  /** The signed-in author's own five. */
  mine: 'me',
  tracker: 'tracker',
} as const;

/**
 * The one route with a variable in it: `/builds/<slug>`.
 *
 * Kept out of `ROUTES` rather than folded in, because that table maps a name to
 * a literal and `routeAt` is a lookup in it — both stay simple as long as
 * nothing in there has a hole. "My builds" lives at `/me` rather than under
 * this prefix for the same reason it is not `/builds/mine`: `mine` is a legal
 * slug, and a route that can collide with real data is a bug waiting for the
 * right author to publish.
 */
export const BUILD_PREFIX = 'builds';

/**
 * What a slug may look like.
 *
 * A range rather than the exact length the server generates, so changing that
 * length later cannot orphan links already shared. Mirrors `isSlug` in
 * `apps/api/core/builds/slug.ts` — the alphabet deliberately excludes the
 * glyphs people transcribe wrong.
 */
const SLUG = /^[1-9A-HJ-NP-Za-km-z]{4,16}$/;

export type RouteId = keyof typeof ROUTES;

export const ROUTE_IDS = Object.keys(ROUTES) as RouteId[];

/**
 * Vite's `base`, which always ends in a slash — `/` at a domain root,
 * `/dota-aow5-utils/` on a project Pages site.
 *
 * Guarded so this module can be imported by `node --test`, where Vite's
 * `import.meta.env` does not exist. The shared package's loader does the same.
 */
export const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function pathOf(id: RouteId, base: string = BASE): string {
  return `${base}${ROUTES[id]}`;
}

/** The path for one published build. */
export function buildPath(slug: string, base: string = BASE): string {
  return `${base}${BUILD_PREFIX}/${slug}`;
}

/** Strips the base and the surrounding slashes, leaving the route's own part. */
function rest(pathname: string, base: string): string {
  return (pathname.startsWith(base) ? pathname.slice(base.length) : pathname).replace(/^\/+|\/+$/g, '');
}

/**
 * The route a pathname names, or `landing` for anything unrecognised.
 *
 * Unrecognised means the front page rather than an error page: the only way to
 * get here is a stale or hand-typed URL, and there is nothing a 404 screen
 * could offer that the front page does not.
 */
export function routeAt(pathname: string, base: string = BASE): RouteId {
  const tail = rest(pathname, base);
  return ROUTE_IDS.find((id) => ROUTES[id] === tail) ?? 'landing';
}

export interface Match {
  id: RouteId | 'build';
  /** Only present for `build`. */
  slug?: string;
}

/**
 * The full match, including the one dynamic route.
 *
 * `routeAt` stays the static lookup it always was, so every existing caller and
 * every existing test keeps its meaning; this wraps it.
 */
export function matchRoute(pathname: string, base: string = BASE): Match {
  const tail = rest(pathname, base);

  if (tail.startsWith(`${BUILD_PREFIX}/`)) {
    const slug = tail.slice(BUILD_PREFIX.length + 1);
    // A malformed slug is not a build page. It falls through to the landing
    // page like any other unrecognised path rather than rendering an error.
    if (SLUG.test(slug)) return { id: 'build', slug };
    return { id: 'landing' };
  }

  return { id: routeAt(pathname, base) };
}

/**
 * Whether a URL is carrying a build.
 *
 * Three shapes, because the planner has accepted three: `#b=<payload>` today,
 * a bare `#<payload>` which it has always tolerated, and `?b=<payload>` from
 * before the board moved to the fragment. A payload is base64url and never
 * contains `=`, which is what separates a bare one from any other fragment.
 *
 * Kept in step with `readPayload` in `src/build/useUrlSync.ts` — that function
 * decides what the planner will read, this one decides what gets sent there.
 *
 * **Deliberately not loosened for the new routes.** A saved build's board
 * arrives from the API, never from its URL, so `/builds/<slug>` carries no
 * fragment and nothing about it should look to this function like it does.
 */
export function carriesBuildPayload(search: string, hash: string): boolean {
  const fragment = hash.replace(/^#/, '');
  if (fragment.startsWith('b=') && fragment.length > 2) return true;
  if (fragment !== '' && !fragment.includes('=')) return true;
  return new URLSearchParams(search).get('b') !== null;
}
