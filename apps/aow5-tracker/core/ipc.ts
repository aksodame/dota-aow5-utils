import type { TrackerEvent } from './events.ts';
import type { SessionHistory } from './history.ts';
import type { SoundSettings } from './sounds.ts';

/**
 * The contract across the preload bridge.
 *
 * Lives in `core/` rather than in `electron/preload.ts` because both sides need
 * it: the preload implements it, the renderer consumes it, and they compile
 * under different tsconfigs. Deriving it from the preload's object with
 * `typeof` would drag a Node-side module into the browser project.
 */

export interface TrackerStatus {
  source: SourceKind;
  detail: string;
  error?: boolean;
}

export type SourceKind = 'mock' | 'console';

/**
 * Which window a message is about.
 *
 * Four of them, and they are not the same kind of thing — see `OVERLAY_SPEC`,
 * which is where the differences live. Every channel below already carries the
 * id, so a fifth would change no signature.
 */
export type OverlayId = 'farm' | 'recipe' | 'history' | 'settings';

export const OVERLAY_IDS: OverlayId[] = ['farm', 'recipe', 'history', 'settings'];

/** Per-overlay window state. Collapsed height is measured by the renderer, not stored. */
export interface OverlayView {
  /** Shrunk to the one-line summary bar. */
  collapsed: boolean;
  /**
   * Size while expanded.
   *
   * Kept separately from the live window size so collapsing — which drives the
   * window down to the height of a single bar — does not overwrite the size to
   * restore on expand.
   */
  size: { width: number; height: number };
  /** Last position on screen, or null to place it by the default rule. */
  position: { x: number; y: number } | null;
}

/**
 * What a user may resize an overlay to.
 *
 * A floor matters more than a ceiling: an overlay dragged to 40px tall is
 * unreadable and, being frameless and transparent, effectively unrecoverable.
 */
export interface OverlayLimits {
  min: { width: number; height: number };
  max: { width: number; height: number };
  default: { width: number; height: number };
}

/**
 * What a window is, beyond how big it may be.
 *
 * The three differ in ways that are properties of the window rather than of
 * the React tree inside it, so they are declared here where main can read them
 * without importing a component.
 */
export interface OverlaySpec {
  limits: OverlayLimits;
  /**
   * Opened at launch.
   *
   * The two panels that sit over the game are; history is a thing you go and
   * look at, and a window nobody asked for should not exist.
   */
  auto: boolean;
  /**
   * Follows the click-through hotkey.
   *
   * True for anything drawn over a live game, which must not eat a click
   * mid-fight. False for a window you read rather than play behind: history is
   * always interactive, because a window you cannot click is not a window.
   */
  hotkeyed: boolean;
}

export const OVERLAY_SPEC: Record<OverlayId, OverlaySpec> = {
  farm: {
    limits: {
      min: { width: 320, height: 200 },
      max: { width: 1200, height: 1600 },
      default: { width: 600, height: 690 },
    },
    auto: true,
    hotkeyed: true,
  },
  /*
   * A line of icons with no panel behind it: wide rather than tall, and its
   * height is whatever the ingredients wrap to. The default fits a handful of
   * tiles before wrapping, which is most recipes.
   */
  recipe: {
    limits: {
      min: { width: 150, height: 40 },
      // Wide, because the ceiling is what a one-line recipe is allowed to grow
      // to: the deepest recipes in the game flatten to thirty-odd ingredients,
      // which is about 1500px of tiles.
      max: { width: 2400, height: 1600 },
      default: { width: 460, height: 120 },
    },
    auto: true,
    hotkeyed: true,
  },
  /*
   * The two reading windows: bigger than the overlays, and neither
   * click-through nor opened for you.
   *
   * Settings used to be a view inside the farm HUD, which meant configuring the
   * overlay resized the thing you were configuring — and the item-price list
   * below wants more height than a panel that sits over a game should ever
   * take. It is narrower than history because it is a column of controls
   * rather than a table, and it has a floor low enough to tuck beside the game.
   */
  history: {
    limits: {
      min: { width: 380, height: 240 },
      max: { width: 1400, height: 1600 },
      default: { width: 620, height: 760 },
    },
    auto: false,
    hotkeyed: false,
  },
  settings: {
    limits: {
      min: { width: 340, height: 260 },
      max: { width: 900, height: 1600 },
      default: { width: 460, height: 720 },
    },
    auto: false,
    hotkeyed: false,
  },
};

