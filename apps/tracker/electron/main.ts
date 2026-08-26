import { app, BrowserWindow, dialog, globalShortcut, ipcMain, net, type Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { TrackerEvent } from '../core/events.ts';
import {
  OPACITY,
  OVERLAY_IDS,
  OVERLAY_SPEC,
  UI_SCALE,
  type OverlayId,
  type PackInstall,
  type SearchFail,
  type SessionSnapshot,
  type SkippedLine,
  type TrackerConfig,
  type UpdateState,
} from '../core/ipc.ts';
import type { SoundHit, SoundSearchResponse } from 'aow5-api-contract';
import { importedSoundId, IMPORTED_PACK, packedSound, packRef, type PackFail } from '../core/packs.ts';
import { MAX_SOUND_BYTES } from '../core/sounds.ts';
import { compactLog, type CompactResult } from '../core/sources/logfile.ts';
import { byRoom } from '../core/stats.ts';
import { applyArgs, clamp, loadConfig, saveConfig } from './config.ts';
import { History } from './history.ts';
import { Overlay } from './overlay.ts';
import { SoundStore } from './packs.ts';
import { SourceFeed } from './sources.ts';
import { createTray } from './tray.ts';
import { Updater } from './update.ts';

/**
 * Wiring, and nothing else.
 *
 * The pieces assembled here each own one thing — `config.ts` the settings file,
 * `overlay.ts` a window, `sources.ts` the feed, `tray.ts` the tray — so what is
 * left is the lifecycle and the IPC surface. Each overlay after the first cost
 * an id in `OVERLAY_IDS` and a spec in `OVERLAY_SPEC`, not a rewrite of this
 * file — there are four.
 *
 * The renderer never reads a file. Main tails and parses; the renderer receives
 * already-validated events and cannot tell mock from live — which is the whole
 * reason the UI could be built before the game emits anything.
 */

let config: TrackerConfig = null as unknown as TrackerConfig;
let tray: Tray | null = null;
let interactive = false;
let feedStarted = false;

const overlays = new Map<OverlayId, Overlay>();
const each = (fn: (overlay: Overlay) => void) => overlays.forEach(fn);

/** Broadcasts to every overlay: they all watch the same session. */
const broadcast = (channel: string, payload: unknown) => each((overlay) => overlay.send(channel, payload));

let history: History = null as unknown as History;

/**
 * The fetched sounds, kept by content under `userData/sounds`.
 *
 * Built in `whenReady` rather than here, because `app.getPath('userData')` is
 * not answerable until then.
 */
let store: SoundStore = null as unknown as SoundStore;

/**
 * How many unreadable lines are kept for a window that asks later.
 *
 * The settings window shows the last handful as a diagnostic, not a log: if
 * the game has emitted hundreds, the newest five say the same thing as all of
 * them, and the file itself is where an actual investigation goes.
 */
const SKIPPED_LIMIT = 20;

const skippedLines: SkippedLine[] = [];

/** A search nobody is still waiting for. Shorter than a download's: this is a keystroke's answer. */
const SEARCH_TIMEOUT_MS = 12_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A search hit, out of whatever the renderer sent back.
 *
 * Checked even though this process is what handed the renderer the hit in the
 * first place. It is the argument to a call that fetches a URL and writes a
 * file, and a channel that takes one of those on trust is a channel where trust
 * is the only thing between a compromised renderer and an arbitrary download.
 * https is required here for the same reason `core/packs.ts` requires it of a
 * manifest.
 */
function readHit(raw: unknown): SoundHit | null {
  if (!isRecord(raw)) return null;
  const { id, name, username, license, duration, preview, page } = raw;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
  if (typeof preview !== 'string' || !preview.startsWith('https://')) return null;
  return {
    id,
    name: typeof name === 'string' && name !== '' ? name.slice(0, 120) : `#${id}`,
    username: typeof username === 'string' ? username.slice(0, 80) : 'unknown',
    license: typeof license === 'string' ? license.slice(0, 200) : 'unknown',
    duration: typeof duration === 'number' && Number.isFinite(duration) ? duration : 0,
    preview,
    page: typeof page === 'string' && page.startsWith('https://') ? page : `https://freesound.org/s/${id}/`,
  };
}

/** And the server's answer, held to the same standard for the same reason. */
function readSearch(raw: unknown): SoundSearchResponse | { error: SearchFail } {
  if (!isRecord(raw) || !Array.isArray(raw['hits'])) return { error: 'failed' };
  const hits = raw['hits'].map(readHit).filter((hit): hit is SoundHit => hit !== null);
  return {
    hits,
    total: typeof raw['total'] === 'number' ? raw['total'] : hits.length,
    page: typeof raw['page'] === 'number' ? raw['page'] : 1,
    nextPage: typeof raw['nextPage'] === 'number' ? raw['nextPage'] : null,
  };
}

/**
 * A page of search hits, or a code the picker turns into a sentence.
 *
 * In main rather than the renderer, and not only because of the page's CSP.
 * This is the one request the tracker makes on a player's behalf, so it is
 * worth being somewhere the whole of it can be read at once: a GET to the
 * configured server, a query string, no cookies, no identity, and a body thrown
 * away unless it parses into the shape above.
 *
 * A function rather than an inline handler because it is worth being callable
 * without an IPC message behind it — the two things this feature can get wrong
 * are both here, and neither is reachable through a unit test of `core/`.
 */
async function searchSounds(query: unknown, page: unknown): Promise<SoundSearchResponse | { error: SearchFail }> {
  const base = config.soundSearchUrl.trim();
  // Emptied on purpose is a setting, not a failure — the picker hides its
  // search box rather than showing an error nobody asked to see.
  if (base === '') return { error: 'off' };
  if (typeof query !== 'string' || query.trim() === '') return { error: 'failed' };

  let url: URL;
  try {
    url = new URL('/api/sounds/search', base);
  } catch {
    // A hand-edited `soundSearchUrl` that is not a URL. The same answer as off,
    // because it is the same situation: there is nothing here to search.
    return { error: 'off' };
  }
  url.searchParams.set('q', query.trim());
  url.searchParams.set('page', String(typeof page === 'number' && page >= 1 ? Math.floor(page) : 1));

  let response: Response;
  try {
    response = await net.fetch(url.href, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      // Nothing about a search is personal, and the server has no account for
      // this app to be signed in to.
      credentials: 'omit',
    });
  } catch {
    return { error: 'offline' };
  }

  // 404 is how the API says it has no catalogue key — a different thing from a
  // query with no matches, which is a 200 and an empty list.
  if (response.status === 404) return { error: 'unconfigured' };
  if (response.status === 429) return { error: 'busy' };
  if (!response.ok) return { error: 'failed' };

  try {
    const body: unknown = await response.json();
    return readSearch(body);
  } catch {
    return { error: 'failed' };
  }
}

