/**
 * Item passives that change the character panel itself — conversions, and
 * grants that scale with mana or attributes — for the wiki's stats calculator.
 *
 * The partner wiki's `itemeffects.js`. These can be counted without a fight,
 * from the build's stats alone; the formulas were read from the items' scripts
 * and checked against their texts. Procs, stacks and anything else that needs
 * combat are *not* here: the calculator lists those as "not on the panel".
 *
 * **Parameters come from the copy.** Each effect reads its numbers from the
 * pool's `ability_*` keys — the values the item editor's step chips hold — so
 * picking a better roll of a parameter (the crown's +32% → +43%) changes the
 * result. A fallback is used only when the pool has no such key.
 *
 * **Fixed point.** Effects depend on totals (mana, attributes) and totals on
 * effects (the crown adds attributes, +int → mana → the sage's boots), so the
 * pass runs up to four times until the deltas stop changing. Each effect sees
 * the pool *without its own previous deltas*: the prism and the crystal read
 * the very stats they change, and the crown must see the total "before its own
 * grant", as its script does.
 *
 * Notes come back as numbers, not sentences — the page words them in the
 * reader's language.
 */

/** Totals an effect may depend on, derived from a pool by the caller. */
export interface DerivedTotals {
  str: number;
  agi: number;
  int: number;
  mana: number;
}

export type EffectId =
  | 'prism'
  | 'crown'
  | 'sageBoots'
  | 'arcaneCloak'
  | 'nullifier'
  | 'primalCrystal'
  | 'overcrit'
  | 'infinity'
  | 'usurerCodex';

/** What one effect did on the last pass, for the page to put into words. */
export type EffectFacts =
  | { kind: 'prism'; moved: number; gained: number; pct: number }
  | {
      kind: 'crown';
      boost: number;
      reduce: number;
      /** 0 strength, 1 agility, 2 intelligence. */
      best: 0 | 1 | 2;
      /** Signed grant per attribute, str/agi/int. */
      grants: [number, number, number];
    }
  | { kind: 'sageBoots'; pct: number; extra: number; threshold: number; per: number; step: number; cap: number }
  | { kind: 'arcaneCloak'; hp: number }
  | { kind: 'nullifier'; pct: number; lifesteal: number; step: number; per: number; cap: number }
  | { kind: 'primalCrystal'; total: number; moved: number; gained: number; convert: number; agi: number; stepAgi: number; perPct: number; cap: number }
  | { kind: 'overcrit'; total: number; cap: number; overflow: number; step: number; perStep: number; amp: number }
  | { kind: 'infinity'; physical: number; magical: number; convert: number; amp: number }
  | { kind: 'usurerCodex'; amp: number };

export interface EffectNote {
  itemId: string;
  effect: EffectId;
  /** Holds only under a condition (the codex: while the debt lasts). */
  conditional: boolean;
  /** Null when the effect did nothing with this build (no physical damage to convert, …). */
  facts: EffectFacts | null;
}

type Pool = Record<string, number>;

const param = (P: Pool, key: string, fallback: number): number => {
  const v = P[key];
  return v === undefined || !Number.isFinite(v) ? fallback : v;
};
const add = (P: Pool, key: string, delta: number): void => {
  P[key] = (P[key] ?? 0) + delta;
};

/**
 * The game's `GetTotalCritChancePct(type, omni)` as the item scripts use it:
 * the type's own chance plus the omni chance. The base 5% attack crit is not
 * part of this helper — the damage pipeline combines it with the type chance
 * only when it rolls the hit (`ProcessCriticalStrike`), while item effects such
 * as Overflow read the summed stat before that roll.
 */
export function totalCritChancePct(typePct: number, omniPct: number): number {
  return (Number.isFinite(typePct) ? typePct : 0) + (Number.isFinite(omniPct) ? omniPct : 0);
}

interface EffectDef {
  conditional?: true;
  apply(P: Pool, D: DerivedTotals): EffectFacts | null;
}