/** Sizes a window may take. Shorthand for the half of the spec everyone reads. */
export const OVERLAY_LIMITS: Record<OverlayId, OverlayLimits> = {
  farm: OVERLAY_SPEC.farm.limits,
  recipe: OVERLAY_SPEC.recipe.limits,
  history: OVERLAY_SPEC.history.limits,
  settings: OVERLAY_SPEC.settings.limits,
};

/**
 * UI scale bounds. Below 0.6 the icons stop being recognisable; above 1.6 the
 * panel stops fitting a screen.
 *
 * 100% is the default and what Ctrl+Alt+0 returns to — the size the panel was
 * designed at, so a scale is something the player chose rather than something
 * they have to undo.
 */
export const UI_SCALE = { min: 0.6, max: 1.6, step: 0.05, default: 1 } as const;

/**
 * Bounds for the panel background.
 *
 * The floor is 0 — fully clear — which used to be unthinkable when this number
 * was the whole window's opacity and zero meant a window nobody could find.
 * It only tints the slab behind the readout now, so the text, the border and
 * the numbers survive the bottom of the range.
 */
export const OPACITY = { min: 0, max: 1, step: 0.02, default: 0.92 } as const;

export interface TrackerConfig {
  source: SourceKind;
  logFile: string;
  /** Item ids pinned to the tracked list. Empty means "show everything". */
  tracked: string[];
  /**
   * Gold each item is worth to *you*, by id, overriding the extracted cost.
   *
   * The tables carry the game's sell price, which is not always the number a
   * player is farming against: an ingredient two crafts below something
   * valuable is worth more than it sells for, and an item you would never sell
   * is worth nothing however it is priced. Every gold figure in the app reads
   * through this, so a preset here changes g/hr, the session total and the
   * archive's value column together — they would be worth less than nothing if
   * they disagreed.
   *
   * An id absent here is priced from the tables, which is the case for almost
   * every item almost always.
   */
  prices: Record<string, number>;
  /**
   * Value drops at what the trader actually pays: half the table price.
   *
   * On by default, because it is what farming a room is worth: the tables
   * carry the shop's number and the shop is not who a farmer sells to. A
   * tracker whose first run overstates the evening by a factor of two is worse
   * than one that needs turning up.
   *
   * A price in `prices` is never halved. Naming a number is saying what the
   * item is worth to you, and quietly taking half of it would report something
   * you did not say.
   */
  halvePrices: boolean;
  /** What to play when something drops, and how loudly. See `core/sounds.ts`. */
  sounds: SoundSettings;
  /**
   * Keep Dota's console log down to the lines this tracker reads.
   *
   * `-con_logfile` writes the whole console and cannot be told not to: a
   * measured session came to 12 MB, of which 0.08 MB was `[AOW5TRK]` and 10.5
   * MB was one engine warning repeating five times a second. With this on, the
   * tracker rewrites the log with only its own lines whenever the game is not
   * holding it — never while you are playing. See `core/sources/logfile.ts`.
   */
  trimLog: boolean;
  /**
   * How much of the panel's background is painted, `OPACITY.min`–`OPACITY.max`.
   *
   * The panel only — never the window. Electron's window opacity fades the
   * whole surface, text and icons with it, which is exactly wrong for a HUD
   * read at a glance over a bright game, so it is left at 1 and this number is
   * applied in CSS instead. Ignored while `transparentBackground` is off.
   */
  opacity: number;
  /**
   * Let the game show through the panel at all.
   *
   * Off, the panel is solid and `opacity` does not apply — the two settings
   * together are "see-through by this much" or "not see-through". Either way
   * the numbers on top stay at full contrast.
   */
  transparentBackground: boolean;
  /**
   * Multiplier on the root font size, `UI_SCALE.min`–`UI_SCALE.max`.
   *
   * Everything in the overlay is sized in rem, so this one number resizes the
   * whole UI without touching the window — which is the point: on a 1440p
   * screen the default is small, on a laptop it is large.
   */
  uiScale: number;
  mockSpeed: number;
  hotkey: string;
  overlays: Record<OverlayId, OverlayView>;
  /**
   * What the recipe panel is counting toward.
   *
   * Kept in the config rather than in the panel because a grind outlasts a
   * session: closing the overlay in the middle of collecting thirty ore and
   * finding the count reset would make the panel worse than a note on paper.
   */
  recipe: RecipeTarget[];
  /**
   * Ingredient ids the player has ticked off by hand.
   *
   * The counter only knows what dropped while the tracker was watching, which
   * is never the whole story — a stash from last night, a purchase, a session
   * before the overlay was open. Ticking a row says "I have this, stop asking",
   * and it outranks the count.
   */
  recipeDone: string[];
  /**
   * Crafted ingredients the player has opened up into steps of their own.
   *
   * A plan is one level deep by default: the thing you asked for, and the
   * materials it takes, crafted or not. Naming an ingredient here says "I am
   * making that one too", and it gets a line with its own materials under it.
   */
  recipeExpand: string[];
}