/**
 * Fetches one hit's preview and files it under the imported pack.
 *
 * The audio comes from the catalogue's own CDN rather than through the search
 * server. That is both the honest arrangement — nobody is mirroring anybody's
 * sounds — and the reason none of this needs an account: a preview is public.
 *
 * What gets written down afterwards is an ordinary pack entry carrying the URL,
 * the real size and the real hash of what arrived. That is what makes an import
 * shareable: on somebody else's machine it is indistinguishable from a sound out
 * of a pack they installed themselves.
 */
async function importSound(raw: unknown): Promise<{ ref: string } | { error: PackFail }> {
  const hit = readHit(raw);
  if (hit === null) return { error: 'shape' };

  let stored: { sha256: string; bytes: number };
  try {
    stored = await store.capture(hit.preview);
  } catch (cause) {
    return { error: cause instanceof Error && 'reason' in cause ? (cause.reason as PackFail) : 'offline' };
  }

  const soundId = importedSoundId(hit.name, hit.id);
  const existing = config.soundPacks[IMPORTED_PACK];
  const pack = {
    id: IMPORTED_PACK,
    name: existing?.name ?? 'Freesound',
    // Null, and it has to be: there is no manifest behind this pack to re-read.
    // It was assembled here, one search at a time.
    source: null,
    sounds: {
      ...existing?.sounds,
      [soundId]: {
        url: hit.preview,
        sha256: stored.sha256,
        bytes: stored.bytes,
        license: hit.license,
        // Stored rather than shown once and forgotten: most of the catalogue is
        // CC-BY, which asks for the author by name, and the person who has to
        // honour that is whoever ends up holding this config.
        credit: `${hit.name} by ${hit.username} — ${hit.page}`,
      },
    },
  };

  config = { ...config, soundPacks: { ...config.soundPacks, [IMPORTED_PACK]: pack } };
  save();
  broadcast('tracker:config', config);
  return { ref: packRef(IMPORTED_PACK, soundId) };
}

