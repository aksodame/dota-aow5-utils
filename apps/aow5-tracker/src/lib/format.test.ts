import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, compact, percent } from './format.ts';

test('compact drops a decimal that says nothing', () => {
  assert.equal(compact(123_000), '123k');
  assert.equal(compact(1_000), '1k');
  assert.equal(compact(2_000_000), '2M');
});

test('compact keeps a decimal that does', () => {
  assert.equal(compact(123_100), '123.1k');
  assert.equal(compact(1_234), '1.2k');
  assert.equal(compact(123_100_000), '123.1M');
});

test('compact capitalises millions and not thousands', () => {
  assert.equal(compact(5_000_000), '5M');
  assert.equal(compact(5_000), '5k');
});

test('compact leaves small numbers whole', () => {
  assert.equal(compact(0), '0');
  assert.equal(compact(999), '999');
  assert.equal(compact(12.7), '13');
});

test('compact survives what a rate can produce', () => {
  assert.equal(compact(Number.NaN), '0');
  assert.equal(compact(Number.POSITIVE_INFINITY), '0');
  assert.equal(compact(-1_500), '-1.5k');
  assert.equal(compact(-2_000), '-2k');
});

test('clock grows to hours only when there are hours', () => {
  assert.equal(clock(0), '00:00');
  assert.equal(clock(59), '00:59');
  assert.equal(clock(90), '01:30');
  assert.equal(clock(3_600), '1:00:00');
  assert.equal(clock(-5), '00:00');
});

test('percent rounds to whole points', () => {
  assert.equal(percent(0.92), '92%');
  assert.equal(percent(1), '100%');
  assert.equal(percent(0), '0%');
});
