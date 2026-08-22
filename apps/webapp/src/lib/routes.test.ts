import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carriesBuildPayload, pathOf, routeAt } from './routes.ts';

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
