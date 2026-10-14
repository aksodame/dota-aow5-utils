import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { parseKv, type KvObject } from './lib/kv.ts';
import { Vpk } from './lib/vpk.ts';
import { readRulesetManifest, readRulesetTable } from './lib/ruleset.ts';
import { decodeVtex, encodePng, readVtexInfo } from './lib/vtex.ts';
import { readPngInfo, stripTextChunks } from './lib/png.ts';
import { substitute } from './lib/placeholders.ts';
import { parseRichText } from './lib/richtext.ts';
import { sortKeys, writeJson, writeJsonPretty } from './lib/writeJson.ts';
import { check, checkSoft, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import { isAbilitySlot, type AbilityLocale, type AbilitySlotKey } from '../../packages/aow5-shared/src/types/heroes.ts';
import {
  sumStats,
  talentIconFile,
  type AttrBonus,
  type AttrTriple,
  type HeroKv,
  type HeroStatsEntry,
  type HeroStatsFile,
  type HeroesWikiFile,
  type HeroesWikiLocale,
  type ItemCount,
  type NamedText,
  type PrimaryAttr,
  type Profession,
  type ProfessionTier,
  type ProgressionFile,
  type ProgressionLocale,
  type RuneFamily,
  type StatPair,
  type TalentNode,
  type TalentTree,
  type WikiAbility,
  type WikiHero,
  type WikiHeroText,
} from '../../packages/aow5-shared/src/wiki/progression.ts';

/**
 * Step 08b — the wiki's progression domain: talent trees, profession ladders,
 * the heroes' kits with their runes, and the stats calculator's inputs.
 *
 * **Which copy of the tables.** The pak carries the talent, profession,
 * ability and gem tables three ways: hand-authored KV under `scripts/npc/`
 * (the base, which is S1), a compiled copy per season under
 * `panorama/.../vendor/data/rulesets/<s>/` (what the client reads), and the
 * server's Lua copy of the same per-season tables. This step reads the
 * per-season Panorama copies — complete tables, not deltas — and diffs them:
 * S2 is primary, anything another season changes goes under `bySeason`.
 *
 * `scripts/npc/seasons/s2/*.txt` is **not** used. It is four rows of test data
 * (`T000` worth 100 health, Axe gaining 8 strength a tier) that neither the
 * client's nor the server's S2 table agrees with.
 *
 * **What the HUD bundle adds.** Some facts exist only as literals in the
 * compiled client (`hud/script.vjs_c`, step 02's `hud_script.js`): which trees
 * the talent window has tabs for and their title tokens, which trees a season
 * hides, which token labels each stat key, and the class a profession is shown
 * as. Every pattern is anchored on the shape of the literal, never on a
 * minified name, and fails loudly when it stops matching.
 *
 * **Attribute constants** come from `scripts/vscripts/shared/const.lua`, which
 * the pak ships as plain (unencrypted) Lua: `ATTR_PRIMARY_BONUS` and the two
 * saturation curves. Nothing encrypted is read.
 */

const PRIMARY_SEASON = 's2';
const RULESET_DIR = 'panorama/layout/custom_game/vendor/data/rulesets';
const TALENT_ICON_DIR = 'panorama/images/custom_game/talent';
const PANORAMA_SPELLICONS = 'panorama/images/spellicons';
const CONST_LUA = 'scripts/vscripts/shared/const.lua';
const STOCK_HEROES_KV = 'scripts/npc/original_kv/npc_heroes.txt';
const HEROES_KV = 'scripts/npc/ak_heroes.txt';
/** The addon's placeholder naming for an ability it has not written yet (as in step 04b). */
const PLACEHOLDER_NAME = /^(?:ability|skill|talent)\s*\d+$/i;
const PLACEHOLDER_DESC = /^to be filled\.?$/i;
const ID = '[\\w$]+';

ensureDirs();
const cfg = loadConfig();
step('08b · wiki progression, heroes and hero stats');

const WIKI_DIR = path.join(DIRS.publicData, 'wiki');
const TALENT_ICONS = path.join(DIRS.publicIcons, 'talents');
const ABILITY_ICONS_WIKI = path.join(DIRS.publicIcons, 'abilities-wiki');
const generatedAt = new Date().toISOString();

// --- small parsers ----------------------------------------------------------

/** A CSV-derived field: absent, one value, a `|` list, or (in the rulesets) an array. */
function list(v: unknown): string[] {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

function num(v: unknown, what: string): number {
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new Error(`${what}: ${JSON.stringify(v)} is not a number`);
  return n;
}

/** `key:value` → `[key, number]`, failing on anything else. */
function pair(s: string, what: string): StatPair {
  const m = /^([A-Za-z0-9_]+):(-?[0-9.]+)$/.exec(s);
  if (!m) throw new Error(`${what}: ${JSON.stringify(s)} is not key:number`);
  return [m[1]!, Number(m[2])];
}

/** Deep equality that ignores key order (the payloads and the emitted files order keys differently). */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// --- the pak ----------------------------------------------------------------

const vpk = Vpk.open(cfg.vpkPath);
const readText = (p: string): string => vpk.readPath(p).toString('utf8');

const manifest = readRulesetManifest(vpk.readPath(`${RULESET_DIR}/manifest.vjs_c`), 'rulesets/manifest');
const seasons = manifest.seasons.map((s) => s.id);
check(seasons.includes(PRIMARY_SEASON), `ruleset manifest names ${seasons.join(', ')} (primary ${PRIMARY_SEASON})`);

type Row = Record<string, unknown>;
type Table = Record<string, Row>;
function rulesetTables(table: string): Record<string, Table> {
  const out: Record<string, Table> = {};
  for (const s of seasons) {
    out[s] = readRulesetTable(vpk.readPath(`${RULESET_DIR}/${s}/${table}.vjs_c`), table, `${s}/${table}`) as Table;
  }
  return out;
}
const talentBy = rulesetTables('ak_talent');
const professionBy = rulesetTables('ak_profession');
const abilityBy = rulesetTables('ak_abilities');
const gemBy = rulesetTables('ak_gems');
for (const s of seasons) {
  info(
    `${s}: ${Object.keys(talentBy[s]!).length} talents, ${Object.keys(professionBy[s]!).length} profession tiers, ` +
      `${Object.keys(abilityBy[s]!).length} abilities, ${Object.keys(gemBy[s]!).length} gems`,
  );
}
const T2 = talentBy[PRIMARY_SEASON]!;

/*
 * Cross-check the base season against the hand-authored KV. The first season
 * in the manifest is the base the others are diffed from; if the KV and its
 * compiled copy disagree, one of the two readings is wrong.
 */
{
  const base = manifest.baseSeason;
  const kv = (parseKv(vpk.readPath('scripts/npc/ak_talent.txt')).root['CSVContent'] ?? {}) as KvObject;
  const compiled = talentBy[base]!;
  const fieldsDiffer: string[] = [];
  for (const [id, row] of Object.entries(compiled)) {
    const k = kv[id];
    if (typeof k !== 'object') {
      fieldsDiffer.push(`${id} (missing)`);
      continue;
    }
    for (const [f, v] of Object.entries(row)) {
      const a = list(v).join('|');
      const b = list(k[f]).join('|');
      if (a !== b && Number(a) !== Number(b)) fieldsDiffer.push(`${id}.${f}`);
    }
  }
  check(
    fieldsDiffer.length === 0 && Object.keys(kv).length === Object.keys(compiled).length,
    `scripts/npc/ak_talent.txt matches the ${base} ruleset copy (${Object.keys(kv).length} rows)` +
      (fieldsDiffer.length ? `; differs: ${fieldsDiffer.slice(0, 10).join(', ')}` : ''),
  );
}

// --- localisation -----------------------------------------------------------

const tokens: Record<string, Record<string, string>> = {};
for (const lang of cfg.languages) {
  const file = path.join(DIRS.cache, `tokens.${lang}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing cache/tokens.${lang}.json; run 03-parse-locales first`);
  tokens[lang] = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
}

/*
 * A season retitles a row by pointing its token at a prefixed copy:
 * `talent_T600` → `ak_ruleset_s2__talent_T600`. The manifest lists the
 * redirects; the prefixed tokens live in the ordinary locale files.
 */
const remap: Record<string, Record<string, string>> = {};
for (const s of manifest.seasons as Array<{ id: string; localization?: { tokens?: Record<string, string> } }>) {
  remap[s.id] = {};
  for (const [from, to] of Object.entries(s.localization?.tokens ?? {})) remap[s.id]![from.toLowerCase()] = to.toLowerCase();
}
function tok(lang: string, key: string, season: string = PRIMARY_SEASON): string | undefined {
  const k = key.toLowerCase();
  return tokens[lang]![remap[season]?.[k] ?? k];
}
function plain(text: string, what: string): string {
  try {
    return parseRichText(text).plain.trim();
  } catch (err) {
    check(false, `richtext ${what}: ${(err as Error).message}`);
    return text;
  }
}

// --- the HUD bundle ---------------------------------------------------------

const hudFile = path.join(DIRS.cacheRaw, 'hud_script.js');
if (!fs.existsSync(hudFile)) throw new Error('missing cache/raw/hud_script.js; run 02-extract-raw first');
const hud = fs.readFileSync(hudFile, 'utf8');

function hudOne(re: RegExp, what: string): RegExpExecArray {
  const all = [...hud.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))];
  if (all.length !== 1) {
    throw new Error(`hud: expected exactly one ${what}, found ${all.length}. The talent window has changed shape.`);
  }
  return all[0]!;
}

