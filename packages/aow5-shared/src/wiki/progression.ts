/**
 * The wiki's progression domain: talent trees, hero professions, the heroes'
 * kits with the runes that modify them, and the inputs of the stats
 * calculator.
 *
 * Five files, all emitted by `parser/tools/08b-wiki-progression.ts`:
 *
 * | file | type |
 * |---|---|
 * | `wiki/progression.json` | {@link ProgressionFile} |
 * | `wiki/locale.<lang>.progression.json` | {@link ProgressionLocale} |
 * | `wiki/heroes-wiki.json` | {@link HeroesWikiFile} |
 * | `wiki/locale.<lang>.heroes-wiki.json` | {@link HeroesWikiLocale} |
 * | `wiki/herostats.json` | {@link HeroStatsFile} |
 *
 * **Seasons.** The addon ships one copy of each table per ruleset (`s1`, `s2`,
 * `s3`). Everything here is the `s2` copy — the season the wiki describes —
 * and a value another season changes rides along under `bySeason`, holding
 * only the fields that differ. {@link nodeForSeason} and {@link tierForSeason}
 * fold an override in. A record that exists in only some seasons says so with
 * `seasons`; absent means "every season the file lists".
 *
 * **Names are never in the structural files.** Items are joined by id against
 * the builder's `items.index.json` / `locale.<lang>.names.json`; everything
 * else the game names is in the domain's locale file, resolved from the
 * addon's own localisation tokens.
 */

import type { AbilityLocale, AbilitySlotKey } from '../types/heroes.ts';

// ---------------------------------------------------------------------------
// Shared shapes

// `RulesetId` (`s1`, `s2`, `s3`) and `ItemCount` (`[itemId, count]`) are the
// pools' and the sources' — one name, one shape across the wiki's modules.
import type { RulesetId } from './pools.ts';
import type { ItemCount } from './sources.ts';
export type { RulesetId, ItemCount };

/** `[statKey, value]`, e.g. `['base_health', 10]`. Not `NodeStat`, which is the sky's floor-stat record. */
export type NodeStat = [key: string, value: number];

/** The three attributes, in the addon's own short spelling (`str:0.8`). */
export interface AttrTriple {
  str: number;
  agi: number;
  int: number;
}

/** Per-season overrides: only the fields that differ from the primary copy. */
export type BySeason<T> = Partial<Record<RulesetId, Partial<T>>>;

// ---------------------------------------------------------------------------
// progression.json

/** One talent node (`ak_talent` row). */
export interface TalentNode {
  /** `T000`. Also the locale key. */
  id: string;
  /** The addon's `Level` — the ring the node is drawn with (1..3). */
  level: number;
  /** Grid position (`layout_col` / `layout_row`), 0-based. */
  col: number;
  row: number;
  /** The tree's entry point (`IsRoot`). */
  root?: true;
  /** Nodes that must be researched first, in the addon's order. The first is the main edge. */
  needs: string[];
  /** Gold price (`cost_coin`). */
  gold: number;
  /** Item price (`cost`). */
  items: ItemCount[];
  /** Research time, seconds. */
  time: number;
  /** Stats the node grants (`data`). Keys are labelled by {@link ProgressionLocale.stats}. */
  stats: NodeStat[];
  /**
   * Account features the node grants (`player_data`): `tree2:1` unlocks a
   * tree, `warehouse:10` widens the warehouse, `npc_3:1` opens a vendor. The
   * game has a label for some keys (also in `stats` of the locale); the node's
   * own description always says it in words.
   */
  unlocks?: NodeStat[];
  /** Recipe items whose crafting the node unlocks (`formula`). Absent when none, like `unlocks` and `skills`. */
  formulas?: string[];
  /** Hero abilities the node unlocks (`profession_skills`). */
  skills?: string[];
  /** `npc_dota_hero_*` the node is gated on (`profession`). */
  profession?: string;
  /** Icon file under `public/icons/talents/` — see {@link talentIconFile}. */
  icon: string;
  /** Fields another season changes (today: `s1`'s item prices on the Drow tree). */
  bySeason?: BySeason<Pick<TalentNode, 'gold' | 'items' | 'time' | 'stats' | 'unlocks' | 'needs'>>;
}

export interface TalentTree {
  /** `tree1`. Also the locale key. */
  id: string;
  /** Grid size: max column + 1, max row + 1. */
  cols: number;
  rows: number;
  /** The hero whose profession tree this is (`talent_tree_id` in the profession table). */
  hero?: string;
  /**
   * Seasons the client shows the tree in, when not all. Read from the HUD:
   * `tree14` (Dragon Knight) is s3-only and the Magic Tower tree is s2-only.
   */
  seasons?: RulesetId[];
  nodes: TalentNode[];
}

/** One rung of a hero's profession ladder (`npc_dota_hero_axe_tier_3`). */
export interface ProfessionTier {
  tier: number;
  /** Hero level the tier needs (`unlock_items` → `hero_level:N`). */
  heroLevel: number;
  /** Item price of the tier (`unlock_items` minus the level). */
  items: ItemCount[];
  /** Attribute growth the tier adds (`growth_bonus_key`); missing attributes are 0. */
  growth: AttrTriple;
  /** Wearable items the tier awards (`wearable_rewards`). */
  wearables: string[];
  /** Seasons the tier exists in, when not all of the hero's. */
  seasons?: RulesetId[];
  bySeason?: BySeason<Pick<ProfessionTier, 'heroLevel' | 'items' | 'growth' | 'wearables'>>;
}

