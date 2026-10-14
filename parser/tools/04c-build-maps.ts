import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { parseKv, type KvObject } from './lib/kv.ts';
import { Vpk } from './lib/vpk.ts';
import { decodeVtex, encodePng } from './lib/vtex.ts';
import { writeJsonPretty } from './lib/writeJson.ts';
import { check, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import type { MapInfo, MapLocale, MapType } from '../../packages/aow5-shared/src/types/maps.ts';

/**
 * Step 04c — the map table, which is what a guide is filed under.
 *
 * `ak_rooms.txt` is a CSV the addon compiles into KeyValues, one block per
 * room: its type, its `Level`, the gold it costs to enter and its bosses. The
 * names are not in there at all — they live in the ordinary locale files under
 * two tokens per room, `name_m007` ("Temple Depths") and `lv_name_m007`
 * ("Lv. 6: Temple Depths").
 *
 * The tier comes out of that second token rather than out of `Level`. They
 * agree for eleven of the fourteen rooms and disagree for the three DLC ones —
 * M014 is `Level 5` in KV and Lv. 8 in all three languages — and the number a
 * guide author means by "a tier 8 build" is the one the game showed them. Both
 * are emitted; see the note on `MapInfo.tier`.
 *
 * This step also lifts the portal's art. The base's teleport screen shows a
 * painted 512x128 scene per room, compiled as `m007_png.vtex_c` and so on —
 * named by room id, which is what makes them attachable here rather than in the
 * icon steps. They are DXT5-YCoCg; see `lib/vtex.ts` for why that is not the
 * same as DXT5 and how it is verified.
 */

ensureDirs();
const cfg = loadConfig();
step('04c · build maps');

const roomsFile = path.join(DIRS.cacheRaw, path.basename(cfg.roomsPath));
if (!fs.existsSync(roomsFile)) {
  check(false, `cache/raw/${path.basename(cfg.roomsPath)} exists (run step 02)`);
  exitIfFailed();
}

const { root } = parseKv(fs.readFileSync(roomsFile));
const content = root['CSVContent'];
check(typeof content === 'object' && content !== null, 'ak_rooms.txt has a CSVContent node');
const rooms = (content ?? {}) as KvObject;

// --- locale tokens ----------------------------------------------------------

const tokens: Record<string, Record<string, string>> = {};
for (const lang of cfg.languages) {
  const file = path.join(DIRS.cache, `tokens.${lang}.json`);
  if (!fs.existsSync(file)) {
    warn(`no cache/tokens.${lang}.json; skipping ${lang}`);
    continue;
  }
  tokens[lang] = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
}

/**
 * The tier a label states, in any of the three languages.
 *
 * English and Chinese both prefix "lv"; Russian uses either "lv" or "Ур." and
 * is inconsistent between rooms — M010 is "Ур. 8:" where its neighbours are
 * "lv8.". Matching both rather than picking one means a translator switching
 * forms does not silently drop a tier.
 */
function tierInLabel(label: string): number | null {
  const match = /^\s*(?:lv|ур|уровень)\.?\s*(\d+)/i.exec(label);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The label with its "Lv. 6: " prefix removed, for rooms that have no bare name token. */
function stripTier(label: string): string {
  return label.replace(/^\s*(?:lv|ур|уровень)\.?\s*\d+\s*[.:：]?\s*/i, '').trim();
}

const hidden = new Set(cfg.mapRoster.hidden);
const numeric = (v: unknown, fallback = 0): number => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
};

const maps: Omit<MapInfo, 'idx'>[] = [];
const localized: Record<string, Record<string, MapLocale>> = {};
for (const lang of Object.keys(tokens)) localized[lang] = {};

const tierConflicts: string[] = [];
const missingNames: string[] = [];

for (const [id, node] of Object.entries(rooms)) {
  if (typeof node !== 'object' || node === null) continue;
  if (hidden.has(id)) continue;

  const room = node as KvObject;
  const key = id.toLowerCase();
  const roomLevel = numeric(room['Level'], 1);

  /*
   * Every language is asked for the tier and they must agree. A disagreement
   * means one translation was written against an older room and is exactly the
   * kind of drift that would otherwise file guides under the wrong tier.
   */
  const stated = new Set<number>();
  for (const lang of Object.keys(tokens)) {
    const label = tokens[lang]?.[`lv_name_${key}`];
    const tier = label ? tierInLabel(label) : null;
    if (tier !== null) stated.add(tier);
  }
  /*
   * A disagreement that the room data itself settles is not a conflict. Pak
   * 3011606331 re-tiered the three DLC rooms to their KV `Level` in English and
   * Russian while the Chinese baseline kept the old labels — so when exactly
   * one stated tier is the room's own level, that is the one the addon now
   * means. Anything else is still drift nobody has explained, and fails.
   */
  let tier = roomLevel;
  if (stated.size === 1) {
    tier = [...stated][0]!;
  } else if (stated.size > 1) {
    if (stated.has(roomLevel)) {
      warn(`${id}: languages disagree on the tier (${[...stated].join(' vs ')}); taking the room level ${roomLevel}`);
    } else {
      tierConflicts.push(`${id}: ${[...stated].join(' vs ')}`);
    }
  }

  for (const lang of Object.keys(tokens)) {
    const label = tokens[lang]?.[`lv_name_${key}`] ?? '';
    const name = tokens[lang]?.[`name_${key}`] ?? stripTier(label);
    if (name === '') {
      missingNames.push(`${lang}:${id}`);
      continue;
    }
    localized[lang]![id] = { name, label: label === '' ? name : label };
  }

  const bosses = String(room['Bosses'] ?? '')
    .split('|')
    .map((b) => b.trim())
    .filter((b) => b !== '');

  maps.push({
    id,
    type: String(room['Type'] ?? 'forest') as MapType,
    tier,
    roomLevel,
    gold: numeric(room['gold']),
    isDlc: numeric(room['isDLC']) === 1,
    visible: numeric(room['IsShow']) === 1,
    bosses,
  });
}

check(maps.length > 0, `parsed ${maps.length} room(s) from ak_rooms.txt`);
check(tierConflicts.length === 0, `tier agrees across languages (${tierConflicts.join('; ') || 'no conflicts'})`);
if (missingNames.length > 0) warn(`${missingNames.length} room(s) with no localized name: ${missingNames.join(', ')}`);

/*
 * Sorted by tier then id, so the emitted table reads the way the game's own
 * selection screen does and a new room lands next to its neighbours rather
 * than wherever the KV file happened to list it. The *frozen* order is not
 * this one — that is the append-only table in step 07, which never moves.
 */
maps.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));

