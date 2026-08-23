import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPath, carriesBuildPayload, matchRoute, pathOf, routeAt } from './routes.ts';

/*
 * Both bases, because the site is served from a subpath on GitHub Pages and
 * from the root everywhere else, and the router is the only thing that has to
 * know the difference.
 */
const ROOT = '/';
const PAGES = '/dota-aow5-utils/';

test('resolves every route at a domain root', () => {
  assert.equal(routeAt('/', ROOT), 'landing');
  assert.equal(routeAt('/builder', ROOT), 'planner');
  assert.equal(routeAt('/tracker', ROOT), 'tracker');
});

test('resolves every route under a base path', () => {
  assert.equal(routeAt(PAGES, PAGES), 'landing');
  assert.equal(routeAt(`${PAGES}builder`, PAGES), 'planner');
  assert.equal(routeAt(`${PAGES}tracker`, PAGES), 'tracker');
});

test('a trailing slash names the same route', () => {
  assert.equal(routeAt('/builder/', ROOT), 'planner');
  assert.equal(routeAt(`${PAGES}tracker/`, PAGES), 'tracker');
});

test('an unknown path falls back to the landing page', () => {
  assert.equal(routeAt('/nope', ROOT), 'landing');
  assert.equal(routeAt(`${PAGES}builder/extra`, PAGES), 'landing');
});

test('pathOf and routeAt are inverses', () => {
  for (const base of [ROOT, PAGES]) {
    for (const id of ['landing', 'planner', 'tracker'] as const) {
      assert.equal(routeAt(pathOf(id, base), base), id, `${id} at ${base}`);
    }
  }
});

/*
 * The load-bearing one. Every build shared before the planner moved off the
 * site root is a landing-page URL with the board in it, and the redirect that
 * rescues those links is only as good as this predicate.
 */
test('recognises every share-link shape the planner accepts', () => {
  assert.equal(carriesBuildPayload('', '#b=AQIDBA'), true, 'current form');
  assert.equal(carriesBuildPayload('', '#AQIDBA'), true, 'bare fragment');
  assert.equal(carriesBuildPayload('?b=AQIDBA', ''), true, 'pre-fragment query');
  assert.equal(carriesBuildPayload('?ref=CODE&b=AQIDBA', '#b=AQIDBA'), true, 'alongside a referral code');
});

test('does not mistake anything else for a build', () => {
  assert.equal(carriesBuildPayload('', ''), false, 'a clean URL');
  assert.equal(carriesBuildPayload('', '#'), false, 'an empty fragment');
  assert.equal(carriesBuildPayload('?ref=CODE', ''), false, 'a referral code alone');
  // The planner's own writer omits the fragment entirely for an empty board,
  // so `#b=` with nothing after it is not a board — and following it would
  // report a malformed link where there is none.
  assert.equal(carriesBuildPayload('', '#b='), false, 'an empty payload');
});

/*
 * The builds platform's routes.
 *
 * Every case below exists because getting one wrong either breaks a link
 * somebody already shared or sends a board somewhere that will try to decode it.
 */

test('resolves the builds routes at both bases', () => {
  assert.equal(routeAt('/builds', ROOT), 'builds');
  assert.equal(routeAt('/me', ROOT), 'mine');
  assert.equal(routeAt(`${PAGES}builds`, PAGES), 'builds');
  assert.equal(routeAt(`${PAGES}me`, PAGES), 'mine');
});

test('the planner keeps the path it shipped with, whatever it is now called', () => {
  // The nav says "Builds". Every board shared since launch points at /builder,
  // so the path does not get to follow the label.
  assert.equal(routeAt('/builder', ROOT), 'planner');
  assert.equal(pathOf('planner', ROOT), '/builder');
});

test('/builds and /builds/<slug> do not shadow each other', () => {
  assert.deepEqual(matchRoute('/builds', ROOT), { id: 'builds' });
  assert.deepEqual(matchRoute('/builds/', ROOT), { id: 'builds' });
  assert.deepEqual(matchRoute('/builds/abcd1234', ROOT), { id: 'build', slug: 'abcd1234' });
});

test('my builds is not under the builds prefix, because a slug could collide', () => {
  // "mine" and "my" are both legal slugs; a route that can collide with real
  // data is a bug waiting for the right author to publish.
  assert.equal(routeAt('/me', ROOT), 'mine');
  assert.deepEqual(matchRoute('/builds/mine', ROOT), { id: 'build', slug: 'mine' });
});

test('a build URL yields its slug', () => {
  assert.deepEqual(matchRoute('/builds/is6GeWwza4', ROOT), { id: 'build', slug: 'is6GeWwza4' });
  assert.deepEqual(matchRoute('/builds/is6GeWwza4/', ROOT), { id: 'build', slug: 'is6GeWwza4' });
  assert.deepEqual(matchRoute(`${PAGES}builds/is6GeWwza4`, PAGES), { id: 'build', slug: 'is6GeWwza4' });
});

test('buildPath and matchRoute are inverses', () => {
  for (const base of [ROOT, PAGES]) {
    assert.deepEqual(matchRoute(buildPath('abcd1234', base), base), { id: 'build', slug: 'abcd1234' });
  }
});

test('a malformed slug is not a build page', () => {
  // The alphabet leaves out the glyphs people transcribe wrong, so these are
  // typos rather than builds — and a typo belongs on the front page, not on an
  // error screen.
  for (const bad of [
    '/builds/abc',
    '/builds/O0Il9999',
    '/builds/has space',
    '/builds/toolongtobeaslug1234',
    '/builds/a/b',
  ]) {
    assert.equal(matchRoute(bad, ROOT).id, 'landing', `${bad} should fall back to landing`);
  }
});

test('matchRoute still answers for every static route', () => {
  assert.deepEqual(matchRoute('/', ROOT), { id: 'landing' });
  assert.deepEqual(matchRoute('/builder', ROOT), { id: 'planner' });
  assert.deepEqual(matchRoute('/tracker', ROOT), { id: 'tracker' });
  assert.deepEqual(matchRoute('/builds', ROOT), { id: 'builds' });
  assert.deepEqual(matchRoute('/me', ROOT), { id: 'mine' });
  assert.deepEqual(matchRoute('/nonsense', ROOT), { id: 'landing' });
});

test('none of the new routes look like they are carrying a board', () => {
  // The load-bearing one. `carriesBuildPayload` decides what gets forwarded to
  // the planner and decoded; a build URL must never qualify, or opening one
  // would hand its path to the codec.
  for (const path of ['/builds', '/me', '/builds/is6GeWwza4']) {
    const url = new URL(path, 'https://example.test');
    assert.equal(carriesBuildPayload(url.search, url.hash), false, `${path} must not read as a board`);
  }
  // Nor with the query strings the browse page actually uses.
  for (const search of ['?sort=top', '?q=axe&hero=npc_dota_hero_axe', '?cursor=abc123']) {
    assert.equal(carriesBuildPayload(search, ''), false, `${search} must not read as a board`);
  }
});

test('a planner link still reads as a board, exactly as before', () => {
  assert.equal(carriesBuildPayload('', '#b=6.AAAA'), true);
  assert.equal(carriesBuildPayload('', '#6.AAAA'), true);
  assert.equal(carriesBuildPayload('?b=6.AAAA', ''), true);
});
