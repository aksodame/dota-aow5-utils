import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDay, wasRevised } from './dates.ts';

/**
 * Written to be true in any timezone the machine running it happens to be in.
 * A date rendered at a fixed local offset is a test that fails in CI and
 * nowhere else, which teaches everybody to ignore it.
 */
const DAY = 24 * 60 * 60;

test('a unix second becomes a day somebody can read', () => {
  const stamp = Date.UTC(2026, 8, 3, 12, 0, 0) / 1000;
  const rendered = formatDay(stamp, 'en');
  assert.ok(rendered !== null);
  assert.match(rendered, /2026/);
  assert.match(rendered, /September/);
});

test('the language is the reader’s', () => {
  const stamp = Date.UTC(2026, 8, 3, 12, 0, 0) / 1000;
  assert.notEqual(formatDay(stamp, 'ru'), formatDay(stamp, 'en'));
});

test('a timestamp that is not one renders as nothing rather than as 1970', () => {
  for (const bad of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatDay(bad as number, 'en'), null, String(bad));
  }
});

test('publishing is not an edit', () => {
  const published = Date.UTC(2026, 8, 3) / 1000;
  // Both timestamps are written by the same save, seconds apart.
  assert.equal(wasRevised(published, published + 2), false);
  assert.equal(wasRevised(published, published + DAY - 1), false, 'same day, nothing to report');
  assert.equal(wasRevised(published, published + DAY), true);
  // A draft has no publication date to compare against.
  assert.equal(wasRevised(null, published + 10 * DAY), false);
});
