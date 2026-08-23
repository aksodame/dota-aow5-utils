import { encodePng, renderIcon } from './icon.ts';

/**
 * Prints the tray icon as a `data:image/png;base64,…` URL, for pasting into
 * `TRAY_ICON` in `electron/main.ts`.
 *
 * The icon is generated rather than committed as a binary because it is trivial
 * — a gold coin on a dark rounded square — and an inline data URL cannot be
 * lost by a build's copy step, which a `resources/` file quietly can be. The
 * drawing itself lives in `icon.ts`, since the installer needs the same mark at
 * sixteen times the size.
 */

const SIZE = 32;

process.stdout.write(`data:image/png;base64,${encodePng(renderIcon(SIZE), SIZE).toString('base64')}
`);
