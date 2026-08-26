/**
 * What the tracker plays when something drops, and the rules it plays it by.
 *
 * The settings live here rather than in `ipc.ts` because reading them is a
 * decision with edges — a volume out of range, a cut length of zero, a binding
 * whose value is not a string — and every one of those has to survive a
 * hand-edited config file without taking the app down with it.
 *
 * Browser-safe and free of imports: the renderer plays the sounds, main writes
 * the file, and `node --test` checks the reader.
 */

/** Where a sound comes from: one of the sounds we ship, or a file the player chose. */
export const BUILTIN_PREFIX = 'builtin:';

/**
 * The sound a fresh install reaches for.
 *
 * Which sounds are *in* the box is not decided here: the renderer globs
 * `assets/sounds/` (see `features/sounds/builtins.ts`), so adding one is
 * dropping a file in. This name is the one thing that has to be a constant,
 * because it is bound to Crimson Heart in `DEFAULT_SOUNDS` and it is what a
 * one-click rule starts from.
 */
export const BUILTIN_JACKPOT = `${BUILTIN_PREFIX}jackpot`;

/**
 * The two a fresh install puts on the top tiers.
 *
 * Named here for the same reason as the jackpot: they are bound in
 * `DEFAULT_SOUNDS` below, so their file names in `assets/sounds/` are load-
 * bearing and renaming one silently unbinds it.
 */
export const BUILTIN_FAHHH = `${BUILTIN_PREFIX}fahhh`;
export const BUILTIN_UNDERTAKER = `${BUILTIN_PREFIX}undertaker`;

/**
 * The rarity ladder the game grades items on, and the level ladder beside it.
 *
 * Both come out of `items.index.json` rather than being invented here: quality
 * runs 1–7 (Common through Divine, the last of which is two potions) and level
 * runs 1–10. They are listed rather than derived so the settings grid can draw
 * a tier that nothing has dropped into yet — an empty row is a rule you can
 * still set, and a grid that changes shape with the data is one that quietly
 * loses a tier the day a pak ships without it.
 */
export const QUALITIES = [1, 2, 3, 4, 5, 6, 7] as const;
export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * A sound reference: `builtin:name`, `pack:id/sound`, or an absolute path to
 * the player's own file. See `core/packs.ts` for the middle one.
 */
export type SoundRef = string;

/**
 * The largest a bound sound may be, wherever it came from.
 *
 * Here rather than beside any one of the three places that enforce it — main
 * reading a file off disk, the store accepting a download, the renderer
 * decoding either — because they have to agree. They are enforcing the same
 * sentence: anything bigger than this is not a notification. A number that
 * drifted apart between them would let a sound install and then never play,
 * which looks like a bug in the binding.
 */
export const MAX_SOUND_BYTES = 10 * 1024 * 1024;

export interface SoundSettings {
  /** Off, and nothing plays whatever is bound. */
  enabled: boolean;
  /** 0–1, applied to every voice. */
  volume: number;
  /**
   * Seconds after which a sound is faded out, or null to let it play out.
   *
   * On by default: a drop sound is a notification, and a notification that
   * outlasts the moment it is about becomes something to wait through.
   */
  limitSeconds: number | null;
  /**
   * Rarity -> sound, for every item of that grade the player has not spoken
   * about by name.
   *
   * The thing a player reacts to is almost never a particular item — it is
   * "something Mythic dropped". Binding that by hand meant 239 rows, so it was
   * a feature nobody used; as a rule it is one click. Keyed by the quality
   * number as a string, because that is what a JSON object gives back.
   */
  byQuality: Record<string, SoundRef>;
  /**
   * Level -> sound, under the rarity rules.
   *
   * The other half of how the game grades a drop, and the one that matters when
   * you are farming a band rather than a tier. Lower precedence than rarity —
   * see `resolveSound`, which is the only place that order exists.
   */
  byLevel: Record<string, SoundRef>;
  /**
   * Item id -> sound. Beats both rules.
   *
   * A binding is a deliberate statement about one item, which is why it
   * outranks a grade and why the default one can be removed and stays removed:
   * it is seeded into a fresh config rather than applied as a rule.
   */
  bindings: Record<string, SoundRef>;
}

/**
 * Bounds for the volume slider and the cut length, shared with the settings UI.
 *
 * 15% by default, because the sound plays over a game that is already making
 * noise and the first launch should not be the loudest one. It is a
 * notification, not a soundtrack — and a default that startles is a default
 * people turn off rather than turn down.
 */
export const VOLUME = { min: 0, max: 1, step: 0.05, default: 0.15 } as const;
export const LIMIT = { min: 1, max: 15, step: 1, default: 5 } as const;

