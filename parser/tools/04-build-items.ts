import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { findChild, parseKv, type KvObject } from './lib/kv.ts';
import { substitute } from './lib/placeholders.ts';
import { hasHan } from './lib/han.ts';
import { parseRichText, surveyHtml } from './lib/richtext.ts';
import { writeJson, writeJsonPretty } from './lib/writeJson.ts';
import { check, checkSoft, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import {
  ESSENCE_IDS,
  SLOT_KIND,
  type Dismantle,
  type DismantleOutput,
  type ItemFull,
  type ItemNeed,
  type ItemSource,
  type LocaleDetail,
  type RichNode,
} from '../../packages/aow5-shared/src/types/items.ts';

/**
 * Step 04 — turn the raw item table plus token maps into normalized records.
 *
 * Runs over every item, including disabled and hidden ones; the playable filter
 * is applied at emit time so re-enabling an item later needs no re-extraction.
 */

const TOKEN_PREFIX = 'dota_tooltip_ability_';

ensureDirs();
const cfg = loadConfig();
step('04 · normalize items');

const raw = JSON.parse(
  fs.readFileSync(path.join(DIRS.cacheRaw, 'npc_items_custom.payload.json'), 'utf8'),
) as Record<string, Record<string, unknown>>;

/**
 * The addon's own answer to which items are Life Souls, and to which seasons
 * they belong: one `ak_life_souls` table per ruleset, S1's empty and S2's
 * holding thirty rows. The client refuses to offer a Life Soul that is not in
 * the table for the active ruleset, and this is the same rule read back out.
 */
const lifeSoulsPath = path.join(DIRS.cacheRaw, 'ak_life_souls.rulesets.json');
const lifeSoulsByRuleset = fs.existsSync(lifeSoulsPath)
  ? (JSON.parse(fs.readFileSync(lifeSoulsPath, 'utf8')) as Record<string, Record<string, unknown>>)
  : {};
if (!fs.existsSync(lifeSoulsPath)) warn('missing cache/raw/ak_life_souls.rulesets.json; run 02-extract-raw first');

/** Item id -> the seasons whose life-soul table lists it. */
const soulSeasons = new Map<string, number[]>();
for (const [ruleset, rows] of Object.entries(lifeSoulsByRuleset)) {
  const season = cfg.rulesets.seasonKeys[ruleset];
  check(season !== undefined, `ruleset "${ruleset}" has a season number in the config`);
  if (season === undefined) continue;
  for (const id of Object.keys(rows)) {
    const seasons = soulSeasons.get(id) ?? [];
    seasons.push(season);
    soulSeasons.set(id, seasons);
  }
}

/**
 * `AllowedRulesets` -> season numbers.
 *
 * Absent is not a restriction — most of the catalogue says nothing and exists
 * in every season. A ruleset the config does not name is a fail rather than a
 * guess: silently dropping it would turn a season-locked item into one the
 * editor offers everywhere.
 */
function seasonsOf(id: string, value: unknown): number[] | undefined {
  const rulesets = asArray(value).flatMap((v) => v.split(/[\s,]+/)).filter(Boolean);
  if (rulesets.length === 0) return undefined;
  const seasons: number[] = [];
  for (const ruleset of rulesets) {
    const season = cfg.rulesets.seasonKeys[ruleset];
    if (season === undefined) {
      check(false, `${id}: AllowedRulesets "${ruleset}" has a season number in the config`);
      continue;
    }
    if (!seasons.includes(season)) seasons.push(season);
  }
  return seasons.length > 0 ? seasons.sort((a, b) => a - b) : undefined;
}

/** Life Souls whose two sources disagree about the season. Reported in one line. */
const soulSeasonMismatches: string[] = [];

const tokens: Record<string, Record<string, string>> = {};
for (const lang of cfg.languages) {
  const file = path.join(DIRS.cache, `tokens.${lang}.json`);
  if (fs.existsSync(file)) tokens[lang] = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  else warn(`missing cache/tokens.${lang}.json; run 03-parse-locales first`);
}

// --- coercion helpers -------------------------------------------------------
// The payload is mostly typed already, but single-element lists arrive as bare
// strings (Needs, gem_value, target_tags, professions, AbilityBehavior, ...),
// so every list-shaped field has to be normalized to an array.

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

const asString = (v: unknown): string | undefined => {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return undefined;
};

/** Parses `["tag_gem_damage:10", "tag_gem_mana_cost:25"]` into a map. */
const parsePairs = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const entry of asArray(v)) {
    const colon = entry.lastIndexOf(':');
    if (colon <= 0) continue;
    const key = entry.slice(0, colon).trim();
    const num = Number(entry.slice(colon + 1).trim());
    if (key && Number.isFinite(num)) out[key] = num;
  }
  return out;
};

