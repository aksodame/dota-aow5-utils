/**
 * Sound search, as the tracker asks for it and the API answers.
 *
 * The catalogue behind this is Freesound. The tracker does not talk to it
 * directly and could not: searching needs a credential, and a credential
 * shipped inside a desktop app is one key's daily quota shared by every player
 * who installs it. So the API holds the key and proxies the search, and what
 * comes back is trimmed to what a picker actually draws.
 *
 * The audio itself never passes through this server. A hit carries the URL of
 * Freesound's own public preview, which needs no account and no token, and the
 * tracker fetches it from there. That is the whole reason this feature has no
 * login in it — and it is also what keeps it inside Freesound's terms, which
 * forbid mirroring their content anywhere else.
 */

/** One sound the picker can offer. */
export interface SoundHit {
  /** Freesound's own id. Stable, and what a link back to the page is built from. */
  id: number;
  name: string;
  /**
   * Who made it.
   *
   * Not decoration: most of Freesound is CC-BY, which asks for the author by
   * name, so this is stored with the sound rather than shown and forgotten.
   */
  username: string;
  /** The licence URL Freesound reports, verbatim — never interpreted here. */
  license: string;
  /** Seconds, as the catalogue has it. */
  duration: number;
  /**
   * The public preview mp3, and the thing that actually gets bound.
   *
   * Not the original upload, which needs a signed-in Freesound account to
   * download. A preview is a ~128kbps mp3 of the whole sound, which is what a
   * notification over a running game needs and rather less than a 40 MB wav.
   */
  preview: string;
  /** The sound's own page, for a player who wants to know where it came from. */
  page: string;
}

export interface SoundSearchResponse {
  hits: SoundHit[];
  /** How many the catalogue has in total, for a "showing 15 of 400". */
  total: number;
  page: number;
  /** Null when there is nothing after this page. */
  nextPage: number | null;
}

/**
 * A page of results.
 *
 * Fifteen is Freesound's own default and about a screen of rows in the picker.
 * Both sides know it so the tracker can size its list before the answer lands.
 */
export const SOUND_PAGE_SIZE = 15;

/** Longer than this is not a drop notification, and the search says so upfront. */
export const MAX_SOUND_SECONDS = 12;

/** A query longer than this is a paste, not a search. */
export const MAX_SOUND_QUERY = 80;
