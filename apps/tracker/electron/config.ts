import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SOUNDS, readSoundSettings } from '../core/sounds.ts';
import {
  OPACITY,
  OVERLAY_IDS,
  OVERLAY_LIMITS,
  UI_SCALE,
  type OverlayId,
  type OverlayView,
  type RecipeTarget,
  type TrackerConfig,
} from '../core/ipc.ts';

/**
 * The persisted settings, and the only place that knows where they live.
 *
 * Everything here has to survive three things a settings file always meets: an
 * older build's shape, a hand edit, and a value out of range. None of them may
 * stop the app from starting, so every read is clamped and defaulted rather
 * than validated-and-rejected.
 */

const defaultView = (id: OverlayId): OverlayView => ({
  // Nothing starts collapsed. The farm HUD used to, on the reasoning that its
  // one-line bar is the shape it lives in all evening — but that is the shape
  // you settle on, not the one to be handed on a first launch, where a bar
  // showing three numbers gives no sign of the panel behind it. The chevron is
  // right there, and a collapse the player chose is remembered.
  collapsed: false,
  size: { ...OVERLAY_LIMITS[id].default },
  position: null,
});

export const DEFAULTS: TrackerConfig = {
  source: 'mock',
  /*
   * The path the site tells people to create, so following it needs no fourth
   * step: the tracker is already looking where the log was told to appear.
   *
   * `Public` rather than a folder under the player's own name, and this is not
   * cosmetic. A Windows account named in Cyrillic gives a user folder named in
   * Cyrillic, and Dota handed such a path by `-con_logfile` writes nothing at
   * all — no error, no empty file, just a game that runs normally while the
   * overlay sits at zero. `C:\Users\Public` is spelled the same on every
   * Windows install, needs no permissions, and cannot inherit that problem.
   *
   * It was this file's author's own path before, which worked on exactly one
   * machine.
   */
  logFile: 'C:/Users/Public/aow5-console.log',
  // Nothing pinned and nothing repriced: a fresh profile has no opinions yet,
  // and both lists are the player telling the tracker one.
  tracked: [],
  prices: {},
  halvePrices: true,
  trimLog: true,
  sounds: { ...DEFAULT_SOUNDS, bindings: { ...DEFAULT_SOUNDS.bindings } },
  opacity: OPACITY.default,
  // Solid by default: a readout you can see is worth more than a game you can
  // see through it, and the slider is right there for anyone who disagrees.
  transparentBackground: false,
  uiScale: UI_SCALE.default,
  // Real time by default; `--speed=60` compresses a session for UI work.
  mockSpeed: 1,
  hotkey: 'Control+Alt+T',
  overlays: Object.fromEntries(OVERLAY_IDS.map((id) => [id, defaultView(id)])) as TrackerConfig['overlays'],
  recipe: [],
  recipeDone: [],
  recipeExpand: [],
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Clamps a size to what an overlay may be dragged to, rounding to whole pixels. */
export function clampSize(id: OverlayId, size: { width: number; height: number }): { width: number; height: number } {
  const { min, max } = OVERLAY_LIMITS[id];
  return {
    width: Math.round(clamp(size.width, min.width, max.width)),
    height: Math.round(clamp(size.height, min.height, max.height)),
  };
}

/**
 * `%APPDATA%\aow5-tracker\config.json`, and the reason that is worth writing down.
 *
 * The folder is named after `app.getName()`, which reads `productName` from
 * package.json if it is there and falls back to `name`. It is not there, on
 * purpose: `productName: AOW5 Tracker` lives in `electron-builder.yml`, where it
 * names the executable and the installer without touching this. Adding it to
 * package.json would move this path to `%APPDATA%\AOW5 Tracker` and silently
 * orphan every existing user's settings and run archive — a one-line change
 * that looks like tidying and reads, to a player, as the app having forgotten
 * everything.
 *
 * Nothing is stored next to the executable, which is what makes an update safe:
 * an installer replaces the program directory and never touches this one.
 */
const configPath = () => path.join(app.getPath('userData'), 'config.json');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const number = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Reads one overlay's geometry out of whatever the file happens to hold.
 *
 * Also accepts the pre-0.2 layout, which stored a single flat `bounds` for the
 * one window that existed then — an upgrade must not throw away where the user
 * had put their overlay.
 */
function readView(id: OverlayId, raw: unknown, legacyBounds: unknown): OverlayView {
  const view = defaultView(id);
  const source = isRecord(raw) ? raw : {};

  const size = isRecord(source['size']) ? source['size'] : isRecord(legacyBounds) ? legacyBounds : null;
  if (size) {
    view.size = clampSize(id, {
      width: number(size['width'], view.size.width),
      height: number(size['height'], view.size.height),
    });
  }

  const position = isRecord(source['position']) ? source['position'] : isRecord(legacyBounds) ? legacyBounds : null;
  if (position && typeof position['x'] === 'number' && typeof position['y'] === 'number') {
    view.position = { x: Math.round(position['x']), y: Math.round(position['y']) };
  }

  // Only an explicit value overrides the default — an older file that predates
  // this key means "never said", not "expanded".
  if (typeof source['collapsed'] === 'boolean') view.collapsed = source['collapsed'];
  return view;
}

/** A list of item ids, tolerating anything else the file happens to hold. */
const readIds = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];

/**
 * Item id -> the gold the player says it is worth.
 *
 * Anything that is not a finite number at or above zero is dropped rather than
 * clamped: a price is a deliberate statement, and a hand-edited `"lots"` or a
 * negative is not one this app should guess at. A dropped entry simply reverts
 * that item to the table price.
 */
function readPrices(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[id] = value;
  }
  return out;
}

