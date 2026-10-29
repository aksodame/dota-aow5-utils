/**
 * Achievements and the panel stats their claimed stages add —
 * `wiki/achievements.json` and `wiki/locale.<lang>.achievements.json`.
 *
 * The game's own `ak_achievement.txt` gives every stage a `reward_attributes`
 * string (`base_health:15`, `base_health_pct:2`, …). The server applies a
 * claimed stage's rewards to the hero as attributes, and a stage can only be
 * claimed after the one before it (see `player_achievement_manager.lua`:
 * `arePreviousStagesClaimed`), so a reader who has stage III also has I and II.
 * The calculator therefore treats a series as one level from 0 to 3 and sums
 * every stage up to it.
 *
 * The four `base_*` keys are not panel rows of their own. They are folded into
 * the rows the panel does show, the way `attributesmanager`/`attr_const` do it:
 *
 *   - `base_health` adds flat health;
 *   - `base_health_pct` is a percentage of the hero's base health (plus any
 *     `base_health` the achievements themselves add);
 *   - `base_all_stats` adds flat to every attribute;
 *   - `base_all_stats_pct` is a percentage of the hero's base attributes (plus
 *     the achievements' own `base_all_stats`).
 *
 * The percentages are turned into flat amounts at the hero's base, so what the
 * calculator adds to its “Buffs” column has a fixed number for the chosen
 * hero. This is the same reading of the encrypted server half as the hero
 * model in `progression.ts`.
 */

import type { AttrTriple } from './progression.ts';

/** One key:value pair of a stage's `reward_attributes`. */
export interface AchievementReward {
  key: string;
  value: number;
}

/** One stage of a series: a single achievement in the game's table. */
export interface AchievementStage {
  /** `achievement_0001`. */
  id: string;
  /** 1, 2 or 3. */
  stage: number;
  /** The raw `condition`, e.g. `boss|kill|monster_12004|difficulty=easy`. */
  condition: string;
  target: number;
  rewards: AchievementReward[];
  /**
   * Icon file under `public/icons/achievements/`. The game picks it from the
   * condition: a hero-level stage gets `level_<stage>`, a boss series its
   * boss art. Stages of one boss series share a file.
   */
  icon: string;
}

/** The three stages that share a `series_id`. */
export interface AchievementSeries {
  /** `series_0001`. */
  id: string;
  /** `boss` or `level` — the table's own category. */
  category: string;
  stages: AchievementStage[];
}

/** `wiki/achievements.json`. */
export interface AchievementsFile {
  schema: 1;
  generatedAt: string;
  series: AchievementSeries[];
}

/** One stage's localized strings. */
export interface AchievementStageText {
  name: string;
  /**
   * The name's part after the last `·`: `Охотник: Тини · Легко` keeps `Легко`.
   * The card shows the shared title as its heading and this as the row.
   */
  shortName: string;
  description: string;
}

/** One series' localized strings, keyed by stage id. */
export interface AchievementSeriesText {
  /** The common part of all three names before `·`, when they share one. */
  title?: string;
  stages: Record<string, AchievementStageText>;
}

/** `wiki/locale.<lang>.achievements.json`. */
export interface AchievementsLocale {
  schema: 1;
  lang: string;
  series: Record<string, AchievementSeriesText>;
}

/** The rewards of every stage up to and including `level`, in table order. */
export function achievementLevelRewards(series: AchievementSeries, level: number): AchievementReward[] {
  const top = Math.max(0, Math.floor(level));
  const out: AchievementReward[] = [];
  for (const stage of [...series.stages].sort((a, b) => a.stage - b.stage)) {
    if (stage.stage > top) break;
    out.push(...stage.rewards);
  }
  return out;
}

/**
 * The rewards of every stage up to `level`, summed per key — what the card's
 * “current bonus” line shows. Insertion order is the stages' order, so a card
 * reads the same way as the game's own reward tooltip.
 */
export function achievementTotals(series: AchievementSeries, level: number): AchievementReward[] {
  const totals = new Map<string, number>();
  for (const reward of achievementLevelRewards(series, level)) {
    totals.set(reward.key, (totals.get(reward.key) ?? 0) + reward.value);
  }
  return [...totals].map(([key, value]) => ({ key, value }));
}

/** The hero's base the percentage rewards are taken from. */
export interface AchievementBase {
  /** Base health before percentages: the hero's own health plus tree flat. */
  health: number;
  /** Base attributes before percentages (the hero model's `buckets`). */
  attrs: AttrTriple;
}

const ATTR_KEY: Record<keyof AttrTriple, string> = {
  str: 'bonus_strength',
  agi: 'bonus_agility',
  int: 'bonus_intelligence',
};

const DIRECT_KEYS: ReadonlySet<string> = new Set([
  'outgoing_damage_pct',
  'outgoing_damage_pct_2',
  'damage_resistance_pct',
]);

/**
 * What the claimed achievements add to the calculator's buff pool.
 *
 * Keys are the calculator's own panel keys, so the page needs no special case:
 * the pool goes through the same `rowTotal`/`applyEffects` path as the
 * permanent consumables.
 */
export function achievementPool(
  file: AchievementsFile,
  selected: Readonly<Record<string, number>>,
  base: AchievementBase,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const series of file.series) {
    const level = selected[series.id] ?? 0;
    if (level <= 0) continue;
    for (const reward of achievementLevelRewards(series, level)) {
      totals[reward.key] = (totals[reward.key] ?? 0) + reward.value;
    }
  }

  const pool: Record<string, number> = {};
  const add = (key: string, value: number): void => {
    if (value !== 0) pool[key] = (pool[key] ?? 0) + value;
  };

  const flatHealth = totals['base_health'] ?? 0;
  const healthPct = totals['base_health_pct'] ?? 0;
  if (flatHealth !== 0) add('bonus_health', flatHealth);
  if (healthPct !== 0) add('bonus_health', ((base.health + flatHealth) * healthPct) / 100);

  const allFlat = totals['base_all_stats'] ?? 0;
  const allPct = totals['base_all_stats_pct'] ?? 0;
  if (allFlat !== 0) add('bonus_all_stats', allFlat);
  if (allPct !== 0) {
    for (const attr of ['str', 'agi', 'int'] as const) {
      add(ATTR_KEY[attr], ((base.attrs[attr] + allFlat) * allPct) / 100);
    }
  }

  for (const key of DIRECT_KEYS) add(key, totals[key] ?? 0);
  for (const [key, value] of Object.entries(totals)) {
    if (key === 'base_health' || key === 'base_health_pct' || key === 'base_all_stats' || key === 'base_all_stats_pct') continue;
    if (DIRECT_KEYS.has(key)) continue;
    // A reward key the page does not model yet still becomes a pool key: a
    // future panel row with the same name starts working without a code change.
    add(key, value);
  }
  return pool;
}
