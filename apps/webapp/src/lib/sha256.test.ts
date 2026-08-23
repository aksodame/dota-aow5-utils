import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex } from './sha256.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

test('the FIPS 180-2 vectors', () => {
  // If these are wrong, every challenge the server issues is unsolvable and the
  // sign-up form spins forever — so they are worth stating literally.
  assert.equal(sha256Hex(utf8('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex(utf8('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256Hex(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('it agrees with node:crypto across lengths that straddle the block boundary', () => {
  // 55/56/57 and 63/64/65 are where the padding rules change, and where a
  // hand-written implementation goes wrong if it is going to.
  for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 200, 1000]) {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) bytes[i] = (i * 31 + 7) & 0xff;
    assert.equal(sha256Hex(bytes), createHash('sha256').update(bytes).digest('hex'), `length ${length}`);
  }
});

test('it agrees with node:crypto on the exact strings the solver hashes', () => {
  // salt + nonce, which is the only input shape this is ever used for.
  const salt = 'Zm9vYmFyYmF6cXV4';
  for (const nonce of [0, 1, 9, 10, 99, 100, 65535, 1_000_000, 2_147_483_647]) {
    const message = `${salt}${nonce}`;
    assert.equal(
      sha256Hex(utf8(message)),
      createHash('sha256').update(message, 'utf8').digest('hex'),
      `nonce ${nonce}`,
    );
  }
});

test('reusing the internal buffers does not leak state between calls', () => {
  // The working arrays are module-scope so the hot loop does not allocate. That
  // is only safe if every call fully reinitialises them.
  const first = sha256Hex(utf8('abc'));
  sha256Hex(utf8('a much longer message that spans more than one compression block, definitely'));
  assert.equal(sha256Hex(utf8('abc')), first);
});

test('unicode is hashed as its UTF-8 bytes', () => {
  const message = 'Вася🎲';
  assert.equal(sha256Hex(utf8(message)), createHash('sha256').update(message, 'utf8').digest('hex'));
});
