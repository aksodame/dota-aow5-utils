import type { RollTables } from '../types/rolls.ts';
import {
  canBeAffix,
  canBeDivine,
  decimalsOf,
  divinePctFor,
  isReverseKey,
  iterationBonus,
  randomPctOf,
  stableLevel,
} from '../data/rolls.ts';

/**
 * One *particular* copy of an item: where each stat landed, which stat carries
 * the fixed affix and which the enhancement, the divine forge, the reforge
 * level — and, on an ancestral item, the fate stone's own rolls.
 *
 * The wiki's stats calculator and its item editor both run on this, the
 * partner wiki's `itemroll.js` ported onto the builder's roll tables
 * (`rolls.json`, read by `data/rolls.ts`). It differs from `data/rolls.ts` in
 * what it is for: that module answers "what can this stat be?" for a planner,
 * as a list of reachable draws; this one answers "what *is* it on the copy in
 * my bag?", with a slider per stat, so a reader can dial their item in and see
 * the numbers move. Five things follow from that, each the partner's reading of
 * the game checked against values seen in it:
 *
 *  1. **An ordinary stat is a continuous slider**, over the window
 *     `−0.5 + sqrt(refine/9)·0.3 … +0.5`. The bundle's `normal01` quantises the
 *     draw, but a reader does not know their copy's draw — they know the number
 *     on the card — and a slider lands on it wherever the card says.
 *  2. **Every bonus multiplies one value and the result is rounded once**:
 *     `(base + roll·base·pct) × fixed × enhanced × divine`, then rounded. The
 *     planner's `valueOf` rounds after each step and leaves the enhancement out.
 *  3. **An effect stat (`ability_*`) has five step chips**, the quantised grid
 *     drawn at the stable iteration count; the lowest step (k = 0) is hidden —
 *     about 1.3% of copies roll it, and the game's own UI shows five.
 *  4. **Colours by roll**, as the client paints them: 0.45 / 0.37 / 0.2 / 0.08 /
 *     −0.2 for stats, 0.45 / 0.36 / 0.15 for effect values.
 *  5. **A fate stone's stats on an ancestral item roll separately** — their own
 *     slider at the fresh window, their own fixed affix and nothing else — and
 *     are added to the item's.
 */

/** A copy's roll state. Arrays rather than sets so it serialises as it is. */
export interface RollState {
  /**
   * Stat key → position. For an ordinary stat, 0..100 across the window; for
   * an effect stat, the index of the chip (see {@link effectSteps}).
   */
  roll: Record<string, number>;
  /** Stats wearing the fixed affix (+30%). The game puts it on one; the editor lets you mark any. */
  fix: string[];
  /** Stats wearing the enhancement. */
  enhance: string[];
  divine: boolean;
  /** The enhancement's size on this copy, 20..38. */
  enhancePct: number;
  /** Reforge level, 0..9. */
  refine: number;
  /** Fate-stone stat key → slider position 0..100 (ancestral items only). */
  stoneRoll: Record<string, number>;
  /** Fate-stone stats wearing their own fixed affix. */
  stoneFix: string[];
}

/** The enhancement a fresh copy is drawn with until told otherwise: the middle of 20..38. */
export const DEFAULT_ENHANCE_PCT = 29;

export function newRollState(): RollState {
  return { roll: {}, fix: [], enhance: [], divine: false, enhancePct: DEFAULT_ENHANCE_PCT, refine: 0, stoneRoll: {}, stoneFix: [] };
}

/**
 * Reads a stored state back, dropping anything malformed. What `localStorage`
 * holds was written by some earlier version of the page, so nothing in it is
 * trusted beyond its shape.
 */
export function hydrateRollState(raw: unknown): RollState {
  const s = newRollState();
  if (raw === null || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  const numbers = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v !== null && typeof v === 'object') {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
    }
    return out;
  };
  const keys = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
  s.roll = numbers(r.roll);
  s.fix = keys(r.fix);
  s.enhance = keys(r.enhance);
  s.divine = r.divine === true;
  if (typeof r.enhancePct === 'number' && Number.isFinite(r.enhancePct)) s.enhancePct = Math.max(20, Math.min(38, r.enhancePct));
  if (typeof r.refine === 'number' && Number.isFinite(r.refine)) s.refine = Math.max(0, Math.min(9, Math.trunc(r.refine)));
  s.stoneRoll = numbers(r.stoneRoll);
  s.stoneFix = keys(r.stoneFix);
  return s;
}

