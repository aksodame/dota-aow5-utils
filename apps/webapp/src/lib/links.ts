/** Every outbound URL on the page, in one place. */

export const REPO = 'aksodame/dota-aow5-utils';
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

/** The addon both tools read their data from. */
export const WORKSHOP_URL = 'https://steamcommunity.com/sharedfiles/filedetails?id=2883951116';

/*
 * The planner and the tracker's page are routes of this app, not links — see
 * `src/router.tsx`. Nothing outbound points at them.
 */
