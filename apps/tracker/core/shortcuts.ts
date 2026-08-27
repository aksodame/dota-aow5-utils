/**
 * The keys that drive the tracker without touching it.
 *
 * The overlay is click-through over a running game, so for most of an evening
 * the only way to tell it anything is a global accelerator. There were three,
 * hard-coded, and one of them — the focus toggle — was configurable by hand
 * editing `hotkey` in the config file. That is the wrong shape for a setting
 * somebody actually needs to change: `Control+Alt+T` is already taken by
 * something on a lot of machines, and the app's answer was a status line saying
 * so and no way to fix it without a text editor.
 *
 * Two ideas here, and the split is the whole design:
 *
 *   1. An **action key** — one modifier, shared by every binding. It is what
 *      keeps the set out of the game's way as a set: Dota binds bare letters,
 *      so a shortcut has to be a chord, and the player picks the chord once
 *      rather than seven times.
 *   2. A **binding** per action, spliced onto the end of it. Short, because the
 *      action key is already carrying the work of not colliding.
 *
 * So `die` is `E`, and what is registered is `Control+E`. Change the action key
 * to `Alt` and every shortcut moves with it, which is the point — a player
 * whose Ctrl chords are spoken for changes one setting, not seven.
 *
 * Browser-safe and free of imports: the settings window renders these, main
 * registers them, and `node --test` checks the reader. Nothing here calls
 * Electron — `accelerator` produces the string `globalShortcut` wants, and that
 * is the only thing the two ends have to agree on.
 */

/**
 * The actions a key can be bound to.
 *
 * Ids are persisted, so they name what the shortcut *does* rather than what it
 * is currently bound to. The three scale shortcuts are deliberately not here:
 * they are `=`, `-` and `0` under the action key, they are the same three keys
 * every application on the machine uses for zoom, and a rebinding UI for them
 * would be three more rows nobody opens the window for.
 */
export const SHORTCUT_IDS = ['focus', 'die'] as const;

export type ShortcutId = (typeof SHORTCUT_IDS)[number];

export interface Shortcuts {
  /**
   * The modifier every binding hangs off, without a trailing `+`.
   *
   * One rather than a free-form prefix: this is the part that has to be a
   * modifier, and letting it be `Control+Shift+Alt` would let a player build a
   * chord they cannot press while holding a mouse button — which is when the
   * skull is actually needed.
   */
  actionKey: ActionKey;
  /** Action -> the rest of the chord, e.g. `E` or `Alt+T`. */
  keys: Record<ShortcutId, string>;
}

/**
 * What an action key may be.
 *
 * `Control` by default. `CommandOrControl` is not offered: this app ships on
 * Windows only, and an option that is a synonym for the default on every
 * machine that can run it is a choice with no second answer.
 */
