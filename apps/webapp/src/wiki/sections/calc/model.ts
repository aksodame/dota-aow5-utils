import {
  attributeBonus,
  type AttrTriple,
  type DerivedKey,
  type DerivedTotals,
  type HeroStatsFile,
  type LevelStats,
  type PrimaryAttr,
} from 'aow5-shared/wiki';

/**
 * The calculator's arithmetic: the panel's rows, the hero's base, and how the
 * base, the items and the attributes add up. JSX-free, so the page is only
 * drawing.
 *
 * The constants are the game's own (`herostats.json`'s `attrBonus`, read from
 * the addon's plain `const.lua`) and the hero's panel without items is
 * `heroStatsAtLevel` — the same model the partner wiki used, and the same
 * numbers: checked hero by hero, the two agree to the last digit.
 */

export type GroupId = 'attrs' | 'hpMana' | 'attack' | 'defence' | 'crits' | 'season' | 'other' | 'amps';

/**
 * What feeds a row besides the items.
 * - `attr`: an attribute — "All Stats" from items adds to it, and its own `%`.
 * - `derived`: fed by attributes (`attributeBonus`).
 * - `season`: not a stat at all but a final multiplier, typed in as a level.
 */
export type RowKind = { type: 'attr'; attr: keyof AttrTriple } | { type: 'derived'; key: DerivedKey } | { type: 'season'; max: number } | { type: 'plain' };

export interface RowDef {
  key: string;
  /** Decimals to print; undefined picks by magnitude. */
  dec?: number;
  kind: RowKind;
}

const plain = (key: string, dec?: number): RowDef => ({ key, ...(dec !== undefined ? { dec } : {}), kind: { type: 'plain' } });
const derived = (key: DerivedKey, dec: number): RowDef => ({ key, dec, kind: { type: 'derived', key } });

export const GROUPS: ReadonlyArray<{ id: GroupId; rows: RowDef[] }> = [
  {
    id: 'attrs',
    rows: [
      { key: 'bonus_strength', dec: 0, kind: { type: 'attr', attr: 'str' } },
      { key: 'bonus_agility', dec: 0, kind: { type: 'attr', attr: 'agi' } },
      { key: 'bonus_intelligence', dec: 0, kind: { type: 'attr', attr: 'int' } },
      plain('bonus_all_stats'),
    ],
  },
  {
    id: 'hpMana',
    rows: [derived('bonus_health', 0), derived('health_regen', 1), derived('bonus_mana', 1), derived('mana_regen', 2)],
  },
  {
    id: 'attack',
    rows: [
      // 0.8 damage per point of the primary attribute: fractional, so one decimal.
      derived('bonus_attack_damage', 1),
      plain('all_attack_damage_percent'),
      derived('attack_speed', 1),
      plain('attack_speed_pct'),
      plain('bonus_movespeed'),
    ],
  },
  {
    id: 'defence',
    rows: [derived('bonus_armor', 1), derived('base_magic_resistance', 1), plain('damage_resistance_pct'), plain('evasion_pct')],
  },
  {
    id: 'crits',
    rows: [plain('physical_crit_chance_pct'), plain('magical_crit_chance_pct'), plain('omni_crit_chance_pct'), plain('crit_damage_pct')],
  },
  {
    id: 'season',
    rows: [
      { key: 'season_contribution', dec: 0, kind: { type: 'season', max: 20 } },
      { key: 'season_world', dec: 0, kind: { type: 'season', max: 10 } },
    ],
  },
  { id: 'other', rows: [plain('block'), plain('extra_backpack_slot_limit')] },
  {
    id: 'amps',
    rows: [
      plain('outgoing_damage_pct'),
      plain('outgoing_damage_pct_2'),
      plain('physical_damage_add_pct'),
      plain('magical_damage_add_pct'),
      plain('spell_amplify_pct'),
      plain('dot_outgoing_damage_pct'),
      plain('poison_outgoing_damage_pct'),
      plain('bleed_outgoing_damage_pct'),
    ],
  },
];

/** Every key the panel shows — the node stats outside it are "not on the panel yet". */
export const PANEL_KEYS: ReadonlySet<string> = new Set(GROUPS.flatMap((g) => g.rows.map((r) => r.key)));

const ATTR_ROW: Record<keyof AttrTriple, string> = { str: 'bonus_strength', agi: 'bonus_agility', int: 'bonus_intelligence' };
const ATTR_PCT: Record<keyof AttrTriple, string> = { str: 'all_strength_pct', agi: 'all_agility_pct', int: 'all_intelligence_pct' };

