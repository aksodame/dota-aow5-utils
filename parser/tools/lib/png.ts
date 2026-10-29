import zlib from 'node:zlib';

const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngInfo {
  width: number;
  height: number;
}

export function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(MAGIC);
}

/**
 * Reads dimensions from the IHDR chunk, which the spec requires to be first.
 * Returns null for anything that is not a PNG — used to reject CDN error pages
 * that come back with a 200 status.
 */
export function readPngInfo(buf: Buffer): PngInfo | null {
  if (!isPng(buf) || buf.length < 24) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * The PNG without its text chunks (`tEXt`, `zTXt`, `iTXt`).
 *
 * Valve's CDN ships a couple of item icons — `disperser`, `phylactery` — with
 * two megabytes of editor metadata riding in text chunks behind a picture of a
 * few kilobytes. Nothing renders them, and the shared package's icon test
 * refuses them. Every other chunk is copied as it was, CRCs included, so the
 * image itself is byte-identical.
 */
export function stripTextChunks(buf: Buffer): Buffer {
  if (!isPng(buf)) return buf;
  const parts: Buffer[] = [buf.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const end = at + 12 + length;
    if (end > buf.length) return buf; // truncated: leave it for verify to refuse
    const kind = buf.toString('ascii', at + 4, at + 8);
    if (kind !== 'tEXt' && kind !== 'zTXt' && kind !== 'iTXt') parts.push(buf.subarray(at, end));
    at = end;
    if (kind === 'IEND') break;
  }
  return Buffer.concat(parts);
}

export interface DecodedPng {
  width: number;
  height: number;
  /** Straight (not premultiplied) 8-bit RGBA. */
  rgba: Buffer;
}

/**
 * The PNG as RGBA pixels.
 *
 * Only what the addon's own art is: 8-bit truecolour with alpha, non-interlaced.
 * That is the shape of every achievement texture, and the function refuses
 * anything else rather than guessing — a palette or 16-bit image would need
 * code this pipeline does not otherwise have.
 */
export function decodePng(buf: Buffer): DecodedPng | null {
  if (!isPng(buf) || buf.length < 33) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) return null;
  if (width === 0 || height === 0) return null;

  const idat: Buffer[] = [];
  let at = 8;
  while (at + 12 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const end = at + 12 + length;
    if (end > buf.length) return null;
    const kind = buf.toString('ascii', at + 4, at + 8);
    if (kind === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + length));
    at = end;
    if (kind === 'IEND') break;
  }
  if (idat.length === 0) return null;

  const stride = width * 4;
  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  if (raw.length < (stride + 1) * height) return null;

  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4]! : 0;
      const b = prev !== null ? prev[x]! : 0;
      const c = prev !== null && x >= 4 ? prev[x - 4]! : 0;
      let value = src[x]!;
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
      else if (filter === 4) value += paeth(a, b, c);
      else if (filter !== 0) return null;
      row[x] = value & 0xff;
    }
  }
  return { width, height, rgba: out };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Box-filtered downscale, with alpha premultiplied while averaging — a
 * transparent black pixel beside an opaque one must not darken it.
 *
 * `max` is the longer side of the result; the other side keeps the aspect.
 */
export function downscalePng(source: DecodedPng, max: number): DecodedPng {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  if (width === source.width && height === source.height) return source;

  const out = Buffer.alloc(width * height * 4);
  const sx = source.width / width;
  const sy = source.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const at = (yy * source.width + xx) * 4;
          const alpha = source.rgba[at + 3]!;
          r += source.rgba[at]! * alpha;
          g += source.rgba[at + 1]! * alpha;
          b += source.rgba[at + 2]! * alpha;
          a += alpha;
          n++;
        }
      }
      const at = (y * width + x) * 4;
      if (a > 0) {
        out[at] = Math.round(r / a);
        out[at + 1] = Math.round(g / a);
        out[at + 2] = Math.round(b / a);
        out[at + 3] = Math.round(a / n);
      }
    }
  }
  return { width, height, rgba: out };
}