export interface Profession {
  /** `npc_dota_hero_axe`. Tier locale keys are `${hero}_tier_${tier}`. */
  hero: string;
  /** `axe` — the id abilities and runes are gated on. */
  profession: string;
  /** The hero's own talent tree. */
  tree: string;
  /** Seasons whose profession table lists the hero. */
  seasons: RulesetId[];
  tiers: ProfessionTier[];
}

export interface ProgressionFile {
  schema: 1;
  generatedAt: string;
  /** The ruleset every top-level value is from. */
  season: RulesetId;
  /** Every ruleset the pak ships, in manifest order. */
  seasons: RulesetId[];
  /** The talent window's tabs, in the game's order (tree ids). */
  tabs: string[];
  /** Every tree, keyed by id — including hidden ones (`tree11`, `tree20`) no tab or hero shows. */
  trees: Record<string, TalentTree>;
  /** Heroes with a profession ladder, in the profession table's order. */
  professions: Profession[];
}

/** A node's or tier's text. */
export interface NamedText {
  name: string;
  desc?: string;
}

export interface ProgressionLocale {
  schema: 1;
  lang: string;
  /** Label for the profession-trees tab (the game's "Class Talent"). */
  heroTab: string;
  /** Tree titles the game has (tabs plus three hero trees); others are absent. */
  trees: Record<string, string>;
  /** `T000` → name and plain-text description. */
  nodes: Record<string, NamedText>;
  /** `npc_dota_hero_axe_tier_1` → tier name and description. */
  tiers: Record<string, NamedText>;
  /**
   * Stat and unlock key → the game's label, verbatim. A label that starts with
   * `%` is the addon's mark for a percentage stat — use {@link statLabel}.
   */
  stats: Record<string, string>;
  /**
   * The same keys as the character panel labels them (`AK_Attr_<key>`), where
   * it has a label — e.g. `base_mana` is "Mana" in the talent window but
   * "Base Mana" on the panel. The calculator wants these.
   */
  panel: Record<string, string>;
  /** Text another season replaces (season tokens `ak_ruleset_<s>__…`). */
  bySeason?: Partial<Record<RulesetId, { nodes?: Record<string, NamedText>; tiers?: Record<string, NamedText> }>>;
}

// ---------------------------------------------------------------------------
// heroes-wiki.json

/** One rune family (`item_G100`, `_2`, `_3`, …) bound to an ability. */
export interface RuneFamily {
  /** The tier-1 item; the family's name and art come from it. */
  base: string;
  /** `AllowedRulesets` of the base item, when restricted. */
  rulesets?: RulesetId[];
  /** `[itemId, tier]`, plus the tier's own rulesets when they differ from the family's. */
  tiers: Array<[itemId: string, tier: number] | [itemId: string, tier: number, rulesets: RulesetId[]]>;
}

export interface WikiAbility {
  id: string;
  /** The key it binds to; `null` for the few that bind to none (`AbilitySlot` empty). */
  slot: AbilitySlotKey | null;
  /** Cooldown and mana cost in the hero's primary season — see {@link heroPrimarySeason}. */
  cd?: number;
  mana?: number;
  tags: string[];
  /**
   * Icon path under `public/icons/` (`abilities/axe_01.png` reuses the
   * builder's art; `abilities-wiki/*.png` is extracted here). Absent when the
   * pak does not ship the art — then {@link WikiAbility.texture} names a
   * stock Dota ability for the CDN.
   */
  icon?: string;
  texture: string;
  /** The addon has not written the ability yet ("To be filled."). */
  stub?: true;
  /** The talent node that unlocks it, when one does. */
  unlock?: { tree: string; node: string };
  runes: RuneFamily[];
  /** Seasons it can be used in, when narrower than the hero's. */
  seasons?: RulesetId[];
  /** Numbers another season changes. Present ⇔ the wiki's "s2 ≠ s3" badge. */
  bySeason?: BySeason<{ slot: AbilitySlotKey | null; cd: number; mana: number; values: Record<string, number | string> }>;
}

export interface WikiHero {
  /** `npc_dota_hero_axe`. */
  id: string;
  /** `axe`. */
  profession: string;
  /** Short key, also the `herostats.json` key: `axe`. */
  short: string;
  tree: string;
  seasons: RulesetId[];
  abilities: WikiAbility[];
}

export interface HeroesWikiFile {
  schema: 1;
  generatedAt: string;
  season: RulesetId;
  heroes: WikiHero[];
  /** Runes bound to no ability (no `target_ability`), counted for the header line. */
  genericRunes: number;
}

export interface WikiHeroText {
  /** Valve's hero name. Not in the pak — from the pipeline's roster config. */
  name?: string;
  /** The class the profession screen shows (`change_战士` → "Warrior"). */
  role?: string;
  /** `Strength · Melee Counterattack` — attribute, a middle dot, the archetype. */
  archetype?: string;
  desc?: string;
}

export interface HeroesWikiLocale {
  schema: 1;
  lang: string;
  heroes: Record<string, WikiHeroText>;
  /**
   * Ability text for the primary season — **only** where it is missing from,
   * or differs from, the builder's `locale.<lang>.abilities.json`. Look here
   * first, then there. See {@link abilityText}.
   */
  abilities: Record<string, AbilityLocale>;
  /** Text a season changes (other values or a season token). */
  bySeason?: Partial<Record<RulesetId, Record<string, AbilityLocale>>>;
}

