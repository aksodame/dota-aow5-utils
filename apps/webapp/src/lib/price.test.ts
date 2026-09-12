import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PRICE } from 'aow5-api-contract';
import { formatPrice, formatPriceExact } from './price.ts';

test('the ladder the format was specified by', () => {
  // Straight from the request: these nine are what the format has to produce.
  assert.equal(formatPrice(1_000), '1k');
  assert.equal(formatPrice(10_000), '10k');
  assert.equal(formatPrice(100_000), '100k');
  assert.equal(formatPrice(1_000_000), '1m');
  assert.equal(formatPrice(10_000_000), '10m');
  assert.equal(formatPrice(100_000_000), '100m');
  assert.equal(formatPrice(1_000_000_000), '1b');
  assert.equal(formatPrice(1_500_000_000), '1.5b');
  assert.equal(formatPrice(2_000_000_000), '2b');
});

test('a whole unit drops the decimal, a partial one keeps exactly one', () => {
  assert.equal(formatPrice(2_500), '2.5k');
  assert.equal(formatPrice(12_300), '12.3k');
  assert.equal(formatPrice(1_050_000), '1m', 'the tenths digit is 0, so it goes');
  assert.equal(formatPrice(1_250_000), '1.2m');
});

test('truncated rather than rounded, so a price is never overstated', () => {
  // The whole point: `2b` here would tell somebody the build is within reach
  // of two billion when it is one gold short of it.
  assert.equal(formatPrice(1_999_999_999), '1.9b');
  assert.equal(formatPrice(999_999), '999.9k', 'and the unit cannot be promoted by rounding');
  assert.equal(formatPrice(1_999), '1.9k');
});

test('under a thousand is written out, because it is already short', () => {
  assert.equal(formatPrice(1), '1');
  assert.equal(formatPrice(750), '750');
  assert.equal(formatPrice(999), '999');
});

test('nonsense renders as a number rather than as NaN', () => {
  // Nothing should reach this — zero is "not given" and the callers check for
  // it — but a hand-edited request must not paint `NaN.5b` into a row.
  for (const bad of [0, -1, -5_000, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatPrice(bad), '0', String(bad));
  }
  assert.equal(formatPrice(1_500.9), '1.5k', 'a fraction is floored, not rounded up');
});

test('the cap is representable, and nothing renders past it', () => {
  assert.equal(formatPrice(MAX_PRICE), '4b');
  // Past the cap the server would have refused the write, so this is only ever
  // reached by data that predates the limit. Clamping beats a five-digit `b`.
  assert.equal(formatPrice(MAX_PRICE * 3), '4b');
});

test('the exact form groups without committing to a separator', () => {
  // A non-breaking space: `1,500,000` reads as a decimal to a Russian speaker
  // and `1.500.000` reads as one to an English speaker. A space is neither, and
  // this one cannot wrap a price across two lines. Escaped in the expectation
  // for the same reason it is escaped in the source.
  const nb = '\u00a0';
  assert.equal(formatPriceExact(1_500_000), `1${nb}500${nb}000`);
  assert.equal(formatPriceExact(750), '750');
  assert.equal(formatPriceExact(0), '0');
  assert.equal(formatPriceExact(MAX_PRICE), `4${nb}000${nb}000${nb}000`);
});