/** The talent window's tabs: `[{id:"tree1",title:gt("talent_核心天赋")},…]`. */
const tabMatch = hudOne(new RegExp(`=\\[((?:\\{id:"tree\\d+",title:${ID}\\("[^"]+"\\)\\},?)+)\\]`), 'tab list');
const tabs: Array<{ id: string; token: string }> = [
  ...tabMatch[1]!.matchAll(new RegExp(`id:"(tree\\d+)",title:${ID}\\("([^"]+)"\\)`, 'g')),
].map((m) => ({ id: m[1]!, token: m[2]! }));
ok(`talent window tabs: ${tabs.map((t) => t.id).join(', ')}`);

/** Tree → title token, which also names three hero trees. */
const nameMatch = hudOne(new RegExp(`=\\{((?:tree\\d+:${ID}\\("[^"]+"\\),?)+)\\}`), 'tree title map');
const treeTitleToken: Record<string, string> = {};
for (const m of nameMatch[1]!.matchAll(new RegExp(`(tree\\d+):${ID}\\("([^"]+)"\\)`, 'g'))) treeTitleToken[m[1]!] = m[2]!;
for (const t of tabs) {
  check(treeTitleToken[t.id] === t.token, `tab ${t.id} has the same title token in both HUD tables`);
}

/*
 * Season gating: `function nu(e,t){return"tree14"===e?"s3"===t:e!==mu||"s2"===t}`
 * with `mu=lu.s2.treeId` and `lu={…,s2:{…,treeId:"tree13"}}` — one tree only
 * in one season, and the season expansion pack's tree only in its season.
 */
const treeSeasons: Record<string, string[]> = {};
{
  const gate = hudOne(
    new RegExp(`function ${ID}\\(${ID},${ID}\\)\\{return"(tree\\d+)"===${ID}\\?"(s\\d+)"===${ID}:${ID}!==(${ID})\\|\\|"(s\\d+)"===${ID}\\}`),
    'tree season gate',
  );
  treeSeasons[gate[1]!] = [gate[2]!];
  const varName = gate[3]!.replace(/\$/g, '\\$');
  const def = hudOne(new RegExp(`[,;\\s]${varName}=(${ID})\\.(s\\d+)\\.treeId[;,]`), 'season pack tree reference');
  const packs = [...hud.matchAll(/\b(s\d+):\{[^{}]{0,400}?treeId:"(tree\d+)"\}/g)].filter((m) => m[1] === def[2]);
  check(packs.length === 1, `season pack ${def[2]} names exactly one tree`);
  if (packs[0]) treeSeasons[packs[0][2]!] = [gate[4]!];
  ok(`season-gated trees: ${Object.entries(treeSeasons).map(([t, s]) => `${t}→${s.join(',')}`).join(', ')}`);
}

