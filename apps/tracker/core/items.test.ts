import assert from 'node:assert/strict';
import test from 'node:test';
import type { IndexRow } from 'aow5-shared/types';
import { ItemTable } from './items.ts';

/**
 * Browsing a grade, which is the half of the table that has an opinion.
 *
 * `get` and `search` were always straightforward; `grade` is the one that
 * decides an order, and the order is the feature — it is what the mute list is
 * read through, and a wrong answer there looks like a tier that simply does not
 * contain the item making all the noise.
 */

/** `[?, id, type, quality, level, cost, icon]` — see `INDEX_*` in `aow5-shared`. */
const row = (id: string, quality: number, level: number, cost: number): IndexRow =>
  [0, id, 'material', quality, level, cost, `${id}.png`] as unknown as IndexRow;

const ROWS: IndexRow[] = [
  row('item_A', 6, 9, 40_000),
  row('item_B', 6, 9, 120),
  row('item_C', 6, 3, 8_000),
  row('item_D', 5, 9, 600),
];

const NAMES = { item_A: 'Zircon Core', item_B: 'Ash Fragment', item_C: 'Brass Gear', item_D: 'Dust' };

const table = ItemTable.from(ROWS, NAMES);
const ids = (items: { id: string }[]) => items.map((i) => i.id);

test('a grade is cheapest first, because that is where the noise is', () => {
  // Against the house order of every other list here, and deliberately: the
  // mute list is filled in by looking for the drops that arrive by the fistful.
  assert.deepEqual(ids(table.grade(6, null)), ['item_B', 'item_C', 'item_A']);
});

test('either half of the grade may be left open', () => {
  assert.deepEqual(ids(table.grade(6, 9)), ['item_B', 'item_A'], 'both halves narrow it');
  assert.deepEqual(ids(table.grade(null, 9)), ['item_B', 'item_D', 'item_A'], 'a level across every rarity');
  assert.deepEqual(ids(table.grade(null, null)), ['item_B', 'item_D', 'item_C', 'item_A'], 'and neither is the lot');
});

test('a grade nothing is in is empty rather than everything', () => {
  assert.deepEqual(table.grade(7, null), [], 'a tier a pak has not shipped into is a real answer');
  assert.deepEqual(table.grade(6, 10), []);
});

test('two items worth the same hold their order under a re-render', () => {
  const tied = ItemTable.from([row('item_X', 1, 1, 50), row('item_Y', 1, 1, 50)], {
    item_X: 'Second',
    item_Y: 'First',
  });
  // By name after price, so the list is not free to reshuffle every time the
  // settings window redraws — which it does on every keystroke in the box above.
  assert.deepEqual(ids(tied.grade(1, null)), ['item_Y', 'item_X']);
});

test('browsing does not disturb the table it reads', () => {
  const before = ids(table.all);
  table.grade(6, null);
  assert.deepEqual(ids(table.all), before, 'sorted on a copy: `all` backs every other list');
});
