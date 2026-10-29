import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { findChild, parseKv } from './lib/kv.ts';
import { Vpk } from './lib/vpk.ts';
import { decodePng, downscalePng, readPngInfo } from './lib/png.ts';
import { encodePng, vtexToPng } from './lib/vtex.ts';
import { achievementIconName } from './lib/achievementIcon.ts';
import { check, exitIfFailed, info, ok, step, warn } from './lib/log.ts';

/**
 * Step 05c — the achievement art the calculator's cards show.
 *
 * The game's achievement page has no icon table: the HUD builds each texture
 * name from the stage's condition (see `lib/achievementIcon.ts`). This step
 * reads the same table and decodes only the textures those names point at —
 * one per level stage, one per boss series — into
 * `public/icons/achievements/`.
 *
 * The art is compiled as `PNG_RGBA8888`, which is an ordinary PNG embedded in
 * the vtex; `vtexToPng` cuts it out without re-encoding.
 */

ensureDirs();
const cfg = loadConfig();
step('05c · achievement icons from VPK');

const rawFile = path.join(DIRS.cacheRaw, path.basename(cfg.achievementsPath));
if (!fs.existsSync(rawFile)) {
  warn(`missing ${path.relative(DIRS.root, rawFile)}; run 02-extract-raw first`);
  process.exit(1);
}

const parsed = parseKv(fs.readFileSync(rawFile));
const content = findChild(parsed.root, 'CSVContent');
if (content === undefined) {
  warn('ak_achievement.txt has no CSVContent node');
  process.exit(1);
}

const wanted = new Set<string>();
for (const [id, row] of Object.entries(content)) {
  if (!id.startsWith('achievement_') || row === null || typeof row !== 'object') continue;
  const fields = row as Record<string, unknown>;
  const condition = typeof fields.condition === 'string' ? fields.condition : '';
  const stage = Number(fields.stage);
  if (!Number.isInteger(stage) || stage <= 0) {
    warn(`${id}: no stage, icon name cannot be derived`);
    continue;
  }
  wanted.add(achievementIconName(condition, stage));
}

check(wanted.size > 0, 'the achievement table names at least one icon');
fs.mkdirSync(DIRS.publicIconAchievements, { recursive: true });

const written = new Set<string>();
const vpk = Vpk.open(cfg.vpkPath);
try {
  for (const name of [...wanted].sort()) {
    const source = `${cfg.achievementIconDir}/${name}_png.vtex_c`;
    const entry = vpk.get(source);
    if (entry === undefined) {
      check(false, `${name}: ${source} is in the VPK`);
      continue;
    }
    const decoded = vtexToPng(vpk.read(entry));
    if (!decoded.ok) {
      check(false, `${name}: ${source} decoded (${decoded.reason})`);
      continue;
    }
    const pixels = decodePng(decoded.png);
    if (pixels === null) {
      check(false, `${name}: ${source} is an 8-bit RGBA PNG`);
      continue;
    }
    // The game's achievement art is 250–900 px; the card draws it at ~88 px.
    // A 128 px thumbnail keeps it crisp on a retina display and keeps the
    // committed icons from costing a dozen megabytes.
    const thumb = downscalePng(pixels, 128);
    const bytes = encodePng(thumb);
    const png = readPngInfo(bytes);
    if (png === null) {
      check(false, `${name}: ${source} produced a PNG`);
      continue;
    }
    const file = `${name}.png`;
    fs.writeFileSync(path.join(DIRS.publicIconAchievements, file), bytes);
    written.add(file);
    ok(`${file} — ${png.width}x${png.height}, ${bytes.length} bytes (from ${pixels.width}x${pixels.height})`);
  }
} finally {
  vpk.close();
}

for (const file of fs.readdirSync(DIRS.publicIconAchievements)) {
  if (file.endsWith('.png') && !written.has(file)) {
    fs.unlinkSync(path.join(DIRS.publicIconAchievements, file));
    info(`removed orphaned achievement icon ${file}`);
  }
}

exitIfFailed();
ok(`${written.size} achievement icon${written.size === 1 ? '' : 's'} written`);
