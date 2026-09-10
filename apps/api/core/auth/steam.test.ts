import assert from 'node:assert/strict';
import test from 'node:test';
import {
  profileXmlUrl,
  readProfileXml,
  MAX_PERSONA,
  STEAM_OPENID_ENDPOINT,
  buildAuthUrl,
  buildVerificationBody,
  isVerified,
  readProfile,
  steamIdFromClaim,
} from './steam.ts';

/** A callback that Steam would actually send. */
function callback(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000001',
    'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001',
    'openid.return_to': 'https://aow5.example/api/auth/steam/return',
    'openid.response_nonce': '2026-09-09T00:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'Zm9vYmFy',
    ...overrides,
  };
}

// --- the redirect out -------------------------------------------------------

test('the sign-in URL asks Steam who this is rather than naming anyone', () => {
  const url = new URL(buildAuthUrl('https://aow5.example/api/auth/steam/return', 'https://aow5.example'));
  assert.equal(`${url.origin}${url.pathname}`, STEAM_OPENID_ENDPOINT);
  assert.equal(url.searchParams.get('openid.mode'), 'checkid_setup');
  assert.equal(url.searchParams.get('openid.identity'), 'http://specs.openid.net/auth/2.0/identifier_select');
  assert.equal(url.searchParams.get('openid.claimed_id'), 'http://specs.openid.net/auth/2.0/identifier_select');
  assert.equal(url.searchParams.get('openid.return_to'), 'https://aow5.example/api/auth/steam/return');
  assert.equal(url.searchParams.get('openid.realm'), 'https://aow5.example');
});

// --- the callback -----------------------------------------------------------

test('a genuine-looking callback becomes a check_authentication body', () => {
  const body = buildVerificationBody(callback());
  assert.ok(body);
  assert.equal(body.get('openid.mode'), 'check_authentication', 'only the mode is rewritten');
  assert.equal(body.get('openid.sig'), 'Zm9vYmFy');
  assert.equal(body.get('openid.claimed_id'), 'https://steamcommunity.com/openid/id/76561198000000001');
});

test('every signed value is echoed back exactly as it arrived', () => {
  // The signature covers these bytes. Normalising one turns a valid login into
  // an invalid one, and the failure would look like Steam being flaky.
  const odd = callback({ 'openid.response_nonce': '2026-09-09T00:00:00Z ünïcode +/=' });
  const body = buildVerificationBody(odd);
  assert.ok(body);
  assert.equal(body.get('openid.response_nonce'), '2026-09-09T00:00:00Z ünïcode +/=');
});

test('non-openid query parameters are not forwarded to Steam', () => {
  const body = buildVerificationBody({ ...callback(), ref: 'ABCD', utm_source: 'discord' });
  assert.ok(body);
  assert.equal(body.get('ref'), null);
  assert.equal(body.get('utm_source'), null);
});

test('a callback that is not shaped like an assertion never reaches the network', () => {
  const cases: Record<string, Record<string, string | undefined>> = {
    'no signature': callback({ 'openid.sig': undefined }),
    'no signed list': callback({ 'openid.signed': undefined }),
    'empty signed list': callback({ 'openid.signed': '' }),
    'wrong mode': callback({ 'openid.mode': 'cancel' }),
    'nothing at all': {},
  };
  for (const [name, query] of Object.entries(cases)) {
    assert.equal(buildVerificationBody(query), null, name);
  }
});

test('a signed field that is missing from the query is refused rather than asked about', () => {
  // Steam signed `identity`; dropping it would have us ask about a different
  // document than the one that was signed, and Steam answers about what it got.
  const body = buildVerificationBody(callback({ 'openid.identity': undefined }));
  assert.equal(body, null);
});

// --- Steam's verdict --------------------------------------------------------

test('only an affirmative reply counts as verified', () => {
  assert.equal(isVerified('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'), true);
  assert.equal(isVerified('is_valid: true'), true);
  assert.equal(isVerified('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'), false);
  assert.equal(isVerified(''), false);
  assert.equal(isVerified('<html>502 Bad Gateway</html>'), false);
});

// --- the claimed identity ---------------------------------------------------

test('a Steam claimed_id yields its 64-bit id, as a string', () => {
  const id = steamIdFromClaim('https://steamcommunity.com/openid/id/76561198000000001');
  assert.equal(id, '76561198000000001');
  assert.equal(typeof id, 'string', 'never a number: this value is past 2^53');
});

test('an identity claiming to be Steam without being Steam is refused', () => {
  const impostors = [
    'https://evil.example/steamcommunity.com/openid/id/76561198000000001',
    'https://steamcommunity.com.evil.example/openid/id/76561198000000001',
    'http://steamcommunity.com/openid/id/76561198000000001',
    'https://steamcommunity.com/openid/id/76561198000000001/../../x',
    'https://steamcommunity.com/openid/id/notdigits',
    'https://steamcommunity.com/openid/id/',
    '',
    undefined,
  ];
  for (const claim of impostors) {
    assert.equal(steamIdFromClaim(claim), null, String(claim));
  }
});