// ---------------------------------------------------------------------------
// herostats.json

/**
 * What one point of an attribute is worth — `ATTR_PRIMARY_BONUS` in the
 * addon's `scripts/vscripts/shared/const.lua` (plain Lua in the pak), keys
 * verbatim.
 */
export interface AttrBonus {
  strength_health: number;
  strength_health_regen: number;
  agility_attack_speed_decay: number;
  agility_attack_speed_cap: number;
  agility_armor: number;
  intelligence_mana: number;
  intelligence_mana_regen: number;
  intelligence_magic_resistance_decay: number;
  intelligence_magic_resistance_cap: number;
  primary_attr_attack_damage: number;
  universal_attr_attack_damage: number;
}

export type PrimaryAttr = 'str' | 'agi' | 'int' | 'uni';

/** A hero's base panel (`Custom_*` keys of `ak_heroes.txt`). */
export interface HeroKv {
  health: number;
  mana: number;
  attackDamage: number;
  armor: number;
  magicResistance: number;
  movementSpeed: number;
  attackRange: number;
  attackRate: number;
  attackSpeed: number;
  healthRegen: number;
  manaRegen: number;
}

export interface HeroStatsEntry {
  /** `npc_dota_hero_axe`. */
  hero: string;
  /** From the stock hero (`AttributePrimary` in the pak's `original_kv/npc_heroes.txt`). */
  primary: PrimaryAttr;
  kv: HeroKv;
  /** Level-1 attributes (`Custom_AttributeBase*`). */
  base: AttrTriple;
  /** Per-level gain (`Custom_Attribute*Gain`). */
  growth: AttrTriple;
  /** Profession tiers' growth, primary season. */
  tiers: Array<{ tier: number; heroLevel: number; growth: AttrTriple }>;
  /** The hero's profession tree. */
  tree: string;
  seasons: RulesetId[];
  /** Stock Dota talents in `Ability10..17` (the addon does not say which of a pair is taken). */
  vanillaTalents: string[];
}

export interface HeroStatsFile {
  schema: 1;
  generatedAt: string;
  season: RulesetId;
  /** The level the wiki's calculator shows. */
  level: number;
  attrBonus: AttrBonus;
  /** Keyed by short id (`axe`). */
  heroes: Record<string, HeroStatsEntry>;
  /** Tab trees whose nodes grant stats, in tab order (the crafting tree grants none). */
  commonTrees: string[];
  /** Sum of every node's `stats` per tree, primary season. */
  treeStats: Record<string, Record<string, number>>;
  /** Node count per tree, primary season. */
  treeNodes: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Pure helpers

/**
 * The PNG a talent icon is published as. The addon names its art with spaces
 * and parentheses (`tree_ (20)`); this is the one mapping the extractor and
 * the UI both use.
 */
export function talentIconFile(icon: string): string {
  return `${icon.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+$/, '')}.png`;
}

/**
 * Splits a game stat label into text and a percent flag, the way the HUD does:
 * the addon marks a percentage stat by starting its label with `%`.
 */
export function statLabel(raw: string): { text: string; percent: boolean } {
  return raw.startsWith('%') ? { text: raw.slice(1).trim(), percent: true } : { text: raw, percent: false };
}

function overlay<T extends object>(base: T, season: RulesetId, bySeason: BySeason<T> | undefined): T {
  const patch = bySeason?.[season];
  return patch ? { ...base, ...patch } : base;
}

/** A node as a given season has it. */
export function nodeForSeason(node: TalentNode, season: RulesetId): TalentNode {
  return overlay(node, season, node.bySeason as BySeason<TalentNode> | undefined);
}

/** A profession tier as a given season has it. */
export function tierForSeason(tier: ProfessionTier, season: RulesetId): ProfessionTier {
  return overlay(tier, season, tier.bySeason as BySeason<ProfessionTier> | undefined);
}

/**
 * The season a hero's abilities are described in: the file's season when the
 * hero plays in it, else the hero's first season (Dragon Knight is s3-only, so
 * his kit is s3's). `bySeason` on his abilities is relative to that.
 */
export function heroPrimarySeason(hero: WikiHero, file: { season: RulesetId }): RulesetId {
  return hero.seasons.includes(file.season) ? file.season : (hero.seasons[0] ?? file.season);
}

/** Whether a record restricted by `seasons` exists in `season`. */
export function inSeason(record: { seasons?: RulesetId[] }, season: RulesetId): boolean {
  return record.seasons === undefined || record.seasons.includes(season);
}

/** What researching a set of nodes costs. */
export interface Cost {
  gold: number;
  time: number;
  /** Item id → count, in first-seen order. */
  items: Map<string, number>;
  nodes: number;
}

/** Sums gold, time and items over `nodes`, skipping ids in `skip` (already researched). */
export function totalCost(nodes: Iterable<TalentNode>, skip: ReadonlySet<string> = new Set()): Cost {
  const out: Cost = { gold: 0, time: 0, items: new Map(), nodes: 0 };
  for (const n of nodes) {
    if (skip.has(n.id)) continue;
    out.nodes++;
    out.gold += n.gold;
    out.time += n.time;
    for (const [id, count] of n.items) out.items.set(id, (out.items.get(id) ?? 0) + count);
  }
  return out;
}

/** Which node unlocks crafting each recipe item: item id → tree and node. */
export function formulaNodes(file: ProgressionFile): Map<string, { tree: string; node: string }> {
  const out = new Map<string, { tree: string; node: string }>();
  for (const tree of Object.values(file.trees)) {
    for (const n of tree.nodes) for (const f of n.formulas ?? []) if (!out.has(f)) out.set(f, { tree: tree.id, node: n.id });
  }
  return out;
}

/** Sum of every node's stats in `nodes`. */
export function sumStats(nodes: Iterable<TalentNode>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of nodes) for (const [k, v] of n.stats) out[k] = round6((out[k] ?? 0) + v);
  return out;
}

