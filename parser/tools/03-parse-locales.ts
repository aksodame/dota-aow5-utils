import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { findChild, parseKv } from './lib/kv.ts';
import { writeJsonByEntry, writeJsonPretty } from './lib/writeJson.ts';
import { check, checkSoft, exitIfFailed, info, ok, step, warn } from './lib/log.ts';

/**
 * Step 03 — flatten the localization KV files into token maps.
 *
 * Valve token lookups are case-insensitive and the addon's item keys do not
 * always match the casing used in the token names, so every key is lowercased
 * on the way in and every lookup lowercases too.
 */

const TOKEN_PREFIX = 'dota_tooltip_ability_';

ensureDirs();
const cfg = loadConfig();
step('03 · parse localization');

const itemIds = Object.keys(
  JSON.parse(fs.readFileSync(path.join(DIRS.cacheRaw, 'npc_items_custom.payload.json'), 'utf8')) as Record<
    string,
    unknown
  >,
);
const itemIdSet = new Set(itemIds.map((id) => id.toLowerCase()));

interface LangStats {
  tokens: number;
  names: number;
  descriptions: number;
  lore: number;
  values: number;
  emptyKeys: number;
  duplicates: number;
}

const stats: Record<string, LangStats> = {};

for (const lang of cfg.languages) {
  const rel = cfg.localeFiles[lang];
  if (!rel) continue;
  const file = path.join(DIRS.cacheRaw, path.basename(rel));
  if (!fs.existsSync(file)) {
    warn(`${lang}: ${path.basename(rel)} not extracted; run 02-extract-raw first`);
    continue;
  }

  const parsed = parseKv(fs.readFileSync(file));
  const langNode = findChild(parsed.root, 'lang');
  const tokensNode = langNode ? findChild(langNode, 'Tokens') : undefined;
  if (!tokensNode) {
    warn(`${lang}: no lang/Tokens node found`);
    continue;
  }

  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokensNode)) {
    if (typeof value !== 'string') continue;
    const lower = key.toLowerCase();
    // First wins, matching the KV parser's duplicate policy.
    if (!(lower in flat)) flat[lower] = value;
  }

  // Classify item-relevant tokens so counts can be asserted against the
  // numbers observed when this pipeline was written.
  let names = 0;
  let descriptions = 0;
  let lore = 0;
  let values = 0;
  for (const key of Object.keys(flat)) {
    if (!key.startsWith(TOKEN_PREFIX)) continue;
    const rest = key.slice(TOKEN_PREFIX.length);
    if (itemIdSet.has(rest)) {
      names++;
      continue;
    }
    if (rest.endsWith('_description') && itemIdSet.has(rest.slice(0, -'_description'.length))) {
      descriptions++;
      continue;
    }
    if (rest.endsWith('_lore') && itemIdSet.has(rest.slice(0, -'_lore'.length))) {
      lore++;
      continue;
    }
    // Everything else prefixed with a known item id is a per-stat label.
    for (const id of itemIdSet) {
      if (rest.startsWith(`${id}_`)) {
        values++;
        break;
      }
    }
  }

  stats[lang] = {
    tokens: Object.keys(flat).length,
    names,
    descriptions,
    lore,
    values,
    emptyKeys: parsed.emptyKeys,
    duplicates: parsed.duplicates,
  };

  writeJsonByEntry(path.join(DIRS.cache, `tokens.${lang}.json`), flat);
  ok(
    `${lang}: ${Object.keys(flat).length} tokens (names ${names}, desc ${descriptions}, lore ${lore}, values ${values})`,
  );
  if (parsed.duplicates > 0) info(`${lang}: ${parsed.duplicates} duplicate token(s), first wins`);
  if (parsed.emptyKeys > 0) info(`${lang}: ${parsed.emptyKeys} empty key(s) skipped`);
}

// English is the reference locale; its counts are pinned. Other languages are
// reported only, since translations legitimately lag behind.
const en = stats['en'];
if (en) {
  const exp = cfg.expected.enTokens;
  checkSoft(en.names, exp.names, 'en item names');
  checkSoft(en.descriptions, exp.descriptions, 'en descriptions');
  checkSoft(en.lore, exp.lore, 'en lore entries');
  checkSoft(en.values, exp.values, 'en stat labels');
} else {
  check(false, 'english tokens parsed');
}

writeJsonPretty(path.join(DIRS.reports, 'locale-coverage.json'), { stats });
exitIfFailed();