export const DEFAULT_SOUNDS: SoundSettings = {
  enabled: true,
  volume: VOLUME.default,
  limitSeconds: LIMIT.default,
  /*
   * The top two tiers ring out of the box; everything below is silent.
   *
   * A tier rule is loud by construction, and that argument used to end with an
   * empty grid — but it only really applies downward. Quality 6 is 239 items,
   * and Legendary above it is rarer still: those are the two grades a player
   * looks up from a fight for, and an overlay that says nothing on the first
   * Mythic of a fresh install has not demonstrated the feature it is built
   * around. The five grades below stay empty, which is where the noise would
   * actually have come from, and one click fills any of them.
   *
   * Only ever applied to a genuinely first launch — see `loadConfig`, which is
   * the half that can tell a new profile from an upgrade. A file that predates
   * these rules is a file that has never been asked, and it stays silent.
   */
  byQuality: { 5: BUILTIN_FAHHH, 6: BUILTIN_UNDERTAKER },
  byLevel: {},
  // Crimson Heart. The one item the tracker has an opinion about, and only
  // until the player says otherwise.
  bindings: { item_M504: BUILTIN_JACKPOT },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/**
 * Reads the sound settings out of whatever the config file holds.
 *
 * Absent means the defaults, including the Crimson Heart binding — a file
 * written before this feature existed is a file that never said no to it.
 * Present but wrong is dropped field by field rather than wholesale: a bad
 * volume should not cost somebody their bindings.
 */
export function readSoundSettings(raw: unknown): SoundSettings {
  if (!isRecord(raw)) {
    /*
     * The grade rules are dropped here, defaults or not, and that is the point.
     *
     * This branch is reached by two situations that look identical from inside
     * a reader: a first launch, and a config file written before the rules
     * existed. Only one of them should start ringing at a whole tier, and it is
     * not the second — so this answers with silence for both, and `loadConfig`,
     * which can see whether a file was there at all, is what hands a genuinely
     * new profile `DEFAULT_SOUNDS` intact.
     */
    return { ...DEFAULT_SOUNDS, byQuality: {}, byLevel: {}, bindings: { ...DEFAULT_SOUNDS.bindings } };
  }

  const bindings: Record<string, string> = {};
  if (isRecord(raw['bindings'])) {
    for (const [id, ref] of Object.entries(raw['bindings'])) {
      // An empty string is a binding to nothing, which is what removing one
      // should have produced instead.
      if (typeof ref === 'string' && ref !== '') bindings[id] = ref;
    }
  } else {
    Object.assign(bindings, DEFAULT_SOUNDS.bindings);
  }

  const volume = typeof raw['volume'] === 'number' && Number.isFinite(raw['volume']) ? raw['volume'] : VOLUME.default;

  // `null` is a value here — "play it to the end" — so only an absent or
  // unusable field falls back to the default.
  let limitSeconds: number | null = LIMIT.default;
  if (raw['limitSeconds'] === null) limitSeconds = null;
  else if (typeof raw['limitSeconds'] === 'number' && Number.isFinite(raw['limitSeconds'])) {
    limitSeconds = clamp(raw['limitSeconds'], LIMIT.min, LIMIT.max);
  }

  return {
    enabled: raw['enabled'] !== false,
    volume: clamp(volume, VOLUME.min, VOLUME.max),
    limitSeconds,
    // Absent means no rules, not the defaults: these are new in 0.1.8, and a
    // file written before them is a file that has never been asked. Reading
    // them as "unset" is the only answer that cannot start ringing at somebody
    // who upgraded.
    byQuality: readRules(raw['byQuality'], QUALITIES),
    byLevel: readRules(raw['byLevel'], LEVELS),
    bindings,
  };
}

/**
 * A grade -> sound map, keeping only the grades that exist.
 *
 * Stricter than `bindings` on purpose. An item id the tables have never heard
 * of is still a statement about *an item*, and the tables can change under a
 * config file; a quality of 9 or a level of "soon" is a file edited into
 * nonsense, and keeping it would put a row in the settings grid with nothing to
 * draw it against.
 */
function readRules(raw: unknown, allowed: readonly number[]): Record<string, string> {
  const rules: Record<string, string> = {};
  if (!isRecord(raw)) return rules;
  for (const [grade, ref] of Object.entries(raw)) {
    if (typeof ref !== 'string' || ref === '') continue;
    const n = Number(grade);
    if (Number.isInteger(n) && allowed.includes(n)) rules[String(n)] = ref;
  }
  return rules;
}

/**
 * The sound one dropped item should ring with, or null for silence.
 *
 * Three ways to have an opinion, in the order of how specific they are: the
 * item itself, then its rarity, then its level. One sound comes out — a drop
 * that matches a Mythic rule and a level 9 rule is still one drop, and two
 * notifications about it would be two things happening when there was one.
 *
 * Rarity above level because rarity is what a player looks up for. The level
 * ladder is the floor under it: set it for the band you are farming and the
 * tiers you have said nothing about still ring.
 *
 * The only place this order exists, which is why it is here and not in the
 * hook — `node --test` can hold it to it.
 */
export function resolveSound(
  settings: SoundSettings,
  item: { id: string; quality: number; level: number },
): SoundRef | null {
  return (
    settings.bindings[item.id] ??
    settings.byQuality[String(item.quality)] ??
    settings.byLevel[String(item.level)] ??
    null
  );
}

/** True for a reference to a sound the app ships rather than one on disk. */
export const isBuiltin = (ref: string): boolean => ref.startsWith(BUILTIN_PREFIX);

/**
 * What to call a bound sound in the settings list.
 *
 * A path is shown by its file name: the rest of it is where the player keeps
 * their sounds, which they already know and which would push the controls off
 * the row.
 */
export function soundLabel(ref: string): string {
  if (isBuiltin(ref)) return ref.slice(BUILTIN_PREFIX.length);
  const parts = ref.split(/[\\/]/);
  return parts[parts.length - 1] || ref;
}