/**
 * An ability's text: the wiki's own entry when it has one (and the season's,
 * when that season changes it), else the builder's.
 */
export function abilityText(
  id: string,
  wiki: HeroesWikiLocale,
  builder: Record<string, AbilityLocale> | undefined,
  season?: RulesetId,
): AbilityLocale | undefined {
  return (season !== undefined ? wiki.bySeason?.[season]?.[id] : undefined) ?? wiki.abilities[id] ?? builder?.[id];
}

// ---------------------------------------------------------------------------
// Attribute maths (scripts/vscripts/shared/const.lua and
// modifiers/hero_base/modifier_cs_hero_primary_attributes.lua)

/** `CalculateAgilityAttackSpeed`: `x / (x + decay) * cap`, 0 for x ≤ 0. */
export function agilityAttackSpeed(agi: number, b: AttrBonus): number {
  return agi > 0 ? (agi / (agi + b.agility_attack_speed_decay)) * b.agility_attack_speed_cap : 0;
}

/** `CalculateIntelligenceMagicResistance`: `x / (x + decay) * cap`, 0 for x ≤ 0. */
export function intelligenceMagicResistance(int: number, b: AttrBonus): number {
  return int > 0 ? (int / (int + b.intelligence_magic_resistance_decay)) * b.intelligence_magic_resistance_cap : 0;
}

/**
 * The bonus `modifier_cs_hero_primary_attributes` grants for given total
 * attributes, keyed by the stat it feeds. Attack damage is per point of the
 * primary attribute, or of all three at a lower rate for a universal hero.
 */
export function attributeBonus(a: AttrTriple, primary: PrimaryAttr, b: AttrBonus): Record<DerivedKey, number> {
  const primaryTotal = primary === 'uni' ? a.str + a.agi + a.int : a[primary];
  return {
    bonus_attack_damage:
      primaryTotal * (primary === 'uni' ? b.universal_attr_attack_damage : b.primary_attr_attack_damage),
    bonus_health: a.str * b.strength_health,
    health_regen: a.str * b.strength_health_regen,
    attack_speed: agilityAttackSpeed(a.agi, b),
    bonus_armor: a.agi * b.agility_armor,
    bonus_mana: a.int * b.intelligence_mana,
    mana_regen: a.int * b.intelligence_mana_regen,
    base_magic_resistance: intelligenceMagicResistance(a.int, b),
  };
}

/** The panel rows attributes feed, in the calculator's spelling. */
export type DerivedKey =
  | 'bonus_health'
  | 'health_regen'
  | 'bonus_mana'
  | 'mana_regen'
  | 'bonus_attack_damage'
  | 'attack_speed'
  | 'bonus_armor'
  | 'base_magic_resistance';

/**
 * Derived row → [kv field, node stat that adds flat, node stat that multiplies (%)].
 * The flat part of a row is `(kv + node stat) × (1 + pct/100)`.
 */
const DERIVED: Record<DerivedKey, [keyof HeroKv, string, string | null]> = {
  bonus_health: ['health', 'base_health', 'base_health_pct'],
  health_regen: ['healthRegen', 'health_regen', null],
  bonus_mana: ['mana', 'base_mana', 'base_mana_pct'],
  mana_regen: ['manaRegen', 'mana_regen', null],
  bonus_attack_damage: ['attackDamage', 'base_attack_damage', 'base_attack_damage_percent'],
  attack_speed: ['attackSpeed', 'attack_speed', null],
  bonus_armor: ['armor', 'base_armor', 'base_armor_pct'],
  base_magic_resistance: ['magicResistance', 'base_magic_resistance', null],
};

const ATTR_STAT: Record<keyof AttrTriple, [flat: string, pct: string]> = {
  str: ['base_strength', 'base_strength_pct'],
  agi: ['base_agility', 'base_agility_pct'],
  int: ['base_intelligence', 'base_intelligence_pct'],
};

/** Every node stat {@link heroStatsAtLevel} consumes; the rest come back in `rest`. */
export const CONSUMED_STATS: ReadonlySet<string> = new Set([
  ...Object.values(ATTR_STAT).flat(),
  'base_all_stats',
  'base_all_stats_pct',
  ...Object.values(DERIVED).flatMap(([, flat, pct]) => (pct ? [flat, pct] : [flat])),
  'base_movespeed',
  'bonus_movespeed_pct',
]);

export interface LevelStats {
  level: number;
  /** Attributes before percentages: base + (level−1) × (growth + all tiers' growth) + node flats. */
  buckets: AttrTriple;
  /** Attribute percentages from nodes (own + `base_all_stats_pct`). */
  pct: AttrTriple;
  /** Final attributes: `buckets × (1 + pct/100)`. */
  attrs: AttrTriple;
  /**
   * Each attribute-fed row as `flat + mult × attributeBonus`: the flat part is
   * the hero's kv plus node stats, scaled by the node percentage, and the
   * percentage scales the attribute part too.
   */
  derived: Record<DerivedKey, { flat: number; mult: number }>;
  /** `derived` evaluated at `attrs`. */
  totals: Record<DerivedKey | 'bonus_movespeed', number>;
  /** Every node stat not consumed above (crit, damage %, lifesteal, luck, …), summed. */
  rest: Record<string, number>;
}

