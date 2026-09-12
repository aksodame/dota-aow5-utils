/**
 * The maps a guide can be written for.
 *
 * Age of Weapons 5 is played as a run through one of a dozen-odd rooms, each
 * with a tier the game shows in its name ("Lv. 6: Temple Depths"). A build is
 * advice for clearing *one* of them — which is what makes the map, not a
 * free-form label, the thing a guide is filed under and filtered by.
 *
 * Import-free like `items.ts` and `heroes.ts`, so the Node pipeline and the
 * browser bundle share it.
 */

export type MapId = string;

/** Room categories the addon defines. `forest` is the ordinary run. */
export type MapType = 'forest' | 'greed_cave' | 'tutorial' | string;

/**
 * One playable map.
 *
 * `idx` is a frozen table position starting at 1, so 0 stays free to mean "no
 * map chosen" in an encoded build — the same contract as the hero roster and
 * the item id table.
 */
export interface MapInfo {
  id: MapId;
  idx: number;
  type: MapType;
  /**
   * The tier players see, parsed from the localized name (`lv_name_m007` ->
   * "Lv. 6: Temple Depths" -> 6).
   *
   * **Not always `roomLevel`.** The three DLC rooms disagree: M014 is `Level 5`
   * in `ak_rooms.txt` but is called Lv. 8 everywhere a player looks, and M010
   * and M013 are each shown one tier above their KV level. The displayed number
   * is the one a guide author means when they say "a tier 8 build", so it is
   * the one this field carries and the one the site filters on. The raw KV
   * value is kept alongside rather than discarded, because it is what the
   * game's own drop and difficulty maths uses.
   */
  tier: number;
  /** `Level` exactly as `ak_rooms.txt` states it. See the note on `tier`. */
  roomLevel: number;
  /** Entry cost in gold. 0 for the starting rooms. */
  gold: number;
  /** Carries `isDLC` in the room table. */
  isDlc: boolean;
  /**
   * The addon's `IsShow` flag.
   *
   * Kept rather than filtered on: a room the game hides from its own selection
   * screen can still be somewhere people play and write guides about — the
   * Mystic Tower (M022) shipped hidden and arrived with its own keys and coin.
   * The site decides what to list; the pipeline only reports.
   */
  visible: boolean;
  /** Boss unit ids, in the order the room table lists them. */
  bosses: MapId[];
  /**
   * The painted scene the base's teleport screen shows for this room, as a
   * filename under `public/icons/maps/`.
   *
   * Absent for rooms the addon ships no art for — the Skyfall Realm and the
   * hidden test rooms. Callers fall back rather than assuming one exists.
   */
  image?: string;
}

export interface MapsData {
  schema: 1;
  generatedAt: string;
  maps: MapInfo[];
  /** Frozen, append-only. An index here is what an encoded build carries. */
  mapTableLength: number;
  mapTableHash: string;
}

/** Localized map text, mirroring `AbilityLocale`. */
export interface MapLocale {
  /** The bare name — "Temple Depths". What the site renders. */
  name: string;
  /**
   * The game's own labelled form — "Lv. 6: Temple Depths".
   *
   * Kept because it is the string players recognise from the selection screen,
   * and because it is where `tier` was parsed from.
   */
  label: string;
}

export interface LocaleMaps {
  schema: 1;
  lang: string;
  maps: Record<MapId, MapLocale>;
}
