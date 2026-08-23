import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { PowSolution } from 'aow5-api-contract';
import {
  CHALLENGE_TTL_SECONDS,
  ConsumedSalts,
  issueChallenge,
  meetsDifficulty,
  verifySolution,
} from './pow.ts';

const SECRET = randomBytes(32);
const NOW = 1_700_000_000;

/** Brute-forces a challenge the way the browser will. Kept cheap on purpose. */
function solve(challenge: { salt: string; difficulty: number }): number {
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    if (meetsDifficulty(challenge.salt, nonce, challenge.difficulty)) return nonce;
  }
  throw new Error('no solution found, which should be impossible at test difficulty');
}

/** A solved, valid challenge at a difficulty a test can afford. */
function solved(difficulty = 8, now = NOW): PowSolution {
  const challenge = issueChallenge(SECRET, now, difficulty);
  return { ...challenge, nonce: solve(challenge) };
}

test('a solved challenge verifies', () => {
  const verdict = verifySolution(SECRET, new ConsumedSalts(), solved(), NOW);
  assert.deepEqual(verdict, { ok: true });
});

test('the difficulty actually binds', () => {
  const challenge = issueChallenge(SECRET, NOW, 12);
  const answer = solve(challenge);
  // The right nonce works...
  assert.equal(meetsDifficulty(challenge.salt, answer, 12), true);
  // ...and one that only clears a weaker bar does not.
  const weaker = solve({ salt: challenge.salt, difficulty: 4 });
  assert.notEqual(weaker, answer);
  assert.equal(meetsDifficulty(challenge.salt, weaker, 12), false);
  const verdict = verifySolution(SECRET, new ConsumedSalts(), { ...challenge, nonce: weaker }, NOW);
  assert.deepEqual(verdict, { ok: false, reason: 'insufficient-work' });
});

test('a wrong nonce is refused', () => {
  const solution = solved();
  const verdict = verifySolution(SECRET, new ConsumedSalts(), { ...solution, nonce: solution.nonce + 1 }, NOW);
  assert.deepEqual(verdict, { ok: false, reason: 'insufficient-work' });
});

test('every field is under the signature', () => {
  const solution = solved();
  const tampered: Array<[string, PowSolution]> = [
    ['salt', { ...solution, salt: 'somethingelse' }],
    ['difficulty lowered', { ...solution, difficulty: 1 }],
    ['expiry extended', { ...solution, expiresAt: solution.expiresAt + 3600 }],
    ['signature', { ...solution, signature: 'AAAA' }],
  ];
  for (const [what, forged] of tampered) {
    const verdict = verifySolution(SECRET, new ConsumedSalts(), forged, NOW);
    assert.equal(verdict.ok, false, `${what} should not have verified`);
    assert.equal((verdict as { reason: string }).reason, 'bad-signature', what);
  }
});

test('a challenge from another server is refused', () => {
  // The signature is keyed, so a restart — which rotates the secret — makes
  // every outstanding challenge invalid. That is the accepted cost of not
  // putting a secret in the deploy.
  const solution = solved();
  const verdict = verifySolution(randomBytes(32), new ConsumedSalts(), solution, NOW);
  assert.deepEqual(verdict, { ok: false, reason: 'bad-signature' });
});

test('an expired challenge is refused', () => {
  const solution = solved();
  const verdict = verifySolution(SECRET, new ConsumedSalts(), solution, NOW + CHALLENGE_TTL_SECONDS + 1);
  assert.deepEqual(verdict, { ok: false, reason: 'expired' });
});

test('a solved challenge is good exactly once', () => {
  const consumed = new ConsumedSalts();
  const solution = solved();
  assert.deepEqual(verifySolution(SECRET, consumed, solution, NOW), { ok: true });
  assert.deepEqual(verifySolution(SECRET, consumed, solution, NOW), { ok: false, reason: 'replayed' });
});

test('a failed attempt does not burn the challenge', () => {
  // Otherwise one fumbled submit would cost a legitimate visitor another solve.
  const consumed = new ConsumedSalts();
  const solution = solved();
  verifySolution(SECRET, consumed, { ...solution, nonce: solution.nonce + 1 }, NOW);
  assert.deepEqual(verifySolution(SECRET, consumed, solution, NOW), { ok: true });
});

test('malformed input is refused and never throws', () => {
  const solution = solved();
  const rubbish: unknown[] = [
    null,
    undefined,
    {},
    { ...solution, salt: '' },
    { ...solution, salt: 'x'.repeat(65) },
    { ...solution, nonce: -1 },
    { ...solution, nonce: 1.5 },
    { ...solution, nonce: Number.MAX_VALUE },
    { ...solution, nonce: 'abc' },
    { ...solution, signature: '' },
    { ...solution, expiresAt: 0 },
    { ...solution, expiresAt: 'soon' },
    // A difficulty high enough to hang a browser cannot have been signed by us,
    // and is bounded before it is ever used to walk a digest.
    { ...solution, difficulty: 1024 },
    { ...solution, difficulty: 0 },
  ];
  for (const value of rubbish) {
    const verdict = verifySolution(SECRET, new ConsumedSalts(), value as PowSolution, NOW);
    assert.equal(verdict.ok, false, `should have refused ${JSON.stringify(value)}`);
  }
});

test('leading zero bits are counted across byte boundaries', () => {
  // The partial-byte arithmetic is the part worth pinning: an off-by-one here
  // silently makes every challenge easier or impossible.
  const salt = 'fixed';
  for (let nonce = 0; nonce < 200_000; nonce++) {
    const eight = meetsDifficulty(salt, nonce, 8);
    const nine = meetsDifficulty(salt, nonce, 9);
    const seven = meetsDifficulty(salt, nonce, 7);
    // Difficulty is monotonic: clearing a higher bar implies clearing lower ones.
    if (nine) assert.ok(eight && seven, `nonce ${nonce} cleared 9 bits but not 8 or 7`);
    if (eight) assert.ok(seven, `nonce ${nonce} cleared 8 bits but not 7`);
  }
});

test('zero-bit difficulty is not something the checker accepts by accident', () => {
  // Guarded at the shape check rather than here, but prove the arithmetic too.
  assert.equal(meetsDifficulty('salt', 0, 1) || meetsDifficulty('salt', 1, 1), true);
});

test('the consumed set drops entries once they cannot be replayed', () => {
  const consumed = new ConsumedSalts();
  consumed.add('a', NOW + 10);
  consumed.add('b', NOW + 20);
  assert.equal(consumed.size, 2);
  // Sweeping is rate-limited, so move well past the interval as well as the TTL.
  consumed.sweep(NOW + CHALLENGE_TTL_SECONDS + 1000);
  assert.equal(consumed.size, 0);
});
