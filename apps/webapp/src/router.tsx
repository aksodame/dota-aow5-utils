import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
} from 'react';
import { carriesBuildPayload, pathOf, routeAt, type RouteId } from '@/lib/routes';

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

export { ROUTES, pathOf, routeAt, type RouteId } from '@/lib/routes';

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
