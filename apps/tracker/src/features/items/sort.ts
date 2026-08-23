/**
 * Ordering for the loot list.
 *
 * Its own module, and free of every import, because it is the one part of the
 * list that is worth testing: which column is sorted is a click, but *how* a
 * column sorts is a decision, and the wrong answer is invisible until you look
 * for an item that is not where you expect.
 */

export type SortKey = 'name' | 'unit' | 'total';
export type SortDir = 'asc' | 'desc';

/** What the list needs resolved before it can be ordered: prices are not on the row until then. */
export interface SortableRow {
  id: string;
  name: string;
  /** Gold for one, at whatever price is in force. */
  unit: number;
  /** Gold for the quantity held. */
  total: number;
}

/**
 * The direction a column takes when you first click it.
 *
 * Names go A–Z because that is what a name is for — finding one. Money goes
 * high-first because the question there is "what carried this session", and
 * nobody opens a farm tracker to see their cheapest drop.
 */
export const DEFAULT_DIR: Record<SortKey, SortDir> = { name: 'asc', unit: 'desc', total: 'desc' };

/**
 * Orders a copy of the rows.
 *
 * Ties fall back to the name and then the id, so the list never reshuffles
 * under a re-render: two items worth the same gold hold their order for the
 * whole session rather than swapping places every time a drop lands.
 */
export function sortRows<T extends SortableRow>(rows: readonly T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = key === 'name' ? a.name.localeCompare(b.name) : a[key] - b[key];
    if (primary !== 0) return sign * primary;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