/** Parses `["item_0101", "item_M001:3"]`; a missing count means one. */
const parseNeeds = (v: unknown): ItemNeed[] => {
  const out: ItemNeed[] = [];
  for (const entry of asArray(v)) {
    const colon = entry.lastIndexOf(':');
    if (colon <= 0) {
      const id = entry.trim();
      if (id) out.push({ id, count: 1 });
      continue;
    }
    const id = entry.slice(0, colon).trim();
    const count = Number(entry.slice(colon + 1).trim());
    if (id) out.push({ id, count: Number.isFinite(count) && count > 0 ? count : 1 });
  }
  return out;
};

/**
 * What dismantling an item returns.
 *
 * Transcribed from the addon's own rule, which lives in the compiled HUD bundle
 * (`panorama/layout/custom_game/hud/script.vjs_c`) as the function that builds
 * the codex's "Dismantle" acquisition sources — the same one that decides which
 * essence tile the illustrated guide shows under `illustrated_分解获得`. The
 * `rule` strings below are that code's own source ids, kept verbatim so a future
 * VPK can be diffed against them.
 *
 * What is NOT here is a count. The client never computes one: dismantling sends
 * `request_dismantle_preview` to the server and renders whatever comes back on
 * `s2c_dismantle_preview_result`, and the server half of the addon ships as an
 * encrypted Lua bundle (`GameRules.XDecrypt(...)`, ~370 of the 1,442 vscripts,
 * knapsack.lua among them). The one number the client does expose is a guard —
 * a quality-6 treasure only lists Legendary Essence when `floor(level / 2) > 0`
 * — which reads like the count but is not stated as one, so it is not emitted.
 */
/**
 * What dismantling an item returns, and how many.
 *
 * Two sources, because the pak the site reads does not contain the whole
 * answer. *Which* essences come back is transcribed from the published
 * client's illustrated-guide list, and the rule ids below are the addon's own
 * so a future pak can be diffed against them. *How many* is not in that bundle
 * at all — the knapsack asks the server and draws whatever comes back, and the
 * published pak ships its server half encrypted.
 *
 * The author, however, also publishes the addon's **source tree** as a separate
 * workshop item (`1331857008`, "AOW5 S2(Test)"), and there
 * `scripts/vscripts/my_game_axe/make/make.lua` is in the clear. The counts
 * below are `getNonCraftEquipDismantlePreviewOutputs`, `getGemDismantleOutputs`
 * and `getStoneDismantleOutputs` from it, transcribed:
 *
 *   gem       Sigil    x min(10, max(1, level + quality - 1))
 *   stone     Mythic   x 1
 *   treasure  Equipment x level, and from level 3 also Legendary x floor(level/2),
 *             and at quality 6 a 25% Mythic x floor(level/2)
 *   quality 6 Mythic    x max(1, floor(level / 2))
 *   quality 5 Legendary x level
 *   below     Equipment x max(1, floor(quality * level / 2))
 *
 * **These are the counts for one copy at reforge level 0.** A reforged item
 * gives back a share of what the reforge cost as well, which the item page
 * prices separately rather than folding in here.
 *
 * **And they are read from a different pak than the rest of this file.** The
 * source tree is the S2 test build; the site reads the published one. The
 * formulas are the game's rules rather than its content and have no reason to
 * move between the two, but that is an argument, not a guarantee — which is
 * why it is written down here rather than left to be inferred.
 */