/**
 * A hero's panel without items at `level`, with every tier of the profession
 * and every node of `trees` taken.
 *
 * **What is the game's and what is a model.** The per-point constants and the
 * two saturation curves are the addon's own (`AttrBonus`). How the server folds
 * a `_pct` node stat into its base (`(base + flat) × (1 + pct)`), and that every
 * tier's growth counts for every level, are the wiki's reading of the HUD's
 * labels ("% of base health") — the server half that does it is shipped
 * encrypted. The partner wiki's calculator uses the same model.
 */
export function heroStatsAtLevel(
  file: HeroStatsFile,
  short: string,
  opts: { level?: number; trees?: readonly string[] } = {},
): LevelStats | undefined {
  const h = file.heroes[short];
  if (!h) return undefined;
  const level = opts.level ?? file.level;
  const L = level - 1;
  const trees = opts.trees ?? [h.tree, ...file.commonTrees];

  const S: Record<string, number> = {};
  for (const t of trees) for (const [k, v] of Object.entries(file.treeStats[t] ?? {})) S[k] = (S[k] ?? 0) + v;
  const T = (k: string): number => S[k] ?? 0;

  const tierGrowth: AttrTriple = { str: 0, agi: 0, int: 0 };
  for (const t of h.tiers) for (const a of ATTRS) tierGrowth[a] += t.growth[a];

  const buckets = {} as AttrTriple;
  const pct = {} as AttrTriple;
  const attrs = {} as AttrTriple;
  for (const a of ATTRS) {
    const [flat, p] = ATTR_STAT[a];
    buckets[a] = h.base[a] + L * (h.growth[a] + tierGrowth[a]) + T(flat) + T('base_all_stats');
    pct[a] = T(p) + T('base_all_stats_pct');
    attrs[a] = buckets[a] * (1 + pct[a] / 100);
  }

  const bonus = attributeBonus(attrs, h.primary, file.attrBonus);
  const derived = {} as LevelStats['derived'];
  const totals = {} as LevelStats['totals'];
  for (const key of Object.keys(DERIVED) as DerivedKey[]) {
    const [kvKey, flat, p] = DERIVED[key];
    const mult = 1 + (p ? T(p) : 0) / 100;
    derived[key] = { flat: (h.kv[kvKey] + T(flat)) * mult, mult };
    totals[key] = derived[key].flat + mult * bonus[key];
  }
  totals.bonus_movespeed = (h.kv.movementSpeed + T('base_movespeed')) * (1 + T('bonus_movespeed_pct') / 100);

  const rest: Record<string, number> = {};
  for (const [k, v] of Object.entries(S)) if (!CONSUMED_STATS.has(k)) rest[k] = round6(v);

  return { level, buckets, pct, attrs, derived, totals, rest };
}

const ATTRS = ['str', 'agi', 'int'] as const;

/** Rounds away float dust from summing decimal stats (0.1 + 0.2). */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// The heroes section (`/wiki/heroes/<short>`)

/** A hero by the short id the wiki's addresses use (`axe`, `dragon_knight`). */
export function heroByShort(file: HeroesWikiFile, short: string): WikiHero | undefined {
  return file.heroes.find((hero) => hero.short === short);
}

/** Rune families bound to any of the hero's abilities — the count the list and the header show. */
export function heroRuneCount(hero: WikiHero): number {
  return hero.abilities.reduce((n, ability) => n + ability.runes.length, 0);
}

/**
 * The seasons a rune tier is handed out in: its own list when the tuple has
 * one (`[id, tier, rulesets]`), else the family's; undefined means every season.
 */
export function runeTierSeasons(family: RuneFamily, tier: RuneFamily['tiers'][number]): RulesetId[] | undefined {
  return tier[2] ?? family.rulesets;
}

/**
 * The season an ability's numbers come from when it is absent from `season`
 * (the file's) — the partner wiki's "abilities s2 lacks are described from
 * s3". The hero's own first season when the hero is not in `season` at all
 * (Dragon Knight); null when every ability is in `season`.
 */
export function heroFallbackSeason(hero: WikiHero, season: RulesetId): RulesetId | null {
  if (!hero.seasons.includes(season)) return hero.seasons[0] ?? null;
  const lacking = hero.abilities.find((ability) => !inSeason(ability, season));
  return lacking?.seasons?.[0] ?? null;
}

type HeroLang = 'en' | 'ru' | 'zh';

/**
 * A hero page's title, short facts and description — the browser tab and the
 * server's card say the same sentence. `fallbackName` is the builder's roster
 * name, for a hero the wiki locale does not name.
 */
export function heroPageFacts(
  hero: WikiHero,
  text: WikiHeroText | undefined,
  fallbackName: string | undefined,
  lang: HeroLang,
): { name: string; facts: string; description: string } {
  const s = HERO_FACTS[lang];
  const name = text?.name ?? fallbackName ?? hero.short;
  const abilities = hero.abilities.length;
  const runes = heroRuneCount(hero);
  const kind = [text?.role, text?.archetype].filter((bit): bit is string => bit !== undefined && bit !== '');
  return {
    name,
    facts: [...kind, s.abilities(abilities)].join(' · '),
    description: s.sentence(name, kind.join(', '), abilities, runes),
  };
}