/**
 * Every event goes to the windows and to the archive.
 *
 * The archive listens here rather than in a renderer because this is the only
 * place that sees the whole stream exactly once, whatever windows come and go.
 * Skipped lines are kept for the same reason: the settings window is opened
 * *because* something looks wrong, which is always after the fact.
 */
const deliver = (channel: string, payload: unknown) => {
  if (channel === 'tracker:event') history.record(payload as TrackerEvent);
  if (channel === 'tracker:skipped') {
    skippedLines.push(...(payload as SkippedLine[]));
    if (skippedLines.length > SKIPPED_LIMIT) skippedLines.splice(0, skippedLines.length - SKIPPED_LIMIT);
  }
  broadcast(channel, payload);
};

const feed = new SourceFeed(deliver);
const save = () => saveConfig(config);

/**
 * The updater, and where its state goes.
 *
 * Constructed lazily inside `whenReady` — it asks `app.getVersion()` and
 * `app.isPackaged`, and it must not touch `autoUpdater` before the app exists.
 */
let updater: Updater = null as unknown as Updater;

/**
 * How often to see whether the console log can be tidied, in ms.
 *
 * It only ever succeeds once per play session — the moment the player closes
 * Dota — so the interval decides how long a finished session's log sits on the
 * disk, not how much work anything does. Every other tick is one `stat`.
 */
const TRIM_INTERVAL = 5 * 60_000;

/**
 * Trims Dota's log to the lines the tracker reads, if the game has let go of it.
 *
 * The tail is resynchronised on success and only on success: what compaction
 * leaves behind is every tracker line of the evening, so a tail that read the
 * new file from the top would replay the lot as a fresh session.
 */
function trimLog(options: { asked?: boolean } = {}): CompactResult {
  const asked = options.asked === true;
  const idle: CompactResult = { skipped: 'small', before: 0, after: 0, kept: 0 };
  if (!asked && (!config.trimLog || config.source !== 'console')) return idle;

  // Asked: no size floor and no idle guess, so the only thing that can stop
  // it is the game genuinely still holding the file.
  const result = compactLog(config.logFile, asked ? { minBytes: 0, idleMs: 0 } : {});
  if (result.skipped !== null) {
    if (asked) process.stdout.write(`console log not trimmed: ${result.skipped}
`);
    return result;
  }

  // Only on success: what compaction leaves behind is every tracker line of
  // the evening, and a tail reading it from the top would replay the lot.
  feed.skipToEnd();
  const saved = (result.before - result.after) / 1_048_576;
  process.stdout.write(`console log compacted: ${saved.toFixed(1)} MB dropped, ${result.kept} tracker lines kept
`);
  return result;
}

/**
 * Starts the feed and opens a matching session in the archive.
 *
 * The log is trimmed first, so a session begins against a file holding only
 * what the tracker put there rather than an evening of engine spew. It does
 * nothing while the game holds the file, so restarting the session mid-play is
 * exactly as safe as it was.
 */
function startFeed(): void {
  trimLog();
  history.startSession(config.source);
  // A new session's problems are its own; last session's are not news.
  skippedLines.length = 0;
  feed.start(config);
}

/**
 * Development aid: render for a few seconds, save a PNG, quit.
 *
 * An overlay is otherwise hard to inspect — transparent, always on top and
 * click-through — so this is the only practical way to check the layout without
 * a game running behind it.
 */
async function captureAndExit(overlay: Overlay, file: string): Promise<void> {
  const win = overlay.browserWindow;
  if (!win) return;
  // Let the mock produce a few events so the panel is not empty.
  await new Promise((resolve) => setTimeout(resolve, 3500));
  if (win.isDestroyed()) return;
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, image.toPNG());
  process.stdout.write(`screenshot written to ${file}\n`);
  app.quit();
}

