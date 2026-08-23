import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, renderIcon } from './icon.ts';

/**
 * Writes `build/icon.png`, which electron-builder turns into the installer's
 * `.ico` and the executable's icon.
 *
 * Run by the `release` script rather than committed, for the reason the tray
 * icon is generated too: it is a circle on a rounded rectangle, and a binary in
 * the tree is a file nobody can review and a copy step can lose. 512px because
 * that is the largest size Windows asks for, and everything below it is a
 * downscale electron-builder does itself.
 */

const SIZE = 512;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'build', 'icon.png');

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, encodePng(renderIcon(SIZE), SIZE));

process.stdout.write(`${path.relative(root, file)} written, ${SIZE}x${SIZE}\n`);
