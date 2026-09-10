/**
 * The route table and the pure functions over it.
 *
 * Split out of `router.tsx` so it can be tested: `node --test` strips types
 * but not JSX, so anything that has to be verified lives in a file with none.
 *
 * Four routes, which is the whole site. The planner, the landing page, the
 * separate published-builds list and the my-builds page collapsed into these:
 * browsing *is* the front page now, and the thing that used to be the planner
 * is the editor behind it.
 */

export const ROUTES = {
  /**
   * The browse list, at the site root.
   *
   * Called "Builder" in the top bar, because that is what a visitor is here to
   * do — the label and the path are allowed to disagree, and `/` is the one
   * path that can never be wrong.
   */
  browse: '',
  /** The author's own five. */
  mine: 'me',
  /** The editor, with the loadout in the fragment. */
  edit: 'edit',
  /**
   * A shared loadout that nobody published: the same fragment, read-only.
   *
   * `/edit#b=…` was the only shape a board-in-a-URL had, which meant handing
   * somebody a build meant handing them your editor — a screen of controls for
   * a thing they had not made, with Save and Publish on it. This is that link
   * for a reader: the loadout, what the codec says about it, and one button
   * that opens it in the editor if they want to change it.
   */
  view: 'view',
  /** The account: which providers vouch for you, and the language. */
  settings: 'settings',
  tracker: 'tracker',
} as const;

/**
 * The one route with a variable in it: `/builds/<slug>`.
 *
 * Kept out of `ROUTES` rather than folded in, because that table maps a name to
 * a literal and `routeAt` is a lookup in it — both stay simple as long as
 * nothing in there has a hole. "My creations" lives at `/me` rather than under
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

/**
 * A loadout to read rather than to edit.
 *
 * The board rides in the fragment, exactly as the editor's does. The two facts
 * that are *about* a build rather than in it — what it cost and the author's
 * referral code — ride in the query instead, because they belong to the build
 * record and the codec is the loadout. Extending the codec for them would be a
 * version bump every existing link had to survive, in exchange for putting two
 * short strings somewhere less readable.
 *
 * Everything else an author types — the title, the notes, the video — is not
 * here. A shared link is a board, not a guide; those are what saving is for,
 * and the editor says so under each field.
 */
export function viewPath(
  payload: string,
  extras: { price?: number; referral?: string; tier?: string; mainSpell?: string; video?: string } = {},
  base: string = BASE,
): string {
  const query = new URLSearchParams();
  // `0` is "not given" on a build, so it is left out rather than shown as free.
  if (extras.price !== undefined && extras.price > 0) query.set('price', String(Math.floor(extras.price)));
  if (extras.referral !== undefined && extras.referral !== '') query.set('ref', extras.referral);
  /*
   * The tier, which the codec does not carry and does not need to.
   *
   * The *rooms* are in the payload — v8 made them a list — and every room
   * belongs to exactly one tier, so a board that names one already says which
   * tier it is for. This parameter is for the other case: a guide written for a
   * whole tier without naming a room.
   */
  if (extras.tier !== undefined && extras.tier !== '') query.set('tier', extras.tier);
  /*
   * The headline ability, for the same reason the tier is here: it is the
   * author's opinion about the board rather than part of it, and the codec is
   * the board. A slot key is three characters — `spell=w` — where a version
   * bump would be a cost every link already in the wild had to pay.
   */
  if (extras.mainSpell !== undefined && extras.mainSpell !== '') query.set('spell', extras.mainSpell);
  /*
   * The video, as YouTube's id and nothing else. It fits here for the same
   * reason the editor's field is an id rather than a link: eleven characters of
   * base64url go in a query, where a pasted address with a playlist and three
   * tracking parameters does not.
   */
  if (extras.video !== undefined && extras.video !== '') query.set('video', extras.video);

  const search = query.toString();
  return `${pathOf('view', base)}${search === '' ? '' : `?${search}`}${payload === '' ? '' : `#b=${payload}`}`;
}

/**
 * The editor, optionally opened on an existing build.
 *
 * `?slug=` rather than a path segment, because editing is the same screen as
 * creating and a query parameter says "this screen, about that build" without
 * inventing a second route that has to be kept in step with the first.
 */
export function editPath(slug?: string, base: string = BASE): string {
  return slug === undefined ? pathOf('edit', base) : `${pathOf('edit', base)}?slug=${encodeURIComponent(slug)}`;
}

/** Strips the base and the surrounding slashes, leaving the route's own part. */
function rest(pathname: string, base: string): string {
  return (pathname.startsWith(base) ? pathname.slice(base.length) : pathname).replace(/^\/+|\/+$/g, '');
}

/**
 * The route a pathname names, or `browse` for anything unrecognised.
 *
 * Unrecognised means the browse page rather than an error page: the only way to
 * get here is a stale or hand-typed URL, and there is nothing a 404 screen
 * could offer that a list of builds does not.
 */
export function routeAt(pathname: string, base: string = BASE): RouteId {
  const tail = rest(pathname, base);
  return ROUTE_IDS.find((id) => ROUTES[id] === tail) ?? 'browse';
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
    // A malformed slug is not a build page. It falls through to the browse
    // list like any other unrecognised path rather than rendering an error.
    if (SLUG.test(slug)) return { id: 'build', slug };
    return { id: 'browse' };
  }

  return { id: routeAt(pathname, base) };
}

/**
 * Whether a URL is carrying a loadout.
 *
 * Two shapes: `#b=<payload>` and a bare `#<payload>`, which the editor has
 * always tolerated. A payload is base64url with dot-separated segments and
 * never contains `=`, which is what separates a bare one from any other
 * fragment.
 *
 * **Deliberately narrow.** A saved build's loadout arrives from the API, never
 * from its URL, so `/builds/<slug>` carries no fragment and nothing about it
 * should look to this function like it does.
 */
export function carriesBuildPayload(hash: string): boolean {
  const fragment = hash.replace(/^#/, '');
  if (fragment.startsWith('b=') && fragment.length > 2) return true;
  return fragment !== '' && !fragment.includes('=');
}
