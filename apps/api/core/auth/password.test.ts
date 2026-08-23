import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMS, hashPassword, verifyAgainstNobody, verifyPassword } from './password.ts';

test('a password verifies against its own hash', async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', stored), true);
});

test('a different password does not', async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery stapler', stored), false);
});

test('the hash is salted, so the same password stores differently every time', async () => {
  const a = await hashPassword('same password');
  const b = await hashPassword('same password');
  assert.notEqual(a, b);
  // Both still verify — which is the point of saying so.
  assert.equal(await verifyPassword('same password', a), true);
  assert.equal(await verifyPassword('same password', b), true);
});

test('the stored form names its algorithm and cost', async () => {
  const stored = await hashPassword('whatever');
  const [algorithm, cost] = stored.split('$');
  assert.equal(algorithm, 'scrypt');
  assert.equal(cost, `N=${DEFAULT_PARAMS.N},r=${DEFAULT_PARAMS.r},p=${DEFAULT_PARAMS.p}`);
});

test('a row written at a different cost still verifies', async () => {
  // The reason the parameters are in the string at all: raising them later must
  // not lock anybody out of an account they already have.
  const cheap = await hashPassword('legacy password', { N: 1024, r: 8, p: 1 });
  assert.match(cheap, /^scrypt\$N=1024,/);
  assert.equal(await verifyPassword('legacy password', cheap), true);
  assert.equal(await verifyPassword('wrong', cheap), false);
});

test('unicode passwords survive the round trip', async () => {
  const stored = await hashPassword('пароль с пробелами 🎲');
  assert.equal(await verifyPassword('пароль с пробелами 🎲', stored), true);
  assert.equal(await verifyPassword('пароль с пробелами', stored), false);
});

test('a very long password is not truncated to a shorter one', async () => {
  const long = 'a'.repeat(200);
  const stored = await hashPassword(long);
  assert.equal(await verifyPassword(long, stored), true);
  assert.equal(await verifyPassword('a'.repeat(199), stored), false);
});

test('an unreadable stored value is a failed sign-in, never a throw', async () => {
  const rubbish = [
    '',
    'not a hash',
    'scrypt$N=16384,r=8,p=1$onlythreeparts',
    'scrypt$N=16384,r=8,p=1$c2FsdA$aGFzaA$extra',
    // An algorithm this code does not implement.
    'argon2id$m=65536,t=3,p=4$c2FsdA$aGFzaA',
    // Missing p.
    'scrypt$N=16384,r=8$c2FsdA$aGFzaA',
    // N is not a power of two, which scrypt itself would reject.
    'scrypt$N=16000,r=8,p=1$c2FsdA$aGFzaA',
    // Non-numeric cost.
    'scrypt$N=abc,r=8,p=1$c2FsdA$aGFzaA',
    // Empty salt and hash.
    'scrypt$N=16384,r=8,p=1$$',
  ];
  for (const stored of rubbish) {
    assert.equal(await verifyPassword('anything', stored), false, `should have refused: ${JSON.stringify(stored)}`);
  }
});

test('a truncated hash does not verify, even against the right password', async () => {
  // The interesting one. `verify` derives a key as long as the stored hash, so
  // without a floor on that length a row truncated to a byte would match one
  // password in 256 — and the correct password would match a truncated row
  // every time, since a prefix of the right answer is still the right answer.
  const stored = await hashPassword('a password');
  const parts = stored.split('$');
  for (const kept of [1, 4, 10, 40]) {
    parts[3] = parts[3]!.slice(0, kept);
    assert.equal(await verifyPassword('a password', parts.join('$')), false, `hash cut to ${kept} chars`);
  }
});

test('a truncated salt does not verify either', async () => {
  const stored = await hashPassword('a password');
  const parts = stored.split('$');
  parts[2] = parts[2]!.slice(0, 4);
  assert.equal(await verifyPassword('a password', parts.join('$')), false);
});

test('parameters outside sane bounds are refused without asking scrypt for the memory', async () => {
  // `maxmem` is derived from N and r, so an absurd N in a corrupted row would
  // otherwise turn into a colossal allocation request. This has to be fast, and
  // "fast" is half the assertion.
  const started = Date.now();
  for (const cost of ['N=1073741824,r=8,p=1', 'N=512,r=8,p=1', 'N=16384,r=0,p=1', 'N=16384,r=8,p=99']) {
    assert.equal(await verifyPassword('x', `scrypt$${cost}$c2FsdHNhbHRzYWx0c2FsdA$${'A'.repeat(43)}`), false);
  }
  assert.ok(Date.now() - started < 1000, 'bounds should be rejected before any hashing happens');
});

test('an unknown nickname burns the same work a real check would', async () => {
  const real = await hashPassword('a real password');
  const timed = async (fn: () => Promise<boolean>) => {
    const started = process.hrtime.bigint();
    await fn();
    return Number(process.hrtime.bigint() - started) / 1e6;
  };
  const wrongPassword = await timed(() => verifyPassword('guess', real));
  const noSuchUser = await timed(() => verifyAgainstNobody('guess'));
  // Same order of magnitude is the claim, not the same millisecond — this is
  // about not leaking "that account exists" through a 100 ms gap.
  assert.ok(
    noSuchUser > wrongPassword / 4,
    `no-such-user ${noSuchUser.toFixed(1)}ms vs wrong-password ${wrongPassword.toFixed(1)}ms`,
  );
});
