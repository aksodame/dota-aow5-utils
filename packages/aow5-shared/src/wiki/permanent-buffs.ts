/**
 * Permanent consumables — the items a hero may use a limited number of times,
 * each use adding to the panel for good (`use_max` caps the lifetime count).
 *
 * The game applies the effect in encrypted server code; the per-use numbers
 * below are the items' own descriptions, and `permanent-buffs.test.ts` checks
 * every entry: the item is in the catalogue, it has a `use_max`, and its text
 * says "permanently".
 *
 * Only effects that reach the calculator's panel are here. Permanent items
 * that move luck, vision range, warehouse or Exchange slots, or poison
 * resistance are in the game too, but those rows are not on the panel, so they
 * would only clutter the column. P273 and P275 carry such extras (luck, a timed
 * bonus) besides the panel effect listed here.
 */
import { consumableUseMax } from './consumables.ts';
import type { ItemsExtraFile } from './items-extra.ts';
import { CURRENT_RULESET, type RulesetId } from './pools.ts';

export interface PermanentBuff {
  id: string;
  /** Stat key → amount added by one use. Keys are the calculator's own. */
  perUse: Readonly<Record<string, number>>;
}

/**
 * Grouped like the panel: attributes, health and mana, attack, defence, crits,
 * other, amplifiers. The order is the column's order.
 */
export const PERMANENT_BUFFS: readonly PermanentBuff[] = [
  // --- attributes
  { id: 'item_M506', perUse: { bonus_all_stats: 1 } },
  { id: 'item_P260', perUse: { bonus_all_stats: 10 } },
  { id: 'item_P263', perUse: { all_strength_pct: 1 } },
  { id: 'item_P264', perUse: { all_agility_pct: 1 } },
  { id: 'item_P265', perUse: { all_intelligence_pct: 1 } },
  { id: 'item_P273', perUse: { all_all_stats_pct: 1 } },

  // --- health and mana
  { id: 'item_M500', perUse: { bonus_health: 10 } },
  { id: 'item_P150', perUse: { bonus_health: 1 } },
  { id: 'item_P157', perUse: { bonus_health: 5 } },
  { id: 'item_P158', perUse: { bonus_health: 2 } },
  { id: 'item_P207', perUse: { bonus_health: 25 } },
  { id: 'item_P208', perUse: { bonus_health: 10 } },
  { id: 'item_P259', perUse: { bonus_health: 3 } },
  { id: 'item_P269', perUse: { bonus_health: 5 } },
  { id: 'item_P200', perUse: { bonus_mana: 1 } },
  { id: 'item_P262', perUse: { bonus_mana: 1 } },
  { id: 'item_P154', perUse: { mana_regen: 0.1 } },
  { id: 'item_P155', perUse: { health_regen: 0.5 } },

  // --- attack
  { id: 'item_P159', perUse: { bonus_attack_damage: 1 } },
  { id: 'item_P201', perUse: { bonus_attack_damage: 1 } },
  { id: 'item_P203', perUse: { attack_speed_pct: 1 } },
  { id: 'item_P204', perUse: { bonus_movespeed: 1 } },
  { id: 'item_P206', perUse: { bonus_movespeed_pct: 1 } },

  // --- defence
  { id: 'item_P160', perUse: { bonus_armor: 1 } },
  { id: 'item_P270', perUse: { bonus_armor: 1 } },
  { id: 'item_P202', perUse: { damage_resistance_pct: 1 } },

  // --- crits
  { id: 'item_P156', perUse: { crit_damage_pct: 1 } },
  { id: 'item_P275', perUse: { omni_crit_chance_pct: 0.5 } },

  // --- other
  { id: 'item_P271', perUse: { extra_backpack_slot_limit: 3 } },

  // --- amplifiers
  { id: 'item_P261', perUse: { magical_damage_add_pct: 1 } },
  { id: 'item_P266', perUse: { physical_damage_add_pct: 1 } },
  { id: 'item_P267', perUse: { magical_damage_add_pct: 1 } },
];

/** A buff with its limit and the number the reader says they have used. */
export interface PermanentBuffRow extends PermanentBuff {
  /** `use_max` of the wiki's season. */
  max: number;
  used: number;
}

/** The eligible buffs with the reader's counts clamped to `use_max`. */
export function permanentBuffRows(
  extra: ItemsExtraFile,
  used: Readonly<Record<string, number>>,
  ruleset: RulesetId = CURRENT_RULESET,
): PermanentBuffRow[] {
  const out: PermanentBuffRow[] = [];
  for (const buff of PERMANENT_BUFFS) {
    const max = consumableUseMax(extra, buff.id, ruleset);
    if (max === undefined || max <= 0) continue;
    const raw = used[buff.id] ?? 0;
    out.push({ ...buff, max, used: Math.max(0, Math.min(max, Math.floor(Number.isFinite(raw) ? raw : 0))) });
  }
  return out;
}

/** The stat pool the used counts add — what the calculator's Buffs column reads. */
export function permanentBuffPool(rows: readonly PermanentBuffRow[]): Record<string, number> {
  const pool: Record<string, number> = {};
  for (const row of rows) {
    if (row.used === 0) continue;
    for (const [key, perUse] of Object.entries(row.perUse)) pool[key] = (pool[key] ?? 0) + perUse * row.used;
  }
  return pool;
}
