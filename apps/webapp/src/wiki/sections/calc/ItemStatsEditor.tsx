import { useEffect, type ReactNode } from 'react';
import type { RollTables } from 'aow5-shared/types';
import { canBeDivine, isReverseKey, isRolled, randomPctOf } from 'aow5-shared/data';
import {
  canFix,
  drawAt,
  effectIndex,
  effectSteps,
  effectTone,
  enhanceTone,
  isEffectStat,
  statBounds,
  statTone,
  stoneDraw,
  stoneState,
  stoneStatValue,
  valueAtPos,
  defaultPos,
  type RollState,
  type RollTone,
} from 'aow5-shared/wiki';
import { cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { useWikiStrings } from '../../i18n';
import { CALC } from '../../i18n/calc';
import { WikiLoading, num } from '../../kit';
import { itemCooldown, itemValues, linksOf, useItemsExtra, useStatNamer, type StatName } from './itemData';
import styles from './ItemStatsEditor.module.css';

/**
 * One copy of an item, dialled in: every stat's roll, the fixed affix, the
 * enhancement, the divine forge and the reforge level — and on an ancestral
 * item, its fate stone's own rolls. The partner wiki's `itemstats.js`.
 *
 * Controlled: `state` is the copy, `onChange` gets the next one. Standalone
 * otherwise — it loads the item records, the roll tables and the season
 * patches itself — so the item page can drop it in as it is.
 *
 * Ordinary stats get a continuous slider over their window; effect values
 * (`ability_*`, the numbers inside the passive) get their few reachable steps
 * as chips. The maths is `aow5-shared/wiki`'s `itemroll.ts`.
 */
export function ItemStatsEditor({ itemId, state, onChange }: { itemId: string; state: RollState; onChange: (next: RollState) => void }) {
  const store = useItemDetailsStore();
  const extra = useItemsExtra();
  const t = useWikiStrings(CALC).stats;
  const { lang } = useApp();
  const nameOf = useStatNamer();

  useEffect(() => {
    store?.request();
  }, [store]);

  const full = store?.full ?? null;
  const tables = store?.rolls ?? null;
  if (full === null || tables === null) return <WikiLoading />;
  const item = full[itemId];
  if (item === undefined) return null;

  const fmt = (v: number, name: StatName) => `${num(v, lang, 2)}${name.percent ? '%' : ''}`;
  const pctText = (draw: number) => (draw * 100).toFixed(0);

  const numeric = (values: Record<string, number | string>) =>
    Object.entries(values)
      .filter((e): e is [string, number] => typeof e[1] === 'number')
      .sort((a, b) => b[1] - a[1]);
  const stats = numeric(itemValues(item, extra));
  const stoneId = linksOf(full).fromStone.get(itemId);
  const stone = stoneId !== undefined ? full[stoneId] : undefined;
  const stoneStats = stone !== undefined ? numeric(itemValues(stone, extra)) : [];
  const stoneByKey = new Map(stoneStats);
  const ownKeys = new Set(stats.map(([k]) => k));
  const hasStoneCols = stoneStats.length > 0;
  const isStone = item.type === 'stone';
  const cooldown = itemCooldown(item, extra);

  const main = stats.filter(([k]) => !isEffectStat(k));
  const effect = stats.filter(([k]) => isEffectStat(k));
  const anyRoll = stats.some(([k]) => isRolled(tables, k));

  const set = (patch: Partial<RollState>) => onChange({ ...state, ...patch });
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const head = (
    <>
      <h3 className={styles.title}>{t.title}</h3>
      {cooldown !== undefined && cooldown > 0 && <p className={styles.note}>{t.cooldown(num(cooldown, lang, 2))}</p>}
    </>
  );
  if (stats.length === 0) {
    return (
      <div className={styles.root}>
        {head}
        <p className={styles.note}>{t.noStats}</p>
      </div>
    );
  }

  const stoneVal = (key: string) => {
    const base = stoneByKey.get(key);
    return base === undefined ? null : stoneStatValue(tables, key, base, state);
  };
  const stoneToneOf = (key: string): RollTone => statTone(stoneDraw(tables, state.stoneRoll[key] ?? 50));

  /** The "Stone" and "Total" cells of an item's own stat row, on an ancestral item. */
  const stoneCells = (key: string, own: number, name: StatName) => {
    if (!hasStoneCols) return null;
    const g = stoneVal(key);
    return (
      <>
        <span className={cx(styles.num, styles.colStone, g !== null && styles[`tone_${stoneToneOf(key)}`])} title={g !== null ? t.stoneCol : t.noStoneCol}>
          <span className={styles.cellLabel}>{t.cols.stone}</span>
          {g !== null ? fmt(g, name) : '—'}
        </span>
        <span className={cx(styles.num, styles.colTotal)} title={g !== null ? t.totalCol : t.totalOwn}>
          <span className={styles.cellLabel}>{t.cols.total}</span>
          {fmt(own + (g ?? 0), name)}
        </span>
      </>
    );
  };

  const nameCell = (key: string, name: StatName) => (
    <span className={styles.name}>
      <span>{name.text}</span>
      <code className={styles.code}>{key}</code>
    </span>
  );

  const affixButtons = (key: string): ReactNode => {
    if (!canFix(tables, key)) {
      return (
        <span className={styles.dash} title={t.dashEffect(canBeDivine(key))}>
          —
        </span>
      );
    }
    return (
      <>
        <Toggle on={state.fix.includes(key)} title={t.fixTitle(tables.fixedBonusPct)} onClick={() => set({ fix: toggle(state.fix, key) })}>
          {t.fix}
        </Toggle>
        {!isStone && (
          <Toggle
            on={state.enhance.includes(key)}
            title={t.enhTitle(state.enhancePct)}
            tone={enhanceTone(state.enhancePct)}
            onClick={() => set({ enhance: toggle(state.enhance, key) })}
          >
            {t.enh}
          </Toggle>
        )}
      </>
    );
  };

  /** A stat of the item's own: a slider, step chips, or a fixed number. */
  const statRow = (key: string, base: number) => {
    const name = nameOf(key, itemId);
    const pct = randomPctOf(tables, key);
    const effectStat = isEffectStat(key);
    let range: ReactNode;
    let control: ReactNode = null;
    let value: number;
    let valueTone: RollTone | null = null;
    let valueTitle: string;
    let rangeTitle: string;

    if (pct === undefined) {
      value = base;
      range = fmt(base, name);
      rangeTitle = t.fixedRange;
      valueTitle = t.fixedValue;
    } else if (effectStat) {
      const steps = effectSteps(tables, key, base, state);
      const k = effectIndex(tables, key, base, state, steps.length);
      const vals = steps.map((x) => x.value);
      range = `${fmt(Math.min(...vals), name)} – ${fmt(Math.max(...vals), name)}`;
      rangeTitle = t.stepsTitle;
      control = (
        <span className={styles.steps}>
          {steps.map((x, n) => (
            <button
              key={n}
              type="button"
              className={cx(styles.step, n === k && styles.stepOn, styles[`tone_${effectTone(x.roll)}`])}
              aria-pressed={n === k}
              title={t.stepChip(pctText(x.roll), fmt(x.value, name), steps.length)}
              onClick={() => set({ roll: { ...state.roll, [key]: n } })}
            >
              {fmt(x.value, name)}
            </button>
          ))}
        </span>
      );
      const chosen = steps[k]!;
      value = chosen.value;
      valueTone = effectTone(chosen.roll);
      valueTitle = [t.stepValue(fmt(value, name), steps.length, state.refine), isReverseKey(key) ? t.reverse : null, t.effectColours]
        .filter(Boolean)
        .join('\n');
    } else {
      const pos = state.roll[key] ?? defaultPos(tables, key, base, state);
      const b = statBounds(tables, key, base, state);
      range = b.min === b.max ? fmt(b.min, name) : `${fmt(b.min, name)} – ${fmt(b.max, name)}`;
      rangeTitle = t.rangeTitle((pct / 2).toFixed(0));
      value = valueAtPos(tables, key, base, pos, state);
      const draw = drawAt(tables, pos, state.refine);
      valueTone = statTone(draw);
      const g = stoneVal(key);
      valueTitle = [
        t.current(fmt(value, name), pctText(draw)),
        g !== null ? t.withStone(fmt(value + g, name)) : null,
        isReverseKey(key) ? t.reverse : null,
        t.colours,
      ]
        .filter(Boolean)
        .join('\n');
      control = (
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={100}
          value={pos}
          title={t.rangeTitle((pct / 2).toFixed(0))}
          aria-label={name.text}
          onChange={(event) => set({ roll: { ...state.roll, [key]: Number(event.target.value) } })}
        />
      );
    }

    return (
      <div key={key} className={cx(styles.row, effectStat && styles.rowEffect)} role="row">
        <span className={styles.ctl}>{affixButtons(key)}</span>
        {nameCell(key, name)}
        <span className={styles.range} title={rangeTitle}>
          {range}
        </span>
        <span className={styles.control}>{control}</span>
        <span className={cx(styles.num, styles.value, valueTone !== null ? styles[`tone_${valueTone}`] : styles.fixed)} title={valueTitle}>
          {fmt(value, name)}
        </span>
        {stoneCells(key, value, name)}
      </div>
    );
  };

  /** A fate-stone stat: its own slider and fixed affix. */
  const stoneRow = (key: string, base: number) => {
    const only = !ownKeys.has(key);
    const name = nameOf(key, stoneId);
    const pos = state.stoneRoll[key] ?? 50;
    const v = stoneStatValue(tables, key, base, state);
    const b = statBounds(tables, key, base, stoneState(state));
    const tone = statTone(stoneDraw(tables, pos));
    return (
      <div key={`stone:${key}`} className={styles.row} role="row">
        <span className={styles.ctl}>
          {canFix(tables, key) ? (
            <Toggle
              on={state.stoneFix.includes(key)}
              title={t.stoneFixTitle(tables.fixedBonusPct)}
              onClick={() => set({ stoneFix: toggle(state.stoneFix, key) })}
            >
              {t.fix}
            </Toggle>
          ) : (
            <span className={styles.dash} title={t.dashStone}>
              —
            </span>
          )}
        </span>
        {nameCell(key, name)}
        <span className={styles.range} title={t.stoneRange}>
          {b.min === b.max ? fmt(b.min, name) : `${fmt(b.min, name)} – ${fmt(b.max, name)}`}
        </span>
        <span className={styles.control}>
          {isRolled(tables, key) && (
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={100}
              value={pos}
              title={only ? t.stoneSliderOnly : t.stoneSlider}
              aria-label={name.text}
              onChange={(event) => set({ stoneRoll: { ...state.stoneRoll, [key]: Number(event.target.value) } })}
            />
          )}
        </span>
        <span className={cx(styles.num, styles.value, styles.dim)} title={t.stoneItemDash(only)}>
          —
        </span>
        <span className={cx(styles.num, styles.colStone, styles[`tone_${tone}`])} title={t.stoneValue(only, fmt(v, name), pctText(stoneDraw(tables, pos)))}>
          <span className={styles.cellLabel}>{t.cols.stone}</span>
          {fmt(v, name)}
        </span>
        <span className={cx(styles.num, styles.colTotal)} title={t.stoneTotal(only)}>
          <span className={styles.cellLabel}>{t.cols.total}</span>
          {only ? fmt(v, name) : '—'}
        </span>
      </div>
    );
  };

  return (
    <div className={styles.root}>
      {head}
      {anyRoll && !isStone && <Bar tables={tables} state={state} set={set} />}

      <div className={cx(styles.table, hasStoneCols && styles.hasStone)} role="table">
        {hasStoneCols && (
          <div className={cx(styles.row, styles.headRow)} role="row">
            <span />
            <span>{t.cols.prop}</span>
            <span>{t.cols.range}</span>
            <span>{t.cols.roll}</span>
            <span className={styles.num}>{t.cols.item}</span>
            <span className={styles.num}>{t.cols.stone}</span>
            <span className={styles.num}>{t.cols.total}</span>
          </div>
        )}
        {main.map(([k, v]) => statRow(k, v))}
        {effect.length > 0 && <div className={styles.group}>{t.effectGroup}</div>}
        {effect.map(([k, v]) => statRow(k, v))}
        {hasStoneCols && <div className={styles.group}>{t.stoneGroup}</div>}
        {stoneStats.map(([k, v]) => stoneRow(k, v))}
      </div>

      {anyRoll && (
        <p className={styles.note}>
          {isStone
            ? t.stoneNote(tables.fixedBonusPct)
            : t.note({ fixed: tables.fixedBonusPct, divine: tables.divine.bonusPct, ability: tables.divine.abilityBonusPct, stone: hasStoneCols })}
        </p>
      )}
    </div>
  );
}

/** The copy-wide controls: the divine forge, the enhancement's size, the reforge level. */
function Bar({ tables, state, set }: { tables: RollTables; state: RollState; set: (patch: Partial<RollState>) => void }) {
  const t = useWikiStrings(CALC).stats;
  return (
    <div className={styles.bar}>
      <Toggle
        big
        on={state.divine}
        title={t.divineTitle(tables.divine.bonusPct, tables.divine.abilityBonusPct)}
        onClick={() => set({ divine: !state.divine })}
      >
        {t.divine}
      </Toggle>
      <label className={styles.barField} title={t.enhanceTitle}>
        <span className={cx(styles.barLabel, styles[`tone_${enhanceTone(state.enhancePct)}`])}>{t.enhance(state.enhancePct)}</span>
        <input
          type="range"
          className={styles.slider}
          min={tables.enhancedBonusPct[0]}
          max={tables.enhancedBonusPct[1]}
          value={state.enhancePct}
          onChange={(event) => set({ enhancePct: Number(event.target.value) })}
        />
      </label>
      <label className={styles.barField} title={t.refineTitle}>
        <span className={styles.barLabel}>{t.refine(state.refine)}</span>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={tables.maxReforgeLevel}
          step={1}
          value={state.refine}
          onChange={(event) => set({ refine: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  title,
  tone,
  big = false,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  tone?: RollTone;
  big?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx(styles.toggle, big && styles.toggleBig, on && styles.toggleOn, on && tone !== undefined && styles[`tone_${tone}`])}
      aria-pressed={on}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