/** Sets the UI scale, clamped. Shared by the global hotkeys and the settings slider. */
function setScale(next: number): void {
  config.uiScale = clamp(Number(next.toFixed(3)), UI_SCALE.min, UI_SCALE.max);
  save();
  broadcast('tracker:config', config);
}

function setInteractive(next: boolean): void {
  interactive = next;
  each((overlay) => overlay.setInteractive(next));
}

/**
 * Accelerators another app already owns.
 *
 * Remembered rather than only broadcast, because binding happens before any
 * window has finished loading — a message sent at that moment reaches nobody,
 * which is how a dead hotkey used to end up looking like a working one.
 */
const unavailableHotkeys: string[] = [];

/** Registers an accelerator, recording a clash rather than failing silently. */
function bind(accelerator: string, handler: () => void): void {
  if (globalShortcut.register(accelerator, handler)) return;
  // The overlay still works; it just cannot be driven by this key.
  unavailableHotkeys.push(accelerator);
}

/**
 * One tracker at a time.
 *
 * Two copies would both tail the same log, both append finished runs to the
 * same `history.jsonl`, and both rewrite the same `config.json` — so the
 * archive would double-count the evening and whichever process saved last would
 * win the settings. It is easy to end up with two: the app has no taskbar
 * entry, so a second launch looks like the first one failed, and an update
 * relaunches the tracker while a portable copy of it may still be running.
 *
 * The loser exits before `whenReady`, so it never builds a window or opens the
 * feed. The winner shows the overlays it would have opened, which is the
 * answer to what the second launch was actually asking for.
 */
const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => {
    each((overlay) => {
      if (OVERLAY_SPEC[overlay.id].auto) overlay.show();
    });
  });
}

