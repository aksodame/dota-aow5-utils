import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createConsoleClock,
  formatLine,
  parseConsoleTimestamp,
  parseLines,
  validateEvent,
  type TrackerEvent,
} from './events.ts';
import {
  applyAll,
  byRoom,
  createState,
  isLastRunDead,
  itemTotals,
  rates,
  resetState,
  runItems,
  runLootValue,
  timeInRuns,
  toggleLastRunDead,
  type ValueOf,
} from './stats.ts';
import { buildMockTimeline } from './sources/mock.ts';

/**
 * The reducer is where every headline number is decided, so it is tested
 * against hand-written event fixtures rather than through the UI. Two rules in
 * particular are easy to regress silently: rates are per time *inside* runs,
 * and an unfinished run must not pollute clear-time averages.
 */

const enter = (t: number, room: string, level = 1): TrackerEvent => ({ v: 1, e: 'room_enter', t, room, level });
const exit = (t: number, room: string, reason = 'clear', gold?: number): TrackerEvent =>
  gold === undefined ? { v: 1, e: 'room_exit', t, room, reason } : { v: 1, e: 'room_exit', t, room, reason, gold };
const bag = (t: number, count: number, value: number, gold: number): TrackerEvent => ({
  v: 1,
  e: 'backpack',
  t,
  count,
  cap: 51,
  value,
  gold,
});
const drop = (t: number, items: [string, number][]): TrackerEvent => ({ v: 1, e: 'drop', t, items });

const build = (events: TrackerEvent[]) => applyAll(createState(), events);

/**
 * Prices for the fixture ids, standing in for the extracted item table.
 *
 * The reducer takes pricing as an argument, so the tests can state what a drop
 * is worth instead of depending on whatever the real tables say this patch.
 */
const COSTS: Record<string, number> = { item_A: 100, item_B: 50, item_C: 10 };
const price: ValueOf = (id, qty) => (COSTS[id] ?? 0) * qty;

// --- parsing ----------------------------------------------------------------

test('a well-formed line parses into an event', () => {
  const line = formatLine(enter(600, 'M001'));
  const { events, skipped } = parseLines([line]);
  assert.equal(skipped.length, 0);
  assert.deepEqual(events[0], { v: 1, e: 'room_enter', t: 600, room: 'M001', level: 1 });
});

test('lines without the prefix are ignored silently, not reported as skipped', () => {
  const { events, skipped } = parseLines([
    '08/16 17:30:44 [Client] Filename (null) of item item_M102 was not found!',
    '08/16 17:30:40 [PanoramaScript] Abandoned Quarry',
  ]);
  assert.equal(events.length, 0);
  assert.equal(skipped.length, 0, 'Dota chatter is not our business');
});

test('a successful room_exit carrying a reason is not mistaken for a failure', () => {
  // Regression: the validator once signalled failure with a `reason` field,
  // which collided with RoomExitEvent.reason and silently ate every clear.
  const { events, skipped } = parseLines([formatLine(exit(100, 'M001', 'clear', 4200))]);
  assert.equal(skipped.length, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.e === 'room_exit' ? events[0]!.reason : null, 'clear');
});

test('a line that only mentions the prefix is ignored, not called broken', () => {
  // Dota echoes the launch options, so anyone filtering their console on
  // `[AOW5TRK]` has this line in every log they ever produce.
  const { events, skipped } = parseLines([
    '08/22 16:22:17 [CommandLine] -novid -con_logfile C:/log.txt +con_filter_text [AOW5TRK]',
  ]);
  assert.equal(events.length, 0);
  assert.deepEqual(skipped, [], 'not ours to complain about');
});

