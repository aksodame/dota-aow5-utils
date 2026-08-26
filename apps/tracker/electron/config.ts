import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CARDS, readCards } from '../core/cards.ts';
import { readLanguage } from '../core/locale.ts';
import { readPacks } from '../core/packs.ts';
import { DEFAULT_SOUNDS, readSoundSettings } from '../core/sounds.ts';
import { DEFAULT_STYLE, readStyle } from '../core/style.ts';
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
   * Whatever Windows is set to, resolved per window rather than written down.
   *
   * The addon is a Chinese map with a Russian following, and the tables carry
   * all three languages, so there is no reason a first launch should be in a
   * language the player does not read. See `core/locale.ts` for why the stored
   * value stays `auto` instead of being resolved once and frozen.
   */
  language: 'auto',
  style: DEFAULT_STYLE,
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
  // Copied a level down, all three maps: this constant is handed out to a first
  // launch, and a caller that edited one of its rules would be editing the
  // default every later read is built from.
  sounds: {
    ...DEFAULT_SOUNDS,
    byQuality: { ...DEFAULT_SOUNDS.byQuality },
    byLevel: { ...DEFAULT_SOUNDS.byLevel },
    bindings: { ...DEFAULT_SOUNDS.bindings },
  },
  // Nothing fetched out of the box. Every sound a fresh install can play ships
  // inside it, and the first thing a pack does is go to the network — which is
  // not something to do on somebody's behalf before they have asked for it.
  soundPacks: {},
  /*
   * Empty, which is off: the sound search does not exist until this names a
   * server.
   *
   * The whole feature hangs off this one string. Empty, the settings window
   * draws no search panel, no request is ever made, and the tracker is the
   * entirely local app it was before — which is the state it should ship in
   * until the server behind it has a catalogue key and somebody has decided
   * this is worth turning on.
   *
   * To turn it on: put the deployment's origin here — `https://<host>`, the
   * same one serving the guides. Nothing is sent to it but a search term, and
   * nothing comes back but a list of names; the audio is fetched straight from
   * the catalogue's own CDN and never touches that server. See
   * `apps/api/src/sounds/` for the half that holds the key.
   */
  soundSearchUrl: '',
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
  cards: [...DEFAULT_CARDS],
  // On: the failure it prevents — an evening measured as zero — costs more
  // than the one it can cause, which is a clock you have to stop again.
  autoResume: true,
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
  /*
   * Whether this profile has ever been written to, which only this function can
   * know.
   *
   * It exists for the grade rules and nothing else. `DEFAULT_SOUNDS` puts a
   * sound on Legendary and Mythic, and `readSoundSettings` deliberately refuses
   * to apply that when it meets a settings block it cannot read — because an
   * upgrade from a build that predates the rules is indistinguishable, from in
   * there, from a new install, and only one of the two should suddenly start
   * ringing at a whole tier. Up here the two are distinguishable: no file at
   * all is a first launch.
   *
   * An unreadable file is deliberately not counted. It is a profile that exists
   * and has settings in it, and the recovery for a broken one should not also
   * hand somebody rules they never asked for.
   */
  let firstLaunch = false;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (isRecord(parsed)) raw = parsed;
  } catch (cause) {
    firstLaunch = (cause as NodeJS.ErrnoException).code === 'ENOENT';
  }

  const overlays = isRecord(raw['overlays']) ? raw['overlays'] : {};
  return {
    ...DEFAULTS,
    ...raw,
    source: raw['source'] === 'console' ? 'console' : 'mock',
    // Both absent in a file written before 0.1.6, and absent is the default in
    // each case: follow Windows, and the skin the tracker started with.
    language: readLanguage(raw['language']),
    style: readStyle(raw['style']),
    logFile: typeof raw['logFile'] === 'string' ? raw['logFile'] : DEFAULTS.logFile,
    tracked: Array.isArray(raw['tracked']) ? raw['tracked'].filter((t): t is string => typeof t === 'string') : [],
    prices: readPrices(raw['prices']),
    // Absent means the default here, and the default is on.
    halvePrices: raw['halvePrices'] !== false,
    trimLog: raw['trimLog'] !== false,
    sounds: firstLaunch ? DEFAULTS.sounds : readSoundSettings(raw['sounds']),
    // The half of the sound settings that names URLs, so it is read by the
    // strictest reader in the app — see `core/packs.ts`. A pack that does not
    // survive it is dropped here, before anything can be fetched from it.
    soundPacks: readPacks(raw['soundPacks']),
    soundSearchUrl: typeof raw['soundSearchUrl'] === 'string' ? raw['soundSearchUrl'] : DEFAULTS.soundSearchUrl,
    opacity: clamp(number(raw['opacity'], DEFAULTS.opacity), OPACITY.min, OPACITY.max),
    // Absent in a pre-0.3 file, where opacity always meant the whole window —
    // and absent means the default, which is off.
    transparentBackground: raw['transparentBackground'] === true,
    uiScale: clamp(number(raw['uiScale'], DEFAULTS.uiScale), UI_SCALE.min, UI_SCALE.max),
    hotkey: typeof raw['hotkey'] === 'string' && raw['hotkey'] !== '' ? raw['hotkey'] : DEFAULTS.hotkey,
    recipe: readTargets(raw['recipe']),
    recipeDone: readIds(raw['recipeDone']),
    recipeExpand: readIds(raw['recipeExpand']),
    // Absent in a file written before the HUD's cards could be turned off,
    // which is the same thing as asking for the defaults.
    cards: readCards(raw['cards']),
    // Absent means the default here, and the default is on.
    autoResume: raw['autoResume'] !== false,
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
