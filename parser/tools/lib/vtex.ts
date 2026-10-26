import zlib from 'node:zlib';
import { readPngInfo, stripTextChunks } from './png.ts';

/**
 * Just enough of Source 2's compiled-texture format to get the map art out.
 *
 * The pipeline's standing position is that a `.vtex_c` cannot be decompiled on
 * a normal machine, which is why stock item icons are fetched from Valve's CDN
 * instead (see step 05). That is true of the general case — a vtex can be BC6H
 * or BC7, carry a compressed mip chain, and reference an entire material
 * system. It is not true of the fifteen map images, which are single-mip,
 * uncompressed **DXT5** and sit at a fixed offset. Those are about a hundred
 * lines of block decoding, and there is no CDN to fetch them from: they are the
 * addon's own art, not Valve's.
 *
 * So this handles exactly what the map images are and refuses everything else
 * by name, rather than pretending to be a texture library.
 *
 * ## The colour is YCoCg, not RGB
 *
 * The addon compiles its Panorama textures as **DXT5-YCoCg**, which is not
 * something the header announces — the format byte just says DXT5. In that
 * packing the block's alpha channel carries *luminance* and the colour half
 * carries two chroma axes, with blue unused:
 *
 *     R = Co + 128    G = Cg + 128    B = 0    A = Y
 *
 * Decoding it as ordinary DXT5 produces an image with the right shapes, a dead
 * blue channel, and luminance mistaken for transparency — which reads as a
 * washed-out overlay rather than as a bug, and is exactly how this was nearly
 * shipped. `vtex.test.ts` pins the transform against `gold.png`, the one image
 * this addon ships both as a compiled texture and as a plain PNG.
 */

/**
 * Source 2's `VTexFormat`, by the byte in the vtex header.
 *
 * The whole enum rather than the handful that get decoded, so an unsupported
 * texture is *reported* by name — "format BC7 is not supported here" sends the
 * next person somewhere; "unknown(20)" does not.
 *
 * Transcribed rather than guessed, after an abbreviated version of this table
 * had 24 down as BGRA8888. It is ETC2_EAC; BGRA8888 is 28, and the addon's
 * plain-coin icon is one — so the mislabel meant a texture that decodes fine
 * was reported as an unknown format.
 */
const FORMATS: Record<number, string> = {
  0: 'UNKNOWN',
  1: 'DXT1',
  2: 'DXT5',
  3: 'I8',
  4: 'RGBA8888',
  5: 'R16',
  6: 'RG1616',
  7: 'RGBA16161616',
  8: 'R16F',
  9: 'RG1616F',
  10: 'RGBA16161616F',
  11: 'R32F',
  12: 'RG3232F',
  13: 'RGB323232F',
  14: 'RGBA32323232F',
  15: 'JPEG_RGBA8888',
  16: 'PNG_RGBA8888',
  17: 'JPEG_DXT5',
  18: 'PNG_DXT5',
  19: 'BC6H',
  20: 'BC7',
  21: 'ATI2N',
  22: 'IA88',
  23: 'ETC2',
  24: 'ETC2_EAC',
  25: 'R11_EAC',
  26: 'RG11_EAC',
  27: 'ATI1N',
  28: 'BGRA8888',
};

export const FORMAT_DXT5 = 2;
/**
 * Uncompressed, and the only format here that carries real transparency.
 *
 * The addon's DXT5 textures spend their alpha channel on luminance (see the
 * YCoCg note above), so a DXT5 icon can only ever come out opaque — which is
 * why the gold coin, which needs a transparent surround, is taken from the
 * BGRA copy the addon also ships rather than from the DXT5 one beside it.
 */
export const FORMAT_BGRA8888 = 28;

export interface VtexInfo {
  width: number;
  height: number;
  depth: number;
  format: number;
  formatName: string;
  mipCount: number;
  /** Where the pixel data starts. The resource header's own length. */
  dataOffset: number;
}

/**
 * Reads the header without decoding anything.
 *
 * The first uint32 of a Source 2 resource is the header length, and for these
 * single-mip textures the image data begins exactly there — which is why this
 * needs no block walking beyond finding DATA.
 */
export function readVtexInfo(buf: Buffer): VtexInfo | null {
  if (buf.length < 32) return null;

  const headerLength = buf.readUInt32LE(0);
  const blockOffset = buf.readUInt32LE(8);
  const blockCount = buf.readUInt32LE(12);
  if (blockCount === 0 || blockCount > 16) return null;

  let dataStart = -1;
  for (let i = 0; i < blockCount; i += 1) {
    const at = 8 + blockOffset + i * 12;
    if (at + 12 > buf.length) return null;
    if (buf.subarray(at, at + 4).toString('ascii') === 'DATA') {
      dataStart = at + 4 + buf.readUInt32LE(at + 4);
    }
  }
  if (dataStart < 0 || dataStart + 28 > buf.length) return null;

  const format = buf.readUInt8(dataStart + 26);
  return {
    width: buf.readUInt16LE(dataStart + 20),
    height: buf.readUInt16LE(dataStart + 22),
    depth: buf.readUInt16LE(dataStart + 24),
    format,
    formatName: FORMATS[format] ?? `unknown(${format})`,
    mipCount: buf.readUInt8(dataStart + 27),
    dataOffset: headerLength,
  };
}

