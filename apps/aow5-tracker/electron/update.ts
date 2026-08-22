import { app, dialog, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '../core/ipc.ts';

/**
 * Updating the tracker from its own GitHub releases.
 *
 * The release side has existed since packaging did: `publish: github` in
 * `electron-builder.yml` makes electron-builder write a `latest.yml` beside the
 * installer on every tagged release, and that file is the whole protocol. This
 * module is the other half — the part that reads it and asks.
 *
 * Nothing here happens on its own. No check on launch, no download in the
 * background, no restart nobody pressed: the app is an always-on-top overlay
 * drawn over a live game, and every one of those would be an interruption at
 * the worst possible moment. Three buttons in the settings window drive the
 * whole thing, in order.
 *
 * The one exception is `autoInstallOnAppQuit`, left on. A downloaded update
 * applying when somebody quits from the tray costs them nothing — the session
 * is over by then — and it means an update fetched and then left alone does not
 * have to be fetched again next time.
 */

// electron-updater is CommonJS, and main builds as ESM. The default import is
// the module object; destructuring it is the interop that works either way.
const { autoUpdater } = electronUpdater;

/**
 * The release notes, flattened to one paragraph.
 *
 * GitHub's are markdown, and `electron-updater` hands them over as a string, or
 * as a list of per-version entries when more than one release is being skipped
 * at once. The settings window has room for a sentence, so this takes the
 * newest and lets the release page carry the rest.
 */
function firstNote(notes: unknown): string | null {
  if (typeof notes === 'string') return notes.trim() === '' ? null : notes.trim();
  if (Array.isArray(notes)) {
    for (const entry of notes) {
      if (entry !== null && typeof entry === 'object' && 'note' in entry) {
        const note = (entry as { note?: unknown }).note;
        if (typeof note === 'string' && note.trim() !== '') return note.trim();
      }
    }
  }
  return null;
}

/** Whatever the updater failed with, as a sentence a settings window can show. */
function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.trim() === '' ? 'Unknown error.' : text;
}

export class Updater {
  private state: UpdateState;
  /** Told on every transition, so the windows follow without having to ask. */
  private readonly announce: (state: UpdateState) => void;

  /**
   * Whether there is an updater at all.
   *
   * `autoUpdater` reads `app-update.yml` out of the packaged resources the
   * moment it is touched, and a development build has none — so a dev run must
   * never reach it. Which is also the honest answer for the UI: updating is
   * something an installed copy can do.
   */
  private readonly live: boolean;

  constructor(announce: (state: UpdateState) => void) {
    this.announce = announce;
    this.live = app.isPackaged;
    this.state = { status: this.live ? 'idle' : 'unsupported', current: app.getVersion() };
    if (this.live) this.listen();
  }

  get current(): UpdateState {
    return this.state;
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.announce(state);
  }

  /** The running version. Every state carries it; this is where it comes from. */
  private get version(): string {
    return this.state.current;
  }

  private listen(): void {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    // Prereleases are reached through /releases/latest rather than by asking
    // for them: `releaseType: release` in electron-builder.yml means a `-beta`
    // build is still GitHub's latest, and semver puts 0.2.0-beta above
    // 0.1.0-beta by itself. Turning this on would additionally pick up releases
    // deliberately marked "pre-release", which is the opposite of the point.
    autoUpdater.allowPrerelease = false;
    // The app writes to stdout and has no logging dependency; this keeps the
    // updater's noise where `trimLog`'s already is.
    autoUpdater.logger = {
      info: (message: unknown) => process.stdout.write(`update: ${String(message)}\n`),
      warn: (message: unknown) => process.stdout.write(`update: ${String(message)}\n`),
      error: (message: unknown) => process.stderr.write(`update: ${String(message)}\n`),
      debug: () => {},
    };

    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', current: this.version }));

    autoUpdater.on('update-available', (info) =>
      this.set({
        status: 'available',
        current: this.version,
        version: info.version,
        notes: firstNote(info.releaseNotes),
      }),
    );

    autoUpdater.on('update-not-available', () => this.set({ status: 'current', current: this.version }));

    autoUpdater.on('download-progress', (progress) => {
      // Only while a download is what is happening. A late tick after
      // `update-downloaded` would walk the state backwards, and a percentage
      // reappearing under a "Restart and update" button reads as a fault.
      if (this.state.status !== 'downloading') return;
      this.set({
        status: 'downloading',
        current: this.version,
        version: this.state.version,
        percent: Math.min(100, Math.max(0, Math.round(progress.percent))),
      });
    });

    autoUpdater.on('update-downloaded', (info) =>
      this.set({ status: 'ready', current: this.version, version: info.version }),
    );

    autoUpdater.on('error', (error) => this.set({ status: 'error', current: this.version, message: reason(error) }));
  }

  async check(): Promise<void> {
    if (!this.live) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      // `checkForUpdates` both emits `error` and rejects. Setting the state
      // twice is harmless; missing it altogether would not be.
      this.set({ status: 'error', current: this.version, message: reason(error) });
    }
  }

  async download(): Promise<void> {
    if (!this.live || this.state.status !== 'available') return;
    // Straight to a percentage rather than waiting for the first progress
    // event: on a fast connection that event can be most of the file, and until
    // it lands the button would look like it had done nothing.
    this.set({ status: 'downloading', current: this.version, version: this.state.version, percent: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.set({ status: 'error', current: this.version, message: reason(error) });
    }
  }

  /**
   * Restart onto the downloaded update, if they say so.
   *
   * A native dialog rather than something drawn in the window, because every
   * window in this app is frameless and transparent and a modal inside one
   * would have nothing to sit on.
   *
   * `flush` writes the config out one last time before the process is handed to
   * the installer. `saveConfig` is atomic, so this is belt to that braces —
   * but the config is rewritten on every window drag, and the last thing the
   * app does before dying on purpose should not be a write it might die inside.
   */
  async install(parent: BrowserWindow | null, flush: () => void): Promise<void> {
    if (!this.live || this.state.status !== 'ready') return;
    const { version } = this.state;

    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['Restart and update', 'Not now'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update the tracker',
      message: `Update to ${version}?`,
      detail:
        'Get to the hideout first. The tracker closes and reopens on the new version, and it cannot watch the ' +
        'game while it does.\n\n' +
        'Runs you have finished are already in the archive. The one you are standing in is not, and the session ' +
        'totals start again from zero.\n\n' +
        'Your settings, prices and history are kept.',
      noLink: true,
    };

    const { response } = await (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options));
    if (response !== 0) return;

    flush();
    // Silent, and relaunch afterwards: the assisted installer's pages are for
    // somebody installing this for the first time, not for an app updating
    // itself into the directory it is already in.
    autoUpdater.quitAndInstall(true, true);
  }
}