test('a line claiming to be ours but broken is reported, never thrown on', () => {
  const { events, skipped } = parseLines([
    '[AOW5TRK] {not json',
    '[AOW5TRK] {"v":9,"e":"room_enter","t":1,"room":"M001"}',
    '[AOW5TRK] {"v":1,"e":"teleport","t":1}',
    '[AOW5TRK] {"v":1,"e":"room_enter","t":1}',
  ]);
  assert.equal(events.length, 0);
  assert.equal(skipped.length, 4);
  assert.match(skipped[0]!.reason, /not valid JSON/);
  assert.match(skipped[1]!.reason, /unsupported schema version 9/);
  assert.match(skipped[2]!.reason, /unknown event kind/);
  assert.match(skipped[3]!.reason, /without a room id/);
});

test('a timestamped console line with the prefix embedded still parses', () => {
  // The real log prefixes every line with a date and a subsystem tag.
  const line = `08/16 17:30:40 [PanoramaScript] ${formatLine(drop(700, [['item_G002', 3]]))}`;
  const { events } = parseLines([line]);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0]!.e === 'drop' ? events[0]!.items : null, [['item_G002', 3]]);
});

test('a line with no t of its own is clocked from the console timestamp', () => {
  // What the addon actually ships: the request was narrowed to three `$.Msg`
  // calls whose payloads carry no `t` (`docs/EVENT-CONTRACT.md`), so the line's
  // own timestamp is the only clock there is. Every one of these was skipped
  // as "missing or non-numeric t" until it was.
  const { events, skipped } = parseLines([
    '08/22 14:15:05 [PanoramaScript] [AOW5TRK] {"v":1,"e":"room_enter","room":"M009"}',
    '08/22 14:17:35 [PanoramaScript] [AOW5TRK] {"v":1,"e":"room_exit","room":"M009","reason":"clear"}',
  ]);

  assert.equal(skipped.length, 0);
  assert.equal(events.length, 2);
  assert.equal(events[1]!.t - events[0]!.t, 150, 'the gap between the lines is the run duration');
});

test('a payload carrying its own t is not overridden by the line', () => {
  // The addon's game clock is finer than a log line stamped to the second, so
  // it wins whenever it is there.
  const line = `08/22 14:15:05 [PanoramaScript] ${formatLine(enter(600, 'M001'))}`;
  const { events } = parseLines([line]);
  assert.equal(events[0]!.t, 600);
});

test('a line with neither a t nor a timestamp is reported, not clocked at zero', () => {
  // Silently defaulting to 0 would date the event to the start of the year and
  // stretch one run across the whole session.
  const { events, skipped } = parseLines(['[AOW5TRK] {"v":1,"e":"room_enter","room":"M009"}']);
  assert.equal(events.length, 0);
  assert.match(skipped[0]!.reason, /no clock/);
});

test('a drop records the player slot the addon tags it with', () => {
  const { events } = parseLines([
    '08/22 14:15:11 [PanoramaScript] [AOW5TRK] {"v":1,"e":"drop","items":[["item_2021",1]],"player":0}',
  ]);
  assert.equal(events[0]!.e === 'drop' ? events[0]!.player : null, 0);
});

test('the console clock keeps going forward across New Year', () => {
  // The log has no year in it, so 01/01 reads as earlier than 12/31. A clock
  // that went backwards would freeze `state.clock` and decay every rate to zero
  // for the rest of the session, without anything looking broken.
  const clock = createConsoleClock();
  const newYearsEve = clock('12/31 23:59:50 [PanoramaScript] x')!;
  const newYearsDay = clock('01/01 00:00:10 [PanoramaScript] x')!;
  assert.equal(newYearsDay - newYearsEve, 20);
});

test('an untimestamped line yields no clock rather than a wrong one', () => {
  assert.equal(parseConsoleTimestamp('[AOW5TRK] {"v":1}'), undefined);
  assert.equal(parseConsoleTimestamp('13/01 00:00:00 [PanoramaScript] x'), undefined, 'no such month');
});

