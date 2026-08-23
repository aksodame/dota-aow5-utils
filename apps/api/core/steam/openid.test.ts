import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLoginUrl,
  buildReturnTo,
  checkAuthenticationBody,
  isSafeReturnPath,
  isValidResponse,
  parseReturn,
  steamIdFromClaimedId,
} from './openid.ts';

const ORIGIN = 'https://aow5.duckdns.org';
const NONCE = 'abcdef0123456789';
const STEAM_ID = '76561197960287930';

/** What Steam appends on a successful sign-in. */
function returnParams(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    n: NONCE,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': buildReturnTo(ORIGIN, NONCE),
    'openid.response_nonce': '2026-08-23T00:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'Zm9vYmFy',
    ...overrides,
  });
}

test('the login URL asks Steam to identify whoever is signed in', () => {
  const url = new URL(buildLoginUrl(ORIGIN, NONCE));
  assert.equal(url.origin + url.pathname, 'https://steamcommunity.com/openid/login');
  assert.equal(url.searchParams.get('openid.mode'), 'checkid_setup');
  assert.equal(url.searchParams.get('openid.identity'), 'http://specs.openid.net/auth/2.0/identifier_select');
  assert.equal(url.searchParams.get('openid.claimed_id'), 'http://specs.openid.net/auth/2.0/identifier_select');
  // The realm is what the player is shown, so it must be the bare site origin.
  assert.equal(url.searchParams.get('openid.realm'), ORIGIN);
  assert.equal(url.searchParams.get('openid.return_to'), buildReturnTo(ORIGIN, NONCE));
});

test('a well-formed return yields the SteamID and a verification body', () => {
  const check = parseReturn(returnParams(), { siteOrigin: ORIGIN, expectedNonce: NONCE });
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.steamId, STEAM_ID);
  assert.equal(check.verification.get('openid.mode'), 'check_authentication');
});

test('the verification body returns every signed parameter unchanged', () => {
  // Dropping or editing any of these changes what the signature covers, and
  // Steam answers is_valid:false for a reason nobody can debug from the outside.
  const params = returnParams();
  const body = checkAuthenticationBody(params);
  for (const [key, value] of params) {
    if (!key.startsWith('openid.')) continue;
    if (key === 'openid.mode') continue;
    assert.equal(body.get(key), value, `${key} was not passed through`);
  }
  assert.equal(body.get('n'), null, 'our own parameters do not belong in the signed set');
});

test('a nonce that does not match the cookie is refused', () => {
  const check = parseReturn(returnParams({ n: 'someone-elses' }), { siteOrigin: ORIGIN, expectedNonce: NONCE });
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.reason, 'bad-nonce');
});

test('a missing nonce is refused rather than treated as empty', () => {
  const params = returnParams();
  params.delete('n');
  const check = parseReturn(params, { siteOrigin: ORIGIN, expectedNonce: NONCE });
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.reason, 'bad-nonce');
});

test('a return_to that is not exactly ours is refused', () => {
  for (const tampered of [
    'https://evil.example/api/auth/steam/return?n=' + NONCE,
    `${ORIGIN}/api/auth/steam/return?n=${NONCE}&extra=1`,
    `${ORIGIN}/api/auth/steam/return`,
  ]) {
    const check = parseReturn(returnParams({ 'openid.return_to': tampered }), {
      siteOrigin: ORIGIN,
      expectedNonce: NONCE,
    });
    assert.equal(check.ok, false, `expected ${tampered} to be refused`);
    if (check.ok) return;
    assert.equal(check.reason, 'bad-return-to');
  }
});

test('only steamcommunity.com may claim an identity', () => {
  for (const claimed of [
    'https://evil.example/openid/id/76561197960287930',
    'http://steamcommunity.com/openid/id/76561197960287930',
    'https://steamcommunity.com/openid/id/123',
    'https://steamcommunity.com/openid/id/7656119796028793X',
    'https://steamcommunity.com.evil.example/openid/id/76561197960287930',
    'https://steamcommunity.com/openid/id/76561197960287930/../../x',
  ]) {
    assert.equal(steamIdFromClaimedId(claimed), null, `${claimed} must not resolve to a SteamID`);
  }
  assert.equal(steamIdFromClaimedId(`https://steamcommunity.com/openid/id/${STEAM_ID}`), STEAM_ID);
});

test('a mode other than id_res is not a sign-in', () => {
  // `cancel` is what Steam sends when the player declines, and it carries no
  // signature at all.
  const check = parseReturn(returnParams({ 'openid.mode': 'cancel' }), { siteOrigin: ORIGIN, expectedNonce: NONCE });
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.reason, 'not-id-res');
});

test("Steam's answer is read a line at a time, so a false cannot hide a true", () => {
  assert.equal(isValidResponse('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'), true);
  assert.equal(isValidResponse('is_valid:true'), true);
  assert.equal(isValidResponse('is_valid:true\r\n'), true);
  assert.equal(isValidResponse('is_valid:false\n'), false);
  assert.equal(isValidResponse(''), false);
  // The failure this shape of check exists to prevent.
  assert.equal(isValidResponse('is_valid:false\nnote:is_valid:true'), false);
  assert.equal(isValidResponse('x_is_valid:true'), false);
});

test('a post-login redirect can only be a path on this site', () => {
  for (const good of ['/', '/builder', '/g/abc123', '/builds?sort=top', '/me']) {
    assert.equal(isSafeReturnPath(good), true, `${good} should be allowed`);
  }
  for (const bad of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'builder',
    '/x\nSet-Cookie: a=b',
    '/x\r\nLocation: https://evil.example',
    '/' + 'a'.repeat(600),
  ]) {
    assert.equal(isSafeReturnPath(bad), false, `${bad} must be refused`);
  }
});