const HERO_FACTS: Record<
  HeroLang,
  { abilities: (n: number) => string; sentence: (name: string, kind: string, abilities: number, runes: number) => string }
> = {
  en: {
    abilities: (n) => `${n} ${n === 1 ? 'ability' : 'abilities'}`,
    sentence: (name, kind, abilities, runes) =>
      `${name} in Age of Weapons 5${kind === '' ? '' : ` (${kind})`}: all ${abilities} abilities with cooldowns, mana costs and the talents that unlock them, and the ${runes} runes that empower them.`,
  },
  ru: {
    abilities: (n) => `${n} ${ruPlural(n, 'способность', 'способности', 'способностей')}`,
    sentence: (name, kind, abilities, runes) =>
      `${name} в Age of Weapons 5${kind === '' ? '' : ` (${kind})`}: ${abilities} ${ruPlural(abilities, 'способность', 'способности', 'способностей')} с перезарядкой, маной и талантами, которые их открывают, и ${runes} ${ruPlural(runes, 'руна', 'руны', 'рун')}, которые их усиливают.`,
  },
  zh: {
    abilities: (n) => `${n} 个技能`,
    sentence: (name, kind, abilities, runes) =>
      `${name}（Age of Weapons 5${kind === '' ? '' : ` · ${kind}`}）：全部 ${abilities} 个技能的冷却、魔法消耗与解锁天赋，以及强化它们的 ${runes} 种符印。`,
  },
};

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// ---------------------------------------------------------------------------
// The progression section (`/wiki/progression/…`): its addresses, its farm
// arithmetic, and the sentence each of its pages says about itself. The page
// in the browser and the API's prerenderer both call these.

/** The talent window's profession tab: `/wiki/progression/heroes/<profession>`. */
export const PROGRESSION_HERO_TAB = 'heroes';

/**
 * Every tree the section draws: the window's tabs in the game's order, then
 * each profession's tree. `tree11` and `tree20` hang off no tab and no hero —
 * the game has no screen for them — so they are not here and their addresses
 * name nothing.
 */
export function shownTrees(file: ProgressionFile): TalentTree[] {
  const out: TalentTree[] = [];
  for (const id of file.tabs) {
    const tree = file.trees[id];
    if (tree !== undefined) out.push(tree);
  }
  for (const p of file.professions) {
    const tree = file.trees[p.tree];
    if (tree !== undefined && !out.includes(tree)) out.push(tree);
  }
  return out;
}

/** The profession whose tree this is, if it is one. */
export function professionOfTree(file: ProgressionFile, treeId: string): Profession | undefined {
  return file.professions.find((p) => p.tree === treeId);
}

/** What an address under `/wiki/progression/` shows. */
export type ProgressionView =
  | {
      kind: 'tree';
      /** The sub-tab: a tree id from `tabs`. */
      tab: string;
      tree: TalentTree;
      node?: TalentNode;
    }
  | {
      kind: 'hero';
      tab: typeof PROGRESSION_HERO_TAB;
      hero: Profession;
      /** Absent when the profession names a tree the file lacks. */
      tree?: TalentTree;
      node?: TalentNode;
      /** `/wiki/progression/heroes` with no hero: the first one, on the tab's own page. */
      tabOnly?: true;
    };

/**
 * Reads the segments after `progression`. `null` is a well-formed address that
 * names nothing — an unknown tree or hero, a node that is not in the tree the
 * address puts it in, or a tree the game does not show.
 *
 * - `[]` — the first tab;
 * - `[tree]`, `[tree, node]` — a tab, or a profession's tree, which is shown
 *   on the profession tab with that hero picked (the partner wiki did the same
 *   for its `#progression/tree4/T300` links);
 * - `['heroes']`, `['heroes', profession]`, `['heroes', profession, node]`.
 */
export function resolveProgressionPath(file: ProgressionFile, path: readonly string[]): ProgressionView | null {
  const [first, second, third, ...rest] = path;
  if (rest.length > 0) return null;
  if (first === undefined) {
    const tab = file.tabs[0];
    const tree = tab === undefined ? undefined : file.trees[tab];
    return tab !== undefined && tree !== undefined
      ? { kind: 'tree', tab, tree }
      : heroView(file, file.professions[0], undefined, true);
  }

  if (first === PROGRESSION_HERO_TAB) {
    if (second === undefined) return heroView(file, file.professions[0], undefined, true);
    const hero = file.professions.find((p) => p.profession === second);
    return hero === undefined ? null : heroView(file, hero, third, false);
  }

  if (third !== undefined) return null;
  const tree = file.trees[first];
  if (tree === undefined) return null;
  const hero = professionOfTree(file, tree.id);
  if (hero !== undefined) return heroView(file, hero, second, false);
  if (!file.tabs.includes(tree.id)) return null;
  if (second === undefined) return { kind: 'tree', tab: tree.id, tree };
  const node = tree.nodes.find((n) => n.id === second);
  return node === undefined ? null : { kind: 'tree', tab: tree.id, tree, node };
}

function heroView(
  file: ProgressionFile,
  hero: Profession | undefined,
  nodeId: string | undefined,
  tabOnly: boolean,
): ProgressionView | null {
  if (hero === undefined) return null;
  const tree = file.trees[hero.tree];
  const view: ProgressionView = { kind: 'hero', tab: PROGRESSION_HERO_TAB, hero };
  if (tree !== undefined) view.tree = tree;
  if (tabOnly) view.tabOnly = true;
  if (nodeId === undefined) return view;
  const node = tree?.nodes.find((n) => n.id === nodeId);
  if (node === undefined) return null;
  view.node = node;
  return view;
}

