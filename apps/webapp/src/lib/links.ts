/** Every outbound URL on the page, in one place. */

export const REPO = 'aksodame/dota-aow5-utils';
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

/**
 * The site this one replaces, still running.
 *
 * Two pages of it are still linked, for two different reasons. The tracker's
 * page here is being rebuilt, and until it is, the old one is where the
 * download and the setup instructions actually are — a "coming soon" with no
 * way through is worse than no page at all. And the old build list is where
 * everything published before this version still lives: this database starts
 * empty, and nothing migrates a build but its author.
 *
 * Delete each of these and the notice that uses it together, once the page
 * stands on its own and the builds have moved.
 */
const OLD_SITE = 'https://dota-aow5-utils.duckdns.org';
export const OLD_SITE_TRACKER = `${OLD_SITE}/tracker`;
export const OLD_SITE_BUILDS = `${OLD_SITE}/builds`;

/**
 * The same page, in the language the reader is already reading.
 *
 * The old site is the previous version of this one and reads `?lang=` exactly
 * as this one does, so carrying it across is the difference between handing
 * somebody the page they were on and handing them the English one.
 */
export function oldTrackerUrl(lang: string): string {
  return withLang(OLD_SITE_TRACKER, lang);
}

/** The old site's build list, in the reader's language. */
export function oldBuildsUrl(lang: string): string {
  return withLang(OLD_SITE_BUILDS, lang);
}

function withLang(url: string, lang: string): string {
  return `${url}?lang=${encodeURIComponent(lang)}`;
}

/** The addon both tools read their data from. */
export const WORKSHOP_URL = 'https://steamcommunity.com/sharedfiles/filedetails?id=2883951116';

/*
 * The planner and the tracker's page are routes of this app, not links — see
 * `src/router.tsx`. Nothing outbound points at them.
 */
