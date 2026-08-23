import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expectedAttempts, meetsDifficulty, solve } from './pow.ts';

/** The server's own check, so the two are compared rather than assumed equal. */
function serverSide(salt: string, nonce: number, bits: number): boolean {
  const digest = createHash('sha256').update(`${salt}${nonce}`).digest();
  let remaining = bits;
  let index = 0;
  while (remaining >= 8) {
    if (digest[index] !== 0) return false;
    index += 1;
    remaining -= 8;
  }
  return remaining === 0 || digest[index]! >> (8 - remaining) === 0;
}

test('the client and the server agree on what counts as solved', () => {
  // The one bug that would make sign-up impossible while every unit test on
  // either side passed on its own.
  for (let nonce = 0; nonce < 3000; nonce += 1) {
    for (const bits of [1, 4, 7, 8, 9, 12, 16]) {
      assert.equal(meetsDifficulty('salt', nonce, bits), serverSide('salt', nonce, bits), `nonce ${nonce}/${bits}`);
    }
  }
});

test('a solution actually satisfies the difficulty it was asked for', () => {
  for (const bits of [4, 8, 12]) {
    const nonce = solve('a-salt', bits);
    assert.notEqual(nonce, null);
    assert.equal(serverSide('a-salt', nonce!, bits), true, `${bits} bits`);
  }
});

test('difficulty is monotonic', () => {
  for (let nonce = 0; nonce < 5000; nonce += 1) {
    if (meetsDifficulty('s', nonce, 9)) assert.ok(meetsDifficulty('s', nonce, 8), `nonce ${nonce}`);
  }
});

test('progress is reported and cancellation is honoured', () => {
  let seen = 0;
  const nonce = solve('never-solved', 32, {
    reportEvery: 100,
    onProgress: (attempts) => {
      seen = attempts;
    },
    // Give up after a few reports rather than grinding at an impossible target.
    shouldStop: () => seen >= 500,
  });
  assert.equal(nonce, null, 'cancelling returns null rather than a wrong answer');
  assert.ok(seen >= 400, `progress should have been reported, saw ${seen}`);
});

test('solutions vary between runs, so nobody is precomputing a shared table', () => {
  const first = solve('same-salt', 8);
  let differed = false;
  for (let i = 0; i < 10 && !differed; i += 1) differed = solve('same-salt', 8) !== first;
  assert.ok(differed, 'the search should not start from the same place every time');
});

test('expectedAttempts is the power of two it says it is', () => {
  assert.equal(expectedAttempts(1), 2);
  assert.equal(expectedAttempts(18), 262_144);
});
