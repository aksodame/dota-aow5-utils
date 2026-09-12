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

/**
 * The build's own address, with the version a link preview needs.
 *
 * `?v=<updated_at>` is not read by anything on this site — the router matches
 * on the path, and the API's prerenderer reads the path and `?lang=` and throws
 * the rest away. It is there for the scrapers, and it is the answer to a
 * problem they create rather than one this app has.
 *
 * A chat client caches the *embed* it built for a URL, not just the picture
 * inside it: post a build, edit it, post the same link again, and Discord
 * answers from that cache with the card as it was, for hours. The picture's own
 * address already changes on an edit — see `buildCardPath` — but nothing goes
 * back to fetch it while the embed is a hit. A different URL is a different
 * embed, so the version makes "I fixed the title and re-shared it" show the
 * title somebody fixed.
 *
 * Deliberately **not** the canonical. `og:url` and `<link rel="canonical">` are
 * built from `pageMeta.path`, which has no query at all: a search engine must
 * see one address for one build, or an edit forks its ranking in two.
 */
export const BUILD_VERSION_PARAM = 'v';

export function buildShareUrl(href: string, updatedAt: number): string {
  try {
    const url = new URL(href);
    url.searchParams.set(BUILD_VERSION_PARAM, String(updatedAt));
    return url.toString();
  } catch {
    // Not a URL this browser will parse, which should not happen for an address
    // it is already displaying. The unversioned link still works; it is only
    // the freshness of somebody else's preview that is at stake.
    return href;
  }
}
