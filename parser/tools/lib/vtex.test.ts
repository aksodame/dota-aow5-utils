import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';
import { loadConfig } from './paths.ts';
import { Vpk } from './vpk.ts';
import { decodeDxt5, decodeVtex, encodePng } from './vtex.ts';

/**
 * The DXT5 decoder, against blocks built by hand.
 *
 * Worth pinning rather than eyeballing: a block-compression bug produces an
 * image that still looks like the original — right shapes, wrong colours — so
 * "it decoded" is not evidence that it decoded correctly.
 */

/** One 4x4 DXT5 block: two alpha endpoints, 48 index bits, then the DXT1 colour half. */
function block(options: {
  alpha0: number;
  alpha1: number;
  /** 3 bits per pixel, pixel 0 first. */
  alphaIndices: number[];
  colour0: number;
  colour1: number;
  /** 2 bits per pixel, pixel 0 first. */
  colourIndices: number[];
}): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = options.alpha0;
  buf[1] = options.alpha1;

  // 48 bits, little-endian, three per pixel. Written with BigInt so the top
  // bits are not silently lost the way a 32-bit shift would lose them.
  let bits = 0n;
  options.alphaIndices.forEach((value, i) => {
    bits |= BigInt(value & 7) << BigInt(i * 3);
  });
  for (let i = 0; i < 6; i += 1) buf[2 + i] = Number((bits >> BigInt(i * 8)) & 0xffn);

  buf.writeUInt16LE(options.colour0, 8);
  buf.writeUInt16LE(options.colour1, 10);
  let colour = 0;
  options.colourIndices.forEach((value, i) => {
    colour |= (value & 3) << (i * 2);
  });
  buf.writeUInt32LE(colour >>> 0, 12);
  return buf;
}

const WHITE_565 = 0xffff;
const BLACK_565 = 0x0000;
const RED_565 = 0xf800;
const BLUE_565 = 0x001f;

const pixel = (image: { width: number; rgba: Buffer }, x: number, y: number) => {
  const at = (y * image.width + x) * 4;
  return [image.rgba[at], image.rgba[at + 1], image.rgba[at + 2], image.rgba[at + 3]];
};

test('a fully opaque white block decodes to opaque white', () => {
  // The case the map textures were failing: alpha index 0 must select the
  // *first* endpoint, so a block saying 255 everywhere is fully opaque.
  const image = decodeDxt5(
    block({
      alpha0: 255,
      alpha1: 0,
      alphaIndices: new Array(16).fill(0),
      colour0: WHITE_565,
      colour1: BLACK_565,
      colourIndices: new Array(16).fill(0),
    }),
    4,
    4,
  );

  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      assert.deepEqual(pixel(image, x, y), [255, 255, 255, 255], `pixel ${x},${y}`);
    }
  }
});

test('5-6-5 white expands to 255 rather than to 248', () => {
  // Replicating the high bits into the low ones, not shifting. Getting this
  // wrong makes every bright image faintly grey.
  const image = decodeDxt5(
    block({
      alpha0: 255,
      alpha1: 255,
      alphaIndices: new Array(16).fill(0),
      colour0: WHITE_565,
      colour1: WHITE_565,
      colourIndices: new Array(16).fill(0),
    }),
    4,
    4,
  );
  assert.deepEqual(pixel(image, 0, 0).slice(0, 3), [255, 255, 255]);
});

test('the second colour endpoint is selected by index 1', () => {
  const image = decodeDxt5(
    block({
      alpha0: 255,
      alpha1: 255,
      alphaIndices: new Array(16).fill(0),
      colour0: RED_565,
      colour1: BLUE_565,
      colourIndices: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    }),
    4,
    4,
  );
  assert.deepEqual(pixel(image, 0, 0).slice(0, 3), [255, 0, 0], 'index 0 is colour0');
  assert.deepEqual(pixel(image, 1, 0).slice(0, 3), [0, 0, 255], 'index 1 is colour1');
});

