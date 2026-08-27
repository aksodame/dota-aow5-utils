import assert from 'node:assert/strict';
import test from 'node:test';
import { groupSessions, pageOf, parseRecord, sessionTotals, SESSIONS_PER_PAGE, type HistoryRun } from './history.ts';

const run = (over: Partial<HistoryRun> = {}): HistoryRun => ({
  kind: 'run',
  session: 1,
  room: 'M001',
  endedAt: 1000,
  duration: 60,
  outcome: 'clear',
  gold: 100,
  items: [['item_G002', 2]],
  ...over,
});

test('a line the archive cannot read costs one record, not the file', () => {
  assert.equal(parseRecord('not json'), null);
  assert.equal(parseRecord('{"kind":"run"}'), null, 'a run without a session or room is unusable');
  assert.equal(parseRecord('{"kind":"wat","id":1}'), null);
  assert.notEqual(parseRecord(JSON.stringify(run())), null);
});

test('a truncated run keeps whatever of it survived', () => {
  const parsed = parseRecord('{"kind":"run","session":1,"room":"M001"}');
  assert.deepEqual(parsed, {
    kind: 'run',
    session: 1,
    room: 'M001',
    endedAt: 0,
    duration: 0,
    outcome: 'other',
    gold: 0,
    items: [],
  });
});

test('malformed item pairs are skipped, the rest of the run is not', () => {
  const parsed = parseRecord('{"kind":"run","session":1,"room":"M001","items":[["a",2],["b"],7,["c","x"],["d",1]]}');
  assert.deepEqual(parsed?.kind === 'run' ? parsed.items : null, [
    ['a', 2],
    ['d', 1],
  ]);
});

test('sessions come back newest first, runs newest first inside them', () => {
  const grouped = groupSessions([
    { kind: 'session', id: 1, source: 'mock' },
    run({ session: 1, endedAt: 100 }),
    run({ session: 1, endedAt: 300 }),
    { kind: 'session', id: 2, source: 'console' },
    run({ session: 2, endedAt: 200 }),
  ]);

  assert.deepEqual(
    grouped.map((s) => s.id),
    [2, 1],
  );
  assert.deepEqual(grouped[1]?.runs.map((r) => r.endedAt), [300, 100]);
  assert.equal(grouped[0]?.source, 'console');
});

test('a run whose session line never reached disk is still kept', () => {
  const grouped = groupSessions([run({ session: 99 })]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.id, 99);
  assert.equal(grouped[0]?.runs.length, 1);
});

test('session totals add up runs, gold and items', () => {
  const totals = sessionTotals({
    id: 1,
    source: 'mock',
    runs: [
      run({ duration: 60, gold: 100, items: [['a', 2], ['b', 1]] }),
      run({ duration: 30, gold: 50, items: [['a', 3]] }),
    ],
  });

  assert.equal(totals.runs, 2);
  assert.equal(totals.activeTime, 90);
  assert.equal(totals.gold, 150);
  assert.equal(totals.items, 6);
  assert.deepEqual(totals.byItem, [
    { id: 'a', qty: 5 },
    { id: 'b', qty: 1 },
  ]);
});

/**
 * Paging the archive, which is one `slice` and one decision — what a page
 * number means once the list under it has changed size. Everything that can go
 * wrong here goes wrong at the worst moment: right after somebody deleted
 * something, when an empty page reads as a lost archive.
 */

const listOf = (n: number) => Array.from({ length: n }, (_, i) => i);

test('a page is a window on the list, in the list’s own order', () => {
  const all = listOf(25);
  assert.deepEqual(pageOf(all, 0, 10).items, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(pageOf(all, 1, 10).items, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(pageOf(all, 2, 10).items, [20, 21, 22, 23, 24], 'the last page is whatever is left');
});

test('a page past the end lands on the last page, not on nothing', () => {
  // The case that arrives right after a delete: the page being read no longer
  // exists, and an empty list there is indistinguishable from a lost archive.
  const page = pageOf(listOf(25), 9, 10);
  assert.equal(page.index, 2, 'clamped to the last page there is');
  assert.deepEqual(page.items, [20, 21, 22, 23, 24]);
});

test('an emptied archive is still page 1 of 1', () => {
  const page = pageOf([], 3, 10);
  assert.deepEqual(page, { items: [], index: 0, count: 1 }, '"1 of 0" is not a thing to draw');
});

test('a page count covers the remainder rather than dropping it', () => {
  assert.equal(pageOf(listOf(10), 0, 10).count, 1);
  assert.equal(pageOf(listOf(11), 0, 10).count, 2, 'one session over is a second page');
  assert.equal(pageOf(listOf(1), 0, 10).count, 1);
});

test('an index that is not a whole number in range is the first page', () => {
  assert.equal(pageOf(listOf(25), -4, 10).index, 0);
  assert.equal(pageOf(listOf(25), Number.NaN, 10).index, 0, 'not a number, not a page');
  assert.equal(pageOf(listOf(25), 1.7, 10).index, 1, 'truncated, not rounded up past the page asked for');
});

test('the shipped page size is what the view is drawn against', () => {
  // Guards the default: the view passes no size, and a change here changes what
  // every pager in the app shows without touching the pager.
  assert.equal(SESSIONS_PER_PAGE, 10);
  assert.equal(pageOf(listOf(11), 1).items.length, 1);
});
