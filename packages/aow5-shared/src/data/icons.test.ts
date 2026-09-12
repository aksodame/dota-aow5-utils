import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The icons are extracted art, and extraction brings things along with it.
 *
 * Two item icons arrived carrying a two-megabyte XMP packet each — 99.4% of the
 * file was an `iTXt` chunk and 12 kB of it was the picture. The site did not
 * care: browsers skip what they do not understand and the tile drew. The social
 * card did: resvg's PNG decoder refused the file outright ("Failed to decode a
 * PNG image"), so those two items were a black square on every card they
 * appeared in, and nothing said why.
 *
 * This is the cheap guard against the next one. It is not a size limit on
 * artwork — `maps/M014.png` is legitimately 290 kB of painted scene — it is a
 * limit on *text* riding along inside a picture, which is never load-bearing
 * here and is where the weight came from.
 */

const ICONS = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'public', 'icons');

/** Every PNG under `public/icons`, as paths relative to it. */
function icons(dir = ''): string[] {
  return readdirSync(join(ICONS, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? icons(join(dir, entry.name))
      : entry.name.endsWith('.png')
        ? [join(dir, entry.name)]
        : [],
  );
}

/**
 * How many bytes of a PNG are text chunks.
 *
 * A PNG is an 8-byte signature and then a chain of `length | type | data | crc`.
 * Walking it needs no decoder, which is the point: this has to run over a
 * thousand files on every `pnpm test`.
 */
function textBytes(bytes: Buffer): number {
  let at = 8;
  let total = 0;
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const kind = bytes.toString('ascii', at + 4, at + 8);
    if (kind === 'iTXt' || kind === 'tEXt' || kind === 'zTXt') total += length;
    at += 12 + length;
    if (kind === 'IEND') break;
  }
  return total;
}

test('no icon smuggles a metadata packet in with the picture', () => {
  // Generous: a legitimate caption or colour-profile note is bytes, not
  // kilobytes, and the two that failed carried two million each.
  const LIMIT = 16 * 1024;
  const offenders = icons()
    .map((name) => ({ name, text: textBytes(readFileSync(join(ICONS, name))) }))
    .filter((icon) => icon.text > LIMIT);

  assert.deepEqual(
    offenders,
    [],
    `strip the text chunks: ${offenders.map((o) => `${o.name} (${o.text} bytes)`).join(', ')}`,
  );
});

test('every icon is a PNG that starts with a header', () => {
  // A truncated or half-written file is the other way an extraction goes wrong,
  // and it reads as the same black square.
  const broken = icons().filter((name) => {
    const head = readFileSync(join(ICONS, name)).subarray(0, 16);
    return head.length < 16 || head.toString('ascii', 1, 4) !== 'PNG' || head.toString('ascii', 12, 16) !== 'IHDR';
  });
  assert.deepEqual(broken, []);
});
