import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DIR, sortRows, type SortableRow } from './sort.ts';

/**
 * The loot list's ordering, which is a decision rather than a click: a column
 * that sorts the wrong way looks like a missing item, not like a bug.
 */

const row = (id: string, name: string, unit: number, qty: number): SortableRow => ({
  id,
  name,
  unit,
  total: unit * qty,
});

const ROWS: SortableRow[] = [
  row('item_C', 'Ash Fragment', 40, 10), // 400
  row('item_A', 'Zircon Core', 900, 1), //  900
  row('item_B', 'brass gear', 100, 3), //   300
];

const names = (rows: SortableRow[]) => rows.map((r) => r.name);

test('names sort as a person reads them, not as bytes', () => {
  // A capital Z sorts before a lowercase b in code-point order, which would
  // put "brass gear" at the bottom of an A–Z list.
  assert.deepEqual(names(sortRows(ROWS, 'name', 'asc')), ['Ash Fragment', 'brass gear', 'Zircon Core']);
  assert.deepEqual(names(sortRows(ROWS, 'name', 'desc')), ['Zircon Core', 'brass gear', 'Ash Fragment']);
});

test('value sorts by what one is worth, total by what the pile is worth', () => {
  // The two disagree on purpose: one expensive drop against ten cheap ones is
  // exactly the comparison the columns are there to make.
  assert.deepEqual(names(sortRows(ROWS, 'unit', 'desc')), ['Zircon Core', 'brass gear', 'Ash Fragment']);
  assert.deepEqual(names(sortRows(ROWS, 'total', 'desc')), ['Zircon Core', 'Ash Fragment', 'brass gear']);
});

test('ties hold their order instead of shuffling under a re-render', () => {
  const tied = [row('item_B', 'Second', 50, 2), row('item_A', 'First', 100, 1)];
  assert.deepEqual(names(sortRows(tied, 'total', 'desc')), ['First', 'Second']);
  assert.deepEqual(names(sortRows([...tied].reverse(), 'total', 'desc')), ['First', 'Second']);
});

test('sorting leaves the caller its own array', () => {
  const before = names(ROWS);
  sortRows(ROWS, 'name', 'asc');
  assert.deepEqual(names(ROWS), before, 'the list is re-rendered from this array every tick');
});

test('each column opens the way its question is asked', () => {
  assert.equal(DEFAULT_DIR.name, 'asc', 'names are for finding');
  assert.equal(DEFAULT_DIR.unit, 'desc');
  assert.equal(DEFAULT_DIR.total, 'desc', 'nobody opens a farm tracker to see their cheapest drop');
});