/** An effect stat: a number inside the item's passive (`ability_*`). Chips, not a slider. */
export function isEffectStat(key: string): boolean {
  return key.startsWith('ability_');
}

/**
 * How far a reforge lifts the bottom of an ordinary stat's window.
 *
 * `sqrt(refine/9) · 0.3` — the bundle's `normal01` says `·0.4 − 0.1`, but the
 * game's values agree with a curve that has no downward offset: a fresh item
 * spans exactly ±0.5, a ninth reforge starts at +0.3 (partner's check:
 * item_0820's crit cap 100 shows red at 65 = 100·(1 − 0.5·0.7)).
 */
export const ORDINARY_WINDOW_SCALE = 0.3;

/** The top of every window, and the ceiling a draw is clamped to. */
export function rollCap(tables: RollTables): number {
  return tables.roll.cap;
}

/** An ordinary stat's window at a reforge level, as draws. */
export function ordinaryWindow(tables: RollTables, refine: number): { lo: number; hi: number } {
  const levels = tables.roll.bonusLevels;
  const r = Math.max(0, Math.min(levels, refine || 0));
  return { lo: -tables.roll.cap + Math.sqrt(r / levels) * ORDINARY_WINDOW_SCALE, hi: tables.roll.cap };
}

/** The draw at slider position `pos` (0 = bottom of the window, 100 = top). */
export function drawAt(tables: RollTables, pos: number, refine: number): number {
  const { lo, hi } = ordinaryWindow(tables, refine);
  return lo + (pos / 100) * (hi - lo);
}

/** Whether the fixed affix and the enhancement may sit on this stat (`canBeAffix`). */
export function canFix(tables: RollTables, key: string): boolean {
  return canBeAffix(tables, key);
}

/** The product of every bonus this stat carries in `s`. */
export function statFactor(tables: RollTables, key: string, s: Pick<RollState, 'fix' | 'enhance' | 'divine' | 'enhancePct'>): number {
  let k = 1;
  const affix = canBeAffix(tables, key);
  if (affix && s.fix.includes(key)) k *= 1 + tables.fixedBonusPct / 100;
  if (affix && s.enhance.includes(key)) k *= 1 + s.enhancePct / 100;
  if (s.divine && canBeDivine(key)) {
    const pct = divinePctFor(tables, key) / 100;
    // On a `c` key (a cooldown, a threshold) smaller is better, so the forge subtracts.
    k *= isReverseKey(key) ? 1 - pct : 1 + pct;
  }
  return k;
}

/** Rounds to the attribute's own decimals, as the game does (`floor(v + 0.5)`). */
export function roundStat(tables: RollTables, key: string, value: number): number {
  const m = 10 ** decimalsOf(tables, key);
  return Math.round(value * m) / m;
}

/** A stat's value at a given draw, every bonus applied, rounded once. Unrolled stats return `base`. */
export function valueAtDraw(tables: RollTables, key: string, base: number, draw: number, s: RollState): number {
  const pct = randomPctOf(tables, key);
  if (pct === undefined) return base;
  const eff = isReverseKey(key) ? -draw : draw;
  return roundStat(tables, key, (base + eff * base * pct * 0.01) * statFactor(tables, key, s));
}

/** An ordinary stat's value at slider position `pos`. */
export function valueAtPos(tables: RollTables, key: string, base: number, pos: number, s: RollState): number {
  return valueAtDraw(tables, key, base, drawAt(tables, pos, s.refine), s);
}

/** The lowest step shown. k = 0 rolls on ~1.3% of copies and the game draws five. */
export const EFFECT_FIRST_STEP = 1;

export interface EffectStep {
  /** The draw, on [−cap, +cap]. */
  roll: number;
  value: number;
}

/**
 * The values an effect stat can take, worst draw first.
 *
 * The quantised grid of `normal01` — `−0.5 + k/5`, lifted by the iteration
 * bonus at the *stable* iteration count (an effect value rolls off the item's
 * initial seed, so reforging never moves it) and clamped at the cap. Steps
 * that round to the same number are one choice, not two.
 */
export function effectSteps(tables: RollTables, key: string, base: number, s: RollState): EffectStep[] {
  const { steps, centre, cap } = tables.roll;
  const bonus = iterationBonus(tables, stableLevel(tables));
  const out: EffectStep[] = [];
  const seen = new Set<number>();
  for (let k = EFFECT_FIRST_STEP; k <= steps; k++) {
    const roll = Math.min(cap, -centre + k / steps + bonus);
    const value = valueAtDraw(tables, key, base, roll, s);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ roll, value });
  }
  return out;
}