/**
 * Converts a YCoCg-packed block result to RGB in place.
 *
 * Standard YCoCg with the chroma axes centred on 128 and no scale factor —
 * the scale slot (blue) is zero in every texture this addon ships, which is
 * what the golden fixture confirms.
 *
 * Alpha becomes opaque, because in this packing there is no alpha: what was in
 * that channel was the luminance this function has just consumed.
 */
function ycocgToRgb(rgba: Buffer): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const y = rgba[i + 3]!;
    const co = rgba[i]! - 128;
    const cg = rgba[i + 1]! - 128;
    rgba[i] = clamp(y + co - cg);
    rgba[i + 1] = clamp(y + cg);
    rgba[i + 2] = clamp(y - co - cg);
    rgba[i + 3] = 255;
  }
}

const clamp = (value: number): number => (value < 0 ? 0 : value > 255 ? 255 : value);

/** RGBA bytes, row-major, top-left origin. */
export interface Decoded {
  width: number;
  height: number;
  rgba: Buffer;
}

/**
 * Expands a 5-6-5 colour into 8-bit RGB.
 *
 * Replicating the high bits into the low ones rather than shifting, so pure
 * white stays 255 instead of becoming 248.
 */
function rgb565(value: number): [number, number, number] {
  const r = (value >> 11) & 0x1f;
  const g = (value >> 5) & 0x3f;
  const b = value & 0x1f;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

/**
 * Decodes DXT5 (BC3): a 16-bit interpolated alpha block, then a DXT1 colour
 * block, per 4x4 pixels.
 *
 * DXT5's colour block never uses the 3-colour+transparent mode that DXT1 has —
 * alpha lives in its own block — so the c0 > c1 test is not performed and the
 * four-colour interpolation is unconditional.
 */
export function decodeDxt5(data: Buffer, width: number, height: number): Decoded {
  const rgba = Buffer.alloc(width * height * 4);
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);

  const alpha = new Uint8Array(8);
  const red = new Uint8Array(4);
  const green = new Uint8Array(4);
  const blue = new Uint8Array(4);

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const at = (by * blocksX + bx) * 16;
      if (at + 16 > data.length) break;

      // --- alpha: two endpoints and a 3-bit index per pixel ---
      alpha[0] = data[at]!;
      alpha[1] = data[at + 1]!;
      if (alpha[0]! > alpha[1]!) {
        for (let i = 1; i < 7; i += 1) {
          alpha[i + 1] = Math.round(((7 - i) * alpha[0]! + i * alpha[1]!) / 7);
        }
      } else {
        for (let i = 1; i < 5; i += 1) {
          alpha[i + 1] = Math.round(((5 - i) * alpha[0]! + i * alpha[1]!) / 5);
        }
        alpha[6] = 0;
        alpha[7] = 255;
      }

      // The 48 index bits, as one number. Split in two because 48 bits does not
      // fit in a JavaScript bitwise operand.
      const alphaLow = data.readUInt32LE(at + 2);
      const alphaHigh = data.readUInt16LE(at + 6);

      // --- colour: two 5-6-5 endpoints and a 2-bit index per pixel ---
      const c0 = data.readUInt16LE(at + 8);
      const c1 = data.readUInt16LE(at + 10);
      const [r0, g0, b0] = rgb565(c0);
      const [r1, g1, b1] = rgb565(c1);
      red[0] = r0; green[0] = g0; blue[0] = b0;
      red[1] = r1; green[1] = g1; blue[1] = b1;
      red[2] = Math.round((2 * r0 + r1) / 3);
      green[2] = Math.round((2 * g0 + g1) / 3);
      blue[2] = Math.round((2 * b0 + b1) / 3);
      red[3] = Math.round((r0 + 2 * r1) / 3);
      green[3] = Math.round((g0 + 2 * g1) / 3);
      blue[3] = Math.round((b0 + 2 * b1) / 3);

      const colourBits = data.readUInt32LE(at + 12);

      for (let py = 0; py < 4; py += 1) {
        for (let px = 0; px < 4; px += 1) {
          const x = bx * 4 + px;
          const y = by * 4 + py;
          if (x >= width || y >= height) continue;

          const pixel = py * 4 + px;
          const alphaBit = pixel * 3;
          const alphaIndex =
            alphaBit < 30
              ? (alphaLow >>> alphaBit) & 7
              : alphaBit === 30
                ? ((alphaLow >>> 30) & 3) | ((alphaHigh & 1) << 2)
                : (alphaHigh >>> (alphaBit - 32)) & 7;

          const colourIndex = (colourBits >>> (pixel * 2)) & 3;
          const out = (y * width + x) * 4;
          rgba[out] = red[colourIndex]!;
          rgba[out + 1] = green[colourIndex]!;
          rgba[out + 2] = blue[colourIndex]!;
          rgba[out + 3] = alpha[alphaIndex]!;
        }
      }
    }
  }

  return { width, height, rgba };
}