function dismantleOf(item: ItemFull, src: Record<string, unknown>): Dismantle | undefined {
  // The addon's own `lf`: a "treasure" is a treasure subclass, a neutral drop,
  // or anything explicitly un-banned from the neutral slot.
  const isTreasure =
    item.subclass === 'treasure' ||
    (asNumber(src['ItemIsNeutralActiveDrop']) ?? 0) > 0 ||
    (src['SpeciallyBannedFromNeutralSlot'] !== undefined &&
      String(src['SpeciallyBannedFromNeutralSlot']) === '0');

  // Both clamp to 1 in the addon, so a missing or zero field reads as tier 1.
  const quality = Math.max(1, Math.floor(item.quality || 1));
  const level = Math.max(1, Math.floor(item.level || 1));

  const out = (rule: string, outputs: DismantleOutput[]): Dismantle => ({ rule, outputs });
  /** The half-level that three of the branches below are counted in. */
  const half = Math.floor(level / 2);

  if (item.type === 'gem') {
    return out('dismantle_gem', [
      { id: ESSENCE_IDS.SIGIL, count: Math.min(10, Math.max(1, level + quality - 1)) },
    ]);
  }
  if (item.type === 'stone') return out('dismantle_stone', [{ id: ESSENCE_IDS.MYTHIC, count: 1 }]);
  if (item.type !== 'equip') return undefined;

  /*
   * A treasure returns Equipment Essence by the level, and from level three a
   * half-level of Legendary on top — which is what the `floor(level / 2) > 0`
   * guard in the client's display list was a shadow of. At quality six there is
   * a 25% Mythic as well.
   */
  if (isTreasure) {
    const outputs: DismantleOutput[] = [{ id: ESSENCE_IDS.EQUIPMENT, count: level }];
    if (level >= 3) {
      outputs.push({ id: ESSENCE_IDS.LEGENDARY, count: half });
      if (quality === 6) outputs.push({ id: ESSENCE_IDS.MYTHIC, count: half, chance: 25 });
    }
    return out(quality === 6 ? 'dismantle_treasure_q6' : 'dismantle_treasure_q5', outputs);
  }

  if (quality >= 6) return out('dismantle_equip_q6', [{ id: ESSENCE_IDS.MYTHIC, count: Math.max(1, half) }]);
  if (quality >= 5) return out('dismantle_equip_q5', [{ id: ESSENCE_IDS.LEGENDARY, count: level }]);
  return out('dismantle_equip_low_quality', [
    { id: ESSENCE_IDS.EQUIPMENT, count: Math.max(1, Math.floor((quality * level) / 2)) },
  ]);
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * Where each item comes from, out of the endless Greed Cave's reward tables.
 *
 * Every row is a depth and a pool type, and splits its rolls between named
 * groups — `equipment:90|stone:10` — each with its own weighted item list.
 * This inverts that into "which rows mention this item", which is the question
 * a page about one item asks.
 *
 * It is the only answer the pak has for a **fate stone**: a stone is
 * `ItemPurchasable` with `ItemDroppable 0` and appears in no drop pool, no
 * treasure pool and no fragment shop.
 */
const greedCavePath = path.join(DIRS.cacheRaw, path.basename(cfg.greedCavePath));
const sourcesByItem = new Map<string, ItemSource[]>();

if (!fs.existsSync(greedCavePath)) {
  warn(`missing cache/raw/${path.basename(cfg.greedCavePath)}; run 02-extract-raw first`);
} else {
  const { root } = parseKv(fs.readFileSync(greedCavePath, 'utf8'));
  const rows = (findChild(root, 'CSVContent') ?? root) as KvObject;

  /** `equipment:90|stone:10` and `item_x:50|item_y:7` are the same shape. */
  const pairs = (value: unknown): Array<[string, number]> =>
    String(value ?? '')
      .split('|')
      .map((part) => part.split(':'))
      .filter((bits): bits is [string, string] => bits.length === 2 && bits[0] !== '')
      .map(([name, n]) => [name, Number(n)] as [string, number])
      .filter(([, n]) => Number.isFinite(n));

  for (const [pool, raw] of Object.entries(rows)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const level = asNumber(row['Level']) ?? 0;
    const kind = asString(row['PoolType']) ?? '';

    /*
     * `equipment` -> `EquipmentItems`, `stone` -> `StoneItems`. Derived from
     * the group's own name rather than from a list here, so a group the addon
     * adds is picked up without an edit — and one whose item list is missing is
     * simply a group with nothing in it.
     */
    for (const [group, groupPct] of pairs(row['items'])) {
      const field = `${group.charAt(0).toUpperCase()}${group.slice(1)}Items`;
      for (const [id, weight] of pairs(row[field])) {
        const list = sourcesByItem.get(id) ?? [];
        list.push({ pool, level, kind, weight, groupPct });
        sourcesByItem.set(id, list);
      }
    }
  }
  ok(`greed cave: ${sourcesByItem.size} item(s) have a stated source`);
}

// --- pass 1: structural normalization ---------------------------------------

const items = new Map<string, ItemFull>();
const droppedFields = new Map<string, number>();
const nonNumericValues: string[] = [];

for (const [id, src] of Object.entries(raw)) {
  // The payload carries a stray "\r" field on ~100 items; drop anything that
  // is not a plausible identifier rather than letting it reach the output.
  for (const key of Object.keys(src)) {
    if (!/^[A-Za-z0-9_]+$/.test(key)) {
      droppedFields.set(key, (droppedFields.get(key) ?? 0) + 1);
      delete src[key];
    }
  }

  const values: Record<string, number | string> = {};
  const av = src['AbilityValues'];
  if (av && typeof av === 'object' && !Array.isArray(av)) {
    for (const [k, v] of Object.entries(av as Record<string, unknown>)) {
      if (typeof v === 'number') values[k] = v;
      else if (typeof v === 'string') {
        values[k] = v;
        nonNumericValues.push(`${id}.${k}`);
      }
    }
  }

  const colorArr = Array.isArray(src['Color']) ? (src['Color'] as unknown[]).map(Number) : undefined;
  const color =
    colorArr && colorArr.length === 3 && colorArr.every(Number.isFinite)
      ? ([colorArr[0]!, colorArr[1]!, colorArr[2]!] as [number, number, number])
      : undefined;

  const gemKind = asString(src['gem_kind']);
  const gemValues = parsePairs(src['gem_value']);
  const allowed = asArray(src['allowed_professions']).filter(Boolean);
  const preferred = asArray(src['preferred_professions']).filter(Boolean);
  const tags = asArray(src['target_tags']).filter(Boolean);

  const ability = {
    behavior: asArray(src['AbilityBehavior']).filter(Boolean),
    castPoint: asNumber(src['AbilityCastPoint']),
    castRange: asNumber(src['AbilityCastRange']),
    cooldown: asNumber(src['AbilityCooldown']),
    manaCost: asNumber(src['AbilityManaCost']),
    healthCostPct: asNumber(src['AbilityHealthCostPct']),
    targetTeam: asString(src['AbilityUnitTargetTeam']),
    targetType: asArray(src['AbilityUnitTargetType']).filter(Boolean),
    targetFlags: asString(src['AbilityUnitTargetFlags']),
  };
  const hasAbility = Object.values(ability).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined,
  );

  const inGame = asNumber(src['is_item_in_game']) === 1 ? 1 : 0;
  const hidden = asNumber(src['hide']) === 1 ? 1 : 0;

  const petUnitName = asString(src['PetUnitName']);
  const isPet = asNumber(src['IsPet']) === 1 || petUnitName !== undefined;
  const isNeutral = src['ItemIsNeutralActiveDrop'] !== undefined;

  const itemType = asString(src['itemType']) ?? 'unknown';
  /*
   * A Life Soul. Typed 'equip' in the item table like everything worn, and the
   * only thing that says otherwise is the ruleset table — which is also the
   * addon's own test: its item library filters Equipment as
   * `itemType === 'equip' && !isLifeSoul(id)` and gives the souls a tab of
   * their own. Same rule here, so a soul is offered for the soul slot and not
   * as a seventh worn piece.
   */
  const isSoul = soulSeasons.has(id);
  const seasons = seasonsOf(id, src['AllowedRulesets']);
  // Slot eligibility. See SLOT_KIND in aow5-shared/src/types/items.ts for the rationale;
  // the P-prefixed 'special' entries are consumables that share the potion
  // naming, and pets are typed 'equip' but belong only in the pet slot.
  let kinds = SLOT_KIND.BACKPACK;
  if (itemType === 'potion' || (itemType === 'special' && /^item_P/.test(id))) kinds |= SLOT_KIND.POTION;
  if (itemType === 'equip' && !isPet && !isSoul) kinds |= SLOT_KIND.EQUIP;
  if (itemType === 'gem') kinds |= SLOT_KIND.RUNE;
  if (isPet) kinds |= SLOT_KIND.PET;
  if (isNeutral) kinds |= SLOT_KIND.NEUTRAL;
  if (isSoul) kinds |= SLOT_KIND.SOUL;

  /*
   * The two sources have to agree. A soul the item table does not lock to the
   * season whose ruleset lists it would be offered in a season that deletes it
   * from its own catalogue, which is the one thing the slot must not do.
   */
  if (isSoul) {
    const listed = (soulSeasons.get(id) ?? []).join(',');
    const allowed = (seasons ?? []).join(',');
    if (listed !== allowed || allowed === '') {
      soulSeasonMismatches.push(`${id} (table [${listed}] vs AllowedRulesets [${allowed || 'none'}])`);
    }
  }

  const item: ItemFull = {
    id,
    idx: -1, // assigned in 07-emit against the frozen id table
    type: itemType,
    // item_tango is the one vanilla item here; its quality is the string
    // "consumable" rather than the addon's 1-7 scale.
    quality: asNumber(src['ItemQuality']) ?? 0,
    level: asNumber(src['Level']) ?? 0,
    cost: asNumber(src['ItemCost']) ?? 0,
    timeCost: asNumber(src['TimeCost']),

    texture: asString(src['AbilityTextureName']) ?? '',
    icon: '', // filled in by 05/06
    iconSource: 'placeholder',
    iconW: 0,
    iconH: 0,

    needs: parseNeeds(src['Needs']),
    usedBy: [],
    produces: asString(src['item']),
    upgradesFrom: asString(src['old_item']),
    isRecipe: asNumber(src['ItemRecipe']) === 1 ? true : undefined,
    synthesis: asNumber(src['Synthesis']),

    values,
    ability: hasAbility ? ability : undefined,
    gem: gemKind || Object.keys(gemValues).length > 0 ? { kind: gemKind, values: gemValues } : undefined,
    professions:
      allowed.length > 0 || preferred.length > 0
        ? { allowed: allowed.length ? allowed : undefined, preferred: preferred.length ? preferred : undefined }
        : undefined,

    color,
    colorHex: color ? `#${hex2(color[0])}${hex2(color[1])}${hex2(color[2])}` : undefined,
    tags: tags.length > 0 ? tags : undefined,
    subclass: asString(src['Subclass']),
    size: asNumber(src['Size']),
    model: asString(src['Model']),
    effect: asString(src['Effect']),
    scriptFile: asString(src['ScriptFile']),

    stackable: asNumber(src['ItemStackable']),
    carryLimit: asNumber(src['ItemCarryLimit']),
    initialCharges: asNumber(src['ItemInitialCharges']),
    purchasable: asNumber(src['ItemPurchasable']),
    droppable: asNumber(src['ItemDroppable']),
    sellable: asNumber(src['ItemSellable']),

    isPet: isPet || undefined,
    isNeutral: isNeutral || undefined,
    isSoul: isSoul || undefined,
    petUnitName,
    sources: sourcesByItem.get(id),
    seasons,
    kinds,

    flags: { inGame, hidden, playable: inGame === 1 && hidden !== 1 },
  };

  const dismantle = dismantleOf(item, src);
  if (dismantle) item.dismantle = dismantle;

  items.set(id, item);
}

