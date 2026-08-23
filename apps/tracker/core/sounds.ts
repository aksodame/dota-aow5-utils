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

/** The only sound in the box. Bound to Crimson Heart out of the box; see `DEFAULT_SOUNDS`. */
export const BUILTIN_JACKPOT = `${BUILTIN_PREFIX}jackpot`;

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
   * Item id -> `builtin:name` or an absolute path to the player's own file.
   *
   * A binding is a deliberate statement, which is why the default one can be
   * removed and stays removed: it is seeded into a fresh config rather than
   * applied as a rule.
   */
  bindings: Record<string, string>;
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
  if (!isRecord(raw)) return { ...DEFAULT_SOUNDS, bindings: { ...DEFAULT_SOUNDS.bindings } };

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
    bindings,
  };
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
