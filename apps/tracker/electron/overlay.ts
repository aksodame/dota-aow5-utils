import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERLAY_SPEC, type OverlayId, type TrackerConfig } from '../core/ipc.ts';
import { clampSize } from './config.ts';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * One always-on-top overlay window.
 *
 * The farm HUD is the only one today; the recipe panel is the same object with
 * a different id, which is why nothing below is named after farming and why the
 * window is built from `OVERLAY_LIMITS[id]` rather than from constants.
 *
 * Two rules this class exists to keep:
 *
 *   1. **Click-through is the default.** An overlay that eats a click mid-fight
 *      is worse than no overlay, so the mouse only reaches it between the
 *      hotkey being pressed and being pressed again.
 *   2. **The renderer decides how tall it is.** Collapsed or expanded, the
 *      readout is a fixed handful of rows with nothing to scroll, so leftover
 *      window height would be an empty pane of glass over the game — and
 *      hiding the body in CSS instead would leave exactly that. The window has
 *      to follow the content, so it does: `setContentHeight`.
 */

export interface OverlayHost {
  /** The live config. Read at every use — settings change under the window. */
  config: () => TrackerConfig;
  /** Persist a change the window made to its own geometry. */
  save: () => void;
}

export class Overlay {
  readonly id: OverlayId;
  private readonly host: OverlayHost;
  private window: BrowserWindow | null = null;
  /**
   * The size the content asked for, or null while the view inside scrolls and
   * wants the user's. A missing `width` means only the height is the content's.
   */
  private content: { width?: number; height: number } | null = null;
  /** Suppresses the geometry write-back caused by our own `setSize`. */
  private adjusting = false;

  constructor(id: OverlayId, host: OverlayHost) {
    this.id = id;
    this.host = host;
  }

  private get spec() {
    return OVERLAY_SPEC[this.id];
  }

  private get view() {
    return this.host.config().overlays[this.id];
  }