test('malformed pairs inside a drop are dropped without losing the event', () => {
  const result = validateEvent({ v: 1, e: 'drop', t: 5, items: [['item_A', 2], ['item_B'], 'nope', ['item_C', 1]] });
  assert.ok(result.ok);
  assert.deepEqual((result.event as Extract<TrackerEvent, { e: 'drop' }>).items, [
    ['item_A', 2],
    ['item_C', 1],
  ]);
});

// --- run lifecycle ----------------------------------------------------------

test('a clean run is recorded with its duration and outcome', () => {
  const s = build([enter(600, 'M001'), exit(852, 'M001', 'clear')]);
  assert.equal(s.runs.length, 1);
  assert.equal(s.current, null);
  assert.equal(s.runs[0]!.outcome, 'clear');
  assert.equal(timeInRuns(s), 252);
});

test('a death is a finished run but not a clear', () => {
  const s = build([enter(0, 'M001'), exit(100, 'M001', 'death')]);
  assert.equal(s.runs[0]!.outcome, 'other');
  assert.equal(s.runs[0]!.reason, 'death');
});

test('walking into the next room finishes the last one', () => {
  // The addon sends no exit when the player goes room to room. It is not the
  // usual path, but the run happened and has to count: before this, a chained
  // room was filed as abandoned and lost its place in the run count and in the
  // clear-time average.
  const s = build([enter(0, 'M001'), drop(80, [['item_A', 1]]), enter(90, 'M003'), exit(200, 'M003', 'clear')]);
  assert.equal(s.runs[0]!.reason, undefined, 'nothing said how it went, so nothing is claimed');
  assert.equal(s.runs.length, 2);
  assert.equal(s.runs[0]!.outcome, 'chained');
  assert.equal(s.runs[0]!.end, 90, 'it ended when the next one started');
  assert.equal(s.runs[1]!.outcome, 'clear');

  const r = rates(s, price);
  assert.equal(r.completedRuns, 2);
  assert.equal(r.abandonedRuns, 0);
  assert.equal(r.averageClear, 100, '90s and 110s');
});

test('how long the last room took does not change the rule', () => {
  // Deliberately no gap heuristic: a `room_enter` ends the open run whatever
  // the clock says. The cost is a session left running through a crash, where
  // the idle time lands in that run — which is what Restart Session is for.
  const s = build([enter(0, 'M001'), drop(50, [['item_A', 1]]), enter(4000, 'M003')]);
  assert.equal(s.runs[0]!.outcome, 'chained');
  assert.equal(s.runs[0]!.end, 4000);
  assert.equal(rates(s, price).abandonedRuns, 0, 'nothing produces that outcome any more');
});

test('every room in a chain is counted, including the one nobody exited', () => {
  const s = build([
    enter(0, 'M001'),
    exit(100, 'M001', 'clear'),
    enter(200, 'M003'), // ended by the next enter, not by an exit
    enter(1000, 'M003'),
    exit(1100, 'M003', 'clear'),
  ]);
  const r = rates(s, price);
  assert.equal(r.completedRuns, 3);
  assert.deepEqual(s.runs.map((run) => run.outcome), ['clear', 'chained', 'clear']);
  assert.equal(Math.round(r.averageClear), 333, 'the 800s room is a room that took 800s');
});

test('an exit with no matching enter does not invent a run', () => {
  const s = build([exit(100, 'M001', 'clear')]);
  assert.equal(s.runs.length, 0);
  assert.equal(s.current, null);
});

// --- rates ------------------------------------------------------------------

test('rates use time inside runs, not wall clock', () => {
  // Two 100s runs an hour apart: 200s of farming, not 3800s.
  const s = build([
    bag(0, 0, 0, 1000),
    enter(0, 'M001'),
    bag(100, 0, 0, 2000),
    exit(100, 'M001', 'clear', 2000),
    enter(3700, 'M001'),
    bag(3800, 0, 0, 3000),
    exit(3800, 'M001', 'clear', 3000),
  ]);
  const r = rates(s, price);
  assert.equal(r.activeTime, 200, 'the idle hour between rooms is excluded');
  assert.equal(Math.round(r.goldPerHour), 36000, '2000 gold over 200s is 36000/hr');
});