const REG: Record<EffectId, EffectDef> = {
  // Prism of Transmutation: moves ALL physical damage % into magical, with a
  // premium. physical −= c, magical += c × convert_pct/100.
  prism: {
    apply(P) {
      const c = Math.max(0, P.physical_damage_add_pct ?? 0);
      if (!c) return null;
      const pct = param(P, 'ability_value_convert_pct', 120);
      add(P, 'physical_damage_add_pct', -c);
      add(P, 'magical_damage_add_pct', (c * pct) / 100);
      return { kind: 'prism', moved: c, gained: (c * pct) / 100, pct };
    },
  },

  // Crown of Paranoia: the highest attribute gains boost% of its total, the
  // other two lose reduce%. grant = floor(total × pct/100 / (1 + attr% /100)).
  crown: {
    apply(P, D) {
      const boost = param(P, 'ability_value_boost_pct', 32);
      const reduce = param(P, 'ability_value_c_reduce_pct', 15);
      const rows = [
        ['bonus_strength', D.str, 'all_strength_pct'],
        ['bonus_agility', D.agi, 'all_agility_pct'],
        ['bonus_intelligence', D.int, 'all_intelligence_pct'],
      ] as const;
      const raw = rows.map(([, v]) => Math.max(0, v || 0));
      const best = raw.indexOf(Math.max(...raw)) as 0 | 1 | 2;
      const grants: [number, number, number] = [0, 0, 0];
      rows.forEach(([key, , pctKey], n) => {
        const pct = n === best ? boost : reduce;
        // "% to all attributes" adds to the attribute's own percentage in the script.
        const mult = 1 + ((P[pctKey] ?? 0) + (P.all_all_stats_pct ?? 0)) / 100;
        const grant = Math.floor((raw[n]! * Math.max(0, pct)) / 100 / mult);
        const signed = n === best ? grant : -grant;
        if (grant) add(P, key, signed);
        grants[n] = signed;
      });
      return { kind: 'crown', boost, reduce, best, grants };
    },
  },

  // Sage's Boots: magic damage % from mana above a threshold.
  // min(cap, floor((mana − threshold) / per) × step).
  sageBoots: {
    apply(P, D) {
      const threshold = param(P, 'ability_mana_threshold', 250);
      const per = Math.max(1, param(P, 'ability_value_c_mana_per_magic_damage_pct', 15));
      const step = param(P, 'ability_bonus_magic_damage_pct_per_step', 1);
      const cap = param(P, 'ability_value_bonus_magic_damage_pct_max', 40);
      const extra = Math.max(0, (D.mana || 0) - threshold);
      const pct = Math.min(cap, Math.floor(extra / per) * step);
      if (pct <= 0) return null;
      add(P, 'magical_damage_add_pct', pct);
      return { kind: 'sageBoots', pct, extra: Math.floor(extra), threshold, per, step, cap };
    },
  },

  // Arcane Cloak: health equal to the mana pool. bonus_health = floor(mana).
  arcaneCloak: {
    apply(P, D) {
      const hp = Math.floor(Math.max(0, D.mana || 0));
      if (hp <= 0) return null;
      add(P, 'bonus_health', hp);
      return { kind: 'arcaneCloak', hp };
    },
  },

  // Nullifier: magic damage % from magical (and omni) lifesteal.
  // min(cap, floor(lifesteal / step) × per).
  nullifier: {
    apply(P) {
      const step = Math.max(1, param(P, 'ability_lifesteal_step_pct', 1));
      const per = param(P, 'ability_value_damage_bonus_per_step_pct', 1);
      const cap = param(P, 'ability_value_damage_bonus_max_pct', 30);
      const lifesteal = (P.magical_lifesteal_pct ?? 0) + (P.omni_lifesteal_pct ?? 0);
      const pct = Math.min(cap, Math.floor(lifesteal / step) * per);
      if (pct <= 0) return null;
      add(P, 'magical_damage_add_pct', pct);
      return { kind: 'nullifier', pct, lifesteal, step, per, cap };
    },
  },

  // Primal Crystal: part of physical + omni crit chance becomes magical crit.
  // convert = min(cap, floor(agi / stepAgi) × perPct); magic += total × convert/100,
  // physical −= total × min(100, convert)/100.
  primalCrystal: {
    apply(P, D) {
      const stepAgi = Math.max(1, param(P, 'ability_value_c_agility_per_step', 300));
      const perPct = param(P, 'ability_value_crit_convert_pct_per_step', 10);
      const cap = param(P, 'ability_value_crit_convert_cap_pct', 100);
      const total = (P.physical_crit_chance_pct ?? 0) + (P.omni_crit_chance_pct ?? 0);
      const convert = Math.min(cap, Math.floor((D.agi || 0) / stepAgi) * perPct);
      if (!total || convert <= 0) return null;
      const moved = (total * Math.min(100, convert)) / 100;
      const gained = (total * convert) / 100;
      add(P, 'physical_crit_chance_pct', -moved);
      add(P, 'magical_crit_chance_pct', gained);
      return { kind: 'primalCrystal', total, moved, gained, convert, agi: Math.floor(D.agi || 0), stepAgi, perPct, cap };
    },
  },

  // Overflow (item_0610 / ancestor 0820): the physical crit chance above the
  // cap becomes crit damage — floor((total − cap) / step) × perStep. The script
  // reads `physical_crit_chance_pct + omni_crit_chance_pct` every 0.3 s, so in
  // the fixed point it must see Primal Crystal's conversion and vice versa.
  overcrit: {
    apply(P) {
      const cap = Math.max(1, param(P, 'ability_value_c_crit_cap_pct', 100));
      const step = Math.max(1, param(P, 'ability_overflow_per_step', 2));
      const perStep = Math.max(0, param(P, 'ability_value_crit_damage_per_step', 3));
      const total = totalCritChancePct(P.physical_crit_chance_pct ?? 0, P.omni_crit_chance_pct ?? 0);
      const overflow = Math.max(0, Math.floor(total - cap));
      const amp = Math.floor(overflow / step) * perStep;
      if (amp <= 0) return null;
      add(P, 'crit_damage_pct', amp);
      return { kind: 'overcrit', total, cap, overflow, step, perStep, amp };
    },
  },

  // Infinity (item_0368 / ancestor 0779): both the physical and the magical
  // total crit chance turn into crit damage, so omni counts in both halves.
  infinity: {
    apply(P) {
      const convert = param(P, 'ability_value_crit_damage_convert_pct', 70);
      const physical = totalCritChancePct(P.physical_crit_chance_pct ?? 0, P.omni_crit_chance_pct ?? 0);
      const magical = totalCritChancePct(P.magical_crit_chance_pct ?? 0, P.omni_crit_chance_pct ?? 0);
      const amp = ((physical + magical) * convert) / 100;
      if (amp <= 0) return null;
      add(P, 'crit_damage_pct', amp);
      return { kind: 'infinity', physical, magical, convert, amp };
    },
  },

  // Usurer's Codex: magic damage % while the "debt" lasts (it grows with each
  // spell cast). Out of combat there is no debt, so it counts — with a caveat.
  usurerCodex: {
    conditional: true,
    apply(P) {
      const amp = param(P, 'ability_value_magic_amp_pct', 25);
      if (amp <= 0) return null;
      add(P, 'magical_damage_add_pct', amp);
      return { kind: 'usurerCodex', amp };
    },
  },
};