/** Season levels are the player's, not the hero's: a hero change keeps them. */
export const isSeasonKey = (key: string): boolean => key.startsWith('season_');

export type AttrMode = 'delta' | 'full';

export interface CalcInput {
  file: HeroStatsFile;
  /** The hero at the file's level, every tree taken; undefined for a hero the file lacks. */
  level: LevelStats | undefined;
  primary: PrimaryAttr;
  /** Manual overrides of the "Base" column. */
  base: Record<string, number>;
  mode: AttrMode;
}

export interface RowTotal {
  base: number;
  items: number;
  /** What the permanent buffs add to this row, indirect attribute effects included. */
  buffs: number;
  /** "On top": the attributes' contribution (and an attribute's own `%` bonus). */
  fromAttrs: number;
  sum: number;
  /** The `%` that multiplied an attribute row, when one did. */
  pct?: number;
}

export function isOverridden(input: CalcInput, key: string): boolean {
  return input.base[key] !== undefined;
}

function bonusOf(input: CalcInput, key: DerivedKey, attrs: AttrTriple): number {
  return attributeBonus(attrs, input.primary, input.file.attrBonus)[key];
}

/** The hero's attributes without items: the overrides where typed, the computed ones elsewhere. */
export function baseAttrs(input: CalcInput): AttrTriple {
  const all = baseVal(input, 'bonus_all_stats');
  return {
    str: baseVal(input, 'bonus_strength') + all,
    agi: baseVal(input, 'bonus_agility') + all,
    int: baseVal(input, 'bonus_intelligence') + all,
  };
}

/** The computed "Base" of a row, or null when the hero data says nothing. */
export function autoBase(input: CalcInput, key: string): number | null {
  const lv = input.level;
  if (lv === undefined) return null;
  for (const a of ['str', 'agi', 'int'] as const) if (ATTR_ROW[a] === key) return lv.attrs[a];
  const d = lv.derived[key as DerivedKey];
  if (d !== undefined) return d.flat + d.mult * bonusOf(input, key as DerivedKey, baseAttrs(input));
  if (key === 'bonus_movespeed') return lv.totals.bonus_movespeed;
  return lv.rest[key] ?? null;
}

/** The "Base" column: an override wins over the computed value. */
export function baseVal(input: CalcInput, key: string): number {
  const v = input.base[key];
  if (v !== undefined) return v;
  return autoBase(input, key) ?? 0;
}

/**
 * The totals an item effect reads (attributes and mana "as on the panel"),
 * from a pool of item stats. Items' "% attribute" multiplies the attribute,
 * which is what the crown and the crystal depend on.
 */
export function derivePools(input: CalcInput, P: Record<string, number>): DerivedTotals {
  const base = baseAttrs(input);
  const all = P.bonus_all_stats ?? 0;
  const mult = (a: keyof AttrTriple) => 1 + ((P[ATTR_PCT[a]] ?? 0) + (P.all_all_stats_pct ?? 0)) / 100;
  const str = (base.str + (P.bonus_strength ?? 0) + all) * mult('str');
  const agi = (base.agi + (P.bonus_agility ?? 0) + all) * mult('agi');
  const int = (base.int + (P.bonus_intelligence ?? 0) + all) * mult('int');
  const mana = baseVal(input, 'bonus_mana') + (P.bonus_mana ?? 0) + int * input.file.attrBonus.intelligence_mana;
  return { str, agi, int, mana };
}

/**
 * One row's columns. `sums` is the build's pool: item stats plus what item
 * effects add.
 *
 * In "items only" mode the attributes' part is the *difference* the items
 * make — the hero's panel without items already includes what their own
 * attributes give, so counting it again would count it twice. In "full" mode
 * the whole attribute part is shown and the base keeps only the game's flat.
 * "Total" is the same either way.
 */