check(
  soulSeasonMismatches.length === 0,
  `every life soul is locked to the season whose table lists it (${soulSeasons.size} soul(s), ` +
    `${soulSeasonMismatches.length} disagreement(s)${soulSeasonMismatches.length > 0 ? `: ${soulSeasonMismatches.join(', ')}` : ''})`,
);

if (droppedFields.size > 0) {
  const summary = [...droppedFields].map(([k, n]) => `${JSON.stringify(k)}x${n}`).join(', ');
  info(`dropped non-identifier field(s): ${summary}`);
}
if (nonNumericValues.length > 0) {
  info(`${nonNumericValues.length} non-numeric AbilityValues entry(ies): ${nonNumericValues.slice(0, 5).join(', ')}`);
}

// --- pass 2: crafting graph -------------------------------------------------

const danglingNeeds: string[] = [];
for (const item of items.values()) {
  for (const need of item.needs) {
    const target = items.get(need.id);
    if (!target) {
      danglingNeeds.push(`${item.id} -> ${need.id}`);
      continue;
    }
    if (!target.usedBy.includes(item.id)) target.usedBy.push(item.id);
  }
}
for (const item of items.values()) item.usedBy.sort();

const danglingProduces = [...items.values()]
  .filter((i) => i.produces && !items.has(i.produces))
  .map((i) => `${i.id} -> ${i.produces}`);