/** Stat key → label token for the talent window; fallback `AK_Attr_<key>`. */
const statToken: Record<string, string> = {};
{
  const m = hudOne(
    /=\{((?:[a-z_0-9]+:"(?:talent_tree_attribute_|AK_Attr_)[A-Za-z_0-9]+",?)+)\}/,
    'talent stat label map',
  );
  for (const e of m[1]!.matchAll(/([a-z_0-9]+):"([A-Za-z_0-9]+)"/g)) statToken[e[1]!] = e[2]!;
  ok(`talent stat label map: ${Object.keys(statToken).length} keys`);
}

/*
 * The class a profession is shown as. The client decides it with a chain of
 * `heroName.includes("…")` ternaries ending in `{id,heroName,type,role}`; it is
 * evaluated here, in an empty sandbox, with the localiser stubbed to return
 * the token — so a reordering or a new hero in the chain is picked up rather
 * than guessed at.
 */
const roleOf = (() => {
  const m = hudOne(
    new RegExp(
      `let (${ID})="strength",(${ID})=(${ID})\\("change_战士"\\);return (.+?),\\{id:${ID},heroName:(${ID}),type:\\1,role:\\2`,
    ),
    'profession role chain',
  );
  const [, typeVar, roleVar, gtVar, chain, heroVar] = m;
  check(!/[;{}]|function|=>/.test(chain!), 'role chain is a plain expression');
  const fn = vm.runInNewContext(
    `(function(${heroVar},${gtVar}){let ${typeVar}="strength",${roleVar}=${gtVar}("change_战士");${chain};return [${typeVar},${roleVar}];})`,
    {},
  ) as (hero: string, gt: (k: string) => string) => [string, string];
  return (heroName: string): { type: string; role: string } => {
    const [type, role] = fn(heroName, (k) => k);
    return { type, role };
  };
})();

// --- talent trees -----------------------------------------------------------

function nodeOf(id: string, row: Row): TalentNode {
  const what = `talent ${id}`;
  const coin = list(row['cost_coin']).map((c) => pair(c, `${what}.cost_coin`));
  const unknownCoin = coin.filter(([k]) => k !== 'gold');
  if (unknownCoin.length) throw new Error(`${what}: unknown currency ${unknownCoin.map((c) => c[0]).join(',')}`);
  const node: TalentNode = {
    id,
    level: num(row['Level'], `${what}.Level`),
    col: num(row['layout_col'], `${what}.layout_col`),
    row: num(row['layout_row'], `${what}.layout_row`),
    needs: list(row['needs']),
    gold: coin.reduce((n, [, v]) => n + v, 0),
    items: list(row['cost']).map((c) => pair(c, `${what}.cost`) as ItemCount),
    time: num(row['time'], `${what}.time`),
    stats: list(row['data']).map((c) => pair(c, `${what}.data`)),
    unlocks: list(row['player_data']).map((c) => pair(c, `${what}.player_data`)),
    formulas: list(row['formula']),
    skills: list(row['profession_skills']),
    icon: talentIconFile(String(row['icon'] ?? '')),
  };
  // Rare fields are omitted when empty: most nodes grant a stat and nothing else.
  for (const k of ['unlocks', 'formulas', 'skills'] as const) if (node[k]?.length === 0) delete node[k];
  if (Number(row['IsRoot'] ?? 0) === 1) node.root = true;
  const prof = list(row['profession']);
  if (prof.length > 1) throw new Error(`${what}: several professions`);
  if (prof[0]) node.profession = prof[0];
  return node;
}

const KNOWN_TALENT_FIELDS = new Set([
  'type', 'Level', 'data', 'icon', 'cost_coin', 'time', 'IsRoot', 'layout_col', 'layout_row',
  'needs', 'cost', 'player_data', 'formula', 'profession', 'profession_skills',
]);
const DIFFABLE = ['gold', 'items', 'time', 'stats', 'unlocks', 'needs'] as const;

const trees: Record<string, TalentTree> = {};
const rawIcon: Record<string, string> = {};
for (const s of seasons) {
  const extra = Object.keys(talentBy[s]!).filter((id) => !(id in T2));
  check(extra.length === 0, `${s}: every talent row is also in ${PRIMARY_SEASON}${extra.length ? ` (extra: ${extra.join(', ')})` : ''}`);
}
for (const [id, row] of Object.entries(T2)) {
  const unknown = Object.keys(row).filter((f) => !KNOWN_TALENT_FIELDS.has(f));
  if (unknown.length) throw new Error(`talent ${id}: unknown field(s) ${unknown.join(', ')}`);
  const treeId = String(row['type']);
  const node = nodeOf(id, row);
  rawIcon[node.icon] = String(row['icon']);
  const present = seasons.filter((s) => talentBy[s]![id] !== undefined);
  if (present.length !== seasons.length) throw new Error(`talent ${id} is missing from ${seasons.filter((s) => !present.includes(s))}`);
  for (const s of seasons) {
    if (s === PRIMARY_SEASON) continue;
    const other = nodeOf(id, talentBy[s]![id]!);
    if (String(talentBy[s]![id]!['type']) !== treeId || other.col !== node.col || other.row !== node.row || other.level !== node.level) {
      throw new Error(`talent ${id}: ${s} moves the node (tree/position/level) — not modelled`);
    }
    const diff: Record<string, unknown> = {};
    for (const f of DIFFABLE) if (!same(other[f], node[f])) diff[f] = other[f];
    if (Object.keys(diff).length) (node.bySeason ??= {})[s] = diff as never;
  }
  const tree = (trees[treeId] ??= { id: treeId, cols: 0, rows: 0, nodes: [] });
  tree.nodes.push(node);
  tree.cols = Math.max(tree.cols, node.col + 1);
  tree.rows = Math.max(tree.rows, node.row + 1);
}
for (const [t, s] of Object.entries(treeSeasons)) {
  if (!trees[t]) check(false, `season-gated tree ${t} exists`);
  else trees[t]!.seasons = s;
}
for (const t of tabs) check(trees[t.id] !== undefined, `tab ${t.id} has nodes`);

