/** Every outbound URL on the page, in one place. */

export const REPO = 'aksodame/dota-aow5-utils';
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

/** The addon both tools read their data from. */
export const WORKSHOP_URL = 'https://steamcommunity.com/sharedfiles/filedetails?id=3011606331';

/**
 * The published chat export the report cites.
 *
 * A separate deployment rather than a route here: it serves 2,400 messages and
 * their attachments out of files that are not in this repository, which is a
 * different job from a static site baked into an image. `lib/citations` turns
 * every Discord permalink in the document into a link into it.
 */
export const ARCHIVE_URL = 'https://aow5-discord-report.vercel.app';

/*
 * The planner and the tracker's page are routes of this app, not links — see
 * `src/router.tsx`. Nothing outbound points at them.
 */