// Some recipes reference ingredient ids that no KV file defines - verified
// upstream bugs in the addon's own data, including a literal `tem_M308` typo.
// They are listed in config so this check still fails on NEW breakage.
const knownDangling = new Set(cfg.knownDataIssues.danglingNeedIds);
const unexpectedDangling = danglingNeeds.filter((d) => !knownDangling.has(d.split(' -> ')[1] ?? ''));
if (danglingNeeds.length > 0) {
  info(`${danglingNeeds.length} dangling Needs reference(s) to ${[...new Set(danglingNeeds.map((d) => d.split(' -> ')[1]))].join(', ')} (known addon data bugs)`);
}
check(unexpectedDangling.length === 0, `crafting graph: ${unexpectedDangling.length} unexpected dangling reference(s)`);
if (danglingProduces.length > 0) info(`${danglingProduces.length} blueprint(s) point at an unknown product`);

// --- pass 3: localization ---------------------------------------------------

const htmlSurvey = surveyHtml(
  Object.values(tokens).flatMap((map) =>
    Object.entries(map)
      .filter(([k]) => k.startsWith(TOKEN_PREFIX))
      .map(([, v]) => v),
  ),
);
writeJsonPretty(path.join(DIRS.reports, 'html-tag-histogram.json'), htmlSurvey);
info(`html tags in use: ${Object.keys(htmlSurvey.tags).sort().join(', ') || '(none)'}`);

const names: Record<string, Record<string, string>> = {};
const details: Record<string, Record<string, LocaleDetail>> = {};
const unresolved: Record<string, Record<string, string[]>> = {};
const missingNames: Record<string, string[]> = {};
const richIssues: Record<string, number> = {};

/**
 * Life Soul names, recovered from the addon's own translated description.
 *
 * The addon localizes a Life Soul's *text* into English and Russian but leaves
 * its **name token** as the Chinese original in all three files — so the site
 * drew 水鸟乱舞 on an English page while the tooltip under it read "Life Soul
 * Skill: Waterfowl Dance". The name it wanted was right there in the heading.
 *
 * Taken from the addon rather than written here, which is the whole point: a
 * hand-typed table would be thirty guesses at what the author meant, would go
 * stale the day they translate the tokens, and would say nothing at all about
 * the souls added next season. This says exactly what the addon says.
 *
 * Narrow on purpose. It applies only to Life Souls, only where the name still
 * has Han characters in it, and only where the description opens with a
 * heading of the form `<h1>… : <name></h1>` — every other untranslated item in
 * the pak is untranslated in its description too, so there is nothing to
 * recover and nothing here pretends otherwise.
 */
const HEADING = /^\s*<h1>\s*([^<]*?)\s*<\/h1>/;

