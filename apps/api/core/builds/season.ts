import {
  DEFAULT_SEASON,
  isHeroInSeason,
  parseSeason,
  seasonLabel,
  seasonsOfHero,
  type SeasonKey,
} from 'aow5-shared/data';
import type { FieldErrors } from './validate.ts';

/**
 * A build's season, as it will be stored, judged against the build's hero.
 *
 * `raw` is what the request sent; `undefined` means it said nothing, and then
 * `stored` — the row's current season, or null on a create — is what stands.
 * A create that says nothing gets the first season its hero is in, so a client
 * that predates seasons can still save a Drow build rather than being refused
 * for a field it has never heard of.
 *
 * Refused rather than corrected when the pair disagrees, the same way a tier is
 * against its rooms: the author picked both, and quietly moving one is worse
 * than saying they disagree.
 *
 * A build with no hero, or a hero no season lists — Crystal Maiden, who is not
 * offered at all — is accepted in any season: there is nothing to disagree with.
 */
export function resolveSeason(
  raw: unknown,
  heroId: string | null,
  stored: SeasonKey | null,
): { ok: true; season: SeasonKey } | { ok: false; errors: FieldErrors } {
  let season: SeasonKey;
  if (raw === undefined) {
    const heroSeasons = heroId === null ? [] : seasonsOfHero(heroId);
    season = stored ?? heroSeasons[0] ?? DEFAULT_SEASON;
  } else {
    const parsed = parseSeason(raw);
    if (parsed === null) return { ok: false, errors: { season: 'Pick S1 or S2.' } };
    season = parsed;
  }

  if (heroId !== null && seasonsOfHero(heroId).length > 0 && !isHeroInSeason(heroId, season)) {
    return { ok: false, errors: { season: `That hero is not playable in ${seasonLabel(season)}.` } };
  }
  return { ok: true, season };
}
