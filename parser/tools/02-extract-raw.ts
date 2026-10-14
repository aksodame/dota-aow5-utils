import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { Vpk } from './lib/vpk.ts';
import { extractPublishData } from './lib/publishData.ts';
import { scriptText } from './lib/hudScript.ts';
import { readRulesetManifest, readRulesetTable } from './lib/ruleset.ts';
import { writeJsonByEntry, writeJsonPretty } from './lib/writeJson.ts';
import { check, checkSoft, exitIfFailed, info, ok, step, warn } from './lib/log.ts';

/**
 * Step 02 — pull the source files we care about out of the VPK into cache/raw/.
 *
 * The item table is the interesting one. It lives inside a compiled Panorama
 * script (`.vjs_c`), but the payload is plain UTF-8: the compiler embedded a
 * literal `__AK_PANORAMA_PUBLISH_DATA__("@/json/npc_items_custom.json", {...})`
 * call whose second argument is the fully merged, type-normalized item table.
 * That saves us from parsing (and reconciling) seven separate KV files.
 *
 * The hero, ability and profession tables use the same trick, and the ability
 * text rides in a CSV rather than the KeyValues locale files, so both come out
 * here too — see `extractPublishData` and step 04b.
 */

/** Keys that are not plausible item ids — the payload has a stray "\r" entry. */
const VALID_KEY = /^[A-Za-z0-9_]+$/;

ensureDirs();
const cfg = loadConfig();
step('02 · extract raw sources');

