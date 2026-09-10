import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { meetsDifficulty, sha256Prefix32 } from './sha256.ts';

/** The first four bytes of Node's own digest, as the same big-endian number. */
function truth(input: string): number {
  return createHash('sha256').update(input, 'ascii').digest().readUInt32BE(0) >>> 0;
}

test('the known vectors, against the standard', () => {
  // The two every SHA-256 implementation is checked against first, plus the
  // empty string — which is the one that exercises the padding path alone.
  for (const input of ['', 'abc', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq']) {
    assert.equal(sha256Prefix32(input), truth(input), JSON.stringify(input.slice(0, 20)));
  }
});

test('the block boundaries, which is where a padding bug lives', () => {
  /*
   * 55 bytes is the last input that fits in one block with its length field;
   * 56 is the first that needs a second. Both sides of that, and both sides of
   * the next boundary, because an off-by-one in the block count produces a
   * digest that is wrong only for some lengths.
   */
  for (const length of [54, 55, 56, 57, 63, 64, 65, 119, 120, 121]) {
    const input = 'a'.repeat(length);
    assert.equal(sha256Prefix32(input), truth(input), `${length} bytes`);
  }
});

test('the inputs this is actually given', () => {
  // A base64url salt and a decimal nonce, which is every string it will ever
  // see in production.
  const salt = 'Zm9vYmFyYmF6cXV4MDE';
  for (const nonce of [0, 1, 7, 1_000, 262_144, 9_007_199_254_740_991]) {
    const input = `${salt}${nonce}`;
    assert.equal(sha256Prefix32(input), truth(input), input);
  }
});

test('difficulty is counted in leading zero bits', () => {
  const salt = 'test-salt';
  // Found by walking, so the assertion is about a real digest rather than a
  // number chosen to make it pass.
  let nonce = 0;
  while (!meetsDifficulty(salt, nonce, 12)) nonce += 1;

  assert.ok(meetsDifficulty(salt, nonce, 12), 'the solution meets what it was found for');
  assert.ok(meetsDifficulty(salt, nonce, 8), 'and everything easier');
  // Node's own digest agrees about the same nonce, which is the property that
  // matters: the server checks with `createHash`, this hunts with the above.
  const digest = createHash('sha256').update(`${salt}${nonce}`).digest();
  assert.equal(digest[0], 0);
  assert.equal(digest[1]! >> 4, 0);
});

test('zero bits is free, and more than the prefix holds is refused', () => {
  assert.ok(meetsDifficulty('x', 0, 0), 'nothing asked, nothing to do');
  // Only 32 bits are computed, so a challenge past that must fail loudly here
  // rather than pass on a digest nobody looked at.
  assert.equal(meetsDifficulty('x', 0, 33), false);
});
