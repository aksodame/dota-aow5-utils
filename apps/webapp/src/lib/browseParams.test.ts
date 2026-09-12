import assert from 'node:assert/strict';
import test from 'node:test';
import { browseSearch, DEFAULT_BROWSE, readBrowseParams } from './browseParams.ts';

test('the default view has an empty query string', () => {
  // `/` rather than `/?sort=top&q=`, so a shared link is short and "is this the
  // default view" is answerable by looking at the address bar.
  assert.equal(browseSearch(DEFAULT_BROWSE), '');
  assert.deepEqual(readBrowseParams(''), DEFAULT_BROWSE);
  assert.deepEqual(readBrowseParams('?'), DEFAULT_BROWSE);
});

test('a full query survives a round trip', () => {
  const state = {
    hero: 'npc_dota_hero_axe',
    tiers: ['3' as const, 'event' as const],
    maps: ['M001', 'M007'],
    sort: 'cheap' as const,
    q: 'frost opener',
  };
  const search = browseSearch(state);
  assert.deepEqual(readBrowseParams(search), state);
});

test('each field alone survives a round trip', () => {
  // Separately, because `browseSearch` omits defaults and a field could be
  // dropped by the wrong one of those conditions.
  const cases = [
    { ...DEFAULT_BROWSE, q: 'axe' },
    { ...DEFAULT_BROWSE, hero: 'npc_dota_hero_lina' },
    { ...DEFAULT_BROWSE, tiers: ['8' as const] },
    { ...DEFAULT_BROWSE, tiers: ['1' as const, '9' as const, 'event' as const] },
    { ...DEFAULT_BROWSE, maps: ['M003'] },
    { ...DEFAULT_BROWSE, sort: 'costly' as const },
  ];
  for (const state of cases) {
    assert.deepEqual(readBrowseParams(browseSearch(state)), state, JSON.stringify(state));
  }
});

test('text that needs encoding comes back as it went in', () => {
  // A search box takes anything: spaces, `&`, `#`, `%`, Cyrillic. Every one of
  // those means something in a URL, and the round trip is what proves they are
  // escaped rather than truncating the query.
  for (const q of ['a & b', 'вася', '100%', 'a#b', 'a=b', 'a+b', '  padded  ']) {
    assert.equal(readBrowseParams(browseSearch({ ...DEFAULT_BROWSE, q })).q, q.trim(), q);
  }
});

test('nonsense in the URL reads as the default, not as an error', () => {
  // This parses a URL somebody may have typed or edited by hand.
  assert.equal(readBrowseParams('?sort=sideways').sort, 'top', 'an unknown sort');
  assert.equal(readBrowseParams('?sort=').sort, 'top', 'an empty one');
  assert.deepEqual(readBrowseParams('?map=').maps, [], 'an empty map list');
  assert.deepEqual(readBrowseParams('?map=,,M001,,').maps, ['M001'], 'stray separators');
  assert.equal(readBrowseParams('?hero=').hero, undefined, 'an empty hero is "any hero"');
  assert.equal(readBrowseParams('?hero=%20%20').hero, undefined, 'and so is whitespace');
  // A key the site does not have is dropped, not coerced. `'Event'` is not
  // `'event'`, and guessing which was meant files a build where nobody looks.
  for (const bad of ['0', '10', '-1', '2.5', 'eight', 'Event', '']) {
    assert.deepEqual(readBrowseParams(`?tier=${bad}`).tiers, [], `tier=${bad}`);
  }
  assert.deepEqual(readBrowseParams('?tier=9').tiers, ['9'], 'and a real one survives');
  assert.deepEqual(readBrowseParams('?tier=3,event,0').tiers, ['3', 'event'], 'good keys survive bad ones');
});

test('parameters this page does not own are ignored', () => {
  // `?auth=` arrives from the Steam callback and `?slug=` belongs to the
  // editor; neither should become part of a browse query.
  const state = readBrowseParams('?auth=failed&slug=abc&lang=ru&q=frost');
  assert.deepEqual(state, { ...DEFAULT_BROWSE, q: 'frost' });
});

test('a trimmed search is what gets written, so two spellings are one URL', () => {
  assert.equal(browseSearch({ ...DEFAULT_BROWSE, q: '  frost  ' }), '?q=frost');
  assert.equal(browseSearch({ ...DEFAULT_BROWSE, q: '   ' }), '', 'whitespace alone is no search');
});