/** The part of a heading after its label — "Life Soul Skill: X" -> "X". */
function nameFromHeading(rawDesc: string | undefined): string | null {
  const heading = rawDesc?.match(HEADING)?.[1];
  if (heading === undefined) return null;
  // Both the ASCII and the fullwidth colon; the Chinese heading uses the latter.
  const at = heading.search(/[:：]/);
  const name = (at < 0 ? heading : heading.slice(at + 1)).trim();
  return name === '' || hasHan(name) ? null : name;
}

/** Souls whose name could not be recovered, reported in one line. */
const soulNameGaps: string[] = [];
let soulNamesRecovered = 0;

/**
 * Names written by hand, for items the addon has not named outside Chinese.
 *
 * Lives in the shared package rather than in this directory's config because
 * it is the one input here that a re-run cannot reproduce: somebody chose those
 * words. `parser/` is untracked and regenerable; these are neither.
 *
 * Applied *only* where the pak still leaves the name in Chinese, so the pak
 * always wins. That is what makes the table safe to leave in place: the day the
 * addon translates one of these, its own name takes over and the run says the
 * entry here can go.
 */
const overridesPath = path.join(DIRS.data, 'name-overrides.json');
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8')) as {
  names: Record<string, Record<string, string>>;
  text?: Record<string, Record<string, { desc?: string; lore?: string }>>;
};
const nameOverrides = overrides.names;
/**
 * Descriptions and lore for the items the addon leaves in Chinese everywhere.
 *
 * Applied to the **raw token**, before substitution and before the rich-text
 * parse — so a translation carries the `<h1>` markup and the `%placeholders%`
 * and is treated exactly as the addon's own string would be. The generator
 * asserts the placeholder sets match before it writes the file; nothing here
 * re-checks that, because a mismatch there is a bad translation rather than a
 * bad pak, and this step is about the pak.
 */
const textOverrides = overrides.text ?? {};
let descriptionsApplied = 0;
let loreApplied = 0;

/** Overrides the addon has caught up with, and ones aimed at nothing. */
const staleOverrides: string[] = [];
const unusedOverrides = new Set(Object.keys(nameOverrides));
let overridesApplied = 0;

for (const lang of cfg.languages) {
  const map = tokens[lang];
  if (!map) continue;
  names[lang] = {};
  details[lang] = {};
  unresolved[lang] = {};
  missingNames[lang] = [];

  for (const item of items.values()) {
    const base = `${TOKEN_PREFIX}${item.id.toLowerCase()}`;
    const src = { values: item.values, top: raw[item.id] ?? {} };

    const rawName = map[base];
    if (rawName === undefined) missingNames[lang].push(item.id);
    // Fall back to a readable form of the id so the UI never shows a blank tile.
    names[lang][item.id] = rawName !== undefined ? substitute(rawName, src).text : item.id;

    // A Life Soul still wearing its Chinese name in a language that is not
    // Chinese. See `nameFromHeading`.
    if (lang !== cfg.baseLanguage && soulSeasons.has(item.id) && hasHan(names[lang][item.id])) {
      const recovered = nameFromHeading(map[`${base}_description`]);
      if (recovered === null) soulNameGaps.push(`${lang}/${item.id}`);
      else {
        names[lang][item.id] = recovered;
        soulNamesRecovered += 1;
      }
    }

    // And then the hand-written table, for the items with nothing to recover.
    const override = nameOverrides[item.id]?.[lang];
    if (override !== undefined && lang !== cfg.baseLanguage) {
      unusedOverrides.delete(item.id);
      if (hasHan(names[lang][item.id])) {
        names[lang][item.id] = override;
        overridesApplied += 1;
      } else {
        staleOverrides.push(`${lang}/${item.id}`);
      }
    }

    const detail: LocaleDetail = {};

    /*
     * The override only stands in where the addon still has Chinese here, so
     * the day it translates one its own text wins — the same rule the names
     * above follow.
     */
    const textOverride = lang === cfg.baseLanguage ? undefined : textOverrides[item.id]?.[lang];
    const rawDesc =
      textOverride?.desc !== undefined && hasHan(map[`${base}_description`])
        ? ((descriptionsApplied += 1), textOverride.desc)
        : map[`${base}_description`];
    if (rawDesc !== undefined) {
      const sub = substitute(rawDesc, src);
      if (sub.unresolved.length > 0) unresolved[lang][item.id] = sub.unresolved;
      let parsed: RichNode[] = [];
      let plain = '';
      try {
        const rt = parseRichText(sub.text);
        parsed = rt.nodes;
        plain = rt.plain;
        for (const issue of rt.issues) richIssues[issue.kind] = (richIssues[issue.kind] ?? 0) + 1;
      } catch (err) {
        check(false, `richtext ${lang}/${item.id}: ${(err as Error).message}`);
      }
      detail.desc = parsed;
      detail.descPlain = plain;
    }

    const rawLore =
      textOverride?.lore !== undefined && hasHan(map[`${base}_lore`])
        ? ((loreApplied += 1), textOverride.lore)
        : map[`${base}_lore`];
    if (rawLore !== undefined) {
      const sub = substitute(rawLore, src);
      // Lore is plain prose; strip any stray markup rather than modelling it.
      detail.lore = parseRichText(sub.text).plain;
    }

    // Per-stat labels, e.g. `..._item_0100_bonus_all_stats`.
    const valueLabels: Record<string, string> = {};
    for (const key of Object.keys(item.values)) {
      const label = map[`${base}_${key.toLowerCase()}`];
      if (label !== undefined) valueLabels[key] = substitute(label, src).text;
    }
    if (Object.keys(valueLabels).length > 0) detail.values = valueLabels;

    if (Object.keys(detail).length > 0) details[lang][item.id] = detail;
  }

  const missing = missingNames[lang]!.length;
  const unres = Object.keys(unresolved[lang]!).length;
  ok(
    `${lang}: ${Object.keys(names[lang]!).length} names (${missing} fallback), ` +
      `${Object.keys(details[lang]!).length} detail records, ${unres} item(s) with unresolved tokens`,
  );
}

