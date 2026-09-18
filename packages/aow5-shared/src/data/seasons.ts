/**
 * Which season of the game a guide is for, and who can be played in it.
 *
 * **This site's curation, not the addon's data** — the same standing as
 * `tiers.ts`. The addon relaunched as seasons with separate maps (`s1-1`,
 * `s1-2`, `s2-1`), but nothing in the pak says which hero belongs to which: the
 * hero, profession and ability tables are shared by every season. So the pools
 * are written down here, by hand, and change here when the game's do.
 *
 * Seasons split *heroes* and nothing else. Items and rooms are the same for
 * every season on this site — a room that leaves the game stays offered, and no
 * item is filtered by season — which is why nothing below mentions either.
 *
 * Shared rather than per-app because the API refuses a build whose hero is not
 * in its season and the site must not offer a pair the API will refuse.
 */

/** A season. Numbers, because every one of them is a number. */
export type SeasonKey = 1 | 2;

/**
 * Every season that exists, in the order they are offered.
 *
 * The database's CHECK constraint is this list too; a third season is a
 * migration that widens it plus an entry here.
 */
export const SEASON_KEYS: readonly SeasonKey[] = [1, 2];

/**
 * The season every guide written before seasons existed belongs to.
 *
 * Also the column's default. Not "the current season": a draft that does not
 * say is read as the original game, the same way the migration read every row.
 */
export const DEFAULT_SEASON: SeasonKey = 1;

/** The newest season, which is what the editor starts a new build on. */
export const LATEST_SEASON: SeasonKey = 2;

/**
 * The heroes each season can be played with, as `npc_dota_hero_*` ids.
 *
 * Order is the order they are offered in. Axe is in both.
 */
const SEASON_HEROES: Readonly<Record<SeasonKey, readonly string[]>> = {
  1: ['npc_dota_hero_lina', 'npc_dota_hero_phantom_assassin', 'npc_dota_hero_axe'],
  2: ['npc_dota_hero_void_spirit', 'npc_dota_hero_drow_ranger', 'npc_dota_hero_axe'],
};

export function isSeasonKey(value: unknown): value is SeasonKey {
  return typeof value === 'number' && (SEASON_KEYS as readonly number[]).includes(value);
}

/**
 * A season out of a query string or a form field: `'2'`, `2` or `'s2'`.
 *
 * Null for anything else, never a guess — `?season=3` asked for a season that
 * does not exist, and answering with S1 would be answering a different question.
 */
export function parseSeason(value: unknown): SeasonKey | null {
  const raw = typeof value === 'string' ? value.trim().replace(/^s/i, '') : value;
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return isSeasonKey(n) ? n : null;
}

/** The heroes a season offers, as ids, in offering order. */
export function seasonHeroes(season: SeasonKey): readonly string[] {
  return SEASON_HEROES[season];
}

/** Whether a hero can be played in a season. */
export function isHeroInSeason(heroId: string, season: SeasonKey): boolean {
  return SEASON_HEROES[season].includes(heroId);
}

/** The seasons a hero appears in. Empty for a hero no season offers. */
export function seasonsOfHero(heroId: string): SeasonKey[] {
  return SEASON_KEYS.filter((season) => isHeroInSeason(heroId, season));
}

/** `S1`, `S2` — the same in every language the site speaks, like `T1`…`T9`. */
export function seasonLabel(season: SeasonKey): string {
  return `S${season}`;
}