// Edges must land inside the pak's own table.
{
  const dangling: string[] = [];
  const treeOf = new Map<string, string>();
  for (const t of Object.values(trees)) for (const n of t.nodes) treeOf.set(n.id, t.id);
  for (const t of Object.values(trees))
    for (const n of t.nodes) for (const need of n.needs) if (treeOf.get(need) !== t.id) dangling.push(`${n.id}→${need}`);
  // tree20 (no tab, no hero) hangs off tree2's T103. Emitted as the pak has
  // it; the UI draws an edge only when both ends are in the tree it shows.
  if (dangling.length) warn(`needs edges that leave their tree: ${dangling.join(', ')}`);
  else ok('every needs edge stays inside its tree');
  const missing = Object.values(trees).flatMap((t) => t.nodes.flatMap((n) => n.needs.filter((x) => !treeOf.has(x))));
  check(missing.length === 0, `every needs edge names a node${missing.length ? ` (unknown: ${missing.join(', ')})` : ''}`);
}
const seasonDiffNodes = Object.values(trees).flatMap((t) => t.nodes).filter((n) => n.bySeason);
info(
  `${Object.keys(trees).length} trees, ${Object.keys(T2).length} nodes; ${seasonDiffNodes.length} differ in another season ` +
    `(${[...new Set(seasonDiffNodes.flatMap((n) => Object.keys(n.bySeason!)))].join(', ')}: ` +
    `${[...new Set(seasonDiffNodes.flatMap((n) => Object.values(n.bySeason!).flatMap((d) => Object.keys(d ?? {}))))].join(', ')})`,
);

// --- professions ------------------------------------------------------------

function tierOf(key: string, row: Row): { profession: string; tree: string; tier: ProfessionTier } {
  const what = `profession ${key}`;
  const items: ItemCount[] = [];
  let heroLevel = 0;
  for (const u of list(row['unlock_items'])) {
    const [k, v] = pair(u, `${what}.unlock_items`);
    if (k === 'hero_level') heroLevel = v;
    else items.push([k, v]);
  }
  const growth: AttrTriple = { str: 0, agi: 0, int: 0 };
  for (const g of list(row['growth_bonus_key'])) {
    const [k, v] = pair(g, `${what}.growth_bonus_key`);
    if (k !== 'str' && k !== 'agi' && k !== 'int') throw new Error(`${what}: unknown growth key ${k}`);
    growth[k] = v;
  }
  return {
    profession: String(row['profession_id']),
    tree: String(row['talent_tree_id']),
    tier: { tier: num(row['tier'], `${what}.tier`), heroLevel, items, growth, wearables: list(row['wearable_rewards']) },
  };
}

const professions: Profession[] = [];
for (const s of seasons) {
  for (const [key, row] of Object.entries(professionBy[s]!)) {
    const m = /^(npc_dota_hero_\w+?)_tier_(\d+)$/.exec(key);
    if (!m) throw new Error(`profession row ${key} is not <hero>_tier_<n>`);
    const hero = m[1]!;
    const parsed = tierOf(key, row);
    let p = professions.find((x) => x.hero === hero);
    if (!p) {
      p = { hero, profession: parsed.profession, tree: parsed.tree, seasons: [], tiers: [] };
      professions.push(p);
    }
    if (p.profession !== parsed.profession || p.tree !== parsed.tree) throw new Error(`${key}: profession or tree changes by season`);
    if (!p.seasons.includes(s)) p.seasons.push(s);
  }
}
for (const p of professions) {
  const tierNums = [
    ...new Set(seasons.flatMap((s) => Object.keys(professionBy[s]!).filter((k) => k.startsWith(`${p.hero}_tier_`)))),
  ].sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()));
  for (const key of tierNums) {
    const present = seasons.filter((s) => professionBy[s]![key] !== undefined);
    const primary = present.includes(PRIMARY_SEASON) ? PRIMARY_SEASON : present[0]!;
    const tier = tierOf(key, professionBy[primary]![key]!).tier;
    for (const s of present) {
      if (s === primary) continue;
      const other = tierOf(key, professionBy[s]![key]!).tier;
      const diff: Record<string, unknown> = {};
      for (const f of ['heroLevel', 'items', 'growth', 'wearables'] as const) if (!same(other[f], tier[f])) diff[f] = other[f];
      if (Object.keys(diff).length) (tier.bySeason ??= {})[s] = diff as never;
    }
    if (!same(present, p.seasons)) tier.seasons = present;
    p.tiers.push(tier);
  }
  const t = trees[p.tree];
  if (!t) check(false, `${p.hero}: profession tree ${p.tree} exists`);
  else t.hero = p.hero;
}
info(`professions: ${professions.map((p) => `${p.profession} (${p.seasons.join(',')}, ${p.tree})`).join('; ')}`);

const progression: ProgressionFile = {
  schema: 1,
  generatedAt,
  season: PRIMARY_SEASON,
  seasons,
  tabs: tabs.map((t) => t.id),
  trees,
  professions,
};

// --- talent icons -----------------------------------------------------------

/**
 * A compiled texture as a PNG. The talent art is compiled as `PNG_RGBA8888`,
 * which is not pixels at all: the resource carries the original PNG file whole,
 * after its header. That is cut out as-is (minus text chunks); the block
 * formats go through the shared DXT/BGRA decoder.
 */
function vtexToPng(buf: Buffer, what: string): Buffer | undefined {
  const info = readVtexInfo(buf);
  if (info?.formatName === 'PNG_RGBA8888') {
    const start = buf.indexOf(PNG_MAGIC);
    const iend = buf.lastIndexOf(Buffer.from('IEND', 'latin1'));
    if (start < 0 || iend < start) {
      check(false, `${what}: PNG_RGBA8888 resource carries a PNG`);
      return undefined;
    }
    const png = stripTextChunks(buf.subarray(start, iend + 8));
    if (!readPngInfo(png)) {
      check(false, `${what}: embedded PNG parses`);
      return undefined;
    }
    return png;
  }
  const decoded = decodeVtex(buf);
  if (!decoded.ok) {
    check(false, `${what} decodes (${decoded.reason})`);
    return undefined;
  }
  return encodePng(decoded.image);
}
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

fs.mkdirSync(TALENT_ICONS, { recursive: true });
{
  const written = new Set<string>();
  for (const [file, raw] of Object.entries(rawIcon)) {
    const src = `${TALENT_ICON_DIR}/${raw}_png.vtex_c`;
    const entry = vpk.get(src);
    if (!entry) {
      check(false, `talent icon ${src} is in the pak`);
      continue;
    }
    const png = vtexToPng(vpk.read(entry), `talent icon ${raw}`);
    if (!png) continue;
    fs.writeFileSync(path.join(TALENT_ICONS, file), png);
    written.add(file);
  }
  for (const f of fs.readdirSync(TALENT_ICONS)) if (!written.has(f)) fs.unlinkSync(path.join(TALENT_ICONS, f));
  ok(`${written.size} talent icons → public/icons/talents/`);
}

