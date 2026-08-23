import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatLine, type TrackerEvent } from '../events.ts';
import { applyAll, createState } from '../stats.ts';
import { buildMockTimeline } from './mock.ts';
import { startConsoleSource } from './console.ts';

/**
 * Covers the tail against two feeds, because they are not the same feed.
 *
 * The mock timeline proves the live adapter and the mock stay interchangeable,
 * so anything built against the mock holds on the real thing. The verbatim
 * session log below proves the narrower shape the addon actually ships — no
 * `t`, a `player` slot — still lands as a timed run, which is exactly what
 * regressed the first time the real lines arrived.
 */

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aow5-')), 'console.log');
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

test('tailing a log yields exactly the events the mock would have emitted', async () => {
  const file = tmp();
  const timeline = buildMockTimeline({ seed: 7 });
  // Written the way Dota writes it: a timestamp and a subsystem tag per line.
  fs.writeFileSync(file, timeline.map((x) => `08/16 17:30:40 [PanoramaScript] ${formatLine(x.event)}\n`).join(''));

  const seen: TrackerEvent[] = [];
  const handle = startConsoleSource(file, (e) => seen.push(e), { interval: 20, fromStart: true });
  await settle();
  handle.stop();

  assert.deepEqual(seen, timeline.map((x) => x.event));
});

test('appended lines are picked up, and a line split across reads is not lost', async () => {
  const file = tmp();
  fs.writeFileSync(file, '');
  const seen: TrackerEvent[] = [];
  const handle = startConsoleSource(file, (e) => seen.push(e), { interval: 20, fromStart: true });
  await settle(60);

  const line = formatLine({ v: 1, e: 'room_enter', t: 10, room: 'M001' });
  // Write the line in two halves with a poll in between, so the tail has to
  // carry the partial fragment rather than parse it as garbage.
  fs.appendFileSync(file, line.slice(0, 20));
  await settle(60);
  fs.appendFileSync(file, `${line.slice(20)}\n`);
  await settle(80);
  handle.stop();

  assert.equal(seen.length, 1, 'the split line produced exactly one event');
  assert.equal(seen[0]!.e, 'room_enter');
});

test('a truncated log is treated as a new session rather than replayed', async () => {
  const file = tmp();
  fs.writeFileSync(file, `${formatLine({ v: 1, e: 'room_enter', t: 1, room: 'M001' })}\n`);
  const seen: TrackerEvent[] = [];
  const handle = startConsoleSource(file, (e) => seen.push(e), { interval: 20, fromStart: true });
  await settle(80);
  assert.equal(seen.length, 1);

  // Dota restarting truncates the file; offset must reset or nothing is read.
  fs.writeFileSync(file, `${formatLine({ v: 1, e: 'room_enter', t: 2, room: 'M003' })}\n`);
  await settle(120);
  handle.stop();

  assert.equal(seen.length, 2, 'the post-restart line was read');
  assert.equal(seen[1]!.e === 'room_enter' ? seen[1]!.room : null, 'M003');
});

test('a missing log file is waited for, not an error', async () => {
  const file = path.join(os.tmpdir(), `aow5-missing-${Date.now()}.log`);
  const seen: TrackerEvent[] = [];
  let errored = false;
  const handle = startConsoleSource(file, (e) => seen.push(e), {
    interval: 20,
    fromStart: true,
    onError: () => {
      errored = true;
    },
  });
  await settle(80);
  handle.stop();

  assert.equal(seen.length, 0);
  assert.equal(errored, false, 'Dota simply has not been launched yet; that is not a failure');
});

test('a real session of shipped lines tails into a timed run', async () => {
  const file = tmp();
  // Verbatim from a 2026-08-22 session log. No `t` on any payload and a
  // `player` slot on the pickups — the shape that skipped 107 lines out of 107
  // before the tail learned to read the clock off the line itself.
  fs.writeFileSync(
    file,
    [
      '08/22 14:15:05 [PanoramaScript] [AOW5TRK] {"v":1,"e":"room_enter","room":"M009"}',
      '08/22 14:15:11 [PanoramaScript] [AOW5TRK] {"v":1,"e":"drop","items":[["item_2021",1]],"player":0}',
      '08/22 14:15:11 [PanoramaScript] [AOW5TRK] {"v":1,"e":"drop","items":[["item_M535",2]],"player":0}',
      '08/22 14:17:35 [PanoramaScript] [AOW5TRK] {"v":1,"e":"room_exit","room":"M009","reason":"clear"}',
    ].join('\n') + '\n',
  );

  const seen: TrackerEvent[] = [];
  const skips: { line: string; reason: string }[] = [];
  const handle = startConsoleSource(file, (e) => seen.push(e), {
    interval: 20,
    fromStart: true,
    onSkipped: (s) => skips.push(...s),
  });
  await settle();
  handle.stop();

  assert.deepEqual(skips, [], 'nothing the addon ships today is unreadable');
  assert.equal(seen.length, 4);

  const state = applyAll(createState(), seen);
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0]!.outcome, 'clear');
  assert.equal(state.runs[0]!.end! - state.runs[0]!.start, 150, 'timed off the console timestamps');
  assert.equal(state.items.get('item_M535'), 2);
});

test('junk in the log is reported without stopping the tail', async () => {
  const file = tmp();
  fs.writeFileSync(
    file,
    [
      '08/16 17:22:18 [RenderSystem] Determined driver version',
      '[AOW5TRK] {"v":1,"e":"nonsense","t":1}',
      formatLine({ v: 1, e: 'room_enter', t: 5, room: 'M001' }),
    ].join('\n') + '\n',
  );

  const seen: TrackerEvent[] = [];
  const skips: { line: string; reason: string }[] = [];
  const handle = startConsoleSource(file, (e) => seen.push(e), {
    interval: 20,
    fromStart: true,
    onSkipped: (s) => skips.push(...s),
  });
  await settle();
  handle.stop();

  assert.equal(seen.length, 1, 'the good line after the bad one still arrived');
  assert.equal(skips.length, 1);
  assert.match(skips[0]!.reason, /unknown event kind/);
});
