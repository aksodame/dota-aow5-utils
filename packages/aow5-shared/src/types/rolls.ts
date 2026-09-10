/**
 * What an item's stats can roll to, as the addon computes it.
 *
 * Every equipment stat in this game is a *range* around the number the item
 * table lists: the item's seed draws a roll, the roll moves the value by up to
 * a per-attribute percentage, and reforging re-draws it. So the base value in
 * `ItemFull.values` is the middle of a story rather than the whole of it, and
 * a guide that says "get this item" is really saying "get this item rolled a
 * particular way".
 *
 * These are the tables that let the site tell the difference. They are read out
 * of the compiled HUD bundle by the pipeline's step 04d — see
 * `parser/tools/lib/hudScript.ts` for where each number comes from, and
 * `private/reforging_about.md` for what a reforge can and cannot change.
 *
 * Emitted as `public/data/rolls.json`; consumed by `aow5-shared/data`'s
 * `rolls.ts`, which is the same arithmetic running in a browser.
 */
export interface RollTables {
  schema: 1;
  generatedAt: string;
  /** The highest reforge level an item can reach. Nine, today. */
  maxReforgeLevel: number;
  /**
   * The reforge tail every *stable* roll is drawn at.
   *
   * Two digits, read as `floor(tail / 10)` iterations. The fixed attribute and
   * the `ability_value_*` keys roll from the item's initial seed with this tail
   * substituted, which is why they neither move nor improve when an item is
   * reforged — see `stableIterations` in `data/rolls.ts`.
   */
  stableTail: number;
  /** What the fixed attribute adds on top of its roll: +30%. */
  fixedBonusPct: number;
  /** `[min, max]` reforge level the enhancement can demand before it unlocks. */
  enhancedLevel: [number, number];
  /** `[min, max]` percent the enhancement adds once it does. */
  enhancedBonusPct: [number, number];
  /**
   * The roll's quantiser, transcribed from the addon's `normal01`.
   *
   * The draw is rounded to `1 / steps` before the iteration bonus shifts it and
   * `cap` trims it, so a rolled stat has a handful of reachable values rather
   * than a continuum. That is the whole reason a target can be *chosen* from a
   * list instead of typed as a wish.
   */
  roll: {
    /** Buckets the draw is rounded into: `round(v * steps) / steps`. */
    steps: number;
    /** Subtracted after rounding, putting the roll on `[-cap, +cap]`. */
    centre: number;
    /** The ceiling a roll is clamped to, before and after the bonus. */
    cap: number;
    /** The iteration bonus is `bonusScale * sqrt(min(bonusLevels, n) / bonusLevels) + bonusOffset`. */
    bonusScale: number;
    bonusOffset: number;
    bonusLevels: number;
  };
  /**
   * The divine forge — the addon's 神铸, and the one affix that touches every
   * stat at once.
   *
   * Decided when the item is created, from the same initial seed as the other
   * two affixes and only for items at or above `minQuality`: a fraction of them
   * carry it, it unlocks somewhere in `level`, and from then on it multiplies
   * every eligible attribute. Reforging can neither grant it nor remove it —
   * it only walks the item up to the level the roll already demanded.
   *
   * `chancePct` is here for what it says about planning rather than for any sum
   * the site does: it is how often hunting for one is worth the attempt.
   */
  divine: {
    /** Items below this quality never roll one. */
    minQuality: number;
    /** How often an eligible item carries one, in percent. */
    chancePct: number;
    /** `[min, max]` reforge level it can demand before it unlocks. */
    level: [number, number];
    /** What it adds to an ordinary attribute, in percent. */
    bonusPct: number;
    /** What it adds to an `ability_*` one, which is less. */
    abilityBonusPct: number;
  };
  /** What an `ability_value_*` key rolls by when the table names no figure. */
  abilityValuePct: number;
  /** Percent of its base value each attribute may move by. */
  random: Record<string, number>;
  /** Decimal places a rolled value is rounded to. Absent means whole numbers. */
  decimals: Record<string, number>;
}