/** The canonical segments of a view — what a link to it says. */
export function progressionPathOf(view: ProgressionView): string[] {
  if (view.kind === 'tree') return view.node === undefined ? [view.tree.id] : [view.tree.id, view.node.id];
  if (view.tabOnly === true) return [PROGRESSION_HERO_TAB];
  const base = [PROGRESSION_HERO_TAB, view.hero.profession];
  return view.node === undefined ? base : [...base, view.node.id];
}

/** What a full clear of a room yields, as far as the progression maths needs. `LocationFarm` fits. */
export interface FarmYield {
  gold: number;
  items: ReadonlyMap<string, { avg: number }>;
}

/** One resource line: how many are needed, how many a clear yields, and so how many clears. */
export interface ResourceNeed {
  id: string;
  count: number;
  /** Expected copies per full clear of the chosen room; 0 without a room. */
  perClear: number;
  /** `ceil(count / perClear)`; null without a room or when it does not drop there. */
  clears: number | null;
}

export interface ResourcePlan {
  gold: { need: number; perClear: number; clears: number | null };
  /** Most needed first, then by id. With a room, only what drops there. */
  items: ResourceNeed[];
  /** With a room: how many needed resources do not drop in it. */
  skipped: number;
}

/** Clears of a room needed for `need` at `perClear` a clear; null when it never drops there. */
export function clearsFor(need: number, perClear: number): number | null {
  return perClear > 0 ? Math.ceil(need / perClear) : null;
}

/**
 * The partner wiki's resource block: a cost and, when a room is picked, the
 * clears each resource takes — hiding what that room never drops, and
 * counting how many were hidden.
 */
export function resourcePlan(cost: Cost, farm: FarmYield | null): ResourcePlan {
  const goldPer = farm?.gold ?? 0;
  let items: ResourceNeed[] = [...cost.items].map(([id, count]) => {
    const perClear = farm?.items.get(id)?.avg ?? 0;
    return { id, count, perClear, clears: farm === null ? null : clearsFor(count, perClear) };
  });
  const skipped = farm === null ? 0 : items.filter((r) => !(r.perClear > 0)).length;
  if (farm !== null) items = items.filter((r) => r.perClear > 0);
  items.sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    gold: { need: cost.gold, perClear: goldPer, clears: farm === null ? null : clearsFor(cost.gold, goldPer) },
    items,
    skipped,
  };
}

/** Names the facts need, in the reader's language. */
export interface ProgressionNames {
  locale: ProgressionLocale;
  /** `HeroesWikiLocale.heroes`: name and class per `npc_dota_hero_*`. */
  heroes: Readonly<Record<string, WikiHeroText>>;
  item: (id: string) => string | undefined;
}

/** A profession's hero name: the wiki's, else the bare profession id. */
export function professionName(hero: Profession, names: Pick<ProgressionNames, 'heroes'>): string {
  return names.heroes[hero.hero]?.name ?? hero.profession;
}

/**
 * A tree's title. The game names the tabs and three of the hero trees; the
 * others are "<hero> — <the profession tab's label>".
 */
export function treeTitle(
  file: ProgressionFile,
  treeId: string,
  names: Pick<ProgressionNames, 'heroes' | 'locale'>,
): string {
  const own = names.locale.trees[treeId];
  if (own !== undefined) return own;
  const hero = professionOfTree(file, treeId);
  return hero === undefined ? treeId : `${professionName(hero, names)} — ${names.locale.heroTab}`;
}

type ProgressionLang = 'en' | 'ru' | 'zh';

/** The title, short facts and one sentence of a progression page. */
export function progressionPageFacts(
  file: ProgressionFile,
  view: ProgressionView,
  names: ProgressionNames,
  lang: ProgressionLang,
): { name: string; facts: string; description: string } {
  const s = PROGRESSION_FACTS[lang];
  const n = (value: number) => new Intl.NumberFormat(PROGRESSION_LOCALE[lang], { maximumFractionDigits: 1 }).format(value);

  if (view.node !== undefined && view.tree !== undefined) {
    const node = view.node;
    const text = names.locale.nodes[node.id];
    const name = text?.name ?? node.id;
    const tree = treeTitle(file, view.tree.id, names);
    const price = [
      ...(node.gold > 0 ? [s.gold(n(node.gold))] : []),
      ...node.items.map(([id, count]) => `${names.item(id) ?? id} ×${count}`),
    ];
    const desc = text?.desc?.trim();
    return {
      name,
      facts: [tree, s.level(node.level), ...price].join(' · '),
      description: s.node(
        name,
        tree,
        desc === undefined || desc === '' ? null : desc,
        price.length > 0 ? price.join(', ') : null,
        node.time > 0 ? n(node.time) : null,
      ),
    };
  }

  if (view.kind === 'hero' && view.tabOnly === true) {
    return {
      name: names.locale.heroTab,
      facts: s.professions(file.professions.length),
      description: s.heroTab(names.locale.heroTab, file.professions.map((p) => professionName(p, names)).join(', ')),
    };
  }

  const cost = totalCost(view.tree?.nodes ?? []);
  if (view.kind === 'hero') {
    const hero = professionName(view.hero, names);
    const role = names.heroes[view.hero.hero]?.role;
    return {
      name: view.tree === undefined ? hero : treeTitle(file, view.tree.id, names),
      facts: [...(role !== undefined ? [role] : []), s.nodes(cost.nodes), s.tiers(view.hero.tiers.length)].join(' · '),
      description: s.hero(hero, cost.nodes, view.hero.tiers.length, n(cost.gold)),
    };
  }

  const name = treeTitle(file, view.tree.id, names);
  return {
    name,
    facts: [s.nodes(cost.nodes), s.gold(n(cost.gold))].join(' · '),
    description: s.tree(name, cost.nodes, n(cost.gold), cost.items.size, n(Math.round(cost.time / 360) / 10)),
  };
}

