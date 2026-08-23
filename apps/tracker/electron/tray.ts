import { Menu, nativeImage, Tray, app } from 'electron';
import { OVERLAY_SPEC } from '../core/ipc.ts';
import type { Overlay } from './overlay.ts';

/**
 * The tray icon.
 *
 * Not a nicety: every overlay window is frameless and skips the taskbar, so
 * with them hidden this is the only handle the app has. It has to exist in dev
 * and in a packaged build alike.
 */

/*
 * A 32x32 gold coin, inlined rather than shipped as a file — an inline image
 * cannot be missed by a copy step. Regenerate with `node scripts/gen-tray-icon.ts`.
 */
const TRAY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABRklEQVR42mNgwALY2bksePmEc/kFxRqogUFmgcxkIAQ4uXi9JKSUT8kp6vynBQaZDbIDq+UgV9LKYnQMsgvD5/SyHIZRQoKWwY4vOuAJjt6WwzA4YZIT907W+v9zIoz+N2WYgDGIDRIjKy2AsgmxGkAWHZlm+f/1JhusGCQHUkOseSC7iXKAro7u/7Vt5jgtRscgtSA9VHEAyCB8vsYXGoQcQZQDsPn88+GI/z/P5/3/c7USjEFskBi2kKDIAaD4RDbw7XZXiMXXqrBikBxIDbIefGmCoAPQgx6f5ciOQI8KshwAylbowU7IchhGjw5cWRSvA9CDnxjf4woFXNGA1wGgAgbZEHCCI9IBILXIekFmDT0HDHgUDHgiHPBsOCgKogEvigdFZTTg1THNGyQD3iQb8EbpgDfLB0XHZMC7ZoOiczpQ3XMARa3cx1UrXEIAAAAASUVORK5CYII=';

export interface TrayHost {
  overlays: Overlay[];
  hotkey: () => string;
  /** Called after a window is created from the menu, to wire it up. */
  onCreated: (overlay: Overlay) => void;
}

export function createTray(host: TrayHost): Tray {
  const tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON));
  tray.setToolTip('AOW5 tracker');

  const rebuild = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...host.overlays.map((overlay) => ({
          label: `${overlay.isVisible() ? 'Hide' : 'Show'} ${overlay.id} overlay`,
          click: () => {
            overlay.toggleVisible(host.onCreated);
            rebuild();
          },
        })),
        { label: `Interactive: ${host.hotkey()}`, enabled: false },
        { type: 'separator' as const },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
  };

  rebuild();
  // Double-click is the Windows convention for "give me the thing back".
  tray.on('double-click', () => {
    // The panels that belong over the game, and not the windows you open on
    // purpose: `show` creates what is missing, so including history and
    // settings here would answer "give me the HUD back" with three windows.
    for (const overlay of host.overlays) if (OVERLAY_SPEC[overlay.id].auto) overlay.show();
    rebuild();
  });

  return tray;
}