// --- progression locale -----------------------------------------------------

/** Every stat and unlock key the trees use. */
const statKeys = new Set<string>();
for (const t of Object.values(trees))
  for (const n of t.nodes) {
    for (const [k] of n.stats) statKeys.add(k);
    for (const [k] of n.unlocks ?? []) statKeys.add(k);
    for (const d of Object.values(n.bySeason ?? {})) for (const [k] of [...(d?.stats ?? []), ...(d?.unlocks ?? [])]) statKeys.add(k);
  }
const coverage: Record<string, Record<string, string>> = {};
const progressionLocales: Record<string, ProgressionLocale> = {};
for (const lang of cfg.languages) {
  const miss: Record<string, string[]> = { nodes: [], stats: [], tiers: [], trees: [] };
  const nodeText = (id: string, season: string): NamedText | undefined => {
    const name = tok(lang, `talent_${id}`, season);
    if (name === undefined) return undefined;
    const desc = tok(lang, `talent_${id}_dec`, season);
    const out: NamedText = { name: plain(name, `${lang} talent_${id}`) };
    if (desc !== undefined) out.desc = plain(desc, `${lang} talent_${id}_dec`);
    return out;
  };
  const tierText = (key: string, season: string): NamedText | undefined => {
    const name = tok(lang, `${key}_name`, season);
    if (name === undefined) return undefined;
    const desc = tok(lang, `${key}_description`, season);
    return desc === undefined ? { name } : { name, desc: plain(desc, `${lang} ${key}`) };
  };

  const loc: ProgressionLocale = { schema: 1, lang, heroTab: tok(lang, 'change_职业天赋') ?? '', trees: {}, nodes: {}, tiers: {}, stats: {}, panel: {} };
  if (!loc.heroTab) miss.trees!.push('heroTab');
  for (const [tree, token] of Object.entries(treeTitleToken)) {
    const v = tok(lang, token);
    if (v === undefined) miss.trees!.push(tree);
    else loc.trees[tree] = v;
  }
  for (const id of Object.keys(T2)) {
    const t = nodeText(id, PRIMARY_SEASON);
    if (!t) miss.nodes!.push(id);
    else loc.nodes[id] = t;
    for (const s of seasons) {
      if (s === PRIMARY_SEASON) continue;
      const o = nodeText(id, s);
      if (o && !same(o, t)) ((loc.bySeason ??= {})[s] ??= {}).nodes = { ...(loc.bySeason[s]!.nodes ?? {}), [id]: o };
    }
  }
  for (const p of professions)
    for (const tier of p.tiers) {
      const key = `${p.hero}_tier_${tier.tier}`;
      const inPrimary = (tier.seasons ?? p.seasons).includes(PRIMARY_SEASON);
      const base = inPrimary ? PRIMARY_SEASON : (tier.seasons ?? p.seasons)[0]!;
      const t = tierText(key, base);
      if (!t) miss.tiers!.push(key);
      else loc.tiers[key] = t;
      for (const s of tier.seasons ?? p.seasons) {
        if (s === base) continue;
        const o = tierText(key, s);
        if (o && !same(o, t)) ((loc.bySeason ??= {})[s] ??= {}).tiers = { ...(loc.bySeason[s]!.tiers ?? {}), [key]: o };
      }
    }
  for (const k of [...statKeys].sort()) {
    const v = tok(lang, statToken[k] ?? `AK_Attr_${k}`);
    if (v === undefined) miss.stats!.push(k);
    else loc.stats[k] = v;
    // The character panel's own label (`AK_Attr_<key>`), which the calculator wants.
    const p = tok(lang, `AK_Attr_${k}`);
    if (p !== undefined) loc.panel[k] = p;
  }
  progressionLocales[lang] = loc;
  coverage[lang] = Object.fromEntries(Object.entries(miss).map(([k, v]) => [k, v.length ? `missing ${v.join(', ')}` : 'complete']));
  info(
    `${lang}: ${Object.keys(loc.nodes).length} nodes, ${Object.keys(loc.tiers).length} tiers, ` +
      `${Object.keys(loc.stats).length}/${statKeys.size} stat labels; missing — ` +
      Object.entries(miss).map(([k, v]) => `${k}: ${v.length ? v.join(',') : 0}`).join('; '),
  );
}

// --- heroes, abilities, runes -----------------------------------------------

const builderHeroes = JSON.parse(fs.readFileSync(path.join(DIRS.publicData, 'heroes.json'), 'utf8')) as {
  abilities: Record<string, { icon?: string; iconSource?: string }>;
};
const builderAbilityLocale: Record<string, Record<string, AbilityLocale>> = {};
for (const lang of cfg.languages) {
  const f = path.join(DIRS.publicData, `locale.${lang}.abilities.json`);
  builderAbilityLocale[lang] = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')).abilities ?? {}) : {};
}

const unlockOf = new Map<string, { tree: string; node: string }>();
for (const t of Object.values(trees))
  for (const n of t.nodes)
    for (const sk of n.skills ?? []) {
      if (unlockOf.has(sk)) warn(`ability ${sk} is unlocked by two nodes; keeping ${unlockOf.get(sk)!.node}`);
      else unlockOf.set(sk, { tree: t.id, node: n.id });
    }

/** Rune families per target ability, with per-season presence via `AllowedRulesets`. */
const runesOf = new Map<string, RuneFamily[]>();
let genericRunes = 0;
{
  const G = gemBy[PRIMARY_SEASON]!;
  for (const s of seasons) check(same(Object.keys(gemBy[s]!).sort(), Object.keys(G).sort()), `${s} gem table has the same rows as ${PRIMARY_SEASON}`);
  const rulesetsOf = (row: Row): string[] | undefined => {
    const r = list(row['AllowedRulesets']);
    return r.length ? r : undefined;
  };
  for (const [id, row] of Object.entries(G)) {
    if (/_\d+$/.test(id)) continue; // a higher tier of some family
    const target = list(row['target_ability'])[0];
    if (!target) {
      genericRunes++;
      continue;
    }
    const fam: RuneFamily = { base: id, tiers: [[id, 1]] };
    const r = rulesetsOf(row);
    if (r) fam.rulesets = r;
    for (let tier = 2; G[`${id}_${tier}`]; tier++) {
      const tid = `${id}_${tier}`;
      const tr = rulesetsOf(G[tid]!);
      fam.tiers.push(!same(tr, r) && tr ? [tid, tier, tr] : [tid, tier]);
      if (list(G[tid]!['target_ability'])[0] !== target) throw new Error(`${tid} targets another ability than ${id}`);
    }
    const arr = runesOf.get(target) ?? [];
    arr.push(fam);
    arr.sort((x, y) => (x.base < y.base ? -1 : 1));
    runesOf.set(target, arr);
  }
}