const PROGRESSION_LOCALE: Record<ProgressionLang, string> = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };

interface ProgressionFactsStrings {
  level: (level: number) => string;
  gold: (amount: string) => string;
  nodes: (count: number) => string;
  tiers: (count: number) => string;
  professions: (count: number) => string;
  node: (name: string, tree: string, desc: string | null, price: string | null, seconds: string | null) => string;
  tree: (name: string, nodes: number, gold: string, kinds: number, hours: string) => string;
  hero: (hero: string, nodes: number, tiers: number, gold: string) => string;
  heroTab: (tab: string, heroes: string) => string;
}

const PROGRESSION_FACTS: Record<ProgressionLang, ProgressionFactsStrings> = {
  en: {
    level: (level) => `Level ${level}`,
    gold: (amount) => `${amount} gold`,
    nodes: (count) => `${count} ${count === 1 ? 'node' : 'nodes'}`,
    tiers: (count) => `${count} ${count === 1 ? 'tier' : 'tiers'}`,
    professions: (count) => `${count} professions`,
    node: (name, tree, desc, price, seconds) =>
      `${name}, a node of the ${tree} talent tree in Age of Weapons 5${desc === null ? '' : `: ${desc}`}.` +
      (price === null ? '' : ` Costs ${price}.`) +
      (seconds === null ? '' : ` Research takes ${seconds} s.`),
    tree: (name, nodes, gold, kinds, hours) =>
      `The ${name} talent tree of Age of Weapons 5: ${nodes} nodes, ${gold} gold and ${kinds} kinds of materials in all, about ${hours} h of research, and how many location clears that takes.`,
    hero: (hero, nodes, tiers, gold) =>
      `The ${hero} profession in Age of Weapons 5: ${tiers} tiers and a talent tree of ${nodes} nodes costing ${gold} gold, with every material it needs.`,
    heroTab: (tab, heroes) => `${tab} in Age of Weapons 5: each hero's profession tiers and talent tree — ${heroes}.`,
  },
  ru: {
    level: (level) => `уровень ${level}`,
    gold: (amount) => `${amount} зол.`,
    nodes: (count) => `${count} ${ruPlural(count, 'узел', 'узла', 'узлов')}`,
    tiers: (count) => `${count} ${ruPlural(count, 'ступень', 'ступени', 'ступеней')}`,
    professions: (count) => `${count} ${ruPlural(count, 'профессия', 'профессии', 'профессий')}`,
    node: (name, tree, desc, price, seconds) =>
      `${name} — узел дерева «${tree}» в Age of Weapons 5${desc === null ? '' : `: ${desc}`}.` +
      (price === null ? '' : ` Стоимость: ${price}.`) +
      (seconds === null ? '' : ` Время исследования: ${seconds} с.`),
    tree: (name, nodes, gold, kinds, hours) =>
      `Дерево талантов «${name}» в Age of Weapons 5: ${nodes} ${ruPlural(nodes, 'узел', 'узла', 'узлов')}, всего ${gold} золота и ${kinds} видов материалов, около ${hours} ч исследования — и сколько зачисток локации на это нужно.`,
    hero: (hero, nodes, tiers, gold) =>
      `Профессия героя ${hero} в Age of Weapons 5: ${tiers} ${ruPlural(tiers, 'ступень', 'ступени', 'ступеней')} и дерево талантов из ${nodes} ${ruPlural(nodes, 'узла', 'узлов', 'узлов')} за ${gold} золота, со всеми нужными материалами.`,
    heroTab: (tab, heroes) => `${tab} в Age of Weapons 5: ступени профессий и деревья талантов героев — ${heroes}.`,
  },
  zh: {
    level: (level) => `${level}级`,
    gold: (amount) => `${amount} 金币`,
    nodes: (count) => `${count} 个节点`,
    tiers: (count) => `${count} 个阶段`,
    professions: (count) => `${count} 个职业`,
    node: (name, tree, desc, price, seconds) =>
      `${name}：Age of Weapons 5「${tree}」天赋树节点${desc === null ? '' : `——${desc}`}。` +
      (price === null ? '' : `消耗：${price}。`) +
      (seconds === null ? '' : `研究时间 ${seconds} 秒。`),
    tree: (name, nodes, gold, kinds, hours) =>
      `Age of Weapons 5「${name}」天赋树：${nodes} 个节点，共需 ${gold} 金币与 ${kinds} 种材料，研究约 ${hours} 小时，以及需要清图多少次。`,
    hero: (hero, nodes, tiers, gold) =>
      `Age of Weapons 5 ${hero}的职业：${tiers} 个阶段，天赋树 ${nodes} 个节点，共需 ${gold} 金币及全部材料。`,
    heroTab: (tab, heroes) => `Age of Weapons 5「${tab}」：各英雄的职业阶段与天赋树——${heroes}。`,
  },
};
