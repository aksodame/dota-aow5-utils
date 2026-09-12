import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchPath } from './routes.ts';

test('the root is the browse page', () => {
  assert.deepEqual(matchPath('/'), { route: 'browse', lang: undefined });
  assert.equal(matchPath('').route, 'browse');
});

test('every static route is matched', () => {
  assert.equal(matchPath('/me').route, 'mine');
  assert.equal(matchPath('/edit').route, 'edit');
  assert.equal(matchPath('/view').route, 'view');
  assert.equal(matchPath('/settings').route, 'settings');
  assert.equal(matchPath('/tracker').route, 'tracker');
});

test('a trailing slash does not make a different route', () => {
  assert.equal(matchPath('/tracker/').route, 'tracker');
});

test('a build path yields its slug', () => {
  assert.deepEqual(matchPath('/builds/7kQm2'), { route: 'build', slug: '7kQm2', lang: undefined });
});

test('a malformed slug falls through to browse rather than erroring', () => {
  // `0`, `O`, `I` and `l` are outside the slug alphabet on purpose — they are
  // the glyphs people transcribe wrong.
  assert.equal(matchPath('/builds/OOOO').route, 'browse');
  assert.equal(matchPath('/builds/').route, 'browse');
  assert.equal(matchPath('/builds/way-too-long-to-be-a-slug-at-all').route, 'browse');
});

test('an unrecognised path is the browse page, not an error', () => {
  assert.equal(matchPath('/nonsense').route, 'browse');
  assert.equal(matchPath('/a/b/c').route, 'browse');
});

test('the language rides in the query', () => {
  assert.equal(matchPath('/builds/7kQm2?lang=ru').lang, 'ru');
  assert.equal(matchPath('/?lang=zh').lang, 'zh');
  assert.equal(matchPath('/tracker?utm_source=x').lang, undefined);
});

test('the query never changes which route was matched', () => {
  assert.equal(matchPath('/tracker?lang=ru&x=1').route, 'tracker');
  assert.equal(matchPath('/builds/7kQm2?ref=abc').route, 'build');
});

test('a fragment is not part of the path', () => {
  // Never actually sent by a client, but Caddy passes on what it was given.
  assert.equal(matchPath('/view#b=7.abc').route, 'view');
});

test('a URI that will not parse still answers', () => {
  assert.equal(matchPath('/builds/%').route, 'browse');
  assert.equal(matchPath('%%%').route, 'browse');
  assert.equal(matchPath('///').route, 'browse');
});

test('a percent-encoded path is decoded before matching', () => {
  assert.equal(matchPath('/%74racker').route, 'tracker');
});
