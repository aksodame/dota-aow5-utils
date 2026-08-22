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
  planner: 'builder',
  tracker: 'tracker',
} as const;

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

/**
 * The route a pathname names, or `landing` for anything unrecognised.
 *
 * Unrecognised means the front page rather than an error page: the only way to
 * get here is a stale or hand-typed URL, and there is nothing a 404 screen
 * could offer that the front page does not.
 */
export function routeAt(pathname: string, base: string = BASE): RouteId {
  const rest = (pathname.startsWith(base) ? pathname.slice(base.length) : pathname).replace(/^\/+|\/+$/g, '');
  return ROUTE_IDS.find((id) => ROUTES[id] === rest) ?? 'landing';
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
 */
export function carriesBuildPayload(search: string, hash: string): boolean {
  const fragment = hash.replace(/^#/, '');
  if (fragment.startsWith('b=') && fragment.length > 2) return true;
  if (fragment !== '' && !fragment.includes('=')) return true;
  return new URLSearchParams(search).get('b') !== null;
}