const iconWritten = new Set<string>();
fs.mkdirSync(ABILITY_ICONS_WIKI, { recursive: true });
function abilityIcon(id: string, texture: string): string | undefined {
  const b = builderHeroes.abilities[id];
  if (b?.icon && fs.existsSync(path.join(DIRS.publicIconAbilities, b.icon))) return `abilities/${b.icon}`;
  const file = `${texture.toLowerCase().replace(/[^a-z0-9_]+/g, '_')}.png`;
  const flash = vpk.get(`${cfg.spellIconDir}/${texture}.png`);
  let bytes: Buffer | undefined;
  if (flash) bytes = vpk.read(flash);
  else {
    const pano = vpk.get(`${PANORAMA_SPELLICONS}/${texture}_png.vtex_c`);
    if (pano) bytes = vtexToPng(vpk.read(pano), `ability icon ${texture}`);
  }
  if (!bytes) return undefined;
  if (!readPngInfo(bytes)) {
    check(false, `ability icon ${texture} is a PNG`);
    return undefined;
  }
  fs.writeFileSync(path.join(ABILITY_ICONS_WIKI, file), bytes);
  iconWritten.add(file);
  return `abilities-wiki/${file}`;
}

const SLOT_ORDER = ['q', 'w', 'e', 'r', 'd', 'f', 'passive'];
const abilityTextBy: Record<string, Record<string, Record<string, AbilityLocale>>> = {}; // lang → season → id
const heroes: WikiHero[] = [];
/** Ability → the season its top-level numbers and text are from. */
const abilityPrimary = new Map<string, string>();
const stubs: string[] = [];
for (const p of professions) {
  const ids = [
    ...new Set(
      seasons.flatMap((s) =>
        Object.entries(abilityBy[s]!)
          .filter(([, r]) => list(r['AllowedProfessions']).includes(p.profession))
          .map(([id]) => id),
      ),
    ),
  ];
  const abilities: WikiAbility[] = [];
  for (const id of ids) {
    const present = seasons.filter((s) => abilityBy[s]![id] !== undefined);
    // The hero's own season decides: Dragon Knight's kit sits in every table but
    // he plays only in s3, so his numbers and text are s3's.
    const playable = present.filter((s) => p.seasons.includes(s));
    const primary = playable.includes(PRIMARY_SEASON) ? PRIMARY_SEASON : (playable[0] ?? present[0]!);
    abilityPrimary.set(id, primary);
    const rec = abilityBy[primary]![id]!;
    // A few abilities bind to no key (pa_013's shuriken, Void Spirit's step): `AbilitySlot` is empty.
    const slotRaw = String(rec['AbilitySlot'] ?? '').trim();
    if (slotRaw !== '' && !isAbilitySlot(slotRaw)) throw new Error(`ability ${id}: unknown slot ${JSON.stringify(slotRaw)}`);
    const slot = slotRaw === '' ? null : (slotRaw as AbilitySlotKey);
    const texture = String(rec['AbilityTextureName'] ?? '');
    const a: WikiAbility = { id, slot, tags: list(rec['AbilityTags']), texture, runes: runesOf.get(id) ?? [] };
    if (rec['AbilityCooldown'] !== undefined) a.cd = num(rec['AbilityCooldown'], `${id} cd`);
    if (rec['AbilityManaCost'] !== undefined) a.mana = num(rec['AbilityManaCost'], `${id} mana`);
    const icon = abilityIcon(id, texture);
    if (icon) a.icon = icon;
    const unlock = unlockOf.get(id);
    if (unlock) a.unlock = unlock;
    const inHero = present.filter((s) => p.seasons.includes(s));
    if (!same(inHero, p.seasons)) a.seasons = inHero;
    for (const s of playable) {
      if (s === primary) continue;
      const o = abilityBy[s]![id]!;
      if (same(o, rec)) continue;
      const d: Record<string, unknown> = {};
      if (!same(o['AbilitySlot'], rec['AbilitySlot'])) d['slot'] = String(o['AbilitySlot'] ?? '').trim() || null;
      if (!same(o['AbilityCooldown'], rec['AbilityCooldown'])) d['cd'] = num(o['AbilityCooldown'] ?? 0, `${id} cd`);
      if (!same(o['AbilityManaCost'], rec['AbilityManaCost'])) d['mana'] = num(o['AbilityManaCost'] ?? 0, `${id} mana`);
      if (!same(o['AbilityValues'], rec['AbilityValues'])) d['values'] = o['AbilityValues'] ?? {};
      (a.bySeason ??= {})[s] = d as never;
    }

    // Text, per language and per season it can differ in.
    const en = tok('en', `dota_tooltip_ability_${id}`, primary) ?? '';
    const enDesc = tok('en', `dota_tooltip_ability_${id}_description`, primary) ?? '';
    if (en === '' || PLACEHOLDER_NAME.test(en.trim()) || enDesc === '' || PLACEHOLDER_DESC.test(enDesc.trim())) {
      a.stub = true;
      stubs.push(id);
    }
    for (const lang of cfg.languages) {
      for (const s of present) {
        const r = abilityBy[s]![id]!;
        const values: Record<string, number | string> = {};
        for (const [k, v] of Object.entries((r['AbilityValues'] as Record<string, unknown>) ?? {}))
          if (typeof v === 'number' || typeof v === 'string') values[k] = v;
        const name = tok(lang, `dota_tooltip_ability_${id}`, s);
        if (name === undefined) continue;
        const loc: AbilityLocale = { name: substitute(name, { values, top: r }).text };
        const desc = tok(lang, `dota_tooltip_ability_${id}_description`, s);
        if (desc !== undefined) {
          const rt = parseRichText(substitute(desc, { values, top: r }).text);
          loc.desc = rt.nodes;
          loc.descPlain = rt.plain;
        }
        const labels: Record<string, string> = {};
        for (const k of Object.keys(values)) {
          const l = tok(lang, `dota_tooltip_ability_${id}_${k}`, s);
          if (l !== undefined) labels[k] = substitute(l, { values, top: r }).text;
        }
        if (Object.keys(labels).length) loc.values = labels;
        ((abilityTextBy[lang] ??= {})[s] ??= {})[id] = loc;
      }
    }
    abilities.push(a);
  }
  const order = (a: WikiAbility): number => (a.slot === null ? SLOT_ORDER.length : SLOT_ORDER.indexOf(a.slot));
  abilities.sort((x, y) => order(x) - order(y));
  heroes.push({
    id: p.hero,
    profession: p.profession,
    short: p.hero.replace(/^npc_dota_hero_/, ''),
    tree: p.tree,
    seasons: p.seasons,
    abilities,
  });
}
for (const f of fs.readdirSync(ABILITY_ICONS_WIKI)) if (!iconWritten.has(f)) fs.unlinkSync(path.join(ABILITY_ICONS_WIKI, f));
{
  const all = heroes.flatMap((h) => h.abilities);
  const runeless = all.filter((a) => a.runes.length === 0).length;
  const boundTargets = new Set(all.map((a) => a.id));
  const orphanTargets = [...runesOf.keys()].filter((t) => !boundTargets.has(t));
  check(orphanTargets.length === 0, `every rune targets a rostered ability${orphanTargets.length ? ` (orphans: ${orphanTargets.join(', ')})` : ''}`);
  info(
    `${heroes.length} heroes, ${all.length} abilities (${stubs.length} stubs: ${stubs.join(', ')}), ` +
      `${all.reduce((n, a) => n + a.runes.length, 0)} rune families, ${runeless} abilities without runes, ${genericRunes} generic runes`,
  );
  info(
    `ability icons: ${all.filter((a) => a.icon?.startsWith('abilities/')).length} reused, ` +
      `${all.filter((a) => a.icon?.startsWith('abilities-wiki/')).length} extracted, ` +
      `${all.filter((a) => !a.icon).length} CDN-only (${all.filter((a) => !a.icon).map((a) => a.texture).join(', ')})`,
  );
}