/**
 * Where a stat starts: the middle of the window for an ordinary stat, the step
 * nearest the table's own number for an effect stat.
 */
export function defaultPos(tables: RollTables, key: string, base: number, s: RollState): number {
  if (!isEffectStat(key) || randomPctOf(tables, key) === undefined) return 50;
  const list = effectSteps(tables, key, base, s);
  let best = 0;
  list.forEach((x, n) => {
    if (Math.abs(x.roll) < Math.abs(list[best]!.roll)) best = n;
  });
  return best;
}

/** The chip index a state selects for an effect stat, clamped to what exists. */
export function effectIndex(tables: RollTables, key: string, base: number, s: RollState, count: number): number {
  const raw = s.roll[key];
  const i = raw !== undefined ? Math.round(raw) : defaultPos(tables, key, base, s);
  return Math.min(count - 1, Math.max(0, i));
}

/** An ordinary stat's lowest and highest value in the current window. */
export function statBounds(tables: RollTables, key: string, base: number, s: RollState): { min: number; max: number } {
  const a = valueAtPos(tables, key, base, 0, s);
  const b = valueAtPos(tables, key, base, 100, s);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/**
 * A stat's value on this copy: the slider (or chip) the state holds, or the
 * default position when the state says nothing.
 */
export function statValue(tables: RollTables, key: string, base: number, s: RollState): number {
  if (randomPctOf(tables, key) === undefined) return base;
  if (isEffectStat(key)) {
    const list = effectSteps(tables, key, base, s);
    if (list.length === 0) return base;
    return list[effectIndex(tables, key, base, s, list.length)]!.value;
  }
  return valueAtPos(tables, key, base, s.roll[key] ?? defaultPos(tables, key, base, s), s);
}

/**
 * The state a fate stone's stats are rolled with: the stone's own sliders and
 * fixed affix, and none of the item's enhancement, forge or reforge — the stone
 * rolls from its own seed.
 */
export function stoneState(s: RollState): RollState {
  return { ...s, roll: s.stoneRoll, fix: s.stoneFix, enhance: [], divine: false, refine: 0 };
}

/** A fate-stone stat's value on this copy (default slider 50). */
export function stoneStatValue(tables: RollTables, key: string, base: number, s: RollState): number {
  return valueAtPos(tables, key, base, s.stoneRoll[key] ?? 50, stoneState(s));
}

/** The draw a fate-stone slider stands for: its window never moves. */
export function stoneDraw(tables: RollTables, pos: number): number {
  return drawAt(tables, pos, 0);
}

/**
 * Every stat of one copy, the fate stone's included, summed by key.
 *
 * `values` is the item's own table (after any season patch), `stone` the
 * stone's when the item is ancestral. Non-numeric values are skipped.
 */
export function copyStats(
  tables: RollTables,
  values: Record<string, number | string>,
  stone: Record<string, number | string> | null | undefined,
  s: RollState,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, base] of Object.entries(values)) {
    if (typeof base !== 'number') continue;
    out[key] = (out[key] ?? 0) + statValue(tables, key, base, s);
  }
  for (const [key, base] of Object.entries(stone ?? {})) {
    if (typeof base !== 'number') continue;
    out[key] = (out[key] ?? 0) + stoneStatValue(tables, key, base, s);
  }
  return out;
}

/** The client's roll colours, by name; the page maps them to its own tokens. */
export type RollTone = 'red' | 'gold' | 'purple' | 'green' | 'white' | 'grey';

/** An ordinary stat's colour, from its draw (the client's `hud/script.js`). */
export function statTone(roll: number): RollTone {
  if (roll > 0.45) return 'red';
  if (roll > 0.37) return 'gold';
  if (roll > 0.2) return 'purple';
  if (roll >= 0.08) return 'green';
  if (roll <= -0.2) return 'grey';
  return 'white';
}

/**
 * An effect value's colour. Four, not six: the description's substitutions
 * have no grey or white, the bottom is green (`my_ability_details.js`).
 */
export function effectTone(roll: number): RollTone {
  if (roll > 0.45) return 'red';
  if (roll > 0.36) return 'gold';
  if (roll > 0.15) return 'purple';
  return 'green';
}

/** The enhancement's grade, as the game colours it: 20 purple, 21–25 gold, 26–38 red. */
export function enhanceTone(pct: number): RollTone {
  return pct <= 20 ? 'purple' : pct <= 25 ? 'gold' : 'red';
}