/**
 * One thing the player is collecting toward.
 *
 * A craftable id expands into its ingredients; anything else is simply a row
 * of its own. Both are the same shape because both answer the same question —
 * how many do I still need — and keeping them apart would mean two lists, two
 * pieces of UI and one arbitrary rule about which a given id belongs to.
 */
export interface RecipeTarget {
  id: string;
  /** How many to craft, or for a plain item, how many to gather. */
  count: number;
}

export interface SkippedLine {
  line: string;
  reason: string;
}

/** What a trim did, for the button that asked for it. */
export interface LogTrim {
  /** Why nothing happened, or null when the log was rewritten. */
  skipped: 'missing' | 'small' | 'in-use' | null;
  before: number;
  after: number;
  kept: number;
  /** The OS error code behind an `in-use`, when there was one. */
  error?: string;
}

/**
 * Where the app is in the business of updating itself.
 *
 * A union rather than a bag of booleans because the states are genuinely
 * exclusive — there is no such thing as checking *and* downloading — and
 * because the settings window renders one sentence and at most one button from
 * it, which a union makes exhaustive rather than a matter of remembering which
 * flags go together.
 *
 * `current` rides along in every variant. It is the running version, and the
 * About section needs it whatever else is true; nothing else in the bridge
 * exposes `app.getVersion()`, and a second channel to carry one string would be
 * a channel to keep in sync for no reason.
 */
export type UpdateState =
  /** A development build, or a portable copy with no `app-update.yml`. */
  | { status: 'unsupported'; current: string }
  /** Nothing asked yet. */
  | { status: 'idle'; current: string }
  | { status: 'checking'; current: string }
  /** Asked, and this is the newest there is. */
  | { status: 'current'; current: string }
  | { status: 'available'; current: string; version: string; notes: string | null }
  | { status: 'downloading'; current: string; version: string; percent: number }
  /** Downloaded and staged. Applies on the next quit, or on `installUpdate`. */
  | { status: 'ready'; current: string; version: string }
  | { status: 'error'; current: string; message: string };

/** One room's session record, as the settings window tabulates it. */
export interface RoomSummary {
  room: string;
  runs: number;
  /** Mean duration of finished runs, seconds. */
  averageClear: number;
  totalItems: number;
}

/**
 * What the session looks like from main, for a window that was not there for it.
 *
 * Every renderer folds the event stream itself, which is exactly right for a
 * window open all evening and useless for one opened at nine o'clock: it would
 * show the runs since it opened and call that the session. Main has watched the
 * whole thing, so a late window asks rather than guesses.
 *
 * Gold is deliberately absent. Prices are a renderer-side bundle and the reader
 * of this is a table of times and counts.
 */
export interface SessionSnapshot {
  rooms: RoomSummary[];
  /** The most recent unreadable lines, oldest first. */
  skipped: SkippedLine[];
}

/** Subscriptions return their own unsubscribe, so React effects clean up. */
export type Unsubscribe = () => void;

export interface TrackerApi {
  /** Which overlay this renderer is. Set by the preload from the window's query string. */
  readonly overlay: OverlayId;

  onEvent: (handler: (event: TrackerEvent) => void) => Unsubscribe;
  onStatus: (handler: (status: TrackerStatus) => void) => Unsubscribe;
  onConfig: (handler: (config: TrackerConfig) => void) => Unsubscribe;
  onInteractive: (handler: (interactive: boolean) => void) => Unsubscribe;
  onSkipped: (handler: (skipped: SkippedLine[]) => void) => Unsubscribe;

  getConfig: () => Promise<TrackerConfig>;
  setConfig: (patch: Partial<TrackerConfig>) => Promise<TrackerConfig>;
  setInteractive: (next: boolean) => Promise<boolean>;

  /** Collapse or expand this overlay. Main resizes the window to match. */
  setCollapsed: (next: boolean) => Promise<boolean>;
  /**
   * Resize this overlay. Main clamps to `OVERLAY_LIMITS`, so the renderer may
   * send whatever a drag produced without bounds-checking it first.
   *
   * While the window is sizing itself to its contents only the width is taken:
   * see `setContentHeight`.
   */
  setSize: (size: { width: number; height: number }) => Promise<{ width: number; height: number }>;
  /**
   * Hand the window's size over to what is inside it, or take it back.
   *
   * A height means "this is exactly how tall my content is" and the window
   * follows it — a readout of a fixed few rows would otherwise sit in an empty
   * pane of glass over the game. A width says the same about a panel that is a
   * line of things rather than a page of them: the recipe strip keeps its
   * ingredients on one line, so the line is what decides how wide the window
   * is. Omit the width to keep the one the user dragged; pass null for both to
   * hand the whole size back.
   *
   * Measured rather than computed, because every row of it is sized in rem and
   * any constant in main would drift the moment `uiScale` moved.
   */
  setContentSize: (size: { width?: number; height: number } | null) => void;

