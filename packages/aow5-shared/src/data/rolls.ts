import type { RollTables } from '../types/rolls.ts';
import { ESSENCE_IDS } from '../types/items.ts';

/**
 * What a stat can actually be, as opposed to what the item table says.
 *
 * The number in `ItemFull.values` is the centre of a roll, not the value: the
 * item's seed draws one, and the draw moves the stat by up to a per-attribute
 * percentage. So two copies of the same sword are not the same sword, and a
 * guide that names one is really naming a copy of it — which is what the
 * priority panel exists to write down.
 *
 * This is the addon's own arithmetic, running against the tables step 04d reads
 * out of the client bundle. The pipeline's `parser/tools/lib/hudScript.ts` says
 * where every constant comes from; `private/reforging_about.md` explains the
 * part that matters most here, which is:
 *
 *   **The draw is quantised.** `normal01` rounds to a fifth before shifting by
 *   the iteration bonus and clamping, so a rolled stat has five or six
 *   reachable values, not a continuum. A target can therefore be *chosen from a
 *   list* rather than typed as a wish, which is the whole shape of the panel.
 *
 *   **Reforging raises the floor, not the ceiling.** Iteration 0 reaches +0.4;
 *   every level after the first reaches +0.5 and nothing higher. What climbs is
 *   the worst outcome. So "reforge to 9" is a statement about consistency.
 *
 *   **The fixed attribute never moves.** It and the `ability_value_*` keys roll
 *   off the item's *initial* seed with a fixed tail — `stableTail` — so they are
 *   drawn at that iteration count no matter how far the item is reforged. An
 *   item whose fixed stat rolled badly stays that way forever, which is why the
 *   panel treats "which stat is fixed" as a reason to keep or discard a copy
 *   rather than as something to work towards.
 */

/** `ability_value`, `ability_value_x` — the numbers a passive's own text uses. */
export function isAbilityValueKey(key: string): boolean {
  return key === 'ability_value' || key.startsWith('ability_value_');
}

/**
 * Keys where lower is better — cooldowns, intervals, the `c` family.
 *
 * The roll and every bonus are applied with the sign flipped, so a *high* draw
 * on one of these produces a *smaller* number. Ordering "best first" therefore
 * means ordering by the draw in both cases, never by the value.
 */
export function isReverseKey(key: string): boolean {
  return key === 'ability_value_c' || key.startsWith('ability_value_c_');
}

/**
 * Whether the divine forge reaches this attribute at all.
 *
 * It multiplies an item's ordinary stats and the numbers inside its passive,
 * and skips the `ability_*` bookkeeping in between — except the crit chance,
 * which is a stat wearing an ability's prefix.
 */
export function canBeDivine(key: string): boolean {
  return !key.startsWith('ability_') || key === 'ability_crit_chance_pct' || isAbilityValueKey(key);
}

/** What a divine forge is worth on this attribute: less inside an ability. */
export function divinePctFor(tables: RollTables, key: string): number {
  return key.startsWith('ability_') ? tables.divine.abilityBonusPct : tables.divine.bonusPct;
}

/** How far this attribute may move from its base, in percent. */
export function randomPctOf(tables: RollTables, key: string): number | undefined {
  const named = tables.random[key];
  if (named !== undefined) return named;
  return isAbilityValueKey(key) ? tables.abilityValuePct : undefined;
}

/** Decimal places the game rounds this attribute to. */
export function decimalsOf(tables: RollTables, key: string): number {
  return tables.decimals[key] ?? 0;
}

/** True for a stat whose value depends on the roll at all. */
export function isRolled(tables: RollTables, key: string): boolean {
  return randomPctOf(tables, key) !== undefined;
}

/**
 * Whether the fixed affix or the enhancement can land on this attribute.
 *
 * Both index into the item's rollable attributes *excluding* the `ability_*`
 * family — a passive's own tuning numbers — except for the one that is a stat in
 * its own right. So a passive's numbers roll, and roll widely, but they are
 * never the stat wearing the +30%.
 */
export function canBeAffix(tables: RollTables, key: string): boolean {
  return isRolled(tables, key) && (!key.startsWith('ability_') || key === 'ability_crit_chance_pct');
}

/**
 * The pool the fixed affix and the enhancement are drawn from.
 *
 * Sorted, because the addon sorts it: the initial seed picks a *position* in
 * this list, so the order is part of the maths rather than a presentation
 * choice.
 */
export function affixPool(tables: RollTables, values: Record<string, number | string>): string[] {
  return Object.keys(values)
    .filter((key) => canBeAffix(tables, key))
    .sort();
}