export const ACTION_KEYS = ['Control', 'Alt', 'Shift'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/**
 * The keys a binding may end in.
 *
 * A list rather than a regex, because this string is spliced into an Electron
 * accelerator and handed to `globalShortcut.register`, which throws on a
 * malformed one — and it is reachable from a config file that has been through
 * a text editor. Letters, digits, and the function keys: everything a person
 * would reach for, and nothing that needs escaping.
 */
const KEY = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/;

/** The modifiers a binding may add on top of the action key. */
const MODIFIERS = ['Alt', 'Control', 'Shift', 'Super'] as const;

export const DEFAULT_SHORTCUTS: Shortcuts = {
  actionKey: 'Control',
  keys: {
    /*
     * `Alt+T` under `Control` — the `Control+Alt+T` this app has always used.
     *
     * Kept exactly, because it is in the pin hint at the bottom of every
     * overlay and in whatever the player has already learned. The two extra
     * keys are the price of the one shortcut that has to be reachable when the
     * overlay is click-through and therefore invisible to the mouse.
     */
    focus: 'Alt+T',
    /*
     * The skull, which had no key at all.
     *
     * It is the one control with a deadline: a room you died in reports the
     * same loot lines as one you cleared, and the correction has to happen
     * before the next room starts or the session has already counted the wipe
     * as a good run. Reaching it meant pressing the focus chord, finding a
     * small button in the title bar, and pressing the focus chord again — three
     * actions inside the few seconds after dying, which is why it did not
     * happen.
     *
     * `E` for the same reason it is `E` everywhere: it is under the hand that
     * is already on the keyboard.
     */
    die: 'E',
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A binding into the form everything else here expects, or null.
 *
 * Case is normalised rather than rejected — `ctrl+e` out of a hand-edited file
 * is unambiguous, and refusing it would cost somebody their shortcut over a
 * capital letter. Order is normalised too, so `T+Alt` and `Alt+T` are the same
 * binding and the settings window cannot show two rows that mean one thing.
 */
export function readBinding(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return null;

  const mods = new Set<string>();
  let key: string | null = null;
  for (const part of parts) {
    const mod = MODIFIERS.find((m) => m.toLowerCase() === part.toLowerCase());
    // `Ctrl` and `Cmd` are what a person writes and what Electron accepts;
    // spelled out here so the stored form has one spelling.
    const alias = part.toLowerCase() === 'ctrl' ? 'Control' : part.toLowerCase() === 'cmd' ? 'Super' : null;
    if (mod ?? alias) {
      mods.add((mod ?? alias)!);
      continue;
    }
    // Two keys is not a chord, it is a typo — and `A+B` would register as
    // whichever one Electron read last.
    if (key !== null) return null;
    const upper = part.toUpperCase();
    if (!KEY.test(upper)) return null;
    key = upper;
  }
  if (key === null) return null;
  // Modifiers in `MODIFIERS` order, so the same chord always writes the same
  // string — which is what lets `conflicts` below compare them.
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join('+');
}

/** The action key, or null for anything that is not one of the three. */
export function readActionKey(raw: unknown): ActionKey | null {
  if (typeof raw !== 'string') return null;
  return ACTION_KEYS.find((k) => k.toLowerCase() === raw.toLowerCase()) ?? null;
}

/**
 * The shortcuts out of whatever the config file holds.
 *
 * Field by field, like every other reader here: one binding somebody typed by
 * hand should not cost the other. A shortcut that does not survive falls back
 * to its default rather than to nothing — an unbound action is a control the
 * player cannot reach at all, and there is no UI on screen to tell them why.
 *
 * @param legacy the pre-0.1.9 `hotkey` accelerator, which was one whole string.
 * It is used only when there is no `shortcuts` block at all, so a profile that
 * had `Control+Alt+G` in it keeps pressing `Control+Alt+G` after the upgrade.
 */
export function readShortcuts(raw: unknown, legacy?: unknown): Shortcuts {
  const keys = { ...DEFAULT_SHORTCUTS.keys };

  if (!isRecord(raw)) {
    const migrated = splitAccelerator(legacy);
    if (migrated) return { actionKey: migrated.actionKey, keys: { ...keys, focus: migrated.binding } };
    return { ...DEFAULT_SHORTCUTS, keys };
  }

  const rawKeys = isRecord(raw['keys']) ? raw['keys'] : {};
  for (const id of SHORTCUT_IDS) keys[id] = readBinding(rawKeys[id]) ?? DEFAULT_SHORTCUTS.keys[id];

  return { actionKey: readActionKey(raw['actionKey']) ?? DEFAULT_SHORTCUTS.actionKey, keys };
}

/**
 * An old one-string accelerator into an action key and a binding.
 *
 * The leading modifier becomes the action key and the rest becomes the
 * binding, which is the reading that keeps the key combination the player
 * actually presses identical across the upgrade. `Control+Alt+T` comes back out
 * as `Control` + `Alt+T`, which is exactly the new default.
 */
export function splitAccelerator(raw: unknown): { actionKey: ActionKey; binding: string } | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('+').map((p) => p.trim());
  const first = readActionKey(parts[0] === 'Ctrl' ? 'Control' : parts[0]);
  if (first === null || parts.length < 2) return null;
  const binding = readBinding(parts.slice(1).join('+'));
  return binding === null ? null : { actionKey: first, binding };
}

/**
 * The accelerator to hand `globalShortcut.register`.
 *
 * The one place the two halves are joined, which is why main and the settings
 * window both call it rather than each building the string: a label that said
 * `Ctrl+E` while `Control+E` was registered would be a shortcut that looks
 * broken and is not.
 *
 * The action key is dropped from the binding when it is already in it. The
 * default focus binding is `Alt+T` — it has to be, because `Control+Alt+T` is
 * what this app has always used — so switching the action key to `Alt` would
 * otherwise produce `Alt+Alt+T`. That is not an accelerator, and the failure it
 * causes is the quiet kind: the focus key stops working, and the focus key is
 * the one you would use to get back into the settings window and undo it.
 */
export function accelerator(shortcuts: Shortcuts, id: ShortcutId): string {
  const binding = shortcuts.keys[id];
  const parts = binding.split('+').filter((part) => part !== shortcuts.actionKey);
  return [shortcuts.actionKey, ...parts].join('+');
}

/**
 * What to show the player, which is not what Electron is given.
 *
 * `Control` is spelled `Ctrl` on every Windows keyboard and in every other
 * application's menus; writing it out in full in a settings row would be the
 * one place in the machine that does.
 */
export function shortcutLabel(value: string): string {
  return value
    .split('+')
    .map((part) => (part === 'Control' ? 'Ctrl' : part === 'Super' ? 'Win' : part))
    .join('+');
}

/**
 * Actions bound to the same chord.
 *
 * Two shortcuts on one key is not an error Electron reports — the second
 * `register` simply returns false, and the action silently does nothing
 * forever. Cheaper to say so in the settings row, beside the field that caused
 * it, than to leave somebody pressing a key that used to work.
 *
 * Returns the ids involved, so the UI can mark every row in the clash rather
 * than only the one that was typed last.
 */
export function conflicts(shortcuts: Shortcuts): Set<ShortcutId> {
  const seen = new Map<string, ShortcutId>();
  const clashing = new Set<ShortcutId>();
  for (const id of SHORTCUT_IDS) {
    const chord = accelerator(shortcuts, id);
    const first = seen.get(chord);
    if (first === undefined) seen.set(chord, id);
    else {
      clashing.add(first);
      clashing.add(id);
    }
  }
  return clashing;
}
