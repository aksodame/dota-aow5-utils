import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { parseCsvRecords } from './lib/csv.ts';
import { substitute } from './lib/placeholders.ts';
import { parseRichText } from './lib/richtext.ts';
import { writeJson, writeJsonPretty } from './lib/writeJson.ts';
import { check, checkSoft, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import {
  ABILITY_SLOTS,
  isAbilitySlot,
  type AbilityFull,
  type AbilityLocale,
  type AbilitySlotKey,
  type HeroInfo,
} from '../../packages/aow5-shared/src/types/heroes.ts';
import type { RichNode } from '../../packages/aow5-shared/src/types/items.ts';

/**
 * Step 04b — turn the hero, ability and profession tables into the roster the
 * planner offers.
 *
 * Three joins do the work:
 *   profession table  hero id  ->  profession id  (`npc_dota_hero_axe_tier_3`)
 *   ability table     ability  ->  profession id  (`AllowedProfessions`)
 *   ability table     ability  ->  key it binds to (`AbilitySlot`)
 *
 * That last one is the point: several abilities compete for the same key, so a
 * hero's spell list is really six short lists, and choosing between them is the
 * build decision.
 *
 * Abilities the addon has defined but not finished — shipped as "Ability 001"
 * with a "To be filled." description — are counted and dropped rather than
 * offered, so nobody builds a guide around a spell that does not exist yet.
 */

const TOKEN_PREFIX = 'dota_tooltip_ability_';
/** The addon's own placeholder naming for an ability it has not written yet. */
const PLACEHOLDER_NAME = /^(?:ability|skill|talent)\s*\d+$/i;
const PLACEHOLDER_DESC = /^to be filled\.?$/i;

ensureDirs();
const cfg = loadConfig();
step('04b · build heroes and abilities');

const readPayload = (file: string): Record<string, Record<string, unknown>> => {
  const full = path.join(DIRS.cacheRaw, file);
  if (!fs.existsSync(full)) throw new Error(`missing cache/raw/${file}; run 02-extract-raw first`);
  return JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, Record<string, unknown>>;
};

const rawHeroes = readPayload(cfg.heroPayloads.heroes.file);
const rawAbilities = readPayload(cfg.heroPayloads.abilities.file);
const rawProfessions = readPayload(cfg.heroPayloads.professions.file);

const asArray = (v: unknown): string[] => {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
};
const asNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

// --- ability keys from the season rulesets ----------------------------------
/*
 * A few abilities get their key from a season's ruleset rather than from the
 * base payload this table is built from. S3's Burning Thunder (`lina_014`) and
 * Boomerang (`pa_013`) are the current pair: the base row has no `AbilitySlot`
 * and the season's copy has `q`, so without this merge they would be dropped as
 * unfinished and never reach the planner.
 *
 * Only the key is taken. The rest of the season row stays out of scope:
 * abilities are not season-scoped in the app yet, and the base row is what the
 * site has always shown.
 */
const seasonAbilitiesFile = path.join(DIRS.cacheRaw, 'ak_abilities.rulesets.json');
if (!fs.existsSync(seasonAbilitiesFile)) {
  warn(
    'missing cache/raw/ak_abilities.rulesets.json; ability keys that only a season ' +
      'ruleset assigns (lina_014, pa_013) will be dropped — run 02-extract-raw',
  );
} else {
  const perSeason = JSON.parse(fs.readFileSync(seasonAbilitiesFile, 'utf8')) as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  // Oldest season first, so a later season's key wins over an earlier one's.
  // They only ever disagree for an ability the base table does not key.
  const seasons = Object.entries(cfg.rulesets.seasonKeys)
    .sort((a, b) => a[1] - b[1])
    .map(([season]) => season);
  const seasonSlot = new Map<string, string>();
  for (const season of seasons) {
    const table = perSeason[season];
    if (table === undefined) continue;
    for (const [id, row] of Object.entries(table)) {
      const slot = asString(row['AbilitySlot']);
      if (slot !== undefined && isAbilitySlot(slot)) seasonSlot.set(id, slot);
    }
  }

  const filled: string[] = [];
  for (const [id, src] of Object.entries(rawAbilities)) {
    if (asString(src['AbilitySlot']) !== undefined) continue;
    const slot = seasonSlot.get(id);
    if (slot === undefined) continue;
    src['AbilitySlot'] = slot;
    filled.push(`${id} -> ${slot}`);
  }
  info(
    filled.length > 0
      ? `ability key(s) taken from the season rulesets: ${filled.sort().join(', ')}`
      : 'no ability needs a key from a season ruleset',
  );
}

// --- professions ------------------------------------------------------------
// Keys look like `npc_dota_hero_axe_tier_3`; the hero is the key minus the tier
// suffix, and the record names the profession the abilities are gated on.

const heroOfProfession = new Map<string, string>();
const professionOfHero = new Map<string, string>();
for (const [key, rec] of Object.entries(rawProfessions)) {
  const profession = asString(rec['profession_id']);
  if (!profession) continue;
  const hero = key.replace(/_tier_\d+$/, '');
  const previous = professionOfHero.get(hero);
  if (previous !== undefined && previous !== profession) {
    check(false, `hero ${hero} maps to two professions: ${previous} and ${profession}`);
  }
  professionOfHero.set(hero, profession);
  heroOfProfession.set(profession, hero);
}
/*
 * Heroes the profession table does not name.
 *
 * The table holds the five-tier unlock ladder of the S1 heroes. Void Spirit
 * shipped in pak 3011606331 with a full kit gated on `void_spirit` but no
 * ladder rows, so the only thing tying him to his abilities is the id they
 * name. The config supplies that link; a table entry, once the addon adds one,
 * wins over it.
 */
for (const [hero, profession] of Object.entries(cfg.heroRoster.professions ?? {})) {
  if (hero.startsWith('_')) continue;
  if (professionOfHero.has(hero)) {
    info(`${hero}: the profession table now names it; config heroRoster.professions entry is redundant`);
    continue;
  }
  professionOfHero.set(hero, profession);
  heroOfProfession.set(profession, hero);
}
info(`${professionOfHero.size} hero(es) with a profession: ${[...professionOfHero.keys()].sort().join(', ')}`);

// --- roster -----------------------------------------------------------------
// Order is frozen in config because it is what a shared link encodes. A hero the
// game has gained but config has not listed is a deliberate append, so it fails
// here rather than silently landing at an arbitrary index.

const roster = cfg.heroRoster.order;
const rosterSet = new Set(roster);
const unlisted = [...professionOfHero.keys()].filter((h) => !rosterSet.has(h)).sort();
check(
  unlisted.length === 0,
  unlisted.length === 0
    ? 'every hero with a profession is in the frozen roster'
    : `hero(es) missing from config heroRoster.order (append, never reorder): ${unlisted.join(', ')}`,
);
const rosterProblems: string[] = [];
for (const hero of roster) {
  if (rawHeroes[hero] === undefined) rosterProblems.push(`${hero}: not in the hero table`);
  if (!professionOfHero.has(hero)) rosterProblems.push(`${hero}: no profession`);
  // Display names are config data, so a hero added to the roster without one
  // would silently render as its raw id.
  for (const lang of cfg.languages) {
    if (!cfg.heroRoster.names[hero]?.[lang]) rosterProblems.push(`${hero}: no ${lang} display name`);
  }
}
check(
  rosterProblems.length === 0,
  rosterProblems.length === 0
    ? `all ${roster.length} rostered heroes resolve, with display names`
    : `roster problems: ${rosterProblems.join('; ')}`,
);

// --- ability localization ---------------------------------------------------
// Hero ability text is absent from addon_english.txt; it lives in the addon's
// master translation CSV, one column per language.

const csvFile = path.join(DIRS.cacheRaw, path.basename(cfg.abilityLocaleCsv));
const tokens: Record<string, Record<string, string>> = {};
if (!fs.existsSync(csvFile)) {
  check(false, `missing cache/raw/${path.basename(cfg.abilityLocaleCsv)}; run 02-extract-raw first`);
} else {
  const { header, rows } = parseCsvRecords(fs.readFileSync(csvFile, 'utf8'));
  info(`${path.basename(cfg.abilityLocaleCsv)}: ${rows.length} rows, columns ${header.join(', ')}`);
  for (const lang of cfg.languages) {
    const column = cfg.abilityLocaleColumns[lang];
    if (!column) {
      warn(`no ability locale column configured for "${lang}"`);
      continue;
    }
    if (!header.includes(column)) {
      check(false, `ability locale column "${column}" present for ${lang}`);
      continue;
    }
    const map: Record<string, string> = {};
    for (const row of rows) {
      const key = (row['Tokens'] ?? '').trim().toLowerCase();
      const value = row[column] ?? '';
      if (key === '' || value === '') continue;
      if (!(key in map)) map[key] = value; // first wins, matching the KV policy
    }
    tokens[lang] = map;
    ok(`${lang}: ${Object.keys(map).length} translation tokens`);
  }
}

const enTokens = tokens['en'] ?? {};

// --- what a hero can actually learn ----------------------------------------
/*
 * An ability row existing is not the same as a hero being able to have it. A
 * hero starts with whatever its own entity names in `Ability1…18`, and learns
 * everything else from a talent node's `profession_skills`. The addon keeps rows
 * for abilities no hero reaches — Lina's Fire Rain and Lava Bomb among them — and
 * offering those in the planner would suggest builds the game refuses.
 *
 * Seasons are unioned rather than split per season: the app does not scope
 * abilities to a season yet, and the skill-granting nodes are the same in all
 * three today. Only ids that exist in the ability table are counted.
 */
const innateByHero = new Map<string, Set<string>>();
for (const hero of roster) {
  const ids = new Set<string>();
  const row = rawHeroes[hero];
  if (row !== undefined) {
    for (let i = 1; i <= 18; i++) {
      const id = asString(row[`Ability${i}`]);
      if (id === undefined || /^ak_hero_blank(_|$)/.test(id)) continue;
      if (rawAbilities[id] !== undefined) ids.add(id);
    }
  }
  innateByHero.set(hero, ids);
}

const talentFile = path.join(DIRS.cacheRaw, 'ak_talent.rulesets.json');
if (!fs.existsSync(talentFile)) {
  throw new Error('missing cache/raw/ak_talent.rulesets.json; run 02-extract-raw first');
}
const talentByHero = new Map<string, Set<string>>();
const talentSeasons = JSON.parse(fs.readFileSync(talentFile, 'utf8')) as Record<
  string,
  Record<string, Record<string, unknown>>
>;
for (const table of Object.values(talentSeasons)) {
  for (const row of Object.values(table)) {
    const hero = asString(row['profession']);
    if (hero === undefined || !rosterSet.has(hero)) continue;
    const skills = asArray(row['profession_skills'])
      .flatMap((value) => value.split(/[|,]/))
      .map((value) => value.trim())
      .filter(Boolean);
    if (skills.length === 0) continue;
    let set = talentByHero.get(hero);
    if (set === undefined) {
      set = new Set<string>();
      talentByHero.set(hero, set);
    }
    for (const id of skills) if (rawAbilities[id] !== undefined) set.add(id);
  }
}

const grantedByHero = new Map<string, Set<string>>();
for (const hero of roster) {
  grantedByHero.set(
    hero,
    new Set([...(innateByHero.get(hero) ?? []), ...(talentByHero.get(hero) ?? [])]),
  );
}
info(
  `abilities a hero can have: ${roster
    .map((h) => `${h.replace(/^npc_dota_hero_/, '')}=${grantedByHero.get(h)!.size}`)
    .join(', ')}`,
);

// --- abilities --------------------------------------------------------------

const abilities = new Map<string, AbilityFull>();
const unfinishedByHero = new Map<string, number>();
const unfinished: { id: string; hero: string; reason: string; name: string }[] = [];
const unobtainable: { id: string; hero: string; reason: string; name: string }[] = [];

/**
 * Shared abilities a hero actually equips, read off its own `AbilityN` list.
 *
 * Most profession-less abilities are placeholders (`ak_hero_blank_*`) or belong
 * to systems that are not hero kit at all, so the hero table is the authority on
 * which ones are really granted. In practice this is the `f` heal: every hero
 * carries it, nothing competes with it, and the UI preselects it for that reason.
 */
const sharedEquipped = new Set<string>();
for (const [heroId, hero] of Object.entries(rawHeroes)) {
  if (!rosterSet.has(heroId)) continue;
  for (let i = 1; i <= 18; i++) {
    const abilityId = asString(hero[`Ability${i}`]);
    if (!abilityId) continue;
    const ability = rawAbilities[abilityId];
    // Unresolved entries are stock Dota talents (`special_bonus_*`), which live
    // in the base game rather than this addon.
    if (!ability) continue;
    if (asString(ability['AllowedProfessions'])) continue; // owned, handled below
    if (/^ak_hero_blank(_|$)/.test(abilityId)) continue; // an empty key, not an ability
    sharedEquipped.add(abilityId);
  }
}
info(
  sharedEquipped.size > 0
    ? `shared abilities every hero is granted: ${[...sharedEquipped].sort().join(', ')}`
    : 'no shared abilities are equipped by any hero',
);

for (const [id, src] of Object.entries(rawAbilities)) {
  const profession = asString(src['AllowedProfessions']);
  if (!profession && !sharedEquipped.has(id)) continue; // blanks, dash, minigame bits
  const hero = profession ? heroOfProfession.get(profession) : null;
  if (profession && !hero) {
    // A profession with no hero: Marci ships two abilities but has no profession
    // tiers, so she is not a playable pick.
    info(`ability ${id}: profession "${profession}" has no hero in the profession table; skipped`);
    continue;
  }

  const rawSlot = asString(src['AbilitySlot']);
  const name = enTokens[`${TOKEN_PREFIX}${id.toLowerCase()}`]?.trim() ?? '';
  const desc = enTokens[`${TOKEN_PREFIX}${id.toLowerCase()}_description`]?.trim() ?? '';

  let reason = '';
  if (!rawSlot || !isAbilitySlot(rawSlot)) reason = rawSlot ? `unknown slot "${rawSlot}"` : 'no slot';
  else if (name === '') reason = 'no name token';
  else if (PLACEHOLDER_NAME.test(name)) reason = 'placeholder name';
  else if (desc === '' || PLACEHOLDER_DESC.test(desc)) reason = 'placeholder description';

  if (reason !== '') {
    unfinished.push({ id, hero: hero ?? '(shared)', reason, name });
    if (hero) unfinishedByHero.set(hero, (unfinishedByHero.get(hero) ?? 0) + 1);
    continue;
  }

  /*
   * Finished, but no hero can reach it. It stays in the ability map — the wiki
   * still documents it and old shared links still resolve its index — but the
   * hero slot lists below leave it out.
   */
  if (typeof hero === 'string' && !(grantedByHero.get(hero)?.has(id) ?? false)) {
    unobtainable.push({ id, hero, reason: 'no hero AbilityN or talent node grants it', name });
  }

  const values: Record<string, number | string> = {};
  const av = src['AbilityValues'];
  if (av && typeof av === 'object' && !Array.isArray(av)) {
    for (const [k, v] of Object.entries(av as Record<string, unknown>)) {
      if (typeof v === 'number' || typeof v === 'string') values[k] = v;
    }
  }

  const tags = asArray(src['AbilityTags']).filter(Boolean);
  const behavior = asArray(src['AbilityBehavior']).filter(Boolean);
  const targetType = asArray(src['AbilityUnitTargetType']).filter(Boolean);

  abilities.set(id, {
    id,
    idx: -1, // assigned in 07-emit against the frozen ability table
    hero: hero ?? null,
    profession: profession ?? '',
    slot: rawSlot as AbilitySlotKey,

    texture: asString(src['AbilityTextureName']) ?? '',
    icon: '',
    iconSource: 'placeholder',
    iconW: 0,
    iconH: 0,

    maxLevel: asNumber(src['MaxLevel']),
    cooldown: asNumber(src['AbilityCooldown']),
    manaCost: asNumber(src['AbilityManaCost']),
    healthCostPct: asNumber(src['AbilityHealthCostPct']),
    castPoint: asNumber(src['AbilityCastPoint']),
    castRange: asNumber(src['AbilityCastRange']),
    behavior: behavior.length > 0 ? behavior : undefined,
    targetTeam: asString(src['AbilityUnitTargetTeam']),
    targetType: targetType.length > 0 ? targetType : undefined,
    tags: tags.length > 0 ? tags : undefined,
    scriptFile: asString(src['ScriptFile']),

    values,
  });
}

if (unfinished.length > 0) {
  warn(`${unfinished.length} ability(ies) are unfinished in the addon data and are not offered:`);
  for (const u of unfinished) info(`  ${u.id} (${u.hero.replace('npc_dota_hero_', '')}) — ${u.reason}`);
}
if (unobtainable.length > 0) {
  warn(`${unobtainable.length} finished ability(ies) cannot be learned and are not offered:`);
  for (const u of unobtainable) info(`  ${u.id} (${u.hero.replace('npc_dota_hero_', '')}) — ${u.name}`);
}

// --- heroes -----------------------------------------------------------------

const heroes: HeroInfo[] = roster.map((id, i) => {
  const profession = professionOfHero.get(id) ?? '';
  const granted = grantedByHero.get(id) ?? new Set<string>();
  const mine = [...abilities.values()].filter(
    (a) => (a.hero === id || a.hero === null) && granted.has(a.id),
  );

  const bySlot: Partial<Record<AbilitySlotKey, string[]>> = {};
  for (const slot of ABILITY_SLOTS) {
    const list = mine
      .filter((a) => a.slot === slot)
      .map((a) => a.id)
      .sort();
    if (list.length > 0) bySlot[slot] = list;
  }

  return {
    id,
    // 1-based: index 0 stays free to mean "no hero chosen" in the URL.
    idx: i + 1,
    profession,
    short: id.replace(/^npc_dota_hero_/, ''),
    names: cfg.heroRoster.names[id] ?? {},
    icon: '',
    iconSource: 'placeholder',
    abilities: ABILITY_SLOTS.flatMap((slot) => bySlot[slot] ?? []),
    bySlot,
    unfinished: unfinishedByHero.get(id) ?? 0,
    /*
     * Whether the addon has actually finished this hero.
     *
     * Measured as "has at least one ability of their own" rather than by
     * counting unfinished placeholders: Lina and Drow both carry unfinished
     * abilities and are perfectly playable, while Crystal Maiden's only
     * ability is the `f` heal every hero is given — she has nothing of her
     * own, which is what makes her a roster slot rather than a hero.
     *
     * Derived, not configured, so the day the addon finishes her this becomes
     * true without anyone editing a list.
     */
    playable: mine.some((a) => a.hero === id),
  };
});

for (const hero of heroes) {
  const counts = ABILITY_SLOTS.map((s) => `${s}=${hero.bySlot[s]?.length ?? 0}`).join(' ');
  const suffix = hero.unfinished > 0 ? ` (+${hero.unfinished} unfinished)` : '';
  info(`${hero.short.padEnd(17)} ${String(hero.abilities.length).padStart(2)} selectable  ${counts}${suffix}`);
}

const notPlayable = heroes.filter((h) => !h.playable);
if (notPlayable.length > 0) {
  // Not an error. A roster position is frozen the moment it is published, so a
  // hero the addon has not finished has to keep its index and simply not be
  // offered — which is what `playable` is for.
  warn(
    `${notPlayable.length} hero(es) have no abilities of their own and are not offered: ` +
      notPlayable.map((h) => `${h.short} (${h.unfinished} unfinished)`).join(', '),
  );
}

// --- localization -----------------------------------------------------------

const localized: Record<string, Record<string, AbilityLocale>> = {};
const missingNames: Record<string, string[]> = {};
const unresolvedTokens: Record<string, Record<string, string[]>> = {};

for (const lang of cfg.languages) {
  const map = tokens[lang];
  if (!map) continue;
  localized[lang] = {};
  missingNames[lang] = [];
  unresolvedTokens[lang] = {};

  for (const ability of abilities.values()) {
    const base = `${TOKEN_PREFIX}${ability.id.toLowerCase()}`;
    const src = { values: ability.values, top: rawAbilities[ability.id] ?? {} };

    const rawName = map[base];
    if (rawName === undefined) missingNames[lang].push(ability.id);
    const entry: AbilityLocale = {
      // Fall back to the id so a card never renders a blank spell.
      name: rawName !== undefined ? substitute(rawName, src).text : ability.id,
    };

    const rawDesc = map[`${base}_description`];
    if (rawDesc !== undefined) {
      const sub = substitute(rawDesc, src);
      if (sub.unresolved.length > 0) unresolvedTokens[lang][ability.id] = sub.unresolved;
      let nodes: RichNode[] = [];
      let plain = '';
      try {
        const rt = parseRichText(sub.text);
        nodes = rt.nodes;
        plain = rt.plain;
      } catch (err) {
        check(false, `richtext ${lang}/${ability.id}: ${(err as Error).message}`);
      }
      entry.desc = nodes;
      entry.descPlain = plain;
    }

    const valueLabels: Record<string, string> = {};
    for (const key of Object.keys(ability.values)) {
      const label = map[`${base}_${key.toLowerCase()}`];
      if (label !== undefined) valueLabels[key] = substitute(label, src).text;
    }
    if (Object.keys(valueLabels).length > 0) entry.values = valueLabels;

    localized[lang][ability.id] = entry;
  }

  const missing = missingNames[lang]!.length;
  const unres = Object.keys(unresolvedTokens[lang]!).length;
  ok(
    `${lang}: ${Object.keys(localized[lang]!).length} ability records ` +
      `(${missing} without a name token, ${unres} with unresolved placeholders)`,
  );
}

// --- counts -----------------------------------------------------------------

const offered = new Set(heroes.flatMap((h) => h.abilities));
checkSoft(heroes.length, cfg.expected.heroCount, 'hero count');
checkSoft(abilities.size + unfinished.length, cfg.expected.abilityCount, 'hero abilities defined');
checkSoft(offered.size, cfg.expected.selectableAbilityCount, 'selectable abilities');
for (const [profession, expected] of Object.entries(cfg.expected.abilitiesPerHero)) {
  const hero = heroes.find((h) => h.profession === profession);
  checkSoft(hero?.abilities.length ?? 0, expected, `selectable abilities for ${profession}`);
}
check(
  heroes.every((h) => h.abilities.every((id) => abilities.has(id))),
  'every rostered ability resolves',
);

// --- output -----------------------------------------------------------------

writeJson(path.join(DIRS.cache, 'heroes.normalized.json'), {
  heroes,
  abilities: Object.fromEntries(abilities),
});
for (const lang of cfg.languages) {
  if (!localized[lang]) continue;
  writeJson(path.join(DIRS.cache, `locale.abilities.${lang}.json`), localized[lang]);
}

writeJsonPretty(path.join(DIRS.reports, 'heroes.json'), {
  heroCount: heroes.length,
  selectableAbilities: offered.size,
  finishedAbilities: abilities.size,
  unobtainableAbilities: unobtainable.length,
  unfinishedAbilities: unfinished.length,
  heroes: heroes.map((h) => ({
    id: h.id,
    idx: h.idx,
    profession: h.profession,
    selectable: h.abilities.length,
    unfinished: h.unfinished,
    bySlot: Object.fromEntries(ABILITY_SLOTS.map((s) => [s, h.bySlot[s] ?? []])),
  })),
  unfinished,
  unobtainable,
  missingNames,
  unresolvedTokens,
});

ok(`wrote cache/heroes.normalized.json (${heroes.length} heroes, ${offered.size} selectable abilities)`);

exitIfFailed();
