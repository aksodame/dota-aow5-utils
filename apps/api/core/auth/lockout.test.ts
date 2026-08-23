import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FREE_ATTEMPTS, MAX_LOCKOUT_SECONDS, lockoutSeconds, remainingLockout } from './lockout.ts';

test('the first few misses cost nothing', () => {
  for (let attempts = 0; attempts <= FREE_ATTEMPTS; attempts += 1) {
    assert.equal(lockoutSeconds(attempts), 0, `${attempts} attempts should not lock`);
  }
});

test('the wait doubles once the free attempts are gone', () => {
  assert.equal(lockoutSeconds(FREE_ATTEMPTS + 1), 1);
  assert.equal(lockoutSeconds(FREE_ATTEMPTS + 2), 2);
  assert.equal(lockoutSeconds(FREE_ATTEMPTS + 3), 4);
  assert.equal(lockoutSeconds(FREE_ATTEMPTS + 4), 8);
});

test('the wait is capped, and never becomes permanent', () => {
  // With no password recovery, a lockout that did not expire would be a
  // stranger's one-way button for destroying any account on the site.
  for (const attempts of [20, 100, 10_000, Number.MAX_SAFE_INTEGER]) {
    assert.equal(lockoutSeconds(attempts), MAX_LOCKOUT_SECONDS, `${attempts} attempts`);
  }
});

test('the remaining wait counts down and then clears', () => {
  assert.equal(remainingLockout(null, 1000), 0);
  assert.equal(remainingLockout(1200, 1000), 200);
  assert.equal(remainingLockout(1000, 1000), 0);
  assert.equal(remainingLockout(900, 1000), 0);
});