info(`tiers ${Math.min(...maps.map((m) => m.tier))}-${Math.max(...maps.map((m) => m.tier))}`);
for (const map of maps) {
  const name = localized['en']?.[map.id]?.name ?? map.id;
  const flags = [map.isDlc ? 'DLC' : '', map.visible ? '' : 'hidden'].filter(Boolean).join(' ');
  const drift = map.tier === map.roomLevel ? '' : ` (KV Level ${map.roomLevel})`;
  info(`  ${map.id}  T${map.tier}${drift}  ${name}${flags ? `  [${flags}]` : ''}`);
}

// --- the portal's art -------------------------------------------------------

/*
 * Extracted here rather than in step 05 because that step resolves *item*
 * textures through the icon manifest, and these are neither items nor
 * manifest-driven: the filename is the room id, so the join is trivial and
 * belongs beside the table it joins to.
 */
const images = new Map<string, string>();
{
  const vpk = Vpk.open(cfg.vpkPath);
  try {
    fs.mkdirSync(DIRS.publicIconMaps, { recursive: true });
    const failures: string[] = [];

    for (const map of maps) {
      const rel = `${cfg.mapImageDir}/${cfg.mapImagePattern.replace('{id}', map.id.toLowerCase())}`;
      const entry = vpk.get(rel);
      // Not every room has art. G001 and the hidden test rooms have none, and
      // that is a missing image rather than a broken pipeline.
      if (!entry) continue;

      const decoded = decodeVtex(vpk.read(entry));
      if (!decoded.ok) {
        failures.push(`${map.id}: ${decoded.reason}`);
        continue;
      }

      const file = `${map.id}.png`;
      fs.writeFileSync(path.join(DIRS.publicIconMaps, file), encodePng(decoded.image));
      images.set(map.id, file);
    }

    check(failures.length === 0, `every map image that exists decoded${failures.length > 0 ? `: ${failures.join(', ')}` : ''}`);

    // Anything left behind by a previous run for a room that has since gone.
    const wanted = new Set(images.values());
    for (const file of fs.readdirSync(DIRS.publicIconMaps)) {
      if (file.endsWith('.png') && !wanted.has(file)) {
        fs.unlinkSync(path.join(DIRS.publicIconMaps, file));
        warn(`removed orphaned map image ${file}`);
      }
    }
  } finally {
    vpk.close();
  }
}

for (const map of maps) {
  const file = images.get(map.id);
  if (file !== undefined) (map as MapInfo & { image?: string }).image = file;
}
ok(`extracted ${images.size} map image(s) of ${maps.length} room(s)`);

writeJsonPretty(path.join(DIRS.cache, 'maps.normalized.json'), { maps, localized });
ok(`wrote cache/maps.normalized.json (${maps.length} maps, ${Object.keys(localized).length} language(s))`);

exitIfFailed();
