import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

/**
 * The pipeline's outputs belong to the shared package, not to the pipeline.
 *
 * parser/ is untracked and only exists on a machine that has the game
 * installed; everything it produces — the emitted JSON, the icons and the two
 * frozen id tables — is committed over there, so a checkout without this
 * directory still builds. Its own inputs and scratch space (config/, assets/,
 * cache/, reports/) stay local.
 */
export const SHARED = path.resolve(ROOT, '..', 'packages', 'aow5-shared');

export const DIRS = {
  root: ROOT,
  config: path.join(ROOT, 'config'),
  cache: path.join(ROOT, 'cache'),
  cacheRaw: path.join(ROOT, 'cache', 'raw'),
  reports: path.join(ROOT, 'reports'),
  assetIcons: path.join(ROOT, 'assets', 'ability-icons'),
  tools: path.join(ROOT, 'tools'),
  data: path.join(SHARED, 'data'),
  publicData: path.join(SHARED, 'public', 'data'),
  publicIcons: path.join(SHARED, 'public', 'icons'),
  publicIconItems: path.join(SHARED, 'public', 'icons', 'items'),
  publicIconAbilities: path.join(SHARED, 'public', 'icons', 'abilities'),
  publicIconHeroes: path.join(SHARED, 'public', 'icons', 'heroes'),
  publicIconMaps: path.join(SHARED, 'public', 'icons', 'maps'),
  publicIconUi: path.join(SHARED, 'public', 'icons', 'ui'),
  publicIconAchievements: path.join(SHARED, 'public', 'icons', 'achievements'),
};

export function ensureDirs(): void {
  for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });
}

/** One `__AK_PANORAMA_PUBLISH_DATA__` table inside a compiled Panorama script. */
export interface PublishPayload {
  /** VPK path of the `.vjs_c` file. */
  path: string;
  /** The `@/json/…` name the publish call was made with. */
  json: string;
  /** Filename to write under cache/raw/. */
  file: string;
}

export interface Aow5Config {
  vpkPath: string;
  languages: string[];
  /** The language the addon is authored in; see the note beside it in the config. */
  baseLanguage: string;
  localeFiles: Record<string, string>;
  itemsPayloadPath: string;
  /**
   * The compiled client bundle. Not a publish payload — it is read as *source*,
   * for the reforge arithmetic the addon computes stat ranges with. See step 04d.
   */
  hudScriptPath: string;
  heroPayloads: Record<'heroes' | 'abilities' | 'professions', PublishPayload>;
  /**
   * The addon's per-season ruleset tree. See lib/ruleset.ts, and the comment
   * beside this block in the config.
   */
  rulesets: {
    dir: string;
    manifestPath: string;
    tables: string[];
    /** Ruleset id -> the season number `seasons.ts` uses. */
    seasonKeys: Record<string, number>;
    [key: string]: unknown;
  };
  /** Master translation table; the sole source of hero ability text. */
  abilityLocaleCsv: string;
  /** Language code -> column name in that CSV. */
  abilityLocaleColumns: Record<string, string>;
  /** The endless Greed Cave's reward tables; see the note beside it in the config. */
  greedCavePath: string;
  /** The achievement table; see the note beside it in the config. */
  achievementsPath: string;
  /** The game's achievement art directory; step 05c reads the textures it names. */
  achievementIconDir: string;
  /** The room table — every map a guide can be written for, and its tier. */
  roomsPath: string;
  /** Difficulty modifiers the room selection screen offers. Extracted, not yet emitted. */
  roomDifficultyPath: string;
  /** Where the portal's per-room art lives, and how its files are named. */
  mapImageDir: string;
  /** `{id}` is the lowercased room id, e.g. `m007`. */
  mapImagePattern: string;
  /** Frozen, append-only map order. A map's position is what an encoded build carries. */
  mapRoster: { hidden: string[]; [key: string]: unknown };
  /** Chrome the site draws itself, by name. Not manifest-driven; see the config. */
  uiIcons: Record<string, string>;
  flash3IconDir: string;
  spellIconDir: string;
  panoramaIconDir: string;
  kvCrossCheckGlobs: string[];
  cdnBases: string[];
  abilityCdnBases: string[];
  heroCdnBases: string[];
  /** Cosmetic ability texture -> the stock ability it reskins. See config. */
  abilityIconAliases: Record<string, string>;
  /** Ability texture -> a file in assets/ability-icons/. Beats every source. */
  abilityIconOverrides: Record<string, string>;
  cdnConcurrency: number;
  /** Frozen, append-only hero order. A hero's position is what a link encodes. */
  heroRoster: {
    order: string[];
    names: Record<string, Record<string, string>>;
    /** Heroes the profession table does not name, mapped to their `AllowedProfessions` id. */
    professions?: Record<string, string>;
    [key: string]: unknown;
  };
  knownDataIssues: {
    danglingNeedIds: string[];
    /**
     * Placeholder tokens the addon's own localized text references but never
     * defines, per ability id. Exempted from the "no unresolved placeholders"
     * check so it fails on new breakage rather than on a translation bug we
     * have already read the raw data for. See the note beside it in the config.
     */
    unresolvedAbilityTokens?: Record<string, string[]>;
    [key: string]: unknown;
  };
  expected: {
    vpkBytes: number;
    treeSize: number;
    entryCount: number;
    archiveIndex: number;
    itemsPayloadOffset: number;
    itemsPayloadLength: number;
    flash3ItemPngCount: number;
    panoramaItemVtexCount: number;
    itemCount: number;
    inGameCount: number;
    /** Last accepted playable count. The drift tripwire measures against this. */
    playableCount: number;
    hiddenCount: number;
    withNeedsCount: number;
    itemTypeHistogram: Record<string, number>;
    /** How many items each dismantle rule claims. Keys are the addon's own ids. */
    dismantleRuleHistogram: Record<string, number>;
    enTokens: { names: number; descriptions: number; lore: number; values: number };
    achievementSeriesCount: number;
    achievementStageCount: number;
    heroCount: number;
    abilityCount: number;
    selectableAbilityCount: number;
    abilitiesPerHero: Record<string, number>;
  };
}

let cached: Aow5Config | null = null;

/** Loads config/aow5.config.json. `AOW5_VPK` env var overrides the VPK path. */
export function loadConfig(): Aow5Config {
  if (cached) return cached;
  const raw = fs.readFileSync(path.join(DIRS.config, 'aow5.config.json'), 'utf8');
  const cfg = JSON.parse(raw) as Aow5Config;
  const override = process.env.AOW5_VPK;
  if (override) cfg.vpkPath = override;
  cached = cfg;
  return cfg;
}