test('every alpha index resolves, including the ones straddling the 32-bit boundary', () => {
  /*
   * Pixels 10 and 11 are the whole reason this is tested: their 3-bit indices
   * start at bit 30 and bit 33, so one spans the halves the decoder reads
   * separately and the other is the first of the high half. An off-by-one here
   * garbles a quarter of every block's transparency.
   */
  const image = decodeDxt5(
    block({
      alpha0: 255,
      alpha1: 0,
      // Index 0 -> 255, index 1 -> 0, and 2..7 interpolate between them.
      alphaIndices: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      colour0: WHITE_565,
      colour1: WHITE_565,
      colourIndices: new Array(16).fill(0),
    }),
    4,
    4,
  );

  for (let p = 0; p < 16; p += 1) {
    const expected = p % 2 === 0 ? 255 : 0;
    assert.equal(pixel(image, p % 4, Math.floor(p / 4))[3], expected, `alpha of pixel ${p}`);
  }
});

test('the six-value alpha mode reserves 0 and 255 for its last two indices', () => {
  const image = decodeDxt5(
    block({
      alpha0: 10,
      alpha1: 200, // alpha0 <= alpha1 selects the six-value mode
      alphaIndices: [0, 1, 6, 7, ...new Array(12).fill(0)],
      colour0: WHITE_565,
      colour1: WHITE_565,
      colourIndices: new Array(16).fill(0),
    }),
    4,
    4,
  );
  assert.equal(pixel(image, 0, 0)[3], 10);
  assert.equal(pixel(image, 1, 0)[3], 200);
  assert.equal(pixel(image, 2, 0)[3], 0, 'index 6 is transparent');
  assert.equal(pixel(image, 3, 0)[3], 255, 'index 7 is opaque');
});

test('an image whose size is not a multiple of four keeps its edge pixels', () => {
  const image = decodeDxt5(
    block({
      alpha0: 255,
      alpha1: 255,
      alphaIndices: new Array(16).fill(0),
      colour0: RED_565,
      colour1: RED_565,
      colourIndices: new Array(16).fill(0),
    }),
    3,
    2,
  );
  assert.equal(image.rgba.length, 3 * 2 * 4);
  assert.deepEqual(pixel(image, 2, 1), [255, 0, 0, 255]);
});

test('the PNG encoder produces something that starts like a PNG and states its size', () => {
  const png = encodePng({ width: 4, height: 4, rgba: Buffer.alloc(4 * 4 * 4, 0x7f) });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.readUInt32BE(16), 4);
  assert.equal(png.readUInt32BE(20), 4);
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
});

// --- the golden fixture ------------------------------------------------------

/** Minimal PNG reader: 8-bit RGB or RGBA, non-interlaced. Enough for the fixture. */
function readPng(buf: Buffer): { width: number; height: number; rgba: Buffer } {
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString('ascii');
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const colourType = body[9]!;
      channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
      assert.notEqual(channels, 0, `PNG colour type ${colourType} is not handled here`);
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4, 255);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let value = line[i]!;
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = value & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst] = line[src]!;
      out[dst + 1] = line[src + 1]!;
      out[dst + 2] = line[src + 2]!;
      out[dst + 3] = channels === 4 ? line[src + 3]! : 255;
    }
    line.copy(prev);
  }
  return { width, height, rgba: out };
}

/**
 * `gold` is the one image this addon ships both as a compiled texture and as a
 * plain PNG, which makes it the only ground truth available for the whole
 * decode path — block layout, YCoCg transform and all.
 *
 * Skipped rather than failed when the VPK is absent: this file is committed and
 * CI has no Steam install.
 */
const vpkAvailable = (() => {
  try {
    return fs.existsSync(loadConfig().vpkPath);
  } catch {
    return false;
  }
})();

