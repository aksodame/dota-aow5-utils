import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
} from 'react';
import { buildPath, editPath, matchRoute, pathOf, type Match, type RouteId } from '@/lib/routes';
import { LANG_PARAM } from '@/i18n/strings';

/**
 * Four routes, no dependency.
 *
 * A router library buys nested layouts, dynamic segments, loaders and data
 * revalidation. This site has four static paths, one dynamic segment and none
 * of the rest, so what it would actually buy is 15 kB on the page whose whole
 * argument is that it is small. What follows is the History API with a
 * subscription around it.
 *
 * **Paths, not the fragment.** The fragment is spoken for: the editor keeps the
 * whole loadout in `location.hash`, which is what makes a build shareable
 * without an account. So routing is `pathname` — which is also why the deploy
 * needs a `404.html` (see vite.config.ts).
 */

export {
  ROUTES,
  buildPath,
  carriesBuildPayload,
  editPath,
  matchRoute,
  pathOf,
  routeAt,
  viewPath,
  type Match,
  type RouteId,
} from '@/lib/routes';

/*
 * `popstate` covers Back and Forward but not our own pushState, so navigations
 * announce themselves. One event name, one subscriber list, no context.
 */
const NAVIGATED = 'app:navigated';
const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATED, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATED, onChange);
  };
};

/*
 * The fragment, too, for the one page whose content *is* the fragment.
 *
 * `hashchange` on top of the two above because editing the address bar's `#`
 * by hand fires only that one — and on `/view` that is not a detail of the
 * page, it is a different build.
 */
const subscribeHash = (onChange: () => void) => {
  const off = subscribe(onChange);
  window.addEventListener('hashchange', onChange);
  return () => {
    off();
    window.removeEventListener('hashchange', onChange);
  };
};

/**
 * The current route including the one dynamic segment.
 *
 * `getSnapshot` must return a stable reference or useSyncExternalStore loops,
 * and `matchRoute` builds a fresh object every call — so the result is cached
 * and only replaced when the path actually changes.
 */
let lastPath: string | null = null;
let lastMatch: Match = { id: 'browse' };

function matchSnapshot(): Match {
  const path = window.location.pathname;
  if (path !== lastPath) {
    lastPath = path;
    lastMatch = matchRoute(path);
  }
  return lastMatch;
}

export function useMatch(): Match {
  return useSyncExternalStore(subscribe, matchSnapshot, () => lastMatch);
}

/**
 * The query string, as a subscription.
 *
 * The editor reads `?slug=` from it, and the sign-in redirect reads `?auth=`.
 * Kept here rather than read directly so a navigation that only changes the
 * query still re-renders — `matchSnapshot` is keyed on the pathname and would
 * not notice.
 */
export function useSearch(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => '',
  );
}

/**
 * The fragment, as a subscription.
 *
 * Only `/view` reads it: the editor owns its own copy of the loadout and writes
 * the fragment *from* it, so a hook that fed the editor its own writes would be
 * a loop. See `ViewPage`.
 */
export function useHash(): string {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => '',
  );
}

interface NavigateOptions {
  replace?: boolean;
  /**
   * Carried across only when it is asked for.
   *
   * By default the fragment is dropped on navigation, because on this site a
   * fragment is a *loadout*: letting one follow you from the editor to the
   * browse list would be meaningless, and letting anything else follow you onto
   * the editor would be decoded as a build and reported as a broken link.
   */
  keepUrl?: boolean;
}

export function navigate(id: RouteId, { replace = false, keepUrl = false }: NavigateOptions = {}): void {
  const url = keepUrl ? `${pathOf(id)}${window.location.search}${window.location.hash}` : pathOf(id);
  navigateTo(url, { replace });
}

/**
 * Navigates to a path this app owns.
 *
 * The general form behind `navigate`, for the routes that carry something: a
 * build's own page, and the editor opened on one.
 */
export function navigateTo(url: string, { replace = false }: { replace?: boolean } = {}): void {
  const next = withLang(url);
  if (replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
  window.dispatchEvent(new Event(NAVIGATED));
}

/**
 * Carries `?lang=` from where you are to where you are going.
 *
 * The language is a preference about the whole site, and it lives in the URL so
 * a link can be shared in the language it was read in. That made it a
 * preference every internal navigation dropped: choosing Russian in settings
 * and pressing Builder went back to English, because a tab's href is a bare
 * path. Rather than teaching every link to append it, the one funnel every
 * internal navigation goes through does it.
 *
 * A target that already names a language keeps its own — a deliberate `?lang=`
 * in a link somebody followed is an instruction, not an accident.
 */
export function withLang(url: string): string {
  const current = new URLSearchParams(window.location.search).get(LANG_PARAM);
  if (current === null) return url;

  // Resolved against the current location so a relative path parses; only the
  // path, query and fragment are put back, so this never rewrites the origin.
  const target = new URL(url, window.location.origin);
  if (target.searchParams.has(LANG_PARAM)) return url;

  target.searchParams.set(LANG_PARAM, current);
  return `${target.pathname}${target.search}${target.hash}`;
}

export function toBuild(slug: string, options: { replace?: boolean } = {}): void {
  navigateTo(buildPath(slug), options);
}

/**
 * Opens a loadout in the editor.
 *
 * **The only caller allowed to write the fragment.** That is not a loophole in
 * the rule that the fragment belongs to the editor — it is the rule being used:
 * a loadout in the fragment is exactly what an editor URL is, and what this
 * produces is indistinguishable from a link somebody shared by hand.
 *
 * A build's own page never carries one. Its loadout comes from the API.
 */
export function openInEditor(payload: string, slug?: string): void {
  // The fragment goes after the query, which is where `editPath` already left
  // room for it — `/edit?slug=abc#b=7.…` is one URL, not two concatenated.
  const base = editPath(slug);
  navigateTo(payload === '' ? base : `${base}#b=${payload}`);
}

/**
 * A real `<a>` that navigates without a reload.
 *
 * The href is genuine, so middle-click, ctrl-click and "copy link address" all
 * behave — which is the entire reason this is not a button with an onClick.
 */
export function Link({
  to,
  onClick,
  ...rest
}: { to: RouteId | { href: string } } & Omit<ComponentProps<'a'>, 'href'>) {
  const href = typeof to === 'string' ? pathOf(to) : to.href;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      // Anything but a plain left click is the browser's business: a new tab,
      // a new window, a download.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateTo(href);
    },
    [href, onClick],
  );

  return <a href={href} onClick={handleClick} {...rest} />;
}

/**
 * Scrolls to the top on navigation, the one thing a browser does not do here.
 *
 * The *region*, not the window: the page itself no longer scrolls — `#main` is
 * the box between the top bar and the footer, and it is the thing carrying the
 * position a new page has to start from. The window is scrolled too, for the
 * case where a browser has nudged it (an on-screen keyboard, a focused field
 * near the edge) and left it somewhere other than zero.
 */
export function useScrollReset(key: string): void {
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [key]);
}