/**
 * Every attribute on an item that rolls at all — its stats *and* its passive's
 * numbers.
 *
 * The second half is the part a stat block hides: two thirds of this game's
 * equipment carries a passive, and the figures inside its sentence ("reflects
 * 100% of armour", "20% more damage in this stance") are rolled within a band
 * like everything else, up to five of them on one item. They differ from a stat
 * in three ways worth knowing before showing them side by side:
 *
 *   - they are **stable**, drawn from the item's initial seed, so reforging
 *     never moves one — a passive is decided when the item drops, full stop;
 *   - no affix lands on them (see `canBeAffix`), and the divine forge pays them
 *     its smaller ability rate;
 *   - the `c` family runs backwards, where a bigger draw means a smaller number.
 *
 * Sorted for a stable order, with the stats first: an item's own block reads
 * that way, and its passive is a sentence underneath it.
 */
export function rollablePool(tables: RollTables, values: Record<string, number | string>): string[] {
  const rollable = Object.keys(values).filter((key) => isRolled(tables, key));
  const base = rollable.filter((key) => !isAbilityValueKey(key)).sort();
  const passive = rollable.filter(isAbilityValueKey).sort();
  return [...base, ...passive];
}

/**
 * How much a reforge level shifts the whole distribution upward.
 *
 * The *tens digit* of the reforge tail is what the PRNG reads, and a target is
 * written as a level, so this takes the level and treats it as that digit —
 * which is the best case, and the one worth planning for. See "tens digit ≠
 * level" in the reforging notes for why an item can display level 9 and roll
 * like level 4.
 */
export function iterationBonus(tables: RollTables, level: number): number {
  const { bonusScale, bonusOffset, bonusLevels } = tables.roll;
  const clamped = Math.max(0, Math.min(bonusLevels, level));
  return bonusScale * Math.sqrt(clamped / bonusLevels) + bonusOffset;
}

/** The iteration count every *stable* roll is drawn at, whatever the item's level. */
export function stableLevel(tables: RollTables): number {
  return Math.floor(tables.stableTail / 10);
}

/**
 * Every draw reachable at a level, best first.
 *
 * Six values at level 0, five higher up: the top two collapse once the bonus
 * pushes both past the cap. Deduplicated for exactly that reason — offering a
 * reader two options that are the same number is offering them a choice that
 * does not exist.
 */
export function reachableRolls(tables: RollTables, level: number): number[] {
  const { steps, centre, cap } = tables.roll;
  const bonus = iterationBonus(tables, level);
  const raw: number[] = [];
  for (let step = 0; step <= steps; step++) raw.push(step / steps - centre);
  return [...new Set(raw.map((roll) => Math.min(cap, roll + bonus)))].sort((a, b) => b - a);
}

function round(tables: RollTables, key: string, value: number): number {
  const factor = 10 ** decimalsOf(tables, key);
  return Math.round(value * factor) / factor;
}

/**
 * A stat's value for one draw.
 *
 * `fixed` adds the affix's flat 30%, and `divine` the forge's bonus on top of
 * that — the order the addon applies them in, and not a commutative one once
 * each step rounds to the attribute's own decimals.
 *
 * The enhancement is deliberately absent: its size is drawn with the item and
 * is a band rather than a number, so a plan says *which* stat should carry it
 * and the panel prints the band beside it.
 */
export function valueOf(
  tables: RollTables,
  key: string,
  base: number,
  roll: number,
  options: { fixed?: boolean; divine?: boolean } = {},
): number {
  const divine = (value: number): number => {
    if (options.divine !== true || !canBeDivine(key)) return value;
    const pct = divinePctFor(tables, key);
    // A `c` key is a cooldown: a bonus on one makes it smaller, like its roll.
    return round(tables, key, value * (1 + (isReverseKey(key) ? -pct : pct) * 0.01));
  };

  const pct = randomPctOf(tables, key);
  if (pct === undefined) return divine(round(tables, key, base));
  const applied = isReverseKey(key) ? -roll : roll;
  const rolled = base + applied * base * pct * 0.01;
  return divine(round(tables, key, options.fixed === true ? rolled * (1 + tables.fixedBonusPct * 0.01) : rolled));
}

export interface StatOutcome {
  /** The draw itself, on `[-cap, +cap]`. */
  roll: number;
  value: number;
}

/**
 * What a stat can come out as, best first.
 *
 * `level` is the reforge level being planned for. It is ignored for a stat that
 * rolls off the initial seed — the fixed one, and the `ability_value_*` keys —
 * because those are drawn at `stableTail` forever; `stable` on the result says
 * which case this was, so a reader is told *why* a stat is not improving rather
 * than watching a list refuse to change.
 */
export function statOutcomes(
  tables: RollTables,
  key: string,
  base: number,
  level: number,
  options: { fixed?: boolean; divine?: boolean } = {},
): { outcomes: StatOutcome[]; stable: boolean } {
  if (!isRolled(tables, key)) {
    return { outcomes: [{ roll: 0, value: valueOf(tables, key, base, 0, options) }], stable: true };
  }
  const stable = options.fixed === true || isAbilityValueKey(key);
  const rolls = reachableRolls(tables, stable ? stableLevel(tables) : level);
  return {
    outcomes: rolls.map((roll) => ({ roll, value: valueOf(tables, key, base, roll, options) })),
    stable,
  };
}