/**
 * Reads the recipe panel's targets.
 *
 * A count of zero or less would render a row that is finished before it
 * starts, so those are dropped rather than clamped up — an entry that means
 * nothing is better removed than silently rewritten into something the user
 * did not ask for.
 */
function readTargets(raw: unknown): RecipeTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipeTarget[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry['id'] !== 'string') continue;
    const count = Math.round(number(entry['count'], 1));
    if (count > 0) out.push({ id: entry['id'], count });
  }
  return out;
}

/** A corrupt or hand-edited config must not stop the app from starting. */
export function loadConfig(): TrackerConfig {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (isRecord(parsed)) raw = parsed;
  } catch {
    // No file yet, or an unreadable one. Defaults it is.
  }

  const overlays = isRecord(raw['overlays']) ? raw['overlays'] : {};
  return {
    ...DEFAULTS,
    ...raw,
    source: raw['source'] === 'console' ? 'console' : 'mock',
    logFile: typeof raw['logFile'] === 'string' ? raw['logFile'] : DEFAULTS.logFile,
    tracked: Array.isArray(raw['tracked']) ? raw['tracked'].filter((t): t is string => typeof t === 'string') : [],
    prices: readPrices(raw['prices']),
    // Absent means the default here, and the default is on.
    halvePrices: raw['halvePrices'] !== false,
    trimLog: raw['trimLog'] !== false,
    sounds: readSoundSettings(raw['sounds']),
    opacity: clamp(number(raw['opacity'], DEFAULTS.opacity), OPACITY.min, OPACITY.max),
    // Absent in a pre-0.3 file, where opacity always meant the whole window —
    // and absent means the default, which is off.
    transparentBackground: raw['transparentBackground'] === true,
    uiScale: clamp(number(raw['uiScale'], DEFAULTS.uiScale), UI_SCALE.min, UI_SCALE.max),
    hotkey: typeof raw['hotkey'] === 'string' && raw['hotkey'] !== '' ? raw['hotkey'] : DEFAULTS.hotkey,
    recipe: readTargets(raw['recipe']),
    recipeDone: readIds(raw['recipeDone']),
    recipeExpand: readIds(raw['recipeExpand']),
    // Playback speed is a development knob owned by the default and `--speed`,
    // never by the saved file — a stale value there would silently undo it.
    mockSpeed: DEFAULTS.mockSpeed,
    overlays: Object.fromEntries(
      OVERLAY_IDS.map((id) => [id, readView(id, overlays[id], raw['bounds'])]),
    ) as TrackerConfig['overlays'],
  };
}

/**
 * Writes the settings, in a way that cannot leave half of them.
 *
 * Through a temporary file and a rename rather than straight over the top,
 * because of when this runs and how it can be interrupted. It runs on every
 * window drag, resize and collapse — hundreds of times an evening — and the
 * process can be killed under it: by the update button, which hands the process
 * to an installer, or by Task Manager, or by a machine going down. A
 * `writeFileSync` caught halfway leaves truncated JSON, `loadConfig` cannot
 * parse it, and its `catch` quietly hands back `DEFAULTS` — every custom price,
 * the tracked list, the recipe plan and all four windows' geometry gone, with
 * nothing said about it anywhere.
 *
 * A rename on the same volume is atomic, so an interruption at any instant
 * leaves either the previous file or the new one, and never something in
 * between. `renameSync` also replaces the destination on Windows, so there is
 * no unlink-then-rename gap to be killed inside either.
 */
export function saveConfig(config: TrackerConfig): void {
  const file = configPath();
  const staging = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(staging, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    fs.renameSync(staging, file);
  } catch {
    // Read-only profile or a locked file; the session still works, it just
    // will not be remembered. Clear the staging file if it got as far as
    // existing, so a failure does not leave litter beside the real one.
    try {
      fs.rmSync(staging, { force: true });
    } catch {
      // Nothing further to try, and the settings are the thing that matters.
    }
  }
}

export interface CliOptions {
  /** Render for a few seconds, write a PNG, quit. */
  screenshot: string | null;
  /**
   * Which window the shot is of.
   *
   * Two of the four are opened on demand, and a window nobody asked for cannot
   * be photographed — so naming one here also opens it.
   */
  screenshotOverlay: OverlayId;
  /**
   * Start with click-through already off.
   *
   * A development aid, and the companion to `--screenshot`: the chrome that
   * only appears while interactive — the drag handle, the resize grip, the
   * focus ring — is otherwise impossible to capture, since pressing the hotkey
   * requires the app to still be running when the shot is taken.
   */
  interactive: boolean;
}

/** CLI beats the stored config: `--source=console --speed=1`. */
export function applyArgs(config: TrackerConfig, argv: readonly string[]): CliOptions {
  const options: CliOptions = { screenshot: null, screenshotOverlay: 'farm', interactive: false };
  for (const arg of argv) {
    if (arg === '--interactive') options.interactive = true;
    const shot = /^--screenshot=(.+)$/.exec(arg);
    if (shot) options.screenshot = shot[1]!;
    const shotOf = /^--screenshot-overlay=(farm|recipe|history|settings)$/.exec(arg);
    if (shotOf) options.screenshotOverlay = shotOf[1] as OverlayId;
    const source = /^--source=(mock|console)$/.exec(arg);
    if (source) config.source = source[1] as TrackerConfig['source'];
    const speed = /^--speed=(\d+(?:\.\d+)?)$/.exec(arg);
    if (speed) config.mockSpeed = Number(speed[1]);
    const log = /^--log=(.+)$/.exec(arg);
    if (log) config.logFile = log[1]!;
  }
  return options;
}
