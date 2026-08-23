import zlib from 'node:zlib';

/**
 * The app's mark — a gold coin on a dark rounded square — and a PNG encoder for
 * it.
 *
 * Generated rather than committed as a binary, at whatever size the caller
 * wants. The tray needs 32px inline in the source; the installer needs 512px on
 * disk; neither wants a checked-in file that no reviewer can diff and a build's
 * copy step can quietly lose. It is a circle on a rounded rectangle — the code
 * is shorter than the PNG would be.
 *
 * Every measurement is a fraction of the canvas, so the same drawing renders
 * identically at any size.
 */

/** Fractions of the canvas: corner radius, coin radius, and how far in the lighter core starts. */
const RADIUS = 7 / 32;
const COIN = 9.5 / 32;
const CORE_INSET = 3.5 / 32;

const PANEL: [number, number, number] = [30, 33, 44];
const COIN_EDGE: [number, number, number] = [235, 178, 60];
const COIN_CORE: [number, number, number] = [252, 214, 122];

/** RGBA pixels for the icon at `size` × `size`. */
export function renderIcon(size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4, 0);

  /** Source-over onto the (initially transparent) canvas. */
  const blend = (x: number, y: number, [r, g, b]: [number, number, number], a: number): void => {
    const i = (y * size + x) * 4;
    const sa = a / 255;
    pixels[i] = Math.round(pixels[i]! * (1 - sa) + r * sa);
    pixels[i + 1] = Math.round(pixels[i + 1]! * (1 - sa) + g * sa);
    pixels[i + 2] = Math.round(pixels[i + 2]! * (1 - sa) + b * sa);
    pixels[i + 3] = Math.max(pixels[i + 3]!, a);
  };

  // Rounded square: a point is inside when it is within `radius` of the rect
  // inset by that same radius.
  const radius = RADIUS * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(Math.max(x, radius), size - 1 - radius);
      const cy = Math.min(Math.max(y, radius), size - 1 - radius);
      const d = Math.hypot(x - cx, y - cy);
      // One pixel of antialiasing at the edge, whatever the size.
      const inside = Math.max(0, Math.min(1, radius + 0.5 - d));
      if (inside > 0) blend(x, y, PANEL, Math.round(inside * 255));
    }
  }

  // The coin, with a lighter core and a one-pixel antialiased edge.
  const centre = (size - 1) / 2;
  const coin = COIN * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - centre, y - centre);
      const edge = Math.max(0, Math.min(1, coin - d + 0.5));
      if (edge > 0) blend(x, y, COIN_EDGE, Math.round(edge * 255));
      const core = Math.max(0, Math.min(1, coin - CORE_INSET * size - d + 0.5));
      if (core > 0) blend(x, y, COIN_CORE, Math.round(core * 255));
    }
  }

  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** RGBA pixels to a PNG file. Every scanline prefixed with filter type 0, then deflate. */
export function encodePng(pixels: Buffer, size: number): Buffer {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