/*
 * Loud when it stops working. A soul whose heading no longer parses is a name
 * silently back to Chinese on two thirds of the site, which is exactly the kind
 * of thing that goes unnoticed for a month.
 */
if (soulNamesRecovered > 0 || soulNameGaps.length > 0) {
  ok(
    `life-soul names recovered from their own descriptions: ${soulNamesRecovered}` +
      (soulNameGaps.length > 0 ? ` (${soulNameGaps.length} not recoverable: ${soulNameGaps.join(', ')})` : ''),
  );
}
if (soulNameGaps.length > 0) {
  warn(`${soulNameGaps.length} life soul name(s) stay Chinese outside ${cfg.baseLanguage}: ${soulNameGaps.join(', ')}`);
}

ok(`hand-written names applied: ${overridesApplied} (${Object.keys(nameOverrides).length} in the table)`);
ok(
  `hand-written text applied: ${descriptionsApplied} description(s), ${loreApplied} lore ` +
    `(${Object.keys(textOverrides).length} item(s) in the table)`,
);
/*
 * Both of these mean the table has drifted from the game, and both are warnings
 * rather than failures: the site is still correct, there is simply an entry to
 * delete or to re-aim. Silence here is how a hand-written name outlives the
 * real one by a year.
 */
if (staleOverrides.length > 0) {
  warn(
    `${staleOverrides.length} hand-written name(s) the addon now translates itself — drop them from ` +
      `data/name-overrides.json: ${staleOverrides.join(', ')}`,
  );
}
if (unusedOverrides.size > 0) {
  warn(
    `${unusedOverrides.size} hand-written name(s) match no item in this pak: ${[...unusedOverrides].join(', ')}`,
  );
}

if (Object.keys(richIssues).length > 0) {
  info(`richtext issues: ${Object.entries(richIssues).map(([k, v]) => `${k}=${v}`).join(', ')}`);
}

writeJsonPretty(path.join(DIRS.reports, 'unresolved-placeholders.json'), unresolved);

// --- pass 4: independent cross-check against the KV sources -----------------
// The item table came out of a compiled Panorama script. Diffing it against the
// hand-authored KV files is what proves that extraction was faithful, and it
// keeps the fallback KV parser exercised instead of quietly rotting.

const kvItems = new Map<string, KvObject>();
const kvDuplicateIds: string[] = [];
let kvFilesRead = 0;
// `kvCrossCheckGlobs` is in the same order as the `#base` includes in
// npc_items_custom.txt, and a later include overrides an earlier one — verified
// against item_2014, which ak_items.txt and ak_items_change.txt both define and
// which the game's merged table resolves to the ak_items_change.txt values.
// So: last file wins across files, first key wins within a file.
for (const rel of cfg.kvCrossCheckGlobs) {
  const file = path.join(DIRS.cacheRaw, path.basename(rel));
  if (!fs.existsSync(file)) continue;
  kvFilesRead++;
  const parsed = parseKv(fs.readFileSync(file));
  const content = findChild(parsed.root, 'CSVContent') ?? parsed.root;
  for (const [key, value] of Object.entries(content)) {
    if (typeof value !== 'object') continue;
    if (kvItems.has(key)) kvDuplicateIds.push(key);
    kvItems.set(key, value);
  }
}
if (kvDuplicateIds.length > 0) {
  info(`${kvDuplicateIds.length} item(s) defined in more than one KV file (last include wins): ${kvDuplicateIds.join(', ')}`);
}