test('items per hour counts drops across the session', () => {
  const s = build([
    enter(0, 'M001'),
    drop(10, [['item_A', 3]]),
    drop(20, [['item_B', 1], ['item_A', 2]]),
    exit(3600, 'M001', 'clear'),
  ]);
  const r = rates(s, price);
  assert.equal(r.itemsPerHour, 6, '6 items in exactly one hour of running');
  assert.deepEqual(
    itemTotals(s).map((i) => [i.id, i.qty]),
    [
      ['item_A', 5],
      ['item_B', 1],
    ],
  );
});

test('gold is attributed to the run it was earned in', () => {
  const s = build([bag(0, 0, 0, 500), enter(0, 'M001'), bag(50, 0, 0, 900), exit(100, 'M001', 'clear', 1200)]);
  const r = rates(s, price);
  assert.equal(r.currentRunGold, 0, 'no run is open once it exits');
  assert.equal(Math.round(r.goldPerHour), 25200, '700 gold over 100s');
});

test('the open run reports live elapsed and gold', () => {
  const s = build([bag(0, 0, 0, 100), enter(10, 'M001'), bag(40, 3, 250, 400), drop(40, [['item_A', 3]])]);
  const r = rates(s, price);
  assert.equal(r.currentRunElapsed, 30, 'clock 40 minus start 10');
  assert.equal(r.currentRunGold, 300);
  assert.equal(s.current?.outcome, 'open');
});

test('rates are zero rather than NaN before anything has happened', () => {
  const r = rates(createState(), price);
  assert.equal(r.goldPerHour, 0);
  assert.equal(r.itemsPerHour, 0);
  assert.equal(r.averageClear, 0);
  assert.equal(r.activeTime, 0);
});

test('average gold per room is the mean over the rooms that finished', () => {
  const s = build([
    enter(0, 'M001'),
    drop(10, [['item_A', 3]]), // 300
    exit(100, 'M001', 'clear'),
    enter(110, 'M002'),
    drop(120, [['item_A', 1]]), // 100
    exit(200, 'M002', 'clear'),
  ]);
  const r = rates(s, price);
  assert.equal(r.completedRuns, 2);
  assert.equal(r.averageRunGold, 200, '300 and 100');
});

test('the open room is left out of the average, like it is out of the clear time', () => {
  // Otherwise the number would fall every time you picked something up in a
  // room you had not finished, which reads as the farm getting worse.
  const s = build([
    enter(0, 'M001'),
    drop(10, [['item_A', 2]]), // 200, finished
    exit(100, 'M001', 'clear'),
    enter(110, 'M002'),
    drop(120, [['item_A', 9]]), // 900, still open
  ]);
  const r = rates(s, price);
  assert.equal(r.completedRuns, 1);
  assert.equal(r.averageRunGold, 200, 'the open 900 does not count yet');
  assert.equal(r.currentRunGold, 900, 'though it is still reported on its own');
});

test('a room written off as died earns nothing toward the average', () => {
  const s = build([
    enter(0, 'M001'),
    drop(10, [['item_A', 4]]), // 400
    exit(100, 'M001', 'clear'),
    enter(110, 'M002'),
    drop(120, [['item_A', 10]]),
    exit(200, 'M002', 'clear'),
  ]);
  toggleLastRunDead(s);
  const r = rates(s, price);
  assert.equal(r.diedRuns, 1);
  assert.equal(r.completedRuns, 1);
  assert.equal(r.averageRunGold, 400, 'only the room that counted');
});

test('average gold is zero rather than NaN before a room finishes', () => {
  assert.equal(rates(createState(), price).averageRunGold, 0);
  assert.equal(rates(build([enter(0, 'M001')]), price).averageRunGold, 0);
});