export function rowTotal(
  input: CalcInput,
  row: RowDef,
  sums: Record<string, number>,
  buffs: Readonly<Record<string, number>> = {},
): RowTotal {
  const { key, kind } = row;
  if (kind.type === 'season') {
    const base = input.base[key] ?? 0;
    return { base, items: 0, buffs: 0, fromAttrs: 0, sum: base };
  }
  const items = sums[key] ?? 0;
  const full = input.mode === 'full';

  /*
   * The row as a pool sees it: items only, or items plus the permanent buffs.
   * The columns keep the pool's own values; the buffs column is the difference
   * the second evaluation makes — so an indirect bonus (buffs' attributes
   * feeding health, a buffed `%` multiplying the whole) lands there too.
   */
  const evaluate = (P: (k: string) => number): { base: number; fromAttrs: number; sum: number; pct?: number } => {
    const base0 = baseAttrs(input);
    const all = P('bonus_all_stats');
    const flat: AttrTriple = {
      str: base0.str + P('bonus_strength') + all,
      agi: base0.agi + P('bonus_agility') + all,
      int: base0.int + P('bonus_intelligence') + all,
    };
    const pctOf = (a: keyof AttrTriple) => P(ATTR_PCT[a]) + P('all_all_stats_pct');
    const total: AttrTriple = {
      str: flat.str * (1 + pctOf('str') / 100),
      agi: flat.agi * (1 + pctOf('agi') / 100),
      int: flat.int * (1 + pctOf('int') / 100),
    };

    if (kind.type === 'derived') {
      const der = input.level?.derived[kind.key];
      if (der !== undefined) {
        const base = isOverridden(input, key) ? input.base[key]! : full ? der.flat : der.flat + der.mult * bonusOf(input, kind.key, base0);
        const fromAttrs = full
          ? der.mult * bonusOf(input, kind.key, total)
          : der.mult * (bonusOf(input, kind.key, total) - bonusOf(input, kind.key, base0));
        return { base, fromAttrs, sum: base + P(key) + fromAttrs };
      }
      // No hero data: the base is typed, the attributes still add on top.
      const base = baseVal(input, key);
      const fromAttrs = full ? bonusOf(input, kind.key, total) : bonusOf(input, kind.key, total) - bonusOf(input, kind.key, base0);
      return { base, fromAttrs, sum: base + P(key) + fromAttrs };
    }

    const base = baseVal(input, key);
    if (kind.type === 'attr') {
      // "All Stats" from items lands on each attribute, and the attribute's `%`
      // multiplies the whole of it — shown "on top" beside the All Stats share.
      const fromAll = all;
      const pct = pctOf(kind.attr);
      const bonus = pct ? ((base + P(key) + fromAll) * pct) / 100 : 0;
      return { base, fromAttrs: fromAll + bonus, sum: base + P(key) + fromAll + bonus, ...(pct ? { pct } : {}) };
    }
    return { base, fromAttrs: 0, sum: base + P(key) };
  };

  /*
   * Movement speed is the one row where a buff can work through a percentage:
   * items keep their existing flat handling, the buff's `%` multiplies what is
   * already on the panel.
   */
  if (key === 'bonus_movespeed') {
    const base = baseVal(input, key);
    const noBuff = base + items;
    const flat = buffs['bonus_movespeed'] ?? 0;
    const pct = buffs['bonus_movespeed_pct'] ?? 0;
    const sum = (base + items + flat) * (1 + pct / 100);
    return { base, items, buffs: sum - noBuff, fromAttrs: 0, sum };
  }

  const plain = (k: string) => sums[k] ?? 0;
  const combined = (k: string) => (sums[k] ?? 0) + (buffs[k] ?? 0);
  const noBuff = evaluate(plain);
  const withBuff = evaluate(combined);
  return {
    base: noBuff.base,
    items,
    buffs: withBuff.sum - noBuff.sum,
    fromAttrs: noBuff.fromAttrs,
    sum: withBuff.sum,
    ...(noBuff.pct !== undefined ? { pct: noBuff.pct } : {}),
  };
}

/** Decimals a value is printed with when the row names none: as the partner did, by magnitude. */
export function digitsFor(value: number, dec: number | undefined): number {
  if (dec !== undefined) return dec;
  if (Math.round(value) === value) return 0;
  const abs = Math.abs(value);
  return abs < 10 ? 2 : abs < 100 ? 1 : 0;
}

/**
 * Parses a typed base value: a comma works as the decimal point, negatives are
 * clamped to 0, and a season level is a whole number up to its maximum.
 * Undefined for text that is not a number (the field keeps it, nothing changes).
 */
export function parseBase(text: string, seasonMax?: number): number | 'clear' | undefined {
  const v = text.trim().replace(',', '.');
  if (v === '') return 'clear';
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return seasonMax !== undefined ? Math.max(0, Math.min(seasonMax, Math.round(n))) : Math.max(0, n);
}
