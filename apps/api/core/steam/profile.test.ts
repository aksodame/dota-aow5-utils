import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAuthentication, fetchProfile, lookupProfile, parseCommunityXml, parseSummaries } from './profile.ts';

const SUMMARIES_PREFIX = 'https://api.steampowered.com/';

const STEAM_ID = '76561197960287930';

function summaries(player: Record<string, unknown>) {
  return { response: { players: [player] } };
}

test('a public profile parses into what the site shows', () => {
  const profile = parseSummaries(
    summaries({
      steamid: STEAM_ID,
      personaname: 'Гость',
      avatarfull: 'https://avatars.steamstatic.com/full.jpg',
      profileurl: 'https://steamcommunity.com/id/guest/',
      timecreated: 1_600_000_000,
    }),
    STEAM_ID,
  );
  assert.deepEqual(profile, {
    steamId: STEAM_ID,
    persona: 'Гость',
    avatarUrl: 'https://avatars.steamstatic.com/full.jpg',
    profileUrl: 'https://steamcommunity.com/id/guest/',
    createdAt: 1_600_000_000,
  });
});

test('a private profile omits fields rather than nulling them, and still parses', () => {
  const profile = parseSummaries(summaries({ steamid: STEAM_ID, personaname: 'quiet' }), STEAM_ID);
  assert.equal(profile?.createdAt, null, 'timecreated is absent on a private profile');
  assert.equal(profile?.profileUrl, `https://steamcommunity.com/profiles/${STEAM_ID}`);
  assert.equal(profile?.avatarUrl, '');
});

test('a response for somebody else is not accepted as ours', () => {
  assert.equal(parseSummaries(summaries({ steamid: '76561197960287931', personaname: 'x' }), STEAM_ID), null);
});

test('a shape Steam has never sent yields null instead of throwing', () => {
  for (const body of [null, undefined, {}, { response: {} }, { response: { players: 'nope' } }, 42, []]) {
    assert.equal(parseSummaries(body, STEAM_ID), null);
  }
});

test('a profile fetch that fails is not a sign-in failure', async () => {
  // Steam being down must not stop somebody logging in, so every path here
  // resolves to null rather than rejecting.
  const cases: Array<() => Promise<Response>> = [
    () => Promise.reject(new Error('ECONNRESET')),
    () => Promise.resolve(new Response('nope', { status: 500 })),
    () => Promise.resolve(new Response('not json', { status: 200 })),
  ];
  for (const impl of cases) {
    assert.equal(await fetchProfile(STEAM_ID, 'key', impl as unknown as typeof fetch), null);
  }
});

test('no API key means the Web API is never asked', async () => {
  // It used to mean no lookup at all, which is how somebody signed in and was
  // greeted as "Player 7930". Now it means the keyless source answers instead.
  const asked: string[] = [];
  const spy = ((url: string) => {
    asked.push(url);
    return Promise.resolve(new Response('<profile></profile>'));
  }) as unknown as typeof fetch;

  await fetchProfile(STEAM_ID, '', spy);
  assert.equal(asked.length, 1);
  assert.ok(asked[0]?.startsWith('https://steamcommunity.com/'), asked[0] ?? 'nothing was asked');
});

test('the key and the SteamID are encoded into the query, not concatenated into it', async () => {
  let seen = '';
  const spy = ((url: string) => {
    seen = url;
    return Promise.resolve(new Response(JSON.stringify(summaries({ steamid: STEAM_ID, personaname: 'x' }))));
  }) as unknown as typeof fetch;
  await fetchProfile(STEAM_ID, 'a&b=c', spy);
  assert.ok(seen.includes('key=a%26b%3Dc'), `key was not encoded: ${seen}`);
});

