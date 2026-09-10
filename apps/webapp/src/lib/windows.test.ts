import assert from 'node:assert/strict';
import test from 'node:test';
import { windowsFor } from './windows.ts';

/**
 * The translation from "these rows are visible" to "fetch these offsets".
 *
 * Worth testing in isolation because both of its failure modes are quiet: too
 * few windows leaves rows as permanent skeletons, and unaligned windows file
 * rows at indices they do not belong to, which reads as a list in the wrong
 * order rather than as an error.
 */

test('a range inside one window asks for that window', () => {
  assert.deepEqual(windowsFor(0, 9, 10, 100), [0]);
  assert.deepEqual(windowsFor(2, 7, 10, 100), [0]);
});

test('a range spanning a boundary asks for both', () => {
  assert.deepEqual(windowsFor(7, 14, 10, 100), [0, 10]);
  assert.deepEqual(windowsFor(9, 10, 10, 100), [0, 10]);
});

test('windows are aligned, so overlapping ranges ask for the same ones', () => {
  // The property that makes "already requested" a bounded set: scrolling by one
  // row must not invent a new window starting one row further along.
  const a = windowsFor(12, 25, 10, 100);
  const b = windowsFor(13, 26, 10, 100);
  assert.deepEqual(a, [10, 20]);
  assert.deepEqual(b, [10, 20]);
  for (const offset of [...a, ...b]) assert.equal(offset % 10, 0);
});

test('a long range asks for every window it covers, in order', () => {
  assert.deepEqual(windowsFor(5, 44, 10, 100), [0, 10, 20, 30, 40]);
});

test('nothing past the end is asked for', () => {
  // The list has 52 rows, so there is no window at 60 even if overscan reaches.
  assert.deepEqual(windowsFor(45, 70, 10, 52), [40, 50]);
  assert.deepEqual(windowsFor(60, 80, 10, 52), []);
});

test('the last window is asked for even when it is short', () => {
  // 52 rows means the window at 50 holds two. It must still be fetched.
  assert.deepEqual(windowsFor(50, 51, 10, 52), [50]);
});

test('an empty or impossible range asks for nothing', () => {
  assert.deepEqual(windowsFor(0, -1, 10, 0), [], 'an empty list');
  assert.deepEqual(windowsFor(0, 9, 10, 0), [], 'no rows to cover');
  assert.deepEqual(windowsFor(5, 3, 10, 100), [0], 'end before start still covers the start');
  assert.deepEqual(windowsFor(0, 5, 0, 100), [], 'a zero window size cannot tile anything');
});

test('every row in the range is covered by some window', () => {
  // The property that matters, stated directly rather than by example.
  const size = 10;
  const total = 137;
  for (let start = 0; start < total; start += 7) {
    const end = Math.min(total - 1, start + 23);
    const offsets = windowsFor(start, end, size, total);
    for (let row = start; row <= end; row += 1) {
      const covered = offsets.some((offset) => row >= offset && row < offset + size);
      assert.ok(covered, `row ${row} is in no window for range ${start}-${end}`);
    }
  }
});

test('a fresh nine-row list opens with one window', () => {
  /*
   * The reason the browse scroller is nine rows and not ten, and the reason
   * fetching follows the visible range rather than the rendered one. Both
   * matter: ten visible rows reach index 9, which is still one window, but the
   * first scroll immediately reaches index 10 and asks for a second before the
   * first screen has been read. Nine leaves that row of slack.
   */
  const WINDOW = 10;
  const total = 52;

  assert.deepEqual(windowsFor(0, 8, WINDOW, total), [0], 'nine rows on screen');
  assert.deepEqual(
    windowsFor(0, 8 + 4, WINDOW, total),
    [0, 10],
    'and two if the four rows of overscan were allowed to ask',
  );
});
