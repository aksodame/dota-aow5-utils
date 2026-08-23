import type { Match, RouteId } from './routes.ts';

/**
 * Which nav entry stays lit.
 *
 * Split out of `SiteHeader` for the reason everything testable here is: JSX
 * cannot be loaded by `node --test`, and this is a rule with four cases and no
 * obvious right answer for two of them.
 *
 * The rule: a page belongs to the list it came from. Your own build belongs
 * under My builds, anybody else's under Builds, and the planner under Builds
 * because that is where a board you have not saved yet lives. Nothing goes dark
 * just because you clicked into something.
 */
export function isNavCurrent(
  entry: RouteId,
  route: Match['id'],
  viewingOwnBuild: boolean | null,
): boolean {
  if (route === 'build') {
    // Until ownership is known, Builds holds the highlight rather than the nav
    // flickering between two entries as the fetch lands.
    return viewingOwnBuild === true ? entry === 'mine' : entry === 'builds';
  }
  if (entry === 'builds') return route === 'builds' || route === 'planner';
  return route === entry;
}
