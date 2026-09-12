import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILD_VERSION_PARAM, buildShareUrl } from './links.ts';

const PAGE = 'https://aow5tools.boardshub.io/builds/PYw8p8kCtB';

test('a shared link carries the version the card was drawn for', () => {
  assert.equal(buildShareUrl(PAGE, 1789183379), `${PAGE}?${BUILD_VERSION_PARAM}=1789183379`);
});

test('the language rides along, because it was in the link somebody was reading', () => {
  const url = new URL(buildShareUrl(`${PAGE}?lang=ru`, 1789183379));
  assert.equal(url.searchParams.get('lang'), 'ru');
  assert.equal(url.searchParams.get(BUILD_VERSION_PARAM), '1789183379');
});

test('an edit replaces the old version rather than appending a second one', () => {
  // The address bar already carries one by the time the button is pressed —
  // `BuildPage` puts it there — so this runs over its own output constantly.
  const once = buildShareUrl(PAGE, 100);
  const twice = buildShareUrl(once, 200);
  assert.equal(new URL(twice).searchParams.getAll(BUILD_VERSION_PARAM).length, 1);
  assert.equal(new URL(twice).searchParams.get(BUILD_VERSION_PARAM), '200');
});

test('the fragment survives, because a build page may be reached with one', () => {
  assert.ok(buildShareUrl(`${PAGE}#gear`, 7).endsWith('#gear'));
});

test('something that is not a URL comes back unchanged rather than throwing', () => {
  assert.equal(buildShareUrl('not a url', 7), 'not a url');
});