/**
 * Decodes a whole vtex, or explains why it will not.
 *
 * Only single-mip DXT5 is supported, which is what the map images are. Anything
 * else is reported by format name rather than guessed at — a wrong guess here
 * would produce a plausible-looking image made of noise.
 */
export interface DecodeOptions {
  /**
   * Treat the colour as YCoCg. True by default, because every texture this
   * addon compiles is packed that way; pass false for a texture known to hold
   * ordinary RGB.
   */
  ycocg?: boolean;
}

export function decodeVtex(
  buf: Buffer,
  options: DecodeOptions = {},
): { ok: true; image: Decoded } | { ok: false; reason: string } {
  const info = readVtexInfo(buf);
  if (info === null) return { ok: false, reason: 'not a readable vtex resource' };
  if (info.format !== FORMAT_DXT5 && info.format !== FORMAT_BGRA8888) {
    return { ok: false, reason: `format ${info.formatName} is not supported here` };
  }
  if (info.depth !== 1) return { ok: false, reason: `depth ${info.depth} is not a 2D texture` };
  if (info.width === 0 || info.height === 0) return { ok: false, reason: 'zero-sized texture' };

  /*
   * BGRA8888 is four bytes a pixel in the other channel order, and nothing
   * else: no blocks, no YCoCg, and a genuine alpha channel. Same "image is the
   * tail of the file" rule as below, and the same length check for the same
   * reason.
   */
  if (info.format === FORMAT_BGRA8888) {
    const size = info.width * info.height * 4;
    if (buf.length - info.dataOffset < size) {
      return { ok: false, reason: `image data is ${buf.length - info.dataOffset} bytes, short of ${size}` };
    }
    const src = buf.subarray(buf.length - size);
    const rgba = Buffer.alloc(size);
    for (let i = 0; i < size; i += 4) {
      rgba[i] = src[i + 2]!;
      rgba[i + 1] = src[i + 1]!;
      rgba[i + 2] = src[i]!;
      rgba[i + 3] = src[i + 3]!;
    }
    return { ok: true, image: { width: info.width, height: info.height, rgba } };
  }

  /*
   * The image is the tail of the file. Checked rather than assumed: a mip chain
   * or a compressed-mip extra-data section would make the tail smaller than one
   * full-size level, and decoding it anyway would produce a torn image rather
   * than an error.
   */
  const expected = Math.ceil(info.width / 4) * Math.ceil(info.height / 4) * 16;
  const available = buf.length - info.dataOffset;
  if (available < expected) {
    return { ok: false, reason: `image data is ${available} bytes, short of the ${expected} one mip needs` };
  }

  const image = decodeDxt5(buf.subarray(buf.length - expected), info.width, info.height);
  if (options.ycocg !== false) ycocgToRgb(image.rgba);
  return { ok: true, image };
}

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/**
 * Writes 8-bit RGBA as a PNG.
 *
 * Filter type 0 on every row — none of these images is large enough for a
 * smarter filter to be worth the code, and zlib at level 9 does the work.
 */
export function encodePng({ width, height, rgba }: Decoded): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A compiled texture as a PNG. Panorama art is often compiled as
 * `PNG_RGBA8888`, which is not pixels at all: the resource carries the original
 * PNG file whole, after its header. That is cut out as-is (minus text chunks);
 * the block formats go through {@link decodeVtex}.
 */
export function vtexToPng(buf: Buffer): { ok: true; png: Buffer } | { ok: false; reason: string } {
  const info = readVtexInfo(buf);
  if (info?.formatName === 'PNG_RGBA8888') {
    const start = buf.indexOf(PNG_MAGIC);
    const iend = buf.lastIndexOf(Buffer.from('IEND', 'latin1'));
    if (start < 0 || iend < start) return { ok: false, reason: 'PNG_RGBA8888 resource carries no PNG' };
    const png = stripTextChunks(buf.subarray(start, iend + 8));
    if (!readPngInfo(png)) return { ok: false, reason: 'embedded PNG does not parse' };
    return { ok: true, png };
  }
  const decoded = decodeVtex(buf);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };
  return { ok: true, png: encodePng(decoded.image) };
}
