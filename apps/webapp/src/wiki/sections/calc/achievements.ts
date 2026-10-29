import {
  achievementPool,
  type AchievementBase,
  type AchievementsFile,
  type AchievementsLocale,
} from 'aow5-shared/wiki';
import { useWikiData } from '../../kit';
import type { CalcInput } from './model';

/**
 * The calculator's achievements: the data files, the reader's claims, and the
 * panel pool they add.
 *
 * `achievementBase` is the hero's base the percentage rewards are taken from —
 * the same "base before percentages" the hero model uses. A hero the stats
 * file lacks has no base to take a percentage of, so those rewards contribute
 * nothing there; flat and direct rewards still count.
 */

export function useAchievementsData(): { file: AchievementsFile | null; locale: AchievementsLocale | null } {
  const { data } = useWikiData<[AchievementsFile, AchievementsLocale]>(['achievements.json', 'locale.{lang}.achievements.json']);
  return { file: data?.[0] ?? null, locale: data?.[1] ?? null };
}

export function achievementBase(input: CalcInput | null): AchievementBase {
  const level = input?.level;
  if (level === undefined) return { health: 0, attrs: { str: 0, agi: 0, int: 0 } };
  // `derived.bonus_health` is (kv health + tree flat) × the tree's percentage;
  // dividing by that percentage gives the base the achievement's own `%` reads.
  const derived = level.derived.bonus_health;
  const health = derived.mult !== 0 ? derived.flat / derived.mult : derived.flat;
  return { health, attrs: level.buckets };
}

/** The buff-pool entries the claimed achievements add for this hero. */
export function achievementContribution(
  file: AchievementsFile | null,
  selected: Readonly<Record<string, number>>,
  input: CalcInput | null,
): Record<string, number> {
  if (file === null) return {};
  return achievementPool(file, selected, achievementBase(input));
}
