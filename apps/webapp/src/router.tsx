import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
} from 'react';
import { carriesBuildPayload, buildPath, matchRoute, pathOf, routeAt, type Match, type RouteId } from '@/lib/routes';

/**
 * Three pages, no dependency.
 *
 * A router library buys nested layouts, dynamic segments, loaders and data
 * revalidation. This site has three static paths and none of the rest, so what
 * it would actually buy is 15 kB on the page whose whole argument is that it is
 * small. What follows is the History API with a subscription around it.
 *
 * **Paths, not the fragment.** The fragment is spoken for: the planner keeps
 * the entire board in `location.hash`, which is what makes a build shareable
 * without a backend. So routing is `pathname` — which is also why the deploy
 * needs a `404.html` (see vite.config.ts) and why nothing on the landing page
 * is an in-page `#anchor`.
 */

export { ROUTES, buildPath, matchRoute, pathOf, routeAt, type Match, type RouteId } from '@/lib/routes';

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

export function useRoute(): RouteId {
  return useSyncExternalStore(
    subscribe,
    () => routeAt(window.location.pathname),
    () => 'landing' as RouteId,
  );
}

/**
 * The current route including the one dynamic segment.
 *
 * `getSnapshot` must return a stable reference or useSyncExternalStore loops,
 * and `matchRoute` builds a fresh object every call — so the result is cached
 * and only replaced when the path actually changes.
 */
let lastPath: string | null = null;
let lastMatch: Match = { id: 'landing' };

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

interface NavigateOptions {
  replace?: boolean;
  /**
   * Carried across only when it is asked for.
   *
   * By default the fragment is dropped on navigation, because on this site a
   * fragment is a *board*: letting one follow you from the planner to the
   * landing page would be meaningless, and letting anything else follow you
   * onto the planner would be decoded as a build and reported as a broken
   * link. The one caller that passes it is the legacy-link redirect below.
   */
  keepUrl?: boolean;
}

export function navigate(id: RouteId, { replace = false, keepUrl = false }: NavigateOptions = {}): void {
  const url = keepUrl ? `${pathOf(id)}${window.location.search}${window.location.hash}` : pathOf(id);
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(NAVIGATED));
}

/**
 * A real `<a>` that navigates without a reload.
 *
 * The href is genuine, so middle-click, ctrl-click and "copy link address" all
 * behave — which is the entire reason this is not a button with an onClick.
 *
 * Every other anchor prop passes straight through, because most of these are
 * wrapped in `<Button asChild>`: Radix's Slot clones this element with the
 * button's own className, data attributes and any handler of its own, and
 * anything not spread here would be silently dropped on the way.
 */
export function Link({
  to,
  onClick,
  ...rest
}: { to: RouteId } & Omit<ComponentProps<'a'>, 'href'>) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      // Anything but a plain left click is the browser's business: a new tab,
      // a new window, a download.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(to);
    },
    [to, onClick],
  );

  return <a href={pathOf(to)} onClick={handleClick} {...rest} />;
}

/**
 * Navigates to a path this app owns.
 *
 * The general form behind `navigate`, for the two places that need a URL rather
 * than a route name: a build's own page, and opening a build's board in the
 * planner.
 */
export function navigateTo(url: string, { replace = false }: { replace?: boolean } = {}): void {
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(NAVIGATED));
}

export function toBuild(slug: string, options: { replace?: boolean } = {}): void {
  navigateTo(buildPath(slug), options);
}

/**
 * Opens a stored board in the planner.
 *
 * **The second and last caller allowed to write the fragment**, alongside
 * `redirectLegacyBuildLinks` below. That is not a loophole in the rule that the
 * fragment belongs to the planner — it is the rule being used: a board in the
 * fragment is exactly what a planner URL is, and what this produces is
 * indistinguishable from a link somebody shared by hand.
 *
 * A build's own page never carries one. Its board comes from the API.
 */
export function openInPlanner(payload: string): void {
  navigateTo(payload === '' ? pathOf('planner') : `${pathOf('planner')}#b=${payload}`);
}

/**
 * Sends the pre-split links to the planner.
 *
 * Every build shared before the planner moved off the site root points at `/`
 * with the board in the fragment — and `?b=` older still. Those links are the
 * product; they cannot be allowed to land on a marketing page that ignores
 * them. Run before the first render, from main.tsx, so nothing paints twice.
 *
 * Deliberately narrow: only from the landing route, and only when the URL
 * actually carries a payload.
 */
export function redirectLegacyBuildLinks(): void {
  if (routeAt(window.location.pathname) !== 'landing') return;
  if (carriesBuildPayload(window.location.search, window.location.hash)) {
    navigate('planner', { replace: true, keepUrl: true });
  }
}

/** Scrolls to the top on navigation, the one thing a browser does not do here. */
export function useScrollReset(route: RouteId): void {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [route]);
}