/** The base item of each modelled effect. */
export const EFFECT_ITEMS: Readonly<Record<string, EffectId>> = {
  item_0541: 'prism',
  item_0608: 'crown',
  item_0336: 'sageBoots',
  item_0335: 'arcaneCloak',
  item_0208: 'nullifier',
  item_0658: 'primalCrystal',
  item_0610: 'overcrit',
  item_0368: 'infinity',
  item_0615: 'usurerCodex',
};

/** Ancestral item → its base item: an ancestor carries the base's passive with its own numbers. */
export const EFFECT_ALIASES: Readonly<Record<string, string>> = {
  item_0876: 'item_0541',
  item_0737: 'item_0608',
  item_0716: 'item_0336',
  item_0830: 'item_0208',
  item_0884: 'item_0658',
  item_0820: 'item_0610',
  item_0779: 'item_0368',
};

/**
 * The effect an item carries, or undefined. `baseOf` resolves an ancestral
 * item to its base through the fate stone (`stoneLinks`), for an ancestor the
 * alias table does not name.
 */
export function effectOf(itemId: string, baseOf?: (id: string) => string | undefined): EffectId | undefined {
  const direct = EFFECT_ITEMS[itemId];
  if (direct !== undefined) return direct;
  const alias = EFFECT_ALIASES[itemId];
  if (alias !== undefined) return EFFECT_ITEMS[alias];
  const base = baseOf?.(itemId);
  return base !== undefined ? EFFECT_ITEMS[base] : undefined;
}

export interface EffectsResult {
  /** What to add to the summed item stats. */
  extra: Record<string, number>;
  notes: EffectNote[];
}

/** How many passes the fixed point is given. */
export const EFFECT_PASSES = 4;

/**
 * Runs every modelled effect of the equipped items over their summed stats.
 *
 * `equipped` is each item's id with its stats (already rolled, fate stone
 * included); `derive` turns a pool into the totals effects read.
 */
export function applyEffects(
  equipped: ReadonlyArray<{ id: string; stats: Record<string, number> }>,
  derive: (pool: Record<string, number>) => DerivedTotals,
  baseOf?: (id: string) => string | undefined,
): EffectsResult {
  const base: Pool = {};
  for (const e of equipped) for (const [k, v] of Object.entries(e.stats)) base[k] = (base[k] ?? 0) + v;

  const items = equipped
    .map((e) => ({ id: e.id, effect: effectOf(e.id, baseOf) }))
    .filter((x): x is { id: string; effect: EffectId } => x.effect !== undefined);
  if (items.length === 0) return { extra: {}, notes: [] };

  let deltas: Pool[] = items.map(() => ({}));
  let notes: EffectNote[] = [];
  for (let pass = 0; pass < EFFECT_PASSES; pass++) {
    const next: Pool[] = items.map(() => ({}));
    notes = [];
    items.forEach(({ id, effect }, idx) => {
      const P: Pool = { ...base };
      deltas.forEach((d, j) => {
        if (j !== idx) for (const [k, v] of Object.entries(d)) P[k] = (P[k] ?? 0) + v;
      });
      const D = derive(P);
      const def = REG[effect];
      const before: Pool = { ...P };
      const facts = def.apply(P, D);
      for (const [k, v] of Object.entries(P)) {
        const d = v - (before[k] ?? 0);
        if (d) next[idx]![k] = d;
      }
      notes.push({ itemId: id, effect, conditional: def.conditional === true, facts });
    });
    const stable = JSON.stringify(next) === JSON.stringify(deltas);
    deltas = next;
    if (stable) break;
  }

  const extra: Pool = {};
  for (const d of deltas) for (const [k, v] of Object.entries(d)) extra[k] = (extra[k] ?? 0) + v;
  return { extra, notes };
}
