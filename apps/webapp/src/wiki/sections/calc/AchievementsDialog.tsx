import { achievementIconUrl } from 'aow5-shared/data';
import {
  achievementTotals,
  type AchievementsFile,
  type AchievementsLocale,
  type AchievementReward,
  type AchievementSeries,
} from 'aow5-shared/wiki';
import { Button, Dialog, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { useWikiStrings } from '../../i18n';
import { CALC } from '../../i18n/calc';
import { num, useStatNamer } from '../../kit';
import styles from './AchievementsDialog.module.css';

/**
 * The achievements dialog: one card per series — its art, its name, what the
 * current selection grants, and the three level buttons at the bottom.
 *
 * A level in the saved state is cumulative — the game only lets a stage be
 * claimed after the one before it, so III means I + II + III. The bonus line
 * is the sum of the selected stages' rewards in the game's own terms (percent
 * rewards stay percent); the table's “Buffs” column is where they become flat
 * panel numbers.
 */

const ROMAN = ['I', 'II', 'III'] as const;

/** Reward keys that reach the panel under another name. */
const LABEL_KEY: Record<string, string> = {
  base_health: 'base_health',
  base_health_pct: 'base_health_pct',
  base_all_stats: 'bonus_all_stats',
  base_all_stats_pct: 'base_all_stats_pct',
  outgoing_damage_pct: 'outgoing_damage_pct',
  outgoing_damage_pct_2: 'outgoing_damage_pct_2',
  damage_resistance_pct: 'damage_resistance_pct',
};

export function AchievementsDialog({
  open,
  onClose,
  file,
  locale,
  selected,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  file: AchievementsFile | null;
  locale: AchievementsLocale | null;
  selected: Readonly<Record<string, number>>;
  onChange: (seriesId: string, level: number) => void;
  onReset: () => void;
}) {
  const t = useWikiStrings(CALC).achievements;
  const count = Object.values(selected).filter((level) => level > 0).length;
  return (
    <Dialog
      wide
      open={open}
      onClose={onClose}
      title={t.title}
      footer={
        <>
          <span className={styles.count}>{t.selected(count)}</span>
          <Button size="sm" variant="ghost" onClick={onReset} disabled={count === 0}>
            {t.reset}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t.close}
          </Button>
        </>
      }
    >
      <p className={styles.note}>{t.note}</p>
      {file === null || locale === null ? (
        <p className={styles.empty}>{t.loading}</p>
      ) : file.series.length === 0 ? (
        <p className={styles.empty}>{t.empty}</p>
      ) : (
        <div className={styles.grid}>
          {file.series.map((series) => (
            <SeriesCard
              key={series.id}
              series={series}
              locale={locale}
              level={selected[series.id] ?? 0}
              onChange={(level) => onChange(series.id, level)}
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}

function SeriesCard({
  series,
  locale,
  level,
  onChange,
}: {
  series: AchievementSeries;
  locale: AchievementsLocale;
  level: number;
  onChange: (level: number) => void;
}) {
  const t = useWikiStrings(CALC).achievements;
  const { lang } = useApp();
  const namer = useStatNamer();
  const text = locale.series[series.id];
  const stages = [...series.stages].sort((a, b) => a.stage - b.stage);
  const title = text?.title ?? (series.category === 'level' ? t.levelCategory : series.id);
  const shown = level > 0 ? (stages.find((stage) => stage.stage === level) ?? stages[0]) : stages[0];
  const totals = achievementTotals(series, level);

  const rewardText = (rewards: readonly AchievementReward[]): string =>
    rewards
      .map((reward) => {
        const stat = namer(LABEL_KEY[reward.key] ?? reward.key);
        const value = num(reward.value, lang, Number.isInteger(reward.value) ? 0 : 1);
        return `${stat.text} +${value}${stat.percent ? '%' : ''}`;
      })
      .join(' · ');

  return (
    <section className={styles.card}>
      {shown !== undefined && (
        <img className={styles.icon} src={achievementIconUrl(shown.icon)} alt="" loading="lazy" decoding="async" />
      )}
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={cx(styles.bonus, totals.length === 0 && styles.bonusNone)}>
        {totals.length > 0 ? rewardText(totals) : t.notSelected}
      </p>
      <div className={styles.levels}>
        {stages.map((stage) => {
          const stageText = text?.stages[stage.id];
          const on = level >= stage.stage;
          const hint =
            stageText !== undefined
              ? `${stageText.name} — ${rewardText(stage.rewards)} — ${stageText.description}`
              : stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              className={cx(styles.level, on && styles.levelOn)}
              aria-pressed={on}
              title={hint}
              onClick={() => onChange(level === stage.stage ? 0 : stage.stage)}
            >
              {ROMAN[stage.stage - 1] ?? stage.stage}
            </button>
          );
        })}
      </div>
    </section>
  );
}