  /**
   * Open a window, or focus the one already open.
   *
   * Singleton per id: a second history window would be a second copy of the
   * same archive, and closing the wrong one is the kind of thing that makes a
   * tool feel broken.
   */
  open: (id: OverlayId) => Promise<void>;
  /** Close this window. The app keeps running — that is what `quit` is for. */
  close: () => Promise<void>;

  /** Everything the archive holds, newest session first. */
  getHistory: () => Promise<SessionHistory[]>;
  /** The session so far as main saw it — see `SessionSnapshot`. */
  getSession: () => Promise<SessionSnapshot>;
  /**
   * Delete every archived session.
   *
   * The live overlay is untouched: what it is counting happened, whatever the
   * file says. Resolves once the file is gone, so the caller can re-read and
   * show an empty archive rather than guessing when to.
   */
  clearHistory: () => Promise<void>;
  /**
   * Ask for a sound file with the system's own dialog.
   *
   * Resolves to the chosen path, or null if dismissed. Choosing binds nothing
   * on its own — the caller decides which item it belongs to.
   */
  pickSound: () => Promise<string | null>;
  /**
   * The bytes of a sound the player chose.
   *
   * The renderer cannot open a file itself, and a `file://` source would be
   * refused by the page's own CSP — so the bytes come across and are decoded
   * in memory. Null when the file is gone, unreadable, or larger than a
   * notification has any business being.
   */
  readSound: (ref: string) => Promise<Uint8Array | null>;

  /**
   * Delete these sessions and the runs recorded under them.
   *
   * Ids are the session ids the archive hands out — `SessionHistory.id`, the
   * epoch millisecond the session opened. Unknown ids are ignored rather than
   * refused: the window may be a refresh behind the file.
   */
  deleteSessions: (ids: number[]) => Promise<void>;
  /**
   * Ask for the console log with the system's own file dialog.
   *
   * Resolves to the chosen path, or null if the dialog was dismissed. Choosing
   * one also points the tracker at it: a player picking a log file is saying
   * "read this", and leaving the feed on whatever it was reading would be an
   * answer to a question nobody asked. In a packaged build the feed is the
   * console regardless — the mock does not ship.
   */
  pickLogFile: () => Promise<string | null>;
  /**
   * Trim the log now, whatever its size.
   *
   * The size floor the automatic pass keeps is a rule about *when to bother*,
   * so pressing the button waives it. The rule about the game holding the file
   * is a rule about safety, and that one holds: the result says `in-use` and
   * nothing happens.
   */
  compactLog: () => Promise<LogTrim>;
  /**
   * Start a new session, in the archive as well as on screen.
   *
   * Runs before and after a restart are not comparable, which is the whole
   * point of pressing it, so the archive has to agree with the overlay about
   * where the line falls.
   */
  newSession: () => Promise<void>;

  /**
   * Where the updater is now, for a window that opened after it got there.
   *
   * Every window is also sent `tracker:update` as it loads, so this is only
   * needed by a renderer that reloads mid-check — but so is `getConfig`, for
   * the same reason, and the two are the same kind of thing.
   */
  getUpdate: () => Promise<UpdateState>;
  onUpdate: (handler: (state: UpdateState) => void) => Unsubscribe;
  /**
   * Ask GitHub whether there is a newer release.
   *
   * Returns nothing: the answer arrives on `onUpdate` like every other step,
   * so the button has one thing to watch rather than two. Nothing is downloaded
   * — that is the next press.
   */
  checkUpdate: () => Promise<void>;
  /** Fetch the update found by `checkUpdate`. Progress arrives on `onUpdate`. */
  downloadUpdate: () => Promise<void>;
  /**
   * Restart onto a downloaded update, after asking.
   *
   * Asks with a real dialog rather than doing it, because this closes an
   * overlay someone may be playing behind: the run they are standing in is not
   * in the archive yet and the session totals start over. A downloaded update
   * also applies on the next ordinary quit, so declining costs nothing.
   */
  installUpdate: () => Promise<void>;

  quit: () => Promise<void>;
}

declare global {
  interface Window {
    tracker: TrackerApi;
  }
}
