import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DIRS, ensureDirs } from './lib/paths.ts';
import { ok, step } from './lib/log.ts';

/**
 * Generates public/icons/placeholder.png.
 *
 * Shown for items whose icon has no source (a CDN miss, or an item id from a
 * shared link that this build of the app does not know). Written by hand in
 * raw PNG chunks so the repo needs no image dependency, and deterministically
 * so re-running never dirties the working tree.
 */

const W = 88;
const H = 64;

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crcInput = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  out.writeUInt32BE(zlib.crc32(crcInput) >>> 0, 8 + data.length);
  return out;
}

// 8-bit RGB. Flat slate fill with a lighter dashed border, so an empty icon
// reads as "intentionally blank" rather than as a broken image.
const BG: [number, number, number] = [0x24, 0x28, 0x31];
const FG: [number, number, number] = [0x4b, 0x53, 0x63];

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 3);
  raw[rowStart] = 0; // filter type: none
  for (let x = 0; x < W; x++) {
    const onBorder = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
    const dashOn = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
    const c = onBorder && dashOn ? FG : BG;
    const p = rowStart + 1 + x * 3;
    raw[p] = c[0];
    raw[p + 1] = c[1];
    raw[p + 2] = c[2];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

ensureDirs();
step('placeholder icon');
const dest = path.join(DIRS.publicIcons, 'placeholder.png');
fs.writeFileSync(dest, png);
ok(`wrote public/icons/placeholder.png (${W}x${H}, ${png.length} bytes)`);
