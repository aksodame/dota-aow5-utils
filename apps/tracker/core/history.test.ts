import assert from 'node:assert/strict';
import test from 'node:test';
import { groupSessions, parseRecord, sessionTotals, type HistoryRun } from './history.ts';

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
