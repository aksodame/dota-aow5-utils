import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { Vpk } from './lib/vpk.ts';
import { readPngInfo } from './lib/png.ts';
import { decodeVtex, encodePng } from './lib/vtex.ts';
import { check, exitIfFailed, info, ok, step } from './lib/log.ts';

/**
 * Step 05b — the handful of images the site draws as its own chrome.
 *
 * Separate from step 05 because that step is manifest-driven: it walks every
 * item's `AbilityTextureName` and resolves each one, falling back to the CDN
 * for the stock Dota icons the addon only ships compiled. These have no table
 * to join to. They are named one at a time in the config, because "the coin
 * beside a price" is a decision about this site rather than a fact about the
 * game data.
 *
 * A source ending in `.png` is copied across byte for byte; a `.vtex_c` is
 * decoded. Which one an icon names is a real decision rather than a preference:
 * the flash3 PNGs have no alpha channel and the addon's DXT5 textures spend
 * theirs on luminance, so an icon that needs a transparent surround — the gold
 * coin does, it sits inline with text — has to come from the uncompressed
 * BGRA copy. See the note beside it in the config.
 */

ensureDirs();
const cfg = loadConfig();
step('05b · UI icons from VPK');

const wanted = Object.entries(cfg.uiIcons).filter(([name]) => !name.startsWith('_'));
check(wanted.length > 0, 'config lists at least one UI icon');

fs.mkdirSync(DIRS.publicIconUi, { recursive: true });

const written = new Set<string>();
const vpk = Vpk.open(cfg.vpkPath);

try {
  for (const [name, source] of wanted) {
    const entry = vpk.get(source);
    if (entry === undefined) {
      check(false, `${name}: ${source} is in the VPK`);
      continue;
    }

    const raw = vpk.read(entry);
    let bytes: Buffer;

    if (source.endsWith('.vtex_c')) {
      const decoded = decodeVtex(raw);
      if (!decoded.ok) {
        check(false, `${name}: ${source} decoded (${decoded.reason})`);
        continue;
      }
      bytes = encodePng(decoded.image);
    } else {
      bytes = raw;
    }

    // A PNG header is the cheapest proof that what came out is an image and
    // not, say, a KeyValues file that happens to end in `.png`.
    const png = readPngInfo(bytes);
    if (png === null) {
      check(false, `${name}: ${source} is a PNG`);
      continue;
    }

    const file = `${name}.png`;
    fs.writeFileSync(path.join(DIRS.publicIconUi, file), bytes);
    written.add(file);
    ok(`${file} — ${png.width}x${png.height}, ${bytes.length} bytes, from ${source.split('/').pop()}`);
  }
} finally {
  vpk.close();
}

// Anything a previous run left behind for an icon since dropped from the list.
for (const file of fs.readdirSync(DIRS.publicIconUi)) {
  if (file.endsWith('.png') && !written.has(file)) {
    fs.unlinkSync(path.join(DIRS.publicIconUi, file));
    info(`removed orphaned UI icon ${file}`);
  }
}

exitIfFailed();
ok(`${written.size} UI icon${written.size === 1 ? '' : 's'} written`);