const heroesWiki: HeroesWikiFile = { schema: 1, generatedAt, season: PRIMARY_SEASON, heroes, genericRunes };

const heroesLocales: Record<string, HeroesWikiLocale> = {};
for (const lang of cfg.languages) {
  const loc: HeroesWikiLocale = { schema: 1, lang, heroes: {}, abilities: {} };
  let reused = 0;
  for (const h of heroes) {
    const t: WikiHeroText = {};
    const name = cfg.heroRoster.names[h.id]?.[lang];
    if (name) t.name = name;
    const role = tok(lang, roleOf(h.short).role);
    if (role) t.role = role;
    const arch = tok(lang, `hud_profession_guide_${h.profession}_archetype`);
    if (arch) t.archetype = arch;
    const desc = tok(lang, `hud_profession_guide_${h.profession}_description`);
    if (desc) t.desc = plain(desc, `${lang} ${h.profession} description`);
    loc.heroes[h.id] = t;
    for (const a of h.abilities) {
      const primary = abilityPrimary.get(a.id)!;
      const bySeason = abilityTextBy[lang]?.[primary]?.[a.id];
      if (!bySeason) continue;
      const builder = builderAbilityLocale[lang]![a.id];
      const sameAsBuilder =
        builder !== undefined &&
        builder.name === bySeason.name &&
        (builder.descPlain ?? '') === (bySeason.descPlain ?? '') &&
        same(builder.values ?? {}, bySeason.values ?? {});
      if (sameAsBuilder) reused++;
      else loc.abilities[a.id] = bySeason;
      for (const s of seasons) {
        if (s === primary || !(a.seasons ?? h.seasons).includes(s)) continue;
        const o = abilityTextBy[lang]?.[s]?.[a.id];
        if (o && !same(o, bySeason)) ((loc.bySeason ??= {})[s] ??= {})[a.id] = o;
      }
    }
  }
  heroesLocales[lang] = loc;
  const missingHero = heroes.filter((h) => !loc.heroes[h.id]!.name).map((h) => h.short);
  coverage[lang]!['heroes'] =
    `${heroes.length - missingHero.length}/${heroes.length} names${missingHero.length ? ` (no name: ${missingHero.join(', ')})` : ''}; ` +
    `archetype for ${Object.values(loc.heroes).filter((x) => x.archetype).length}, role for ${Object.values(loc.heroes).filter((x) => x.role).length}`;
  coverage[lang]!['abilities'] = `${reused} reused from builder, ${Object.keys(loc.abilities).length} emitted, season overrides: ${Object.entries(loc.bySeason ?? {}).map(([s, m]) => `${s}=${Object.keys(m ?? {}).length}`).join(' ') || 'none'}`;
  info(`${lang}: heroes ${coverage[lang]!['heroes']}; abilities ${coverage[lang]!['abilities']}`);
}

// --- hero stats -------------------------------------------------------------

const attrBonus: AttrBonus = (() => {
  const lua = readText(CONST_LUA);
  check(!lua.includes('XDecrypt'), `${CONST_LUA} is plain Lua`);
  const m = /ATTR_PRIMARY_BONUS = \{([^}]*)\}/.exec(lua);
  if (!m) throw new Error(`${CONST_LUA}: ATTR_PRIMARY_BONUS table not found`);
  const out: Record<string, number> = {};
  for (const e of m[1]!.matchAll(/(\w+) = (-?[0-9.]+)/g)) out[e[1]!] = Number(e[2]);
  const want: Array<keyof AttrBonus> = [
    'strength_health', 'strength_health_regen', 'agility_attack_speed_decay', 'agility_attack_speed_cap',
    'agility_armor', 'intelligence_mana', 'intelligence_mana_regen', 'intelligence_magic_resistance_decay',
    'intelligence_magic_resistance_cap', 'primary_attr_attack_damage', 'universal_attr_attack_damage',
  ];
  check(same(Object.keys(out).sort(), [...want].sort()), `ATTR_PRIMARY_BONUS has exactly the ${want.length} known keys`);
  // The two curves the calculator transcribes; a changed formula must stop the build.
  for (const [fn, decay, cap] of [
    ['CalculateAgilityAttackSpeed', 'agility_attack_speed_decay', 'agility_attack_speed_cap'],
    ['CalculateIntelligenceMagicResistance', 'intelligence_magic_resistance_decay', 'intelligence_magic_resistance_cap'],
  ] as const) {
    const re = new RegExp(
      `function ____exports\\.${fn}\\(self, (\\w+)\\)[\\s\\S]*?return (\\w+) / \\(\\2 \\+ ____exports\\.ATTR_PRIMARY_BONUS\\.${decay}\\) \\* ____exports\\.ATTR_PRIMARY_BONUS\\.${cap}\\s*end`,
    );
    check(re.test(lua), `${fn} is still x / (x + ${decay}) * ${cap}`);
  }
  return out as unknown as AttrBonus;
})();