const numericFields: [kv: string, get: (i: ItemFull) => number][] = [
  ['ItemCost', (i) => i.cost],
  ['Level', (i) => i.level],
  ['ItemQuality', (i) => i.quality],
];
const mismatches: string[] = [];
let compared = 0;
for (const [id, kv] of kvItems) {
  const item = items.get(id);
  if (!item) continue;
  for (const [field, get] of numericFields) {
    const rawVal = kv[field];
    if (typeof rawVal !== 'string') continue;
    const expected = Number(rawVal.trim());
    if (!Number.isFinite(expected)) continue; // e.g. item_tango's "consumable"
    compared++;
    if (expected !== get(item)) mismatches.push(`${id}.${field}: kv=${expected} payload=${get(item)}`);
  }
}

const onlyInKv = [...kvItems.keys()].filter((k) => !items.has(k)).sort();
const onlyInPayload = [...items.keys()].filter((k) => !kvItems.has(k)).sort();

writeJsonPretty(path.join(DIRS.reports, 'kv-crosscheck.json'), {
  kvFilesRead,
  kvItemCount: kvItems.size,
  payloadItemCount: items.size,
  fieldsCompared: compared,
  duplicateIds: kvDuplicateIds,
  mismatches,
  onlyInKv,
  onlyInPayload,
});

info(`cross-check: ${kvItems.size} KV items, ${compared} field comparisons`);
check(mismatches.length === 0, `cross-check: ${mismatches.length} field mismatch(es)`);
if (onlyInKv.length > 0) info(`${onlyInKv.length} item(s) only in KV: ${onlyInKv.slice(0, 8).join(', ')}`);
if (onlyInPayload.length > 0) info(`${onlyInPayload.length} item(s) only in payload: ${onlyInPayload.slice(0, 8).join(', ')}`);

// --- counts -----------------------------------------------------------------

const typeHistogram: Record<string, number> = {};
for (const item of items.values()) typeHistogram[item.type] = (typeHistogram[item.type] ?? 0) + 1;

const dismantleHistogram: Record<string, number> = {};
const essenceHistogram: Record<string, number> = {};
for (const item of items.values()) {
  if (!item.dismantle) continue;
  dismantleHistogram[item.dismantle.rule] = (dismantleHistogram[item.dismantle.rule] ?? 0) + 1;
  for (const o of item.dismantle.outputs) essenceHistogram[o.id] = (essenceHistogram[o.id] ?? 0) + 1;
}
// Every essence the rules can name has to be a real item, or the tracker would
// be counting a reward the game never grants.
const unknownEssences = Object.keys(essenceHistogram).filter((id) => !items.has(id));
check(unknownEssences.length === 0, `dismantle: every essence output is a known item (${unknownEssences.join(', ')})`);

const inGameCount = [...items.values()].filter((i) => i.flags.inGame === 1).length;
const hiddenCount = [...items.values()].filter((i) => i.flags.hidden === 1).length;
const withNeeds = [...items.values()].filter((i) => i.needs.length > 0).length;
const playableCount = [...items.values()].filter((i) => i.flags.playable).length;

checkSoft(items.size, cfg.expected.itemCount, 'item count');
checkSoft(inGameCount, cfg.expected.inGameCount, 'is_item_in_game=1');
checkSoft(hiddenCount, cfg.expected.hiddenCount, 'hide=1');
checkSoft(withNeeds, cfg.expected.withNeedsCount, 'items with Needs');
for (const [type, expected] of Object.entries(cfg.expected.itemTypeHistogram)) {
  checkSoft(typeHistogram[type] ?? 0, expected, `itemType ${type}`);
}
info(`playable (in game and not hidden): ${playableCount}`);

for (const [rule, expected] of Object.entries(cfg.expected.dismantleRuleHistogram)) {
  checkSoft(dismantleHistogram[rule] ?? 0, expected, `dismantle rule ${rule}`);
}
info(
  `dismantle: ${Object.values(dismantleHistogram).reduce((a, b) => a + b, 0)} item(s) yield essence — ` +
    Object.entries(essenceHistogram)
      .sort()
      .map(([id, n]) => `${id}=${n}`)
      .join(', '),
);

writeJsonPretty(path.join(DIRS.reports, 'counts.json'), {
  itemCount: items.size,
  playableCount,
  inGameCount,
  hiddenCount,
  withNeeds,
  typeHistogram,
  dismantleHistogram,
  essenceHistogram,
  droppedFields: Object.fromEntries(droppedFields),
  nonNumericValues,
  danglingNeeds,
  danglingProduces,
  richIssues,
  htmlTags: htmlSurvey.tags,
});

// --- output -----------------------------------------------------------------

writeJson(path.join(DIRS.cache, 'items.normalized.json'), Object.fromEntries(items));
for (const lang of cfg.languages) {
  if (!names[lang]) continue;
  writeJson(path.join(DIRS.cache, `locale.${lang}.json`), { names: names[lang], details: details[lang] });
}
ok(`wrote cache/items.normalized.json (${items.size} items)`);

exitIfFailed();
