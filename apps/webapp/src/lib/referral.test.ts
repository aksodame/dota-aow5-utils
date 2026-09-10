import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_REFERRAL } from 'aow5-api-contract';
import { DEFAULT_REFERRAL, normalizeReferral, referralOnBuild } from './referral.ts';

test('a build with a code of its own shows that one', () => {
  assert.equal(referralOnBuild('ABCD1234'), 'ABCD1234');
});

test('a build without one shows the site’s', () => {
  // The point of the fallback: a reader who wants a code should always find one
  // on the page, and on a build whose author gave none there is no other.
  assert.equal(referralOnBuild(''), DEFAULT_REFERRAL);
  assert.equal(referralOnBuild('   '), DEFAULT_REFERRAL, 'whitespace is not a code');
});

test('what is shown is what the copy button would put on the clipboard', () => {
  // Normalised on the way out as well as in, so a row written before the server
  // normalised — or by hand — still displays and copies the same string.
  assert.equal(referralOnBuild(' abcd1234 '), 'ABCD1234');
  assert.equal(referralOnBuild('ab cd'), normalizeReferral('ab cd'));
});

test('the site’s own code is a legal one', () => {
  // It goes through the same field the server validates, so it has to survive
  // the same cap and the same normalisation untouched.
  assert.equal(normalizeReferral(DEFAULT_REFERRAL), DEFAULT_REFERRAL);
  assert.ok(DEFAULT_REFERRAL.length <= MAX_REFERRAL);
});