const heroKv = (parseKv(vpk.readPath(HEROES_KV)).root['CSVContent'] ?? {}) as KvObject;
const stockKv = (parseKv(vpk.readPath(STOCK_HEROES_KV)).root['DOTAHeroes'] ?? {}) as KvObject;
const PRIMARY: Record<string, PrimaryAttr> = {
  DOTA_ATTRIBUTE_STRENGTH: 'str',
  DOTA_ATTRIBUTE_AGILITY: 'agi',
  DOTA_ATTRIBUTE_INTELLECT: 'int',
  DOTA_ATTRIBUTE_ALL: 'uni',
};
const HUD_TYPE: Record<string, PrimaryAttr> = { strength: 'str', agility: 'agi', intelligence: 'int', universal: 'uni' };

const statsHeroes: Record<string, HeroStatsEntry> = {};
for (const h of heroes) {
  const k = heroKv[h.id];
  if (typeof k !== 'object') {
    check(false, `${h.id} is in ${HEROES_KV}`);
    continue;
  }
  const kn = (f: string): number => num(k[f], `${h.id}.${f}`);
  const stock = stockKv[String(k['include_keys_from'] ?? h.id)];
  const primaryRaw = typeof stock === 'object' ? String(stock['AttributePrimary'] ?? '') : '';
  const primary = PRIMARY[primaryRaw];
  if (!primary) throw new Error(`${h.id}: stock AttributePrimary ${JSON.stringify(primaryRaw)} unknown`);
  const hudType = HUD_TYPE[roleOf(h.short).type];
  if (hudType !== primary) warn(`${h.short}: stock primary attribute is ${primary}, the profession screen says ${hudType}`);
  const kv: HeroKv = {
    health: kn('Custom_StatusHealth'),
    mana: kn('Custom_StatusMana'),
    attackDamage: kn('Custom_AttackDamage'),
    armor: kn('Custom_ArmorPhysical'),
    magicResistance: kn('Custom_MagicResistance'),
    movementSpeed: kn('Custom_MovementSpeed'),
    attackRange: kn('Custom_AttackRange'),
    attackRate: kn('Custom_AttackRate'),
    attackSpeed: kn('Custom_AttackSpeed'),
    healthRegen: kn('Custom_StatusHealthRegen'),
    manaRegen: kn('Custom_StatusManaRegen'),
  };
  const p = professions.find((x) => x.hero === h.id)!;
  const vanilla: string[] = [];
  for (let i = 10; i <= 17; i++) {
    const v = String(k[`Ability${i}`] ?? '').trim();
    if (v) vanilla.push(v);
  }
  statsHeroes[h.short] = {
    hero: h.id,
    primary,
    kv,
    base: {
      str: kn('Custom_AttributeBaseStrength'),
      agi: kn('Custom_AttributeBaseAgility'),
      int: kn('Custom_AttributeBaseIntelligence'),
    },
    growth: {
      str: kn('Custom_AttributeStrengthGain'),
      agi: kn('Custom_AttributeAgilityGain'),
      int: kn('Custom_AttributeIntelligenceGain'),
    },
    tiers: p.tiers
      .filter((t) => (t.seasons ?? p.seasons).includes(PRIMARY_SEASON) || !p.seasons.includes(PRIMARY_SEASON))
      .map((t) => ({ tier: t.tier, heroLevel: t.heroLevel, growth: t.growth })),
    tree: h.tree,
    seasons: h.seasons,
    vanillaTalents: vanilla,
  };
}
const treeStats: Record<string, Record<string, number>> = {};
const treeNodes: Record<string, number> = {};
for (const t of Object.values(trees)) {
  treeStats[t.id] = sumStats(t.nodes);
  treeNodes[t.id] = t.nodes.length;
}
const herostats: HeroStatsFile = {
  schema: 1,
  generatedAt,
  season: PRIMARY_SEASON,
  level: 30,
  attrBonus,
  heroes: statsHeroes,
  commonTrees: tabs.map((t) => t.id).filter((id) => Object.keys(treeStats[id] ?? {}).length > 0),
  treeStats,
  treeNodes,
};
ok(`hero stats for ${Object.keys(statsHeroes).join(', ')}; common trees ${herostats.commonTrees.join(', ')}`);

vpk.close();

// --- output -----------------------------------------------------------------

fs.mkdirSync(WIKI_DIR, { recursive: true });
writeJson(path.join(WIKI_DIR, 'progression.json'), progression);
writeJson(path.join(WIKI_DIR, 'heroes-wiki.json'), heroesWiki);
writeJson(path.join(WIKI_DIR, 'herostats.json'), herostats);
for (const lang of cfg.languages) {
  writeJson(path.join(WIKI_DIR, `locale.${lang}.progression.json`), progressionLocales[lang]);
  writeJson(path.join(WIKI_DIR, `locale.${lang}.heroes-wiki.json`), heroesLocales[lang]);
}
writeJsonPretty(path.join(DIRS.reports, 'wiki-progression.json'), {
  seasons,
  primary: PRIMARY_SEASON,
  coverage,
  stubs,
  treeSeasons,
  tabs,
  roles: Object.fromEntries(heroes.map((h) => [h.short, roleOf(h.short)])),
});
for (const f of ['progression.json', 'heroes-wiki.json', 'herostats.json']) {
  checkSoft(fs.existsSync(path.join(WIKI_DIR, f)), true, `wrote wiki/${f} (${fs.statSync(path.join(WIKI_DIR, f)).size} bytes)`);
}

exitIfFailed();