  get browserWindow(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  isVisible(): boolean {
    return this.browserWindow?.isVisible() ?? false;
  }

  /**
   * A source keeps producing for a moment after a window goes away — timers
   * already scheduled still fire — so this tolerates a disposed frame rather
   * than throwing out of a timer callback.
   */
  send(channel: string, payload: unknown): void {
    const win = this.browserWindow;
    if (!win || win.webContents.isDestroyed()) return;
    try {
      win.webContents.send(channel, payload);
    } catch {
      // Frame disposed between the check and the send; nothing to do.
    }
  }

  create(onReady: (overlay: Overlay) => void): BrowserWindow {
    const existing = this.browserWindow;
    if (existing) return existing;

    const view = this.view;
    const limits = OVERLAY_SPEC[this.id].limits;
    const area = screen.getPrimaryDisplay().workAreaSize;
    const size = clampSize(this.id, view.size);
    const position = view.position ?? { x: Math.max(0, area.width - size.width - 40), y: 80 };

    const win = new BrowserWindow({
      ...position,
      ...size,
      frame: false,
      transparent: true,
      // Asked for, but not granted: Windows refuses to make a transparent
      // window resizable, so the OS never draws drag borders and every resize
      // goes through `resizeTo`. The flag is left in for the platforms that
      // honour it.
      resizable: true,
      minWidth: limits.min.width,
      minHeight: limits.min.height,
      maxWidth: limits.max.width,
      maxHeight: limits.max.height,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(dirname, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        // A drop sound has no gesture behind it: the player is in the game,
        // and this window is click-through. Electron already defaults to this,
        // and the default is not something to find out about by silence.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    this.window = win;

    // 'screen-saver' outranks most other always-on-top windows, which is what
    // keeps it above a borderless-fullscreen game.
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // A window that ignores the hotkey is one you are meant to click, so it
    // starts — and stays — reachable by the mouse.
    this.setInteractive(!this.spec.hotkeyed);

    win.on('moved', () => this.rememberGeometry());
    win.on('resized', () => this.rememberGeometry());

    /*
     * The window's identity and the machine's language, both on the query
     * string, because both are fixed for the life of the window and both are
     * wanted by the first paint. The preload turns them into `window.tracker`;
     * see the note there for why the locale does not travel over a channel.
     */
    const query = { overlay: this.id, locale: app.getLocale() };
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) void win.loadURL(`${devUrl}?${new URLSearchParams(query).toString()}`);
    else void win.loadFile(path.join(dirname, '../renderer/index.html'), { query });

    win.webContents.on('did-finish-load', () => {
      // A fresh renderer has measured nothing yet and will report within a
      // frame; until then the window keeps the size it was created at.
      this.content = null;
      onReady(this);
    });

    win.on('closed', () => {
      this.window = null;
    });

    return win;
  }

  /**
   * Writes the window's own moves back to config.
   *
   * The height is only recorded while the user owns it. A self-sized window's
   * height belongs to whatever it is currently showing, and storing that would
   * hand the scrolling views the height of a two-row readout.
   */
  private rememberGeometry(): void {
    const win = this.browserWindow;
    if (!win || this.adjusting) return;
    const bounds = win.getBounds();
    const view = this.view;
    view.position = { x: bounds.x, y: bounds.y };
    if (this.content?.width === undefined) view.size.width = clampSize(this.id, bounds).width;
    if (this.content === null) view.size.height = clampSize(this.id, bounds).height;
    this.host.save();
  }

  show(): void {
    (this.browserWindow ?? this.create(() => {})).show();
  }

  /**
   * Bring this window to the player, creating it if it does not exist.
   *
   * The singleton rule lives here: one `BrowserWindow` per id, so asking for a
   * window that is already up focuses it rather than opening a second copy of
   * the same thing.
   */
  open(onReady: (overlay: Overlay) => void): void {
    const win = this.browserWindow;
    if (!win) {
      this.create(onReady).show();
      return;
    }
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }

  /** Closes the window without touching the app. Reopening builds a fresh one. */
  close(): void {
    this.browserWindow?.close();
  }

  toggleVisible(onReady: (overlay: Overlay) => void): void {
    const win = this.browserWindow;
    if (!win) this.create(onReady);
    else if (win.isVisible()) win.hide();
    else win.show();
  }

  /**
   * Click-through is the default so the overlay never steals input mid-fight.
   *
   * `forward` is deliberately off. Forwarding would keep the renderer hearing
   * the cursor while the window is transparent to clicks, which lights up
   * hover states under a mouse that is aiming at the game behind — rows
   * highlighting themselves as the pointer crosses the panel, for no gesture
   * the user made. Until the hotkey says otherwise the overlay should not know
   * where the mouse is at all.
   */
  setInteractive(next: boolean): void {
    // The hotkey speaks for the windows over the game. It does not speak for
    // the ones you opened on purpose, which would be unusable click-through.
    const interactive = this.spec.hotkeyed ? next : true;
    this.browserWindow?.setIgnoreMouseEvents(!interactive, { forward: false });
    this.send('tracker:interactive', interactive);
  }

  /**
   * Resizes to a size the user dragged to, clamped.
   *
   * The height is only taken while the window is not sizing itself. Storing a
   * drag's height regardless would quietly overwrite the height the user chose
   * for the views that *do* scroll, using a number that came from the readout
   * measuring itself.
   */
  setSize(size: { width: number; height: number }): { width: number; height: number } {
    const view = this.view;
    const next = clampSize(this.id, size);
    if (this.content?.width === undefined) view.size.width = next.width;
    if (this.content === null) view.size.height = next.height;
    this.apply();
    this.host.save();
    return { width: this.content?.width ?? view.size.width, height: this.content?.height ?? view.size.height };
  }

  setCollapsed(next: boolean): boolean {
    const view = this.view;
    if (view.collapsed !== next) {
      view.collapsed = next;
      this.host.save();
      // No resize here: the renderer re-renders as a bar and reports the height
      // that follows, which is the only one that is actually right.
    }
    return next;
  }

  /**
   * The renderer measured itself, or handed the size back.
   *
   * A content width is also written into the stored geometry, which looks
   * redundant and is not: the window is created at its stored size before the
   * renderer has measured anything, and if that size were the stale one the
   * first measurement would shove the window sideways on every launch.
   */
  setContentSize(next: { width?: number; height: number } | null): void {
    const rounded =
      next === null
        ? null
        : {
            ...(next.width === undefined ? {} : { width: Math.max(1, Math.round(next.width)) }),
            height: Math.max(1, Math.round(next.height)),
          };
    if (rounded?.width === this.content?.width && rounded?.height === this.content?.height) return;
    this.content = rounded;

    if (rounded?.width !== undefined) {
      const width = Math.min(rounded.width, OVERLAY_SPEC[this.id].limits.max.width);
      if (this.view.size.width !== width) {
        this.view.size.width = width;
        this.host.save();
      }
    }
    this.apply();
  }

  /**
   * Puts the window at whichever size is currently in charge.
   *
   * A content-driven width grows from the right edge rather than the left.
   * This panel's home is the top-right corner of the screen, and a strip that
   * marched further right every time an ingredient was added would walk itself
   * off the display; keeping the right edge still is what makes it feel
   * anchored there.
   */
  private apply(): void {
    const win = this.browserWindow;
    if (!win) return;
    const stored = clampSize(this.id, this.view.size);
    // The content's width is clamped like any other: a recipe wider than the
    // ceiling is clipped, which is survivable, where a window wider than the
    // screen is a strip the player cannot see the end of and cannot drag.
    const width = Math.min(this.content?.width ?? stored.width, OVERLAY_SPEC[this.id].limits.max.width);
    const height = this.content?.height ?? stored.height;

    const bounds = win.getBounds();
    if (this.content?.width !== undefined && bounds.width !== width) {
      this.resizeTo(width, height, Math.max(0, bounds.x + bounds.width - width));
      return;
    }
    this.resizeTo(width, height);
  }

  /**
   * Resizes the window, having first re-opened the range it may be resized to.
   *
   * Both halves matter, and the first is the non-obvious one. A transparent
   * window is never actually `resizable` on Windows — the constructor flag is
   * accepted and ignored — and Electron pins a non-resizable window's minimum
   * to whatever size it was last given. Left alone, that minimum ratchets
   * upward with every call and the window can only ever grow: dragging the
   * grip outward worked, dragging it inward did nothing at all.
   *
   * A self-sized window needs the same call for the opposite reason: two rows
   * of readout are shorter than `limits.min.height`, so while the content is
   * in charge the height has to stop being a range at all before the OS will
   * accept it. The same goes for a width the content decides.
   */
  private resizeTo(width: number, height: number, x?: number): void {
    const win = this.browserWindow;
    if (!win) return;
    const limits = OVERLAY_SPEC[this.id].limits;
    const fixedHeight = this.content !== null;
    const fixedWidth = this.content?.width !== undefined;
    win.setMinimumSize(fixedWidth ? width : limits.min.width, fixedHeight ? height : limits.min.height);
    win.setMaximumSize(fixedWidth ? width : limits.max.width, fixedHeight ? height : limits.max.height);
    this.adjusting = true;
    if (x === undefined) win.setSize(width, height, false);
    else win.setBounds({ x, y: win.getBounds().y, width, height }, false);
    this.adjusting = false;
  }
}
