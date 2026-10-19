import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import {
  idTableHash,
  loadAbilityTable,
  loadIdTable,
  loadMapTable,
  saveAbilityTable,
  saveIdTable,
  saveMapTable,
  updateIdTable,
} from './lib/idTable.ts';
import { writeJson, writeJsonByEntry, writeJsonWithRows } from './lib/writeJson.ts';
import { check, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import { HERO_ICON_MANIFEST, type IconRecord } from './05-icons-vpk.ts';
import {
  SLOT_KIND,
  SLOT_KIND_NAMES,
  type IndexRow,
  type ItemFull,
  type LocaleDetail,
  type Meta,
} from '../../packages/aow5-shared/src/types/items.ts';
import {
  ABILITY_SLOTS,
  type AbilityFull,
  type AbilityLocale,
  type HeroInfo,
  type HeroesData,
} from '../../packages/aow5-shared/src/types/heroes.ts';
import type { MapInfo, MapLocale, MapsData } from '../../packages/aow5-shared/src/types/maps.ts';
import type { RollTables } from '../../packages/aow5-shared/src/types/rolls.ts';

/**
 * Step 07 — write the artifacts the app actually loads.
 *
 * Split by load cost: `items.index.json` and the active language's names are
 * fetched at boot; full records and descriptions are lazy. Everything lands in
 * public/ and is fetched rather than imported, so refreshing the data does not
 * invalidate the JS bundle hash and Vite never tries to process 1,000+ PNGs.
 */

const CODEC_VERSION = 1;

ensureDirs();
const cfg = loadConfig();
step('07 · emit artifacts');

const items = JSON.parse(fs.readFileSync(path.join(DIRS.cache, 'items.normalized.json'), 'utf8')) as Record<
  string,
  ItemFull
>;
const iconManifest = JSON.parse(fs.readFileSync(path.join(DIRS.reports, 'icons.manifest.json'), 'utf8')) as Record<
  string,
  IconRecord
>;
const vpkIndex = JSON.parse(fs.readFileSync(path.join(DIRS.cache, 'vpk-index.json'), 'utf8')) as {
  vpkBytes: number;
  vpkMtimeMs: number;
  entryCount: number;
};

// --- id table ---------------------------------------------------------------

const existing = loadIdTable();
const allIds = Object.keys(items);
const { ids, added, tombstones } = updateIdTable(existing, allIds);

// Guard rule 1: the previously published prefix must be byte-identical.
const prefixIntact = existing.every((id, i) => ids[i] === id);
check(prefixIntact, `id table prefix unchanged (${existing.length} previously published id(s))`);
if (added.length > 0) info(`id table: appended ${added.length} new id(s)`);
if (tombstones.length > 0) {
  warn(`id table: ${tombstones.length} id(s) no longer in the game data, kept as tombstones: ${tombstones.slice(0, 8).join(', ')}`);
}
saveIdTable(ids);

const idxOf = new Map(ids.map((id, i) => [id, i]));
const tableHash = idTableHash(ids);

// --- attach icons -----------------------------------------------------------

const byTexture = new Map<string, IconRecord>();
for (const rec of Object.values(iconManifest)) {
  for (const texture of rec.textures) byTexture.set(texture, rec);
}

let missingIcons = 0;
for (const item of Object.values(items)) {
  item.idx = idxOf.get(item.id) ?? -1;
  const rec = item.texture ? byTexture.get(item.texture) : undefined;
  if (rec && rec.source !== 'placeholder') {
    item.icon = rec.file;
    item.iconSource = rec.source;
    item.iconW = rec.w ?? 0;
    item.iconH = rec.h ?? 0;
  } else {
    item.icon = 'placeholder.png';
    item.iconSource = 'placeholder';
    item.iconW = 88;
    item.iconH = 64;
    if (item.flags.playable) missingIcons++;
  }
}
check(
  [...Object.values(items)].every((i) => i.idx >= 0),
  'every item has an id-table index',
);
if (missingIcons > 0) warn(`${missingIcons} playable item(s) fall back to placeholder.png`);

// --- items ------------------------------------------------------------------

const playable = Object.values(items)
  .filter((i) => i.flags.playable)
  .sort((a, b) => a.idx - b.idx);

/**
 * What the index carries: every playable item, plus the pets the game hides
 * from its own shop (`IsPet` with `hide=1`). The FAQ names those pets and
 * links to their cards, so they need a row and a name; the builder's pet slot
 * accepts them too. Everything else non-playable stays out and keeps its hole
 * in the id table.
 */
const shipped = Object.values(items)
  .filter((i) => i.flags.playable || i.isPet === true)
  .sort((a, b) => a.idx - b.idx);

const rows: IndexRow[] = shipped.map((i) => [
  i.idx,
  i.id,
  i.type,
  i.quality,
  i.level,
  i.cost,
  i.icon,
  i.kinds,
]);

// Slot eligibility drives what the picker offers per slot, so a collapse to
// zero in any category is worth catching here rather than in the UI.
const kindCounts: Record<string, number> = {};
for (const name of SLOT_KIND_NAMES) {
  kindCounts[name] = playable.filter((i) => (i.kinds & SLOT_KIND[name]) !== 0).length;
}
info(`slot kinds: ${Object.entries(kindCounts).map(([k, v]) => `${k.toLowerCase()}=${v}`).join(', ')}`);
for (const name of SLOT_KIND_NAMES) {
  check((kindCounts[name] ?? 0) > 0, `at least one playable item accepted by ${name.toLowerCase()} slots`);
}

const generatedAt = new Date(vpkIndex.vpkMtimeMs).toISOString();

writeJsonWithRows(
  path.join(DIRS.publicData, 'items.index.json'),
  { schema: 1, generatedAt, idTableHash: tableHash, idTableLength: ids.length },
  'rows',
  rows,
);
writeJsonByEntry(path.join(DIRS.publicData, 'items.full.json'), items);

// --- roll tables ------------------------------------------------------------
/*
 * How far each stat may roll, and what a reforge level does to that.
 *
 * Emitted verbatim from step 04d, which reads it out of the client's own code
 * rather than out of a table — see `lib/hudScript.ts`. Small enough (a few kB)
 * to be one more fetch, and it is loaded on demand: only the editor and the
 * build page, where somebody is reasoning about a *particular* copy of an item,
 * ever ask for it.
 */
const rollsCache = path.join(DIRS.cache, 'rolls.normalized.json');
if (!fs.existsSync(rollsCache)) {
  warn('no cache/rolls.normalized.json; skipping rolls.json (run step 04d)');
} else {
  const rolls = JSON.parse(fs.readFileSync(rollsCache, 'utf8')) as RollTables;
  writeJson(path.join(DIRS.publicData, 'rolls.json'), { ...rolls, generatedAt });
  ok(`emitted roll tables: ${Object.keys(rolls.random).length} random attributes, ${Object.keys(rolls.decimals).length} rounded`);
}

// --- localization -----------------------------------------------------------

const iconCounts: Record<string, number> = {};
for (const item of Object.values(items)) iconCounts[item.iconSource] = (iconCounts[item.iconSource] ?? 0) + 1;

const emittedLangs: string[] = [];
for (const lang of cfg.languages) {
  const file = path.join(DIRS.cache, `locale.${lang}.json`);
  if (!fs.existsSync(file)) {
    warn(`no cache/locale.${lang}.json; skipping`);
    continue;
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    names: Record<string, string>;
    details: Record<string, LocaleDetail>;
  };

  // The index's contents ship; the rest are dead weight in every page load.
  const names: Record<string, string> = {};
  const details: Record<string, LocaleDetail> = {};
  for (const item of shipped) {
    const name = parsed.names[item.id];
    if (name !== undefined) names[item.id] = name;
    const detail = parsed.details[item.id];
    if (detail !== undefined) details[item.id] = detail;
  }

  writeJson(path.join(DIRS.publicData, `locale.${lang}.names.json`), { schema: 1, lang, names });
  writeJsonByEntry(path.join(DIRS.publicData, `locale.${lang}.details.json`), details);
  emittedLangs.push(lang);
  ok(`${lang}: ${Object.keys(names).length} names, ${Object.keys(details).length} detail records`);
}

// --- heroes and abilities ---------------------------------------------------
// Spells ride in the URL as indices into their own frozen table, under exactly
// the same append-only rule as items: a reorder here would silently repoint
// every shared guide's spell picks.

const heroesFile = path.join(DIRS.cache, 'heroes.normalized.json');
let heroCount = 0;
let abilityCount = 0;
let abilityTableLength = 0;
let abilityTableHash = '';

if (!fs.existsSync(heroesFile)) {
  warn('no cache/heroes.normalized.json; run 04b-build-heroes first (skipping heroes)');
} else {
  const heroData = JSON.parse(fs.readFileSync(heroesFile, 'utf8')) as {
    heroes: HeroInfo[];
    abilities: Record<string, AbilityFull>;
  };
  const heroIcons = JSON.parse(fs.readFileSync(path.join(DIRS.reports, HERO_ICON_MANIFEST), 'utf8')) as Record<
    string,
    IconRecord
  >;

  const existingAbilities = loadAbilityTable();
  const abilityUpdate = updateIdTable(existingAbilities, Object.keys(heroData.abilities));
  const abilityPrefixIntact = existingAbilities.every((id, i) => abilityUpdate.ids[i] === id);
  check(
    abilityPrefixIntact,
    `ability table prefix unchanged (${existingAbilities.length} previously published id(s))`,
  );
  if (abilityUpdate.added.length > 0) info(`ability table: appended ${abilityUpdate.added.length} new id(s)`);
  if (abilityUpdate.tombstones.length > 0) {
    warn(
      `ability table: ${abilityUpdate.tombstones.length} ability(ies) no longer selectable, kept as tombstones: ` +
        abilityUpdate.tombstones.join(', '),
    );
  }
  saveAbilityTable(abilityUpdate.ids);

  const abilityIdxOf = new Map(abilityUpdate.ids.map((id, i) => [id, i]));
  abilityTableLength = abilityUpdate.ids.length;
  abilityTableHash = idTableHash(abilityUpdate.ids);

  let missingSpellIcons = 0;
  for (const ability of Object.values(heroData.abilities)) {
    ability.idx = abilityIdxOf.get(ability.id) ?? -1;
    const short = ability.texture.split('/').pop() ?? ability.texture;
    const rec = heroIcons[`ability:${short}`];
    if (rec && rec.source !== 'placeholder') {
      ability.icon = rec.file;
      ability.iconSource = rec.source;
      ability.iconW = rec.w ?? 0;
      ability.iconH = rec.h ?? 0;
    } else {
      ability.icon = 'placeholder.png';
      ability.iconSource = 'placeholder';
      ability.iconW = 88;
      ability.iconH = 64;
      missingSpellIcons++;
    }
  }
  check(
    Object.values(heroData.abilities).every((a) => a.idx >= 0),
    'every ability has an ability-table index',
  );
  if (missingSpellIcons > 0) warn(`${missingSpellIcons} ability(ies) fall back to placeholder.png`);

  let missingPortraits = 0;
  for (const hero of heroData.heroes) {
    const rec = heroIcons[`hero:${hero.short}`];
    if (rec && rec.source !== 'placeholder') {
      hero.icon = rec.file;
      hero.iconSource = rec.source;
    } else {
      hero.icon = 'placeholder.png';
      hero.iconSource = 'placeholder';
      missingPortraits++;
    }
  }
  if (missingPortraits > 0) warn(`${missingPortraits} hero portrait(s) fall back to placeholder.png`);

  // Every slot a hero offers must resolve, or the picker would open on nothing.
  const danglingSlots: string[] = [];
  for (const hero of heroData.heroes) {
    for (const slot of ABILITY_SLOTS) {
      for (const id of hero.bySlot[slot] ?? []) {
        if (heroData.abilities[id] === undefined) danglingSlots.push(`${hero.short}.${slot} -> ${id}`);
      }
    }
  }
  check(danglingSlots.length === 0, `every ability offered by a hero slot resolves${danglingSlots.length > 0 ? `: ${danglingSlots.join(', ')}` : ''}`);

  const heroesOut: HeroesData = {
    schema: 1,
    generatedAt,
    heroes: heroData.heroes,
    abilities: heroData.abilities,
    abilityTableLength,
    abilityTableHash,
  };
  writeJson(path.join(DIRS.publicData, 'heroes.json'), heroesOut);

  for (const lang of cfg.languages) {
    const file = path.join(DIRS.cache, `locale.abilities.${lang}.json`);
    if (!fs.existsSync(file)) {
      warn(`no cache/locale.abilities.${lang}.json; skipping`);
      continue;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, AbilityLocale>;
    writeJson(path.join(DIRS.publicData, `locale.${lang}.abilities.json`), {
      schema: 1,
      lang,
      abilities: parsed,
    });
    ok(`${lang}: ${Object.keys(parsed).length} ability text record(s)`);
  }

  heroCount = heroData.heroes.length;
  abilityCount = Object.keys(heroData.abilities).length;
  ok(`emitted ${heroCount} heroes and ${abilityCount} selectable abilities; ability table ${abilityTableLength} entries`);
}

// --- maps -------------------------------------------------------------------

let mapCount = 0;
let mapTableLength = 0;
let mapTableHash = '';
{
  const file = path.join(DIRS.cache, 'maps.normalized.json');
  if (!fs.existsSync(file)) {
    warn('no cache/maps.normalized.json; skipping maps (run step 04c)');
  } else {
    const { maps: parsed, localized } = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      maps: Omit<MapInfo, 'idx'>[];
      localized: Record<string, Record<string, MapLocale>>;
    };

    /*
     * The same append-only contract as the item and ability tables: a build
     * carries the map it is written for as an index here, so a room the addon
     * retires stays as a tombstone rather than shifting every guide filed
     * after it. Indices start at 1 — 0 is reserved for "no map chosen".
     */
    const existingMaps = loadMapTable();
    const update = updateIdTable(existingMaps, parsed.map((m) => m.id));
    const prefixIntact = existingMaps.every((id, i) => update.ids[i] === id);
    check(prefixIntact, `map table prefix unchanged (${existingMaps.length} previously published map(s))`);
    if (update.added.length > 0) info(`map table: appended ${update.added.length} new map(s): ${update.added.join(', ')}`);
    if (update.tombstones.length > 0) {
      warn(`map table: ${update.tombstones.length} map(s) no longer in the room table, kept as tombstones: ${update.tombstones.join(', ')}`);
    }
    saveMapTable(update.ids);

    const mapIdx = new Map(update.ids.map((id, i) => [id, i + 1]));
    const maps: MapInfo[] = parsed.map((m) => ({ ...m, idx: mapIdx.get(m.id) ?? 0 }));
    check(
      maps.every((m) => m.idx > 0),
      `every map resolves to a table position (${maps.filter((m) => m.idx === 0).length} unresolved)`,
    );

    mapTableLength = update.ids.length;
    mapTableHash = idTableHash(update.ids);
    mapCount = maps.length;

    const mapsOut: MapsData = { schema: 1, generatedAt, maps, mapTableLength, mapTableHash };
    writeJson(path.join(DIRS.publicData, 'maps.json'), mapsOut);

    for (const lang of cfg.languages) {
      const text = localized[lang];
      if (!text) {
        warn(`no map text for ${lang}; skipping`);
        continue;
      }
      writeJson(path.join(DIRS.publicData, `locale.${lang}.maps.json`), { schema: 1, lang, maps: text });
      ok(`${lang}: ${Object.keys(text).length} map name(s)`);
    }

    ok(`emitted ${mapCount} maps; map table ${mapTableLength} entries`);
  }
}

// --- meta -------------------------------------------------------------------

const meta: Meta = {
  schema: 1,
  codecVersion: CODEC_VERSION,
  generatedAt,
  vpkBytes: vpkIndex.vpkBytes,
  vpkMtimeMs: vpkIndex.vpkMtimeMs,
  vpkEntryCount: vpkIndex.entryCount,
  itemCount: Object.keys(items).length,
  playableCount: playable.length,
  shippedCount: shipped.length,
  idTableHash: tableHash,
  idTableLength: ids.length,
  heroCount,
  abilityCount,
  abilityTableHash,
  abilityTableLength,
  mapCount,
  mapTableHash,
  mapTableLength,
  languages: emittedLangs,
  icons: {
    vpk: iconCounts['vpk'] ?? 0,
    cdn: iconCounts['cdn'] ?? 0,
    placeholder: iconCounts['placeholder'] ?? 0,
  },
};
writeJson(path.join(DIRS.publicData, 'meta.json'), meta);

const sizeOf = (f: string) => {
  const p = path.join(DIRS.publicData, f);
  return fs.existsSync(p) ? `${(fs.statSync(p).size / 1024).toFixed(0)} KB` : 'missing';
};
info(
  `sizes: index ${sizeOf('items.index.json')}, full ${sizeOf('items.full.json')}, ` +
    emittedLangs.map((l) => `${l} names ${sizeOf(`locale.${l}.names.json`)} / details ${sizeOf(`locale.${l}.details.json`)}`).join(', '),
);
ok(
  `emitted ${shipped.length} of ${Object.keys(items).length} items ` +
    `(${playable.length} playable + ${shipped.length - playable.length} hidden pet(s)); id table ${ids.length} entries`,
);

exitIfFailed();
