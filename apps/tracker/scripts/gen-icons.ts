import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the item art out of `aow5-shared` and into the renderer's static
 * directory, dropping every PNG chunk that is not pixels on the way.
 *
 * The icons used to be fetched from the deployed planner, which made them the
 * overlay's only outbound request and the only part of it that could fail on a
 * machine where everything else worked: a resolver that will not answer for the
 * art host leaves an app that is otherwise entirely local drawing broken-image
 * glyphs, and no amount of clearing a cache fixes a name that does not resolve.
 * The item *tables* were already bundled, so a new item has always meant a new
 * release — which is the whole staleness argument for keeping the art remote,
 * and it was never true. Now they ship together.
 *
 * ~19 MB of PNG for 1,052 files at 88x64, which is more than the pixels cost:
 * two of them (`disperser`, `phylactery`) carry a 2 MB `iTXt` of Photoshop XMP
 * apiece, and an `iCCP` profile rides along on most of the rest. Keeping only
 * the critical chunks is lossless — same pixels, same bytes of `IDAT` — and
 * takes the set to ~14 MB. Re-deflating `IDAT` on top of that wins 0.1 MB, so
 * this does not bother; going smaller than 14 MB means WebP, which means an
 * encoder in the build, and 14 MB against a 94 MB installer did not justify one.
 *
 * Run by `build` and `dev` (see package.json) rather than by hand, because the
 * output is generated and gitignored: a build that forgets it is a build with
 * no icons at all. It is incremental — an unchanged source file is left alone —
 * so the cost after the first run is a stat per icon.
 */

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolved through the package's exports map rather than a `../../` path, so
// the workspace can be rearranged without breaking the build — the same rule
// the renderer's import of the item tables follows.
const shared = path.join(path.dirname(require.resolve('aow5-shared/package.json')), 'public', 'icons');
const src = path.join(shared, 'items');
const out = path.join(root, 'public', 'icons', 'items');

/**
 * Everything a decoder needs and nothing it does not.
 *
 * `PLTE` and `tRNS` are here because a palettised icon is unopenable without
 * them; none of the current set is, and that is not a thing to encode as an
 * assumption about art somebody else generates. Colour-management chunks are
 * deliberately dropped: the overlay draws these at 16-42 px over its own dark
 * surface, and a per-file ICC profile costs 0.4 MB across the set to say what
 * sRGB says for free.
 */
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG with only its critical chunks, or the file untouched if it is not one. */
function strip(png: Buffer): Buffer {
  if (!png.subarray(0, 8).equals(SIGNATURE)) return png;

  // Annotated, not inferred: `subarray` hands back a Buffer over an
  // ArrayBufferLike, which does not fit an array shaped by `Buffer.from`.
  const chunks: Buffer[] = [SIGNATURE];
  let i = 8;
  // Each chunk is length(4) type(4) data(length) crc(4). Copied whole, CRC
  // included, so nothing here has to be able to compute one.
  while (i + 12 <= png.length) {
    const end = i + 12 + png.readUInt32BE(i);
    const type = png.toString('latin1', i + 4, i + 8);
    if (KEEP.has(type)) chunks.push(png.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(chunks);
}

/** Writes `to` from `from` unless it is already newer. Returns the bytes written, or null if skipped. */
function convert(from: string, to: string): number | null {
  const source = fs.statSync(from);
  const existing = fs.statSync(to, { throwIfNoEntry: false });
  if (existing && existing.mtimeMs >= source.mtimeMs) return null;

  const bytes = strip(fs.readFileSync(from));
  fs.writeFileSync(to, bytes);
  return bytes.length;
}

fs.mkdirSync(out, { recursive: true });

const icons = fs.readdirSync(src).filter((name) => name.endsWith('.png'));
let written = 0;
let bytes = 0;
for (const name of icons) {
  const size = convert(path.join(src, name), path.join(out, name));
  if (size !== null) {
    written++;
    bytes += size;
  }
}

/*
 * The unknown-id row asks for `placeholder.png`, and `items/` has never had
 * one — it lives a directory up, beside `abilities/` and `heroes/`. Remote,
 * that was a 404 drawn as a broken image and reported by nothing; here it is a
 * copy. `ItemTable.get` returns that row for any id the tables have never heard
 * of, which is exactly the case where the app should still look finished.
 */
const placeholder = convert(path.join(shared, 'placeholder.png'), path.join(out, 'placeholder.png'));
if (placeholder !== null) written++;

// The pak drops items, and `private/actualize.mjs` prunes the icons it orphans.
// Without this the copy keeps them forever, and a stale name is worse here than
// in the source tree: this directory is shipped.
const expected = new Set([...icons, 'placeholder.png']);
let pruned = 0;
for (const name of fs.readdirSync(out)) {
  if (expected.has(name)) continue;
  fs.rmSync(path.join(out, name));
  pruned++;
}

const total = fs.readdirSync(out).reduce((sum, name) => sum + fs.statSync(path.join(out, name)).size, 0);
const summary = written === 0 ? 'up to date' : `${written} written, ${(bytes / 1e6).toFixed(1)} MB`;
process.stdout.write(
  `icons: ${summary}${pruned ? `, ${pruned} pruned` : ''} — ${expected.size} files, ${(total / 1e6).toFixed(1)} MB total\n`,
);
