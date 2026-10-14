import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { readPngInfo, stripTextChunks } from './lib/png.ts';
import { writeJsonPretty } from './lib/writeJson.ts';
import { exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import {
  HERO_ICON_MANIFEST,
  HERO_ICON_PENDING,
  type IconRecord,
  type PendingHeroIcon,
} from './05-icons-vpk.ts';

/**
 * Step 06 — fetch the icons the addon does not ship as PNGs.
 *
 * These reference compiled `.vtex_c` textures that are re-imported stock Dota
 * art. Rather than decompiling a Source 2 texture, we pull the same icon from
 * Valve's public CDN by name. Results are recorded in the manifest with their
 * sha1, so this step only touches the network the first time — afterwards the
 * committed PNGs satisfy it offline.
 *
 * Pass --offline to skip the network entirely and fail only on genuinely
 * missing files.
 */

const OFFLINE = process.argv.includes('--offline');
const USER_AGENT = 'aow5-builder/0.1 (build-time icon fetch; +https://github.com/)';
const RETRY_DELAYS_MS = [500, 1500];
const MIN_PNG_BYTES = 200;

ensureDirs();
const cfg = loadConfig();
step(`06 · icons from CDN${OFFLINE ? ' (offline)' : ''}`);

const manifestPath = path.join(DIRS.reports, 'icons.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, IconRecord>;
const pending = JSON.parse(fs.readFileSync(path.join(DIRS.cache, 'icons.pending.json'), 'utf8')) as string[];

/** Groups texture names by the file they will be written to. */
const targets = new Map<string, string[]>();
for (const texture of pending) {
  const short = texture.replace(/^item_/, '');
  const list = targets.get(short);
  if (list) list.push(texture);
  else targets.set(short, [texture]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FetchOutcome {
  buf?: Buffer;
  url?: string;
  status: string;
}

async function fetchIcon(short: string, bases: string[] = cfg.cdnBases): Promise<FetchOutcome> {
  let lastStatus = 'no-url';
  for (const template of bases) {
    const url = template.replace('{short}', encodeURIComponent(short));
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      } catch (err) {
        lastStatus = `network: ${(err as Error).message}`;
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }

      if (res.status === 404) {
        lastStatus = '404';
        break; // a miss is a miss; try the next URL template, not a retry
      }
      if (res.status === 429 || res.status >= 500) {
        lastStatus = String(res.status);
        if (attempt < RETRY_DELAYS_MS.length) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS_MS[attempt]!);
        }
        continue;
      }
      if (!res.ok) {
        lastStatus = String(res.status);
        break;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      // A 200 is not proof of an image: CDNs happily serve HTML error pages.
      if (buf.length < MIN_PNG_BYTES || !readPngInfo(buf)) {
        lastStatus = `not-a-png (${buf.length} bytes)`;
        break;
      }
      // Stripped here, before anything hashes or writes it — see `stripTextChunks`.
      return { buf: stripTextChunks(buf), url, status: '200' };
    }
  }
  return { status: lastStatus };
}

const shorts = [...targets.keys()].sort();
let fetched = 0;
let cached = 0;
let missing = 0;
const misses: { short: string; textures: string[]; status: string }[] = [];

// Work through a shared cursor with a small pool: enough to be quick, polite
// enough not to look like an attack on Valve's CDN.
let cursor = 0;
async function worker(): Promise<void> {
  for (;;) {
    const i = cursor++;
    if (i >= shorts.length) return;
    const short = shorts[i]!;
    const textures = targets.get(short)!;
    const file = `${short}.png`;
    const dest = path.join(DIRS.publicIconItems, file);

    // Already downloaded on an earlier run and still byte-identical? Skip.
    const prev = manifest[short];
    if (prev && prev.source === 'cdn' && fs.existsSync(dest)) {
      const sha1 = crypto.createHash('sha1').update(fs.readFileSync(dest)).digest('hex');
      if (sha1 === prev.sha1) {
        prev.textures = textures;
        cached++;
        continue;
      }
    }

    if (OFFLINE) {
      if (fs.existsSync(dest)) {
        cached++;
        continue;
      }
      misses.push({ short, textures, status: 'offline' });
      missing++;
      continue;
    }

    const outcome = await fetchIcon(short);
    if (!outcome.buf) {
      misses.push({ short, textures, status: outcome.status });
      manifest[short] = { short, textures, source: 'placeholder', file: 'placeholder.png', status: outcome.status };
      missing++;
      continue;
    }

    const png = readPngInfo(outcome.buf)!;
    fs.writeFileSync(dest, outcome.buf);
    manifest[short] = {
      short,
      textures,
      source: 'cdn',
      file,
      origin: outcome.url,
      bytes: outcome.buf.length,
      w: png.width,
      h: png.height,
      sha1: crypto.createHash('sha1').update(outcome.buf).digest('hex'),
      url: outcome.url,
      status: '200',
    };
    fetched++;
  }
}

const poolSize = Math.max(1, Math.min(cfg.cdnConcurrency, shorts.length));
await Promise.all(Array.from({ length: poolSize }, () => worker()));

ok(`${fetched} fetched, ${cached} already cached, ${missing} missing (of ${shorts.length})`);
if (misses.length > 0) {
  warn(`${misses.length} icon(s) have no CDN source and fall back to placeholder.png:`);
  for (const m of misses) info(`  ${m.short} (${m.status}) <- ${m.textures.join(', ')}`);
}

writeJsonPretty(manifestPath, manifest);
writeJsonPretty(path.join(DIRS.reports, 'icons.misses.json'), misses);

const bySource: Record<string, number> = {};
for (const rec of Object.values(manifest)) bySource[rec.source] = (bySource[rec.source] ?? 0) + 1;
info(`manifest: ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join(', ')}`);

// --- spell and hero portraits -----------------------------------------------
// Same routine against the ability and hero endpoints. These are a few dozen
// files rather than a few hundred, so one sequential pass is polite and plenty.

const heroManifestPath = path.join(DIRS.reports, HERO_ICON_MANIFEST);
const heroPendingPath = path.join(DIRS.cache, HERO_ICON_PENDING);

if (!fs.existsSync(heroPendingPath)) {
  warn(`no cache/${HERO_ICON_PENDING}; run 05-icons-vpk first (skipping spell and hero icons)`);
} else {
  const heroManifest = JSON.parse(fs.readFileSync(heroManifestPath, 'utf8')) as Record<string, IconRecord>;
  const heroPending = JSON.parse(fs.readFileSync(heroPendingPath, 'utf8')) as PendingHeroIcon[];

  let heroFetched = 0;
  let heroCached = 0;
  const heroMisses: { key: string; textures: string[]; status: string }[] = [];

  for (const item of heroPending) {
    const key = `${item.kind}:${item.short}`;
    const bases = item.kind === 'hero' ? cfg.heroCdnBases : cfg.abilityCdnBases;
    const dir = item.kind === 'hero' ? DIRS.publicIconHeroes : DIRS.publicIconAbilities;
    const file = `${item.short}.png`;
    const dest = path.join(dir, file);

    const prev = heroManifest[key];
    if (prev && prev.source === 'cdn' && fs.existsSync(dest)) {
      const sha1 = crypto.createHash('sha1').update(fs.readFileSync(dest)).digest('hex');
      if (sha1 === prev.sha1) {
        prev.textures = item.textures;
        heroCached++;
        continue;
      }
    }

    if (OFFLINE) {
      if (fs.existsSync(dest)) {
        heroCached++;
        continue;
      }
      heroMisses.push({ key, textures: item.textures, status: 'offline' });
      continue;
    }

    // A cosmetic reskin is not on the CDN under its own name, so a verified
    // alias points at the stock ability it reskins — the same spell's art.
    const alias = item.kind === 'ability' ? cfg.abilityIconAliases[item.short] : undefined;
    let outcome = await fetchIcon(item.short, bases);
    if (!outcome.buf && alias) {
      outcome = await fetchIcon(alias, bases);
      if (outcome.buf) info(`${item.short}: not on the CDN; used stock art for ${alias}`);
    }
    if (!outcome.buf) {
      heroMisses.push({ key, textures: item.textures, status: outcome.status });
      heroManifest[key] = {
        short: item.short,
        textures: item.textures,
        source: 'placeholder',
        file: 'placeholder.png',
        status: outcome.status,
      };
      continue;
    }

    const png = readPngInfo(outcome.buf)!;
    fs.writeFileSync(dest, outcome.buf);
    heroManifest[key] = {
      short: item.short,
      textures: item.textures,
      source: 'cdn',
      file,
      origin: outcome.url,
      bytes: outcome.buf.length,
      w: png.width,
      h: png.height,
      sha1: crypto.createHash('sha1').update(outcome.buf).digest('hex'),
      url: outcome.url,
      status: '200',
    };
    heroFetched++;
  }

  ok(`spells and portraits: ${heroFetched} fetched, ${heroCached} already cached, ${heroMisses.length} missing`);
  if (heroMisses.length > 0) {
    warn(`${heroMisses.length} spell/hero icon(s) fall back to placeholder.png:`);
    for (const m of heroMisses) info(`  ${m.key} (${m.status}) <- ${m.textures.join(', ')}`);
  }

  writeJsonPretty(heroManifestPath, heroManifest);
  writeJsonPretty(path.join(DIRS.reports, 'hero-icons.misses.json'), heroMisses);
}

exitIfFailed();