const vpk = Vpk.open(cfg.vpkPath);
try {
  // --- item table -----------------------------------------------------------
  const payloadEntry = vpk.require(cfg.itemsPayloadPath);
  checkSoft(payloadEntry.entryOffset, cfg.expected.itemsPayloadOffset, 'items payload offset');
  checkSoft(payloadEntry.entryLength, cfg.expected.itemsPayloadLength, 'items payload length');

  const buf = vpk.read(payloadEntry);
  const table = extractPublishData(
    buf,
    '@/json/npc_items_custom.json',
    cfg.itemsPayloadPath,
  ) as Record<string, unknown>;

  const droppedKeys: string[] = [];
  for (const key of Object.keys(table)) {
    if (!VALID_KEY.test(key)) {
      droppedKeys.push(key);
      delete table[key];
    }
  }
  if (droppedKeys.length > 0) {
    warn(`dropped ${droppedKeys.length} non-identifier key(s): ${droppedKeys.map((k) => JSON.stringify(k)).join(', ')}`);
  }

  checkSoft(Object.keys(table).length, cfg.expected.itemCount, 'item count');
  check('item_tango' in table, 'sentinel item_tango present');

  writeJsonByEntry(path.join(DIRS.cacheRaw, 'npc_items_custom.payload.json'), table);
  ok(`wrote cache/raw/npc_items_custom.payload.json (${Object.keys(table).length} items)`);

  // --- heroes, abilities, professions ---------------------------------------
  // Same publish-data trick as the item table, three more tables.

  const heroPayloadCounts: Record<string, number> = {};
  for (const [name, payload] of Object.entries(cfg.heroPayloads)) {
    const entry = vpk.get(payload.path);
    if (!entry) {
      warn(`hero payload missing: ${payload.path}`);
      continue;
    }
    const parsed = extractPublishData(vpk.read(entry), payload.json, payload.path) as Record<string, unknown>;
    // `Version` is a scalar bookkeeping field, not a record; drop it so counts
    // and downstream iteration only ever see real entries.
    delete parsed['Version'];
    writeJsonByEntry(path.join(DIRS.cacheRaw, payload.file), parsed);
    heroPayloadCounts[name] = Object.keys(parsed).length;
    ok(`${name}: ${Object.keys(parsed).length} entries -> cache/raw/${payload.file}`);
  }

  // --- the HUD bundle -------------------------------------------------------
  /*
   * Read as source rather than as a table.
   *
   * The publish payloads above are data the addon hands its own UI; this is the
   * UI. It is here because the arithmetic behind a rolled stat — how far a
   * value may move from its base, and which rolls a reforge level can reach —
   * exists nowhere else: the server's copy ships as encrypted Lua, and the item
   * table lists only the middle of each range. Step 04d reads the numbers back
   * out of it; this step just puts the text on disk.
   */
  let hudScriptBytes = 0;
  const hudEntry = vpk.get(cfg.hudScriptPath);
  if (!hudEntry) {
    warn(`HUD bundle missing: ${cfg.hudScriptPath}`);
  } else {
    const text = scriptText(vpk.read(hudEntry));
    fs.writeFileSync(path.join(DIRS.cacheRaw, 'hud_script.js'), text, 'utf8');
    hudScriptBytes = Buffer.byteLength(text, 'utf8');
    ok(`hud_script.js (${hudScriptBytes} bytes of source)`);
  }

  // --- ability localization -------------------------------------------------
  // Hero ability text is not in addon_english.txt at all; it lives in the
  // addon's master translation CSV, which carries every language in columns.

  let abilityCsvBytes = 0;
  const csvEntry = vpk.get(cfg.abilityLocaleCsv);
  if (!csvEntry) {
    warn(`ability locale CSV missing: ${cfg.abilityLocaleCsv}`);
  } else {
    const data = vpk.read(csvEntry);
    fs.writeFileSync(path.join(DIRS.cacheRaw, path.basename(cfg.abilityLocaleCsv)), data);
    abilityCsvBytes = data.length;
    ok(`${path.basename(cfg.abilityLocaleCsv)} (${data.length} bytes)`);
  }

  // --- localization ---------------------------------------------------------
  const localeSizes: Record<string, number> = {};
  for (const lang of cfg.languages) {
    const rel = cfg.localeFiles[lang];
    if (!rel) {
      warn(`no locale file configured for "${lang}"`);
      continue;
    }
    const data = vpk.readPath(rel);
    const out = path.join(DIRS.cacheRaw, path.basename(rel));
    fs.writeFileSync(out, data);
    localeSizes[lang] = data.length;
    ok(`${lang}: ${path.basename(rel)} (${data.length} bytes)`);
  }

  // --- the Greed Cave's reward tables ---------------------------------------
  /*
   * The only table in the pak that says where a fate stone comes from.
   *
   * A stone is `ItemPurchasable` with `ItemDroppable 0` and appears in no drop
   * pool, no treasure pool and no fragment shop — it is a reward for clearing a
   * boss in the endless Greed Cave, and this is the file that lists which stone
   * at which depth. Plain KV shipped uncompiled, like the room tables below it.
   */
  let greedCaveBytes = 0;
  const greedEntry = vpk.get(cfg.greedCavePath);
  if (!greedEntry) {
    warn(`greed cave config missing: ${cfg.greedCavePath}`);
  } else {
    const data = vpk.read(greedEntry);
    fs.writeFileSync(path.join(DIRS.cacheRaw, path.basename(cfg.greedCavePath)), data);
    greedCaveBytes = data.length;
    ok(`${path.basename(cfg.greedCavePath)} (${data.length} bytes)`);
  }

  // --- rooms ----------------------------------------------------------------
  // The map table and its difficulty modifiers. Plain KV rather than a publish
  // payload: both are small CSV-derived files the addon ships uncompiled.

  const roomSizes: Record<string, number> = {};
  for (const rel of [cfg.roomsPath, cfg.roomDifficultyPath]) {
    const entry = vpk.get(rel);
    if (!entry) {
      warn(`room source missing: ${rel}`);
      continue;
    }
    const data = vpk.read(entry);
    fs.writeFileSync(path.join(DIRS.cacheRaw, path.basename(rel)), data);
    roomSizes[path.basename(rel)] = data.length;
    ok(`${path.basename(rel)} (${data.length} bytes)`);
  }

  // --- per-season ruleset tables --------------------------------------------
  /*
   * The season tree. S2 relaunched the addon as rulesets, and `ak_life_souls`
   * is the one table here the site needs: it is the addon's own list of which
   * items are Life Souls, and S1's copy being empty is what makes the Life Soul
   * a second-season slot rather than thirty ids typed into a config. See
   * lib/ruleset.ts for the rest of the tree and why it is not read.
   */
  const rulesetTables: Record<string, Record<string, Record<string, unknown>>> = {};
  const manifestEntry = vpk.get(cfg.rulesets.manifestPath);
  if (!manifestEntry) {
    warn(`ruleset manifest missing: ${cfg.rulesets.manifestPath}`);
  } else {
    const manifest = readRulesetManifest(vpk.read(manifestEntry), cfg.rulesets.manifestPath);
    writeJsonPretty(path.join(DIRS.cacheRaw, 'ruleset-manifest.json'), manifest);
    const seasons = manifest.seasons.map((s) => s.id);
    ok(`ruleset manifest v${manifest.version}: ${seasons.join(', ')} (base ${manifest.baseSeason})`);

    for (const table of cfg.rulesets.tables) {
      const perSeason: Record<string, Record<string, unknown>> = {};
      for (const season of seasons) {
        const rel = `${cfg.rulesets.dir}/${season}/${table}.vjs_c`;
        const entry = vpk.get(rel);
        if (!entry) {
          warn(`ruleset table missing: ${rel}`);
          continue;
        }
        perSeason[season] = readRulesetTable(vpk.read(entry), table, rel);
      }
      rulesetTables[table] = perSeason;
      writeJsonPretty(path.join(DIRS.cacheRaw, `${table}.rulesets.json`), perSeason);
      const counts = Object.entries(perSeason).map(([s, rows]) => `${s}=${Object.keys(rows).length}`);
      ok(`${table}: ${counts.join(', ')} -> cache/raw/${table}.rulesets.json`);
    }
  }

  // --- KV cross-check sources ----------------------------------------------
  let kvCount = 0;
  for (const rel of cfg.kvCrossCheckGlobs) {
    const entry = vpk.get(rel);
    if (!entry) {
      warn(`cross-check source missing: ${rel}`);
      continue;
    }
    fs.writeFileSync(path.join(DIRS.cacheRaw, path.basename(rel)), vpk.read(entry));
    kvCount++;
  }
  info(`extracted ${kvCount}/${cfg.kvCrossCheckGlobs.length} KV cross-check sources`);

  writeJsonPretty(path.join(DIRS.cache, 'extract-raw.report.json'), {
    itemsPayload: {
      path: cfg.itemsPayloadPath,
      offset: payloadEntry.entryOffset,
      length: payloadEntry.entryLength,
      itemCount: Object.keys(table).length,
      droppedKeys,
    },
    heroPayloadCounts,
    abilityCsvBytes,
    hudScriptBytes,
    localeSizes,
    roomSizes,
    kvSources: kvCount,
    greedCaveBytes,
    rulesetRows: Object.fromEntries(
      Object.entries(rulesetTables).map(([table, perSeason]) => [
        table,
        Object.fromEntries(Object.entries(perSeason).map(([s, rows]) => [s, Object.keys(rows).length])),
      ]),
    ),
  });
} finally {
  vpk.close();
}

exitIfFailed();