app.whenReady().then(async () => {
  // `app.quit()` above does not stop this from firing, and a losing copy that
  // built windows and opened the feed would be exactly the second tracker the
  // lock exists to prevent — for however long it took to go away.
  if (!single) return;

  config = loadConfig();
  history = new History();
  store = new SoundStore(path.join(app.getPath('userData'), 'sounds'));

  /*
   * Catch the store up with the config, without waiting for it.
   *
   * The usual way a pack arrives is not the settings window — it is a config
   * file somebody was handed, which lands with `soundPacks` already in it and
   * nothing on disk to play. Fetching them at launch means the first drop of
   * the evening rings; fetching them *before* the windows open would mean a
   * tracker that starts slower because a file host is slow, which is the wrong
   * trade for a feature that is decoration until something drops.
   *
   * The sweep goes first and is not awaited either: it only deletes files no
   * installed pack refers to, so it can never race the fetch that follows it
   * into wanting the same hash.
   */
  store.sweep(config.soundPacks);
  void store.ensure(config.soundPacks).then(({ fetched, failed }) => {
    if (fetched || failed) console.log(`[packs] fetched ${fetched}, failed ${failed}`);
  });
  const cli = applyArgs(config, process.argv.slice(1));

  /*
   * A build somebody downloaded reads their game, and nothing else.
   *
   * The mock is a scripted session — the development vehicle from when the
   * addon emitted nothing — and a player who installs a farm tracker and is
   * shown invented loot has been lied to by the first screen. So the packaged
   * build has no mock at all: not as a default, not from `--source=mock`, not
   * from a config file carried over from a development run, and not over IPC
   * (see `tracker:setConfig`). `app.isPackaged` is the only honest test for
   * this — a renderer's `import.meta.env.DEV` says how the *renderer* was
   * built, which is a different question.
   */
  if (app.isPackaged) config.source = 'console';

  // Before the feed starts, so the tail begins at the end of a log that is
  // already the size it should be — and so a launch after a long evening does
  // not carry yesterday's 12 MB into today.
  trimLog();
  const trimTimer = setInterval(trimLog, TRIM_INTERVAL);
  app.on('will-quit', () => clearInterval(trimTimer));

  interactive = cli.interactive;

  for (const id of OVERLAY_IDS) overlays.set(id, new Overlay(id, { config: () => config, save }));

  // Broadcast rather than returned, so a check started from one window is
  // visible in another — and so the settings window, which is opened on demand
  // and often part-way through a download, is told where things stand as it
  // loads rather than having to ask.
  updater = new Updater((state: UpdateState) => broadcast('tracker:update', state));

  /** Everything a freshly loaded renderer needs to know about the world it woke up in. */
  const onReady = (overlay: Overlay) => {
    overlay.send('tracker:config', config);
    overlay.send('tracker:update', updater.current);
    // Through `setInteractive`, not a bare send: a window that ignores the
    // hotkey has its own answer to this question, and only it knows it.
    overlay.setInteractive(interactive);
    // One feed for every overlay, started with whichever window is ready first
    // so the events have somewhere to land.
    if (!feedStarted) {
      feedStarted = true;
      startFeed();
    }
    // Last, so it is not immediately overwritten by the source's own status.
    if (unavailableHotkeys.length > 0) {
      overlay.send('tracker:status', {
        source: config.source,
        detail: `hotkey ${unavailableHotkeys.join(', ')} unavailable`,
        error: true,
      });
    }
    if (cli.screenshot && overlay.id === cli.screenshotOverlay) void captureAndExit(overlay, cli.screenshot);
  };

  // Only the panels that belong over the game open themselves. History and
  // settings wait to be asked for, and are created by `tracker:open`.
  each((overlay) => {
    if (OVERLAY_SPEC[overlay.id].auto) overlay.create(onReady);
  });

  // Except when the shot is of one of them, which is the one case where "asked
  // for" arrives on the command line.
  if (cli.screenshot && !OVERLAY_SPEC[cli.screenshotOverlay].auto) {
    overlays.get(cli.screenshotOverlay)?.open(onReady);
  }

  tray = createTray({ overlays: [...overlays.values()], hotkey: () => config.hotkey, onCreated: onReady });

  bind(config.hotkey, () => setInteractive(!interactive));
  // Scale is reachable without the overlay having focus, because normally it
  // has none — it is click-through until the hotkey says otherwise.
  bind('Control+Alt+=', () => setScale(config.uiScale + UI_SCALE.step));
  bind('Control+Alt+-', () => setScale(config.uiScale - UI_SCALE.step));
  bind('Control+Alt+0', () => setScale(UI_SCALE.default));

  /** The overlay a message is about, defaulting to the HUD if the id is unknown. */
  const target = (id: unknown): Overlay | undefined =>
    overlays.get(typeof id === 'string' && overlays.has(id as OverlayId) ? (id as OverlayId) : 'farm');

  ipcMain.handle('tracker:getConfig', () => config);

  ipcMain.handle('tracker:setConfig', (_e, patch: Partial<TrackerConfig>) => {
    // The source switch exists only in a development build's title bar, but a
    // channel that accepts the field is a channel that can be asked.
    if (app.isPackaged) delete patch.source;
    // A different file is as much a different session as a different source —
    // and without this the tail would keep reading the old log, which looks
    // exactly like the new one being empty.
    const restart =
      (patch.source !== undefined && patch.source !== config.source) ||
      (patch.logFile !== undefined && patch.logFile !== config.logFile);
    config = { ...config, ...patch };
    // Opacity is the renderer's business now — it tints the panel rather than
    // the window — so there is nothing to push at the window here.
    if (patch.opacity !== undefined) config.opacity = clamp(patch.opacity, OPACITY.min, OPACITY.max);
    if (patch.uiScale !== undefined) config.uiScale = clamp(patch.uiScale, UI_SCALE.min, UI_SCALE.max);
    save();
    // A different source is a different session: mock runs must never average
    // in with real ones.
    if (restart) startFeed();
    broadcast('tracker:config', config);
    return config;
  });

  ipcMain.handle('tracker:setInteractive', (_e, next: boolean) => {
    setInteractive(next);
    return interactive;
  });

  ipcMain.handle('tracker:setCollapsed', (_e, id: OverlayId, next: boolean) => {
    const collapsed = target(id)?.setCollapsed(next) ?? next;
    // Collapsed state lives in the config, so every window sees it change.
    broadcast('tracker:config', config);
    return collapsed;
  });

  ipcMain.handle('tracker:setSize', (_e, id: OverlayId, size: { width: number; height: number }) => {
    return target(id)?.setSize(size) ?? size;
  });

  // Fire-and-forget: the renderer reports a measurement rather than asking a
  // question, and a round trip per resize observation would be pure noise.
  ipcMain.on('tracker:contentSize', (_e, id: OverlayId, size: { width?: number; height: number } | null) => {
    target(id)?.setContentSize(size);
  });

  ipcMain.handle('tracker:getHistory', () => history.read());

  /**
   * The session so far, for a window that missed the start of it.
   *
   * Priced at zero deliberately — see `SessionSnapshot`. Main has no item
   * table, and the table this feeds counts runs and minutes.
   */
  ipcMain.handle(
    'tracker:getSession',
    (): SessionSnapshot => ({
      rooms: byRoom(history.live, () => 0).map(({ room, runs, averageClear, totalItems }) => ({
        room,
        runs,
        averageClear,
        totalItems,
      })),
      skipped: [...skippedLines],
    }),
  );

  /**
   * A sound file, for a binding.
   *
   * The formats are the ones Chromium decodes; anything else would be chosen
   * happily and then never play, which is the worst way to find out.
   */
  ipcMain.handle('tracker:pickSound', async (e): Promise<string | null> => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a sound',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'webm'] }],
    };
    const result = await (parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options));
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  /**
   * The bytes of one, for the renderer to decode.
   *
   * Read on demand rather than watched: a bound file is read once per run of
   * the app and kept decoded, so this is a handful of calls a session. The size
   * cap is what stops somebody's 300 MB wav from being loaded into the overlay
   * because they picked the wrong file in a dialog.
   *
   * A `pack:` reference resolves through the installed packs to a hash and out
   * of the content store — never to a path the reference itself supplied, which
   * is the whole reason a shared config can be trusted with this channel at
   * all. The renderer asks the same question either way and is told the same
   * kind of answer: bytes, or nothing.
   */
  ipcMain.handle('tracker:readSound', (_e, ref: unknown): Uint8Array | null => {
    if (typeof ref !== 'string' || ref === '') return null;

    const packed = packedSound(config.soundPacks, ref);
    // Null while a pack is still being fetched, or after a sound in it failed
    // to arrive. Both read as silence, and both fix themselves on the next
    // launch when `ensure` tries again.
    if (packed) return store.read(packed.sha256);

    try {
      if (fs.statSync(ref).size > MAX_SOUND_BYTES) return null;
      return fs.readFileSync(ref);
    } catch {
      // Moved, renamed, on a drive that is not plugged in. The binding stays;
      // the sound simply does not play, and the settings window still shows it.
      return null;
    }
  });

  /**
   * What a pasted pack URL turns out to be. Fetches the manifest, and no audio.
   *
   * The two-step — preview, then install — is the whole safety story of this
   * feature, and it is worth saying why it is a step and not a confirmation
   * dialog. A pack manifest is a list of URLs that an app will go and fetch,
   * arriving from a chat window. Downloading on paste would put that decision
   * in the hands of whoever wrote the message. So a paste buys a description:
   * names, sizes, licences and the hosts they are on, which somebody reads
   * before the second call happens.
   */
  ipcMain.handle('tracker:previewPack', (_e, url: unknown) => store.preview(typeof url === 'string' ? url : ''));

  /** And the second call. The URL is re-read rather than trusted from the renderer. */
  ipcMain.handle('tracker:installPack', async (_e, url: unknown): Promise<PackInstall | { error: PackFail }> => {
    if (typeof url !== 'string') return { error: 'url' };
    const preview = await store.preview(url);
    if (preview.pack === null) return { error: preview.error ?? 'shape' };

    const result = await store.install(preview.pack);
    /*
     * Kept only if something landed.
     *
     * A pack whose every sound failed is a row in the settings list that can
     * never play anything — the same thing `readPack` refuses an empty manifest
     * for, arriving by a different route. A partial install is kept, though:
     * nineteen of twenty is a working pack, and `ensure` retries the twentieth
     * on every launch.
     */
    if (result.installed.length > 0) {
      config = { ...config, soundPacks: { ...config.soundPacks, [preview.pack.id]: preview.pack } };
      save();
      broadcast('tracker:config', config);
    }
    return result;
  });

  /** Forget a pack, and drop the stored files nothing else still wants. */
  ipcMain.handle('tracker:removePack', (_e, id: unknown) => {
    if (typeof id !== 'string' || config.soundPacks[id] === undefined) return;
    const soundPacks = { ...config.soundPacks };
    delete soundPacks[id];
    config = { ...config, soundPacks };
    save();
    // After the config is the truth, never before: the sweep keeps whatever the
    // remaining packs refer to, and it can only answer that from the new one.
    store.sweep(config.soundPacks);
    broadcast('tracker:config', config);
  });

  /**
   * A page of search hits, or a code the picker turns into a sentence.
   *
   * In main rather than the renderer, and not only because of the page's CSP.
   * This is the one request the tracker makes on a player's behalf, so it is
   * worth being somewhere the whole of it can be read at once: a GET to the
   * configured server, a query string, no cookies, no identity, and a body
   * thrown away unless it parses into the shape below.
   */
  ipcMain.handle('tracker:searchSounds', (_e, query: unknown, page: unknown) => searchSounds(query, page));
  ipcMain.handle('tracker:importSound', (_e, hit: unknown) => importSound(hit));
  ipcMain.handle('tracker:clearHistory', () => history.clear());

  ipcMain.handle('tracker:deleteSessions', (_e, ids: unknown) => {
    // From a renderer, so it is checked here rather than trusted: the argument
    // decides which lines of the archive stop existing.
    if (!Array.isArray(ids)) return;
    history.remove(ids.filter((id): id is number => typeof id === 'number' && Number.isFinite(id)));
  });

  ipcMain.handle('tracker:newSession', () => {
    history.startSession(config.source);
  });

  /**
   * The system file dialog, because a log path is a path.
   *
   * Typing one into a text field means getting a Windows path exactly right by
   * hand, in a settings panel, for a file buried in a Steam install — and a
   * typo there produces a tracker that reads nothing and says nothing about it.
   */
  // The button in settings. It reports what it did rather than doing it
  // quietly: most presses land on a log the game is still holding, and
  // "nothing happened" has to be distinguishable from "nothing works".
  ipcMain.handle('tracker:compactLog', () => trimLog({ asked: true }));

  ipcMain.handle('tracker:pickLogFile', async (e): Promise<string | null> => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Choose the Dota console log',
      defaultPath: config.logFile,
      properties: ['openFile'],
      filters: [
        { name: 'Console log', extensions: ['log', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const result = await (parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options));
    const file = result.canceled ? undefined : result.filePaths[0];
    if (file === undefined) return null;

    // Picking a log is also picking the console feed: the file is no use to
    // the mock, and the mock is no use to someone who just chose a file.
    config = { ...config, logFile: file, source: 'console' };
    save();
    startFeed();
    broadcast('tracker:config', config);
    return file;
  });

  ipcMain.handle('tracker:open', (_e, id: OverlayId) => {
    target(id)?.open(onReady);
  });

  ipcMain.handle('tracker:close', (_e2, ...rest: unknown[]) => {
    // The id comes from the preload, which knows which window it belongs to —
    // a renderer can only ever close itself.
    target(rest[0])?.close();
  });

  /*
   * The update buttons.
   *
   * Three separate presses rather than one, because each is a decision with a
   * different cost: asking GitHub is free, fetching ninety megabytes is not,
   * and restarting closes an overlay somebody may be playing behind. None of
   * them resolves with an answer — every step reports on `tracker:update`, so
   * the window has one thing to watch instead of a return value and a stream
   * that could disagree.
   */
  ipcMain.handle('tracker:getUpdate', () => updater.current);
  ipcMain.handle('tracker:checkUpdate', () => updater.check());
  ipcMain.handle('tracker:downloadUpdate', () => updater.download());

  ipcMain.handle('tracker:installUpdate', (e) =>
    // Parented to whichever window asked, so the confirmation is attached to
    // the settings panel the button lives in rather than floating loose.
    updater.install(BrowserWindow.fromWebContents(e.sender), save),
  );

  ipcMain.handle('tracker:quit', () => app.quit());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      each((overlay) => {
        if (OVERLAY_SPEC[overlay.id].auto) overlay.create(onReady);
      });
    }
  });
});

/*
 * Quitting is the tray's business and the overlay's X button, not a
 * consequence of closing a window. Left as the default, closing the history
 * window while the HUD is hidden in the tray would take the app with it.
 */
app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  feed.stop();
  tray?.destroy();
  tray = null;
});