test('a claimed id is trimmed before it is matched', () => {
  assert.equal(steamIdFromClaim('  https://steamcommunity.com/openid/id/76561198000000001  '), '76561198000000001');
});

// --- the profile ------------------------------------------------------------

test('a normal profile comes through intact', () => {
  const profile = readProfile(
    { personaname: 'Sasha', avatarfull: 'https://avatars.steamstatic.com/abc_full.jpg' },
    '76561198000000001',
  );
  assert.deepEqual(profile, { persona: 'Sasha', avatar: 'https://avatars.steamstatic.com/abc_full.jpg' });
});

test('a missing profile still yields a signed-in person', () => {
  // Sign-in must not fail because the Web API was down or the key was absent.
  const profile = readProfile(undefined, '76561198000000001');
  assert.equal(profile.avatar, '');
  assert.ok(profile.persona.includes('000001'), 'distinguishable from anyone else with no persona');
});

test('a persona is capped, trimmed and stripped of characters that render as nothing', () => {
  assert.equal(readProfile({ personaname: '  spaced  ' }, '1').persona, 'spaced');
  assert.equal(readProfile({ personaname: 'x'.repeat(MAX_PERSONA + 50) }, '1').persona.length, MAX_PERSONA);
  assert.equal(readProfile({ personaname: 'ab‮cd' }, '1').persona, 'abcd');
});

test('a persona that is only invisible characters falls back rather than rendering blank', () => {
  const profile = readProfile({ personaname: '​​' }, '76561198000000042');
  assert.notEqual(profile.persona, '');
  assert.ok(profile.persona.includes('000042'));
});

test('an avatar is only kept when it is an https URL', () => {
  assert.equal(readProfile({ avatarfull: 'http://insecure.example/a.jpg' }, '1').avatar, '');
  assert.equal(readProfile({ avatarfull: 'javascript:alert(1)' }, '1').avatar, '');
  assert.equal(readProfile({ avatarfull: 42 }, '1').avatar, '');
});

test('non-string fields in someone else’s JSON do not become a persona', () => {
  const profile = readProfile({ personaname: { toString: () => 'nope' } }, '76561198000000009');
  assert.ok(profile.persona.startsWith('Player '));
});

test('the public profile is read when there is no API key to use', () => {
  /*
   * `STEAM_API_KEY` is optional, including in production — and without this the
   * optional part cost every visitor their name and their picture, which reads
   * as a broken sign-in rather than as a missing setting. The community profile
   * has carried both fields since before the Web API existed.
   */
  const xml = `<?xml version="1.0"?><profile>
    <steamID64>76561198000801668</steamID64>
    <steamID><![CDATA[Морфиус]]></steamID>
    <avatarFull><![CDATA[https://avatars.steamstatic.com/abc_full.jpg]]></avatarFull>
  </profile>`;

  assert.deepEqual(readProfileXml(xml, '76561198000801668'), {
    persona: 'Морфиус',
    avatar: 'https://avatars.steamstatic.com/abc_full.jpg',
  });
});

test('a profile is read whether or not its fields are wrapped in CDATA', () => {
  // Steam wraps both today. Nothing here should depend on that staying true.
  assert.deepEqual(readProfileXml('<profile><steamID>Plain Name</steamID></profile>', '76561198000801668'), {
    persona: 'Plain Name',
    avatar: '',
  });
});

test('an avatar is kept only when it is https, because it becomes an img src', () => {
  const xml = '<profile><steamID>Someone</steamID><avatarFull>http://insecure.example/a.jpg</avatarFull></profile>';
  assert.equal(readProfileXml(xml, '76561198000801668')?.avatar, '');
});

test('a private profile is no profile, rather than an invented one', () => {
  const xml = '<profile><privacyMessage><![CDATA[This profile is private.]]></privacyMessage></profile>';
  assert.equal(readProfileXml(xml, '76561198000801668'), undefined);
});

test('a nameless profile still gets a name of its own, from the id', () => {
  const xml = '<profile><steamID></steamID><avatarFull>https://avatars.steamstatic.com/a_full.jpg</avatarFull></profile>';
  assert.equal(readProfileXml(xml, '76561198000801668')?.persona, 'Player 801668');
});

test('the public profile URL names the account and asks for XML', () => {
  assert.equal(profileXmlUrl('76561198000801668'), 'https://steamcommunity.com/profiles/76561198000801668?xml=1');
});

test('a persona full of control characters cannot hide the rest of a name', () => {
  const xml = '<profile><steamID><![CDATA[badname]]></steamID></profile>';
  assert.equal(readProfileXml(xml, '76561198000801668')?.persona, 'badname');
});