test('gold never counts backwards when the player spends', () => {
  // Buying something mid-run drops the total; that is not negative income.
  const s = build([bag(0, 0, 0, 5000), enter(0, 'M001'), bag(50, 0, 0, 1000), exit(100, 'M001', 'clear', 1000)]);
  assert.equal(rates(s, price).goldPerHour, 0);
});

test('gold is the value of the drops when the game reports no wallet', () => {
  // The shipped addon sends no gold at all, so this is the only path that runs
  // in a real session: without it the g/hr card sits at 0 all evening.
  const s = build([enter(0, 'M001'), drop(10, [['item_A', 3]]), drop(20, [['item_B', 2]]), exit(100, 'M001', 'clear')]);
  const r = rates(s, price);
  assert.equal(runLootValue(s.runs[0]!, price), 400, '3 x 100 plus 2 x 50');
  assert.equal(r.goldPerHour, 14400, '400 gold over 100s');
});

test('a reported wallet figure beats the price table', () => {
  // Reported gold is the real economy: it counts what the drops sold for, and
  // it sees gold that never took the form of an item.
  const s = build([bag(0, 0, 0, 1000), enter(0, 'M001'), drop(10, [['item_A', 3]]), exit(100, 'M001', 'clear', 2000)]);
  assert.equal(rates(s, price).goldPerHour, 36000, '1000 wallet gold, not 300 of loot');
});

test('gold per hour is whole', () => {
  // A second-resolution clock and a price table do not justify a decimal.
  const s = build([enter(0, 'M001'), drop(1, [['item_C', 1]]), exit(7, 'M001', 'clear')]);
  assert.equal(rates(s, price).goldPerHour, 5142, '10 gold over 7s is 5142.857…');
});

test('an unpriced item costs nothing rather than breaking the rate', () => {
  // Ids outlive the extracted tables; a drop the table has never heard of must
  // not take the whole gold figure down with it.
  const s = build([enter(0, 'M001'), drop(10, [['item_UNKNOWN', 4], ['item_A', 1]]), exit(100, 'M001', 'clear')]);
  assert.equal(rates(s, price).goldPerHour, 3600, 'the priced item still counts');
});

test('the loot list is the room you are in, and empties when the next starts', () => {
  // The card above it counts the whole evening; this answers "was *this* room
  // worth it", which a running total cannot.
  const s = build([enter(0, 'M001'), drop(10, [['item_A', 2]]), drop(20, [['item_B', 1]])]);
  assert.deepEqual(runItems(s), [
    { id: 'item_A', qty: 2 },
    { id: 'item_B', qty: 1 },
  ]);

  applyAll(s, [enter(30, 'M003')]);
  assert.deepEqual(runItems(s), [], 'a fresh room is a fresh answer');

  applyAll(s, [drop(40, [['item_C', 5]])]);
  assert.deepEqual(runItems(s), [{ id: 'item_C', qty: 5 }]);
  assert.equal(itemTotals(s).length, 3, 'the session totals kept all of it');
});

test('a room change does not touch the map the recipe panel counts from', () => {
  // `state.items` is the `have` map behind the ingredient strip, and a grind
  // outlasts a room: three ore across two rooms is three ore. The per-room list
  // reads `run.items`, which is a different map on purpose — this is the test
  // that keeps the two from being confused for each other.
  const s = build([
    enter(0, 'M001'),
    drop(10, [['item_ORE', 2]]),
    enter(30, 'M003'),
    drop(40, [['item_ORE', 1]]),
  ]);

  assert.equal(s.items.get('item_ORE'), 3, 'the session map kept counting');
  assert.deepEqual(runItems(s), [{ id: 'item_ORE', qty: 1 }], 'the room list started over');
});