test('the decoded gold coin matches the PNG the addon ships beside it', { skip: !vpkAvailable }, () => {
  const vpk = Vpk.open(loadConfig().vpkPath);
  try {
    const truth = readPng(vpk.read(vpk.require('resource/flash3/images/items/gold.png')));
    const result = decodeVtex(vpk.read(vpk.require('panorama/images/custom_game/items/gold_png.vtex_c')));
    assert.ok(result.ok, result.ok ? '' : result.reason);
    if (!result.ok) return;

    const mine = result.image;
    assert.equal(mine.width, truth.width);
    assert.equal(mine.height, truth.height);

    /*
     * A tolerance, not equality. DXT5 is lossy and the PNG is the uncompressed
     * source, so a few points of drift per channel is the compression rather
     * than a bug — but a wrong transform is off by tens, and a dead channel by
     * a hundred, which is what this catches.
     */
    let total = 0;
    let bad = 0;
    const samples = truth.width * truth.height * 3;
    for (let i = 0; i < truth.rgba.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        const delta = Math.abs(truth.rgba[i + c]! - mine.rgba[i + c]!);
        total += delta;
        if (delta > 40) bad += 1;
      }
    }

    /*
     * The mean is the assertion that matters. A wrong transform moves it into
     * the tens and a dead channel into the eighties, where lossy compression
     * of a small sharp-edged icon lands around five.
     *
     * Individual pixels are not asserted at all: a single block straddling the
     * coin's outline can be off by ninety and be perfectly correct DXT5. What
     * is bounded instead is how *many* pixels are far out, which stays tiny for
     * a good decode and covers most of the image for a bad one.
     */
    const mean = total / samples;
    assert.ok(mean < 8, `mean channel error ${mean.toFixed(1)} is too high — the colour transform is wrong`);
    assert.ok(bad / samples < 0.02, `${((bad / samples) * 100).toFixed(1)}% of channels are far from the source`);

    // And the blue channel must actually carry something. Decoding YCoCg as
    // plain RGB leaves it flat zero, which is the bug this whole file exists for.
    let blueSpread = 0;
    for (let i = 2; i < mine.rgba.length; i += 4) blueSpread = Math.max(blueSpread, mine.rgba[i]!);
    assert.ok(blueSpread > 40, `blue never exceeds ${blueSpread}; the YCoCg transform did not run`);
  } finally {
    vpk.close();
  }
});

test('the BGRA copy of the same coin decodes, and keeps its transparency', { skip: !vpkAvailable }, () => {
  const vpk = Vpk.open(loadConfig().vpkPath);
  try {
    /*
     * The addon ships this coin three times: flash3 as an opaque PNG, a DXT5
     * texture beside the items, and this uncompressed BGRA one. Only the last
     * has an alpha channel — the DXT5 packing spends alpha on luminance, and
     * the flash3 file has no alpha channel at all — so this is the copy the
     * site draws, and "is it actually transparent" is the property worth
     * pinning. It was not, and the coin rendered as a black rectangle.
     */
    const result = decodeVtex(vpk.read(vpk.require('panorama/images/custom_game/asset/gold_png.vtex_c')));
    assert.ok(result.ok, result.ok ? '' : result.reason);
    if (!result.ok) return;

    const { width, height, rgba } = result.image;
    assert.equal(width, 64);
    assert.equal(height, 64);

    let clear = 0;
    let opaque = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] === 0) clear += 1;
      else if (rgba[i] === 255) opaque += 1;
    }

    // A quarter of the image is the transparent surround. An opaque decode —
    // which is what every other copy of this art gives — has `clear` at zero.
    assert.ok(clear > 500, `only ${clear} fully transparent pixels`);
    assert.ok(opaque > 1000, `only ${opaque} fully opaque pixels`);

    // Every corner is outside the coin, and a round coin in a square box means
    // all four. This is the check that would fail on a channel-order mistake
    // reading alpha out of the blue byte.
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ]) {
      assert.equal(rgba[(y! * width + x!) * 4 + 3], 0, `corner ${x},${y} is not transparent`);
    }

    // The middle is the coin's own gold, in RGB order. Read as BGRA it would
    // come out blue, which is the other half of a channel-order mistake.
    const centre = ((height / 2) * width + width / 2) * 4;
    assert.ok(rgba[centre]! > 200, `red ${rgba[centre]}`);
    assert.ok(rgba[centre + 1]! > 150, `green ${rgba[centre + 1]}`);
    assert.ok(rgba[centre + 2]! < 120, `blue ${rgba[centre + 2]}`);
  } finally {
    vpk.close();
  }
});

