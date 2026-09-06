import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REPORT_NOTICE_INTERVAL_MS,
  REPORT_NOTICE_VERSION,
  acknowledgement,
  isAcknowledged,
  msRemaining,
} from './reportNotice.ts';

/*
 * Two rules, and both decide whether somebody sees the notice again:
 * an acknowledgement expires after the interval, and bumping the version
 * expires every acknowledgement at once.
 */

const NOW = 1_760_000_000_000;

test('nothing stored means the notice is due', () => {
  assert.equal(isAcknowledged(null, NOW), false);
  assert.equal(msRemaining(null, NOW), 0);
});

test('a fresh acknowledgement holds for the whole interval', () => {
  const stored = acknowledgement(NOW);
  assert.equal(isAcknowledged(stored, NOW), true);
  assert.equal(msRemaining(stored, NOW), REPORT_NOTICE_INTERVAL_MS);
});

test('it expires exactly at the interval, not after it', () => {
  const stored = acknowledgement(NOW);
  assert.equal(isAcknowledged(stored, NOW + REPORT_NOTICE_INTERVAL_MS - 1), true);
  assert.equal(isAcknowledged(stored, NOW + REPORT_NOTICE_INTERVAL_MS), false);
});

test('the remaining time counts down', () => {
  const stored = acknowledgement(NOW);
  assert.equal(msRemaining(stored, NOW + 60_000), REPORT_NOTICE_INTERVAL_MS - 60_000);
  assert.equal(msRemaining(stored, NOW + REPORT_NOTICE_INTERVAL_MS * 2), 0);
});

test('bumping the version expires acknowledgements immediately', () => {
  assert.equal(isAcknowledged(`0:${NOW}`, NOW), false);
  assert.equal(isAcknowledged(`${REPORT_NOTICE_VERSION}:${NOW}`, NOW), true);
});

test('a timestamp from the future is not trusted', () => {
  // A clock that moved backwards would otherwise suppress the notice for as
  // long as the machine stayed wrong.
  assert.equal(isAcknowledged(acknowledgement(NOW + 60_000), NOW), false);
});

test('junk in storage means the notice is due', () => {
  for (const stored of ['', 'true', '1', '1:', '1:abc', 'nonsense']) {
    assert.equal(isAcknowledged(stored, NOW), false, stored);
  }
});