test('between rooms the list still shows what the last one gave', () => {
  // Leaving a room does not clear it: until the next room starts, this list is
  // the only record of what that one dropped.
  const s = build([enter(0, 'M001'), drop(10, [['item_A', 2]]), exit(60, 'M001', 'clear')]);
  assert.deepEqual(runItems(s), [{ id: 'item_A', qty: 2 }]);
});

// --- the live clock ---------------------------------------------------------

test('the open run keeps counting between events', () => {
  // The addon speaks a few times per room, so `state.clock` stands still for
  // seconds at a time. The overlay carries it forward with real time; without
  // that the run timer freezes and jumps at the next pickup, which is what it
  // looks like from the outside.
  const s = build([enter(100, 'M001'), drop(110, [['item_A', 1]])]);
  assert.equal(rates(s, price).currentRunElapsed, 10, 'without a live clock, only the last event counts');
  assert.equal(rates(s, price, 137).currentRunElapsed, 37, 'and with one, the seconds since it arrived');
});

test('a live clock behind the events cannot rewind anything', () => {
  // Events arrive up to a poll late, so the anchor can lag the clock it is
  // extrapolating from. Rewinding would show a timer ticking backwards.
  const s = build([enter(0, 'M001'), drop(90, [['item_A', 1]])]);
  assert.equal(rates(s, price, 12).currentRunElapsed, 90);
  assert.equal(timeInRuns(s, 12), 90);
});

test('the live clock stretches the rates as well as the timer', () => {
  // Everything divides by time in runs, so a frozen clock makes g/hr lurch
  // upward on every pickup and sag between them.
  const s = build([enter(0, 'M001'), drop(1, [['item_A', 1]])]);
  assert.equal(rates(s, price, 100).activeTime, 100);
  assert.equal(rates(s, price, 100).goldPerHour, 3600, '100 gold over 100s');
  assert.equal(itemTotals(s, 100)[0]!.perHour, 36);
});

test('a finished run is not stretched by the clock moving on', () => {
  // Only the open run tracks real time; a run that ended is measured by the
  // timestamps it ended with, whenever anyone happens to ask.
  const s = build([enter(0, 'M001'), exit(60, 'M001', 'clear')]);
  assert.equal(rates(s, price, 5000).activeTime, 60);
  assert.equal(byRoom(s, price, 5000)[0]!.averageClear, 60);
});

// --- per room ---------------------------------------------------------------

test('per-room averages separate rooms and ignore abandoned runs', () => {
  const s = build([
    enter(0, 'M001'),
    drop(5, [['item_A', 2]]),
    exit(100, 'M001', 'clear'),
    enter(200, 'M003'),
    exit(500, 'M003', 'clear'),
    enter(600, 'M001'),
    exit(700, 'M001', 'clear'),
  ]);
  const rooms = byRoom(s, price);
  const m001 = rooms.find((r) => r.room === 'M001')!;
  const m003 = rooms.find((r) => r.room === 'M003')!;
  assert.equal(m001.runs, 2);
  assert.equal(m001.averageClear, 100);
  assert.equal(m001.totalItems, 2);
  assert.equal(m001.totalGold, 200, 'two item_A at 100 each, priced from the drops');
  assert.equal(m003.runs, 1);
  assert.equal(m003.averageClear, 300);
});

// --- clearing the session ---------------------------------------------------

test('clearing keeps tracking the room the player is standing in', () => {
  const before = build([
    enter(0, 'M001'),
    bag(1, 0, 0, 1000),
    drop(5, [['item_A', 2]]),
    exit(100, 'M001', 'clear', 1400),
    enter(200, 'M003', 2),
    bag(210, 3, 300, 1500),
    drop(240, [['item_B', 4]]),
    bag(260, 7, 700, 1900),
  ]);

  const after = resetState(before);

  assert.equal(after.runs.length, 0);
  assert.equal(itemTotals(after).length, 0);
  assert.equal(rates(after, price).completedRuns, 0);
  assert.equal(rates(after, price).goldPerHour, 0);

  // Still in M003, with the timer and the gold baseline restarted from now.
  assert.equal(after.current?.room, 'M003');
  assert.equal(after.current?.level, 2);
  assert.equal(rates(after, price).currentRunElapsed, 0);
  assert.equal(after.current?.goldAtStart, 1900);

  // And it picks straight back up from the next event.
  applyAll(after, [drop(280, [['item_C', 1]]), bag(300, 8, 800, 2100)]);
  assert.equal(itemTotals(after).length, 1);
  assert.equal(rates(after, price).currentRunElapsed, 40);
  assert.equal(rates(after, price).currentRunGold, 200);
});

