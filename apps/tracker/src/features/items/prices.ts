import type { ValueOf } from '@core/stats.ts';
import { itemCost } from './table';

/**
 * What an item is worth, with the player's own prices on top of the tables.
 *
 * The extracted `cost` is the game's sell price, which is not always what a
 * player is farming against — an ingredient two crafts below something valuable
 * is worth more than it sells for, and an item nobody sells is worth nothing
 * whatever the table says. `config.prices` is where that judgement lives, and
 * this is the one place that resolves it, so every gold figure in the app
 * agrees: the g/hr card, the session total, the loot list, the archive.
 *
 * Two rules, in this order:
 *
 *   1. A price the player set is used exactly as they set it. Halving a number
 *      somebody typed would report something they did not say.
 *   2. Otherwise the table price, halved when `halvePrices` is on, because the
 *      trader pays half of what the shop lists.
 */

export interface Pricing {
  /** Gold for one: the player's price if they set one, otherwise `table`. */
  unit: (id: string) => number;
  /** What this item fetches without a price of its own — halved when the trader's cut is on. */
  table: (id: string) => number;
  /** Gold for a quantity. The shape `core/stats.ts` wants for its rates. */
  value: ValueOf;
  /** Whether this id is priced by the player rather than by the tables. */
  isCustom: (id: string) => boolean;
}

/** The default: everything at table price. Shared so a caller without config still has a `Pricing`. */
export const TABLE_PRICING: Pricing = pricing({}, false);

export function pricing(overrides: Record<string, number> | undefined, halved = false): Pricing {
  // `?? {}` rather than a required argument: config arrives asynchronously and
  // every window renders once before it does.
  const prices = overrides ?? {};
  // Floored, not rounded: half of an odd price is not a coin, and a tracker
  // that guesses upward is a tracker that flatters the session.
  const table = (id: string): number => {
    // `itemCost` rather than a name table: a price has no language, and reading
    // it through one would tie every gold figure in the app to a setting that
    // cannot change any of them.
    const cost = itemCost(id);
    return halved ? Math.floor(cost / 2) : cost;
  };
  const unit = (id: string): number => prices[id] ?? table(id);
  return {
    unit,
    table,
    value: (id, qty) => unit(id) * qty,
    isCustom: (id) => prices[id] !== undefined,
  };
}