/**
 * Everything this stat could ever be, on any copy of the item.
 *
 * The worst draw an unreforged one can give, up to the best a fully reforged
 * one can — which is the honest answer to "what does this item roll?", and the
 * one a hover card wants, because a card knows nothing about anybody's plans.
 * Null for a stat that does not roll: those are the same on every copy, and a
 * range of one number is a range that says nothing.
 */
export function statSpan(
  tables: RollTables,
  key: string,
  base: number,
  options: { fixed?: boolean; divine?: boolean } = {},
): { min: number; max: number } | null {
  if (!isRolled(tables, key)) return null;
  const values = [0, tables.maxReforgeLevel].flatMap((level) =>
    statOutcomes(tables, key, base, level, options).outcomes.map((outcome) => outcome.value),
  );
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** The band an enhancement would add on top, once it unlocks. */
export function enhancedBand(tables: RollTables, value: number, key: string): [number, number] {
  const [low, high] = tables.enhancedBonusPct;
  const scale = (pct: number) => round(tables, key, value * (1 + pct * 0.01));
  const ends = [scale(low), scale(high)];
  return [Math.min(...ends), Math.max(...ends)] as [number, number];
}

/** Clamps a level to something the game can actually be at. */
export function clampReforge(tables: RollTables, level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(tables.maxReforgeLevel, Math.trunc(level)));
}


/**
 * What one reforge level costs, and therefore what a reforged item gives back.
 *
 * The addon prices a reforge from the item's own level and grade, scales it by
 * the level being reached, and adds a flat surcharge from level six. All of
 * that is `tables.reforgeCost`, transcribed out of the client — see the note
 * on the type and `extractReforgeCost` in the parser.
 *
 * Returns an empty list when the tables predate the extraction, which is why
 * the field is optional: a page that shows no cost table is honest, and one
 * that shows a guessed one is not.
 */
export interface ReforgeCostRow {
  /** The level being reached, 1..maxReforgeLevel. */
  level: number;
  /** Gold per attempt at this level. */
  gold: number;
  /** Essence id -> how many, at this level. */
  materials: Record<string, number>;
}

export function reforgeCost(
  tables: RollTables | null | undefined,
  item: { level: number; quality: number },
): ReforgeCostRow[] {
  const cost = tables?.reforgeCost;
  if (!cost) return [];

  const lvl = Math.max(1, Math.trunc(item.level));
  const mythic = item.quality >= cost.materials.mythicThreshold;

  /*
   * The base amounts, before the per-level scaling. Two branches, exactly as
   * the addon splits them: a mythic reforge burns Mythic Gear Essence and
   * Legendary, anything below burns Legendary and Equipment.
   */
  const base: Record<string, number> = mythic
    ? {
        [ESSENCE_IDS.MYTHIC]: Math.max(0, lvl + cost.materials.mythic.item_M507.offset),
        [ESSENCE_IDS.LEGENDARY]: cost.materials.mythic.item_M315.perLevel * lvl,
      }
    : {
        // `ceil(2 * lvl * 1.5)` in the addon, which is why this multiplier is
        // fractional and the ceiling is applied here rather than to the product.
        [ESSENCE_IDS.LEGENDARY]: Math.ceil(cost.materials.common.item_M315.perLevel * lvl),
        [ESSENCE_IDS.EQUIPMENT]: cost.materials.common.item_M009.perLevel * lvl,
      };

  const scale = (value: number, level: number): number =>
    Math.floor(value * cost.levelScale ** Math.max(0, level)) +
    (level >= cost.surchargeFrom ? cost.surcharge : 0);

  const rows: ReforgeCostRow[] = [];
  for (let level = 1; level <= (tables?.maxReforgeLevel ?? 0); level += 1) {
    const materials: Record<string, number> = {};
    for (const [id, amount] of Object.entries(base)) {
      const need = scale(amount, level);
      if (need > 0) materials[id] = need;
    }
    rows.push({
      level,
      gold: scale(cost.goldPerLevel * lvl, level),
      materials,
    });
  }
  return rows;
}

/** Every reforge from 1 to the ceiling, added up. What a full +9 actually costs. */
export function reforgeCostTotal(rows: readonly ReforgeCostRow[]): ReforgeCostRow {
  const materials: Record<string, number> = {};
  let gold = 0;
  for (const row of rows) {
    gold += row.gold;
    for (const [id, need] of Object.entries(row.materials)) materials[id] = (materials[id] ?? 0) + need;
  }
  return { level: rows.length, gold, materials };
}
