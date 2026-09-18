import type { MapInfo } from '../types/maps.ts';

/**
 * What a guide is filed under: a numbered tier, or Event.
 *
 * **This site's curation, not the addon's data.** The extraction pipeline's job
 * is to report what the game ships, and it does — every room carries the tier
 * its own localized name claims. What is here is the set of deliberate
 * departures from that, plus the Event category the game has no word for.
 *
 * It lives in the shared package rather than in either app because both need
 * the same answer: the API refuses a build whose tier disagrees with its rooms,
 * and the site must not offer a pair the API will refuse. Two copies of this
 * table would be two answers to the same question.
 */

/** A tier key. Strings throughout, because one of them is not a number. */
export type TierKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'event';

/**
 * Every category that exists, in the order they are offered.
 *
 * The full ladder: this is what a stored `tier` is validated against and what a
 * link's `?tier=` is parsed with, so a build filed under a tier this table
 * forgot would become unreadable. What the site *offers* is narrower — see
 * `listedTiers`.
 */
export const TIER_KEYS: readonly TierKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'event'];

export function isTierKey(value: unknown): value is TierKey {
  return typeof value === 'string' && (TIER_KEYS as readonly string[]).includes(value);
}

/**
 * Rooms whose category is decided here rather than read from the game.
 *
 * The first three are corrections: the addon's own localized names put them at
 * a tier that does not match where people actually play them. The rest are not
 * tiered runs at all — Skyfall Realm, the Cat Challenge, the Enchanted Forest
 * and the Mystic Tower are event content, which the data has no way to say.
 *
 * Keyed by id rather than by name so a translation cannot break it.
 */
const OVERRIDES: Readonly<Record<string, TierKey>> = {
  // The three DLC rooms. Their localized names put them at 8, 8 and 9 until pak
  // 3011606331, which moved the English and Russian names to their KV levels —
  // so the data now agrees with these, and they stay as a pin in case it moves
  // back. Ender Shrine is played at 7.
  M010: '7',
  // Ender Thunder Mountain — KV level 5.
  M014: '5',
  // Shrine of Desire — played at 8.
  M013: '8',
  // Event content, none of which belongs on the tier ladder.
  G001: 'event',
  M021: 'event',
  M015: 'event',
  M022: 'event',
};

/**
 * Rooms the site does not offer at all.
 *
 * Kept out of the *offered* list rather than out of the frozen map table, so a
 * build that already names one still decodes and no index shifts. Deleting an
 * entry is all it takes to bring a room back — which is what happened to the
 * Mystic Tower, now offered as event content.
 *
 * Empty, and kept: the next room the game ships before anybody plays it goes
 * here rather than into a filter nobody can use.
 */
const NOT_OFFERED = new Set<string>([]);

/** The category a room belongs to: its override, or the tier the game gives it. */
export function categoryOfMap(map: Pick<MapInfo, 'id' | 'tier'>): TierKey {
  const override = OVERRIDES[map.id];
  if (override !== undefined) return override;
  return isTierKey(String(map.tier)) ? (String(map.tier) as TierKey) : '1';
}

/** Whether the site offers this room for filing a build under. */
export function isOffered(map: Pick<MapInfo, 'id'>): boolean {
  return !NOT_OFFERED.has(map.id);
}

/**
 * The rooms a person may file a build under, ordered as the game's own
 * selection screen lists them: by category, then by name.
 *
 * One function so the browse filter, the editor and the API cannot disagree
 * about which rooms exist — a build filed under a room the filter does not
 * offer is invisible to everyone but its author.
 */
export function listedMaps<T extends { id: string; tier: number; name: string }>(maps: readonly T[]): T[] {
  return maps
    .filter((map) => isOffered(map))
    .slice()
    .sort((a, b) => {
      const byCategory = TIER_KEYS.indexOf(categoryOfMap(a)) - TIER_KEYS.indexOf(categoryOfMap(b));
      return byCategory !== 0 ? byCategory : a.name.localeCompare(b.name);
    });
}

/**
 * The categories worth offering: the ones some listed room belongs to.
 *
 * Derived rather than fixed, which is a reversal. The chips used to be the
 * whole ladder on the argument that a tier with no room is still a tier
 * somebody plays — but after the curation moved the Shrine of Desire down to 8,
 * T9 named nothing at all: a chip that selects no rooms, finds no guides, and
 * cannot be told apart from a filter that is broken. If the addon ships a
 * ninth-tier room, the chip comes back on its own.
 *
 * Both the filter and the editor read this, so the site cannot offer a tier it
 * has no rooms for.
 */
export function listedTiers<T extends { id: string; tier: number }>(maps: readonly T[]): TierKey[] {
  const present = new Set(maps.filter((map) => isOffered(map)).map((map) => categoryOfMap(map)));
  return TIER_KEYS.filter((key) => present.has(key));
}

/**
 * How a category is written where there is only room for a mark: `T7`, `E`.
 *
 * For the corner of a map tile and the badge on a browse row, where the label
 * shares a line with a name. Anywhere with room for a word — the filter chips,
 * the editor's tier picker — uses `tierLabel` instead, because "E" is a letter
 * somebody has to be taught and "Event" is not.
 */
export function tierShort(key: TierKey): string {
  return key === 'event' ? 'E' : `T${key}`;
}

/**
 * How a category is written where the word fits.
 *
 * The event word is the caller's, because it is the one part of this that is
 * translated — the numbered tiers are `T1`…`T9` in every language the site
 * speaks, and inventing a localized "tier" prefix for them would make the chips
 * wider without making them clearer.
 */
export function tierLabel(key: TierKey, eventWord: string): string {
  return key === 'event' ? eventWord : `T${key}`;
}
