import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { Vpk } from './lib/vpk.ts';
import { readPngInfo } from './lib/png.ts';
import { vtexToPng } from './lib/vtex.ts';
import { writeJsonPretty } from './lib/writeJson.ts';
import { check, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import type { ItemFull } from '../../packages/aow5-shared/src/types/items.ts';
import type { AbilityFull, HeroInfo } from '../../packages/aow5-shared/src/types/heroes.ts';

/**
 * Step 05 — resolve each item's AbilityTextureName to a PNG.
 *
 * The addon ships most of its icons as real PNGs under resource/flash3, which
 * we can copy straight out. The rest point at compiled `.vtex_c` textures that
 * are re-imported stock Dota icons; those are queued for step 06 to fetch from
 * Valve's CDN, since nothing on a normal machine can decompile a vtex.
 */

export interface IconRecord {
  /** Texture name with the leading `item_` stripped. */
  short: string;
  /** Every AbilityTextureName that resolves to this icon. */
  textures: string[];
  source: 'vpk' | 'cdn' | 'placeholder';
  file: string;
  /** VPK path the bytes came from, or the CDN URL. */
  origin?: string;
  bytes?: number;
  w?: number;
  h?: number;
  sha1?: string;
  url?: string;
  status?: string;
}

/** A spell or hero portrait still needing the CDN, for step 06. */
export interface PendingHeroIcon {
  kind: 'ability' | 'hero';
  short: string;
  textures: string[];
}

export const HERO_ICON_MANIFEST = 'hero-icons.manifest.json';
export const HERO_ICON_PENDING = 'hero-icons.pending.json';

ensureDirs();
const cfg = loadConfig();
step('05 · icons from VPK');

const items = JSON.parse(fs.readFileSync(path.join(DIRS.cache, 'items.normalized.json'), 'utf8')) as Record<
  string,
  ItemFull
>;

const textures = [...new Set(Object.values(items).map((i) => i.texture).filter(Boolean))].sort();
info(`${textures.length} distinct AbilityTextureName values`);

const manifestPath = path.join(DIRS.reports, 'icons.manifest.json');
const previous: Record<string, IconRecord> = fs.existsSync(manifestPath)
  ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8') as string) as Record<string, IconRecord>)
  : {};

const manifest: Record<string, IconRecord> = {};
const pending: string[] = [];
const collisions: string[] = [];
/** output filename -> VPK path it was written from, for the collision guard. */
const fileOrigin = new Map<string, string>();

const vpk = Vpk.open(cfg.vpkPath);
try {
  let fromVpk = 0;
  let unstripped = 0;
  let aliased = 0;

  for (const texture of textures) {
    const short = texture.replace(/^item_/, '');
    const file = `${short}.png`;

    // Try the stripped name first, then the raw texture name: a handful of
    // icons are stored with the `item_` prefix intact.
    const candidates = [`${cfg.flash3IconDir}/${short}.png`, `${cfg.flash3IconDir}/${texture}.png`];
    let found: Buffer | null = null;
    let origin = '';
    let usedUnstripped = false;
    for (let ci = 0; ci < candidates.length; ci++) {
      const entry = vpk.get(candidates[ci]!);
      if (!entry) continue;
      found = vpk.read(entry);
      origin = candidates[ci]!;
      usedUnstripped = ci === 1;
      break;
    }

    if (!found) {
      pending.push(texture);
      continue;
    }

    const png = readPngInfo(found);
    if (!png) {
      warn(`${texture}: flash3 entry is not a valid PNG; queued for CDN`);
      pending.push(texture);
      continue;
    }

    // Several items name the same art with and without the `item_` prefix
    // (e.g. `icon_35` and `item_icon_35`), which strips to one filename. That
    // is a harmless alias as long as both resolve to the same VPK entry;
    // two *different* sources writing one file would silently lose art.
    const existingOrigin = fileOrigin.get(file);
    if (existingOrigin !== undefined) {
      if (existingOrigin === origin) {
        manifest[short]!.textures.push(texture);
        aliased++;
      } else {
        collisions.push(`${file}: ${existingOrigin} vs ${origin}`);
      }
      continue;
    }
    fileOrigin.set(file, origin);

    fs.writeFileSync(path.join(DIRS.publicIconItems, file), found);
    manifest[short] = {
      short,
      textures: [texture],
      source: 'vpk',
      file,
      origin,
      bytes: found.length,
      w: png.width,
      h: png.height,
      sha1: crypto.createHash('sha1').update(found).digest('hex'),
    };
    fromVpk++;
    if (usedUnstripped) unstripped++;
  }

  ok(`${fromVpk} icon(s) extracted from the VPK${unstripped > 0 ? ` (${unstripped} via unstripped name)` : ''}`);
  if (aliased > 0) info(`${aliased} texture name(s) aliased onto an already-extracted icon`);
  info(`${pending.length} texture(s) need the CDN (compiled vtex_c or stock Dota art)`);
} finally {
  vpk.close();
}

check(collisions.length === 0, `icon filename collisions: ${collisions.length}`);
for (const c of collisions) warn(c);

// Carry forward anything step 06 already downloaded so re-runs stay offline.
let reused = 0;
for (const texture of pending) {
  const short = texture.replace(/^item_/, '');
  const prev = previous[short];
  if (prev && prev.source !== 'vpk' && fs.existsSync(path.join(DIRS.publicIconItems, prev.file))) {
    manifest[short] = prev;
    reused++;
  }
}
if (reused > 0) info(`${reused} previously fetched CDN icon(s) carried over`);

writeJsonPretty(manifestPath, manifest);
writeJsonPretty(path.join(DIRS.cache, 'icons.pending.json'), pending);
ok(`wrote reports/icons.manifest.json (${Object.keys(manifest).length} entries)`);

// --- spell and hero icons ---------------------------------------------------
// Spell art comes from three places, in order of precedence:
//
//   1. assets/ability-icons/, for the handful Valve publishes nowhere and that
//      no stock icon honestly stands in for. Hand-supplied, so it wins.
//   2. the addon's own resource/flash3/images/spellicons, real PNGs.
//   3. the addon's panorama/images/spellicons, compiled textures. Dragon
//      Knight's kit (S3) ships only here, under its full texture path.
//   4. Valve's CDN via step 06, which serves stock art byte-identical to the
//      game's own texture — verified against an uncompressed one in pak01.
//
// Hero portraits are always stock, so they are queued for step 06 outright.
//
// Ability textures may carry a path (`drow_ranger/immortal_gold/foo`), so the
// basename is the key — both the VPK lookup and the CDN answer to that.

const PANORAMA_SPELLICONS = 'panorama/images/spellicons';
const heroesFile = path.join(DIRS.cache, 'heroes.normalized.json');
if (!fs.existsSync(heroesFile)) {
  warn('no cache/heroes.normalized.json; run 04b-build-heroes first (skipping spell icons)');
} else {
  const heroData = JSON.parse(fs.readFileSync(heroesFile, 'utf8')) as {
    heroes: HeroInfo[];
    abilities: Record<string, AbilityFull>;
  };

  const heroManifestPath = path.join(DIRS.reports, HERO_ICON_MANIFEST);
  const previousHero: Record<string, IconRecord> = fs.existsSync(heroManifestPath)
    ? (JSON.parse(fs.readFileSync(heroManifestPath, 'utf8')) as Record<string, IconRecord>)
    : {};

  const heroManifest: Record<string, IconRecord> = {};
  const heroPending: PendingHeroIcon[] = [];

  const abilityTextures = new Map<string, string[]>();
  for (const ability of Object.values(heroData.abilities)) {
    if (!ability.texture) continue;
    const short = ability.texture.split('/').pop() ?? ability.texture;
    const list = abilityTextures.get(short);
    if (list) list.push(ability.texture);
    else abilityTextures.set(short, [ability.texture]);
  }

  const vpkSpells = Vpk.open(cfg.vpkPath);
  let fromSpellDir = 0;
  let fromAssets = 0;
  let fromPanorama = 0;
  try {
    for (const short of [...abilityTextures.keys()].sort()) {
      const textures = [...new Set(abilityTextures.get(short)!)].sort();

      // Hand-supplied art wins over everything. Keyed on the full texture name,
      // since that is what makes a cosmetic variant distinct from its stock one.
      const overrideName = textures.map((t) => cfg.abilityIconOverrides[t]).find(Boolean);
      if (overrideName) {
        const src = path.join(DIRS.assetIcons, overrideName);
        if (!fs.existsSync(src)) {
          check(false, `ability icon override missing: assets/ability-icons/${overrideName}`);
        } else {
          const buf = fs.readFileSync(src);
          const png = readPngInfo(buf);
          if (!png) {
            check(false, `ability icon override is not a valid PNG: ${overrideName}`);
          } else {
            fs.writeFileSync(path.join(DIRS.publicIconAbilities, `${short}.png`), buf);
            heroManifest[`ability:${short}`] = {
              short,
              textures,
              source: 'vpk',
              file: `${short}.png`,
              origin: `assets/ability-icons/${overrideName}`,
              bytes: buf.length,
              w: png.width,
              h: png.height,
              sha1: crypto.createHash('sha1').update(buf).digest('hex'),
            };
            fromAssets++;
            continue;
          }
        }
      }

      const entry = vpkSpells.get(`${cfg.spellIconDir}/${short}.png`);
      if (!entry) {
        const pano = textures
          .map((t) => `${PANORAMA_SPELLICONS}/${t}_png.vtex_c`)
          .find((p) => vpkSpells.get(p) !== undefined);
        const decoded = pano === undefined ? undefined : vtexToPng(vpkSpells.read(vpkSpells.get(pano)!));
        if (decoded === undefined || !decoded.ok) {
          if (decoded !== undefined && !decoded.ok) warn(`${pano}: ${decoded.reason}; queued for CDN`);
          heroPending.push({ kind: 'ability', short, textures });
          continue;
        }
        const png = readPngInfo(decoded.png)!;
        fs.writeFileSync(path.join(DIRS.publicIconAbilities, `${short}.png`), decoded.png);
        heroManifest[`ability:${short}`] = {
          short,
          textures,
          source: 'vpk',
          file: `${short}.png`,
          origin: pano!,
          bytes: decoded.png.length,
          w: png.width,
          h: png.height,
          sha1: crypto.createHash('sha1').update(decoded.png).digest('hex'),
        };
        fromPanorama++;
        continue;
      }
      const buf = vpkSpells.read(entry);
      const png = readPngInfo(buf);
      if (!png) {
        warn(`${short}: spellicons entry is not a valid PNG; queued for CDN`);
        heroPending.push({ kind: 'ability', short, textures });
        continue;
      }
      fs.writeFileSync(path.join(DIRS.publicIconAbilities, `${short}.png`), buf);
      heroManifest[`ability:${short}`] = {
        short,
        textures,
        source: 'vpk',
        file: `${short}.png`,
        origin: `${cfg.spellIconDir}/${short}.png`,
        bytes: buf.length,
        w: png.width,
        h: png.height,
        sha1: crypto.createHash('sha1').update(buf).digest('hex'),
      };
      fromSpellDir++;
    }
  } finally {
    vpkSpells.close();
  }

  for (const hero of heroData.heroes) {
    heroPending.push({ kind: 'hero', short: hero.short, textures: [hero.id] });
  }


  // Carry forward anything step 06 already downloaded so re-runs stay offline.
  let heroReused = 0;
  for (const item of heroPending) {
    const key = `${item.kind}:${item.short}`;
    const prev = previousHero[key];
    const dir = item.kind === 'hero' ? DIRS.publicIconHeroes : DIRS.publicIconAbilities;
    if (prev && prev.source !== 'vpk' && fs.existsSync(path.join(dir, prev.file))) {
      heroManifest[key] = prev;
      heroReused++;
    }
  }

  ok(`${fromSpellDir} spell icon(s) from the addon, ${fromPanorama} compiled, ${fromAssets} from assets/ability-icons`);
  info(
    `${heroPending.filter((x) => x.kind === 'ability').length} spell icon(s) and ` +
      `${heroData.heroes.length} hero portrait(s) need the CDN` +
      (heroReused > 0 ? `; ${heroReused} carried over from a previous fetch` : ''),
  );

  writeJsonPretty(heroManifestPath, heroManifest);
  writeJsonPretty(path.join(DIRS.cache, HERO_ICON_PENDING), heroPending);
}

exitIfFailed();