test('clearing between rooms leaves no run open', () => {
  const before = build([enter(0, 'M001'), bag(1, 0, 0, 500), exit(60, 'M001', 'clear', 900)]);
  const after = resetState(before);
  assert.equal(after.current, null);
  assert.equal(after.runs.length, 0);
  assert.equal(rates(after, price).goldPerHour, 0);
});

// --- the mock ---------------------------------------------------------------

test('the mock timeline is deterministic for a given seed', () => {
  const a = buildMockTimeline({ seed: 42 });
  const b = buildMockTimeline({ seed: 42 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, buildMockTimeline({ seed: 43 }));
});

test('the mock exercises every event kind and the chained path', () => {
  const timeline = buildMockTimeline();
  const kinds = new Set(timeline.map((x) => x.event.e));
  assert.deepEqual([...kinds].sort(), ['backpack', 'drop', 'room_enter', 'room_exit']);

  const s = applyAll(createState(), timeline.map((x) => x.event));
  const r = rates(s, price);
  // One scripted run never reports an exit, and the next room starts moments
  // later — the shape of a player walking straight on.
  assert.ok(
    s.runs.some((run) => run.outcome === 'chained'),
    'the script must include a run the next room ended',
  );
  // The abandoned path is a *silence*, and the mock deliberately does not
  // simulate one: five dead minutes in the middle of the development feed
  // would cost more than the coverage is worth. `core/stats.test.ts` has it.
  assert.equal(r.abandonedRuns, 0);
  assert.ok(r.completedRuns >= 3);
  assert.ok(r.goldPerHour > 0 && r.itemsPerHour > 0, 'the UI needs non-zero numbers to render');
  assert.ok(byRoom(s, price).length >= 2, 'more than one room, so the per-room table has rows');
});

test('the mock round-trips through the real parser', () => {
  // Proves the mock and the live tail are interchangeable: the same bytes the
  // addon is being asked to print parse back to the same events.
  const timeline = buildMockTimeline({ seed: 7 });
  const lines = timeline.map((x) => `08/16 17:30:40 [PanoramaScript] ${formatLine(x.event)}`);
  const { events, skipped } = parseLines(lines);
  assert.equal(skipped.length, 0);
  assert.deepEqual(events, timeline.map((x) => x.event));
});

/*
 * The skull button.
 *
 * The addon reports nothing when the player dies, so a room that killed them
 * arrives looking exactly like one they cleared. Marking it is the player's
 * correction to the feed, which makes it the one outcome set after the fact —
 * and the one that has to survive whatever the feed says next.
 */

test('a dead run keeps its minutes and loses its loot', () => {
  const s = build([
    enter(0, 'M001'),
    drop(50, [['item_A', 2]]),
    exit(100, 'M001', 'clear'),
    enter(100, 'M002'),
    drop(150, [['item_A', 3]]),
    exit(200, 'M002', 'clear'),
  ]);

  const before = rates(s, price);
  assert.equal(before.completedRuns, 2);
  assert.equal(itemTotals(s).find((i) => i.id === 'item_A')?.qty, 5);

  assert.equal(toggleLastRunDead(s), true);

  const after = rates(s, price);
  assert.equal(after.diedRuns, 1);
  assert.equal(after.completedRuns, 1, 'a room you died in is not a room you finished');
  assert.equal(itemTotals(s).find((i) => i.id === 'item_A')?.qty, 2, 'the three it dropped are written off');
  assert.equal(
    after.activeTime,
    before.activeTime,
    'the time still counts — dying cost those minutes as surely as clearing would have',
  );
  assert.ok(after.goldPerHour < before.goldPerHour, 'so the rate falls rather than flattering the session');
});

test('pressing the skull again puts the loot back exactly as it was', () => {
  const s = build([enter(0, 'M001'), drop(50, [['item_A', 2]]), exit(100, 'M001', 'clear')]);
  const before = rates(s, price);

  toggleLastRunDead(s);
  assert.equal(isLastRunDead(s), true);
  assert.deepEqual(itemTotals(s), [], 'every drop came from the room that was written off');

  assert.equal(toggleLastRunDead(s), false);
  assert.equal(isLastRunDead(s), false);
  assert.equal(s.runs[0]!.outcome, 'clear', 'the outcome the feed reported, not a guess at it');
  assert.deepEqual(rates(s, price), before);
});

test('a room marked dead while still open stays dead when the next one starts', () => {
  // Dying and walking straight on would otherwise close the run as `chained`
  // and quietly hand its loot back to the session.
  const s = build([enter(0, 'M001'), drop(50, [['item_A', 4]])]);
  toggleLastRunDead(s);

  applyAll(s, [enter(90, 'M002'), drop(120, [['item_B', 1]])]);

  assert.equal(s.runs[0]!.outcome, 'died');
  assert.equal(itemTotals(s).find((i) => i.id === 'item_A'), undefined);
  assert.equal(itemTotals(s).find((i) => i.id === 'item_B')?.qty, 1, 'the room you are in now is unaffected');
});

test('a dead room is not the one the per-room table recommends', () => {
  const s = build([enter(0, 'M001'), drop(50, [['item_A', 9]]), exit(100, 'M001', 'clear')]);
  toggleLastRunDead(s);
  const room = byRoom(s, price).find((r) => r.room === 'M001');
  assert.equal(room?.totalItems, 0);
  assert.equal(room?.totalGold, 0);
});

test('the skull does nothing at all before the first room', () => {
  const s = createState();
  assert.equal(toggleLastRunDead(s), false);
  assert.equal(isLastRunDead(s), false);
});

/**
 * The map row, which is two cards about one room and therefore has to agree
 * with itself. The gold half is summed off the loot list in the renderer, and
 * the list goes on showing a room's drops until the next room starts — so the
 * time half has to follow the same run or the row describes two different ones.
 */

test('the map clock follows the room the loot list is showing', () => {
  const s = build([enter(0, 'M001'), drop(10, [['item_A', 5]]), exit(120, 'M001')]);
  const r = rates(s, price, 200);
  // The bug this exists for: the list still has the room's five items on it,
  // and the card beside it read 00:00.
  assert.deepEqual(runItems(s), [{ id: 'item_A', qty: 5 }], 'the list still shows the room you left');
  assert.equal(r.mapElapsed, 120, 'and the card still shows how long it took');
  assert.equal(r.currentRunElapsed, 0, 'while "is a run open" keeps its own honest answer');
});

test('the map clock is the open run while there is one', () => {
  const s = build([enter(0, 'M001'), exit(60, 'M001'), enter(90, 'M002')]);
  // Not the 60-second room that came before it: entering empties the list, so
  // the card has to move to the new room at the same moment.
  assert.equal(rates(s, price, 100).mapElapsed, 10);
  assert.equal(rates(s, price, 100).currentRunElapsed, 10, 'and they agree while a run is open');
});

test('the map clock is zero only when nothing has been entered at all', () => {
  const s = createState();
  assert.equal(rates(s, price, 500).mapElapsed, 0, 'no room yet is the one case with nothing to describe');
});