test('verification only passes when Steam says so', async () => {
  const reply = (body: string, status = 200) =>
    (() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;

  const params = new URLSearchParams({ 'openid.mode': 'check_authentication' });
  assert.equal(await checkAuthentication('https://x', params, reply('is_valid:true\n')), true);
  assert.equal(await checkAuthentication('https://x', params, reply('is_valid:false\n')), false);
  assert.equal(await checkAuthentication('https://x', params, reply('is_valid:true', 500)), false);
  assert.equal(
    await checkAuthentication('https://x', params, (() => Promise.reject(new Error('down'))) as unknown as typeof fetch),
    false,
    'a network failure must never read as verified',
  );
});

test('verification is a form POST, because that is what the endpoint accepts', async () => {
  let method = '';
  let contentType = '';
  let body = '';
  const spy = ((_url: string, init: RequestInit) => {
    method = String(init.method);
    contentType = String((init.headers as Record<string, string>)['content-type']);
    body = String(init.body);
    return Promise.resolve(new Response('is_valid:true'));
  }) as unknown as typeof fetch;

  await checkAuthentication('https://x', new URLSearchParams({ 'openid.sig': 'a+b/c=' }), spy);
  assert.equal(method, 'POST');
  assert.equal(contentType, 'application/x-www-form-urlencoded');
  assert.ok(body.includes('openid.sig=a%2Bb%2Fc%3D'), `signature was not form-encoded: ${body}`);
});

/*
 * The keyless fallback.
 *
 * These exist because signing in and being greeted as "Player 7930" is exactly
 * what happened before it: with no API key, the Web API path returns null
 * immediately and the placeholder gets stored as somebody's name.
 */

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><profile>
	<steamID64>${STEAM_ID}</steamID64>
	<steamID><![CDATA[Rabscuttle]]></steamID>
	<privacyState>friendsonly</privacyState>
	<avatarIcon><![CDATA[https://avatars.akamai.steamstatic.com/abc.jpg]]></avatarIcon>
	<avatarFull><![CDATA[https://avatars.akamai.steamstatic.com/abc_full.jpg]]></avatarFull>
</profile>`;

test('the community XML gives a real name and avatar with no key at all', () => {
  const profile = parseCommunityXml(XML, STEAM_ID);
  assert.equal(profile?.persona, 'Rabscuttle', 'CDATA has to be unwrapped');
  assert.equal(profile?.avatarUrl, 'https://avatars.akamai.steamstatic.com/abc_full.jpg');
  assert.equal(profile?.profileUrl, `https://steamcommunity.com/profiles/${STEAM_ID}`);
  // The XML carries no account age, and the vote rule that would use it is not
  // enforced anyway.
  assert.equal(profile?.createdAt, null);
});

test('XML about somebody else, or about nobody, is refused', () => {
  assert.equal(parseCommunityXml(XML.replace(STEAM_ID, '76561197960287931'), STEAM_ID), null);
  assert.equal(parseCommunityXml('<html>404</html>', STEAM_ID), null);
  assert.equal(parseCommunityXml('', STEAM_ID), null);
  assert.equal(
    parseCommunityXml(XML.replace('<![CDATA[Rabscuttle]]>', ''), STEAM_ID),
    null,
    'a profile with no name is not a profile',
  );
});

test('with no key, the community endpoint is what answers', async () => {
  const spy = ((url: string) => {
    assert.ok(url.startsWith('https://steamcommunity.com/profiles/'), `unexpected url ${url}`);
    return Promise.resolve(new Response(XML));
  }) as unknown as typeof fetch;

  const result = await lookupProfile(STEAM_ID, '', spy);
  assert.equal(result.source, 'community');
  assert.equal(result.profile?.persona, 'Rabscuttle');
});

test('with a key, the Web API wins and the fallback is not called', async () => {
  let community = 0;
  const spy = ((url: string) => {
    if (url.startsWith(SUMMARIES_PREFIX)) {
      return Promise.resolve(
        new Response(JSON.stringify(summaries({ steamid: STEAM_ID, personaname: 'FromApi', timecreated: 1 }))),
      );
    }
    community += 1;
    return Promise.resolve(new Response(XML));
  }) as unknown as typeof fetch;

  const result = await lookupProfile(STEAM_ID, 'key', spy);
  assert.equal(result.source, 'web-api');
  assert.equal(result.profile?.persona, 'FromApi');
  assert.equal(community, 0, 'no reason to ask twice when the first source answered');
});

test('a broken Web API falls through to the community endpoint', async () => {
  const spy = ((url: string) =>
    url.startsWith(SUMMARIES_PREFIX)
      ? Promise.resolve(new Response('nope', { status: 403 }))
      : Promise.resolve(new Response(XML))) as unknown as typeof fetch;

  const result = await lookupProfile(STEAM_ID, 'expired-key', spy);
  assert.equal(result.source, 'community', 'an expired key must not cost somebody their name');
  assert.equal(result.profile?.persona, 'Rabscuttle');
});

test('both sources failing is reported, not thrown', async () => {
  const spy = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
  const result = await lookupProfile(STEAM_ID, 'key', spy);
  assert.equal(result.source, 'none');
  assert.equal(result.profile, null);
});
