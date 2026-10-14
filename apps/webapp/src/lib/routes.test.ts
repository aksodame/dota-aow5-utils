import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROUTES,
  buildPath,
  carriesBuildPayload,
  editPath,
  itemPath,
  legacyRedirect,
  matchRoute,
  pathOf,
  routeAt,
  viewPath,
  WIKI_SECTIONS,
  wikiPathAt,
} from './routes.ts';

/**
 * The route table, tested at both bases the site is ever served from.
 *
 * A link somebody shared is a promise, and these are the functions that decide
 * whether it is kept — so the cases that matter are the ones where a URL could
 * silently resolve to the wrong screen rather than the ones where it obviously
 * does not resolve at all.
 */

const ROOT = '/';
const SUB = '/dota-aow5-utils/';

test('every route resolves back to itself at a domain root', () => {
  for (const id of Object.keys(ROUTES) as Array<keyof typeof ROUTES>) {
    assert.equal(routeAt(pathOf(id, ROOT), ROOT), id, id);
  }
});

test('every route resolves back to itself under a subpath', () => {
  for (const id of Object.keys(ROUTES) as Array<keyof typeof ROUTES>) {
    assert.equal(routeAt(pathOf(id, SUB), SUB), id, id);
  }
});

test('browsing is the site root, not a page under it', () => {
  assert.equal(pathOf('browse', ROOT), '/');
  assert.equal(pathOf('browse', SUB), '/dota-aow5-utils/');
  assert.equal(routeAt('/', ROOT), 'browse');
});

test('a trailing slash is the same route', () => {
  assert.equal(routeAt('/me/', ROOT), 'mine');
  assert.equal(routeAt('/tracker/', ROOT), 'tracker');
});

test('an unknown path is the browse list rather than an error', () => {
  // The only way to reach one is a stale or hand-typed URL, and a list of
  // builds is more use than a 404 screen.
  for (const path of ['/nope', '/builder', '/builds', '/me/extra']) {
    assert.equal(routeAt(path, ROOT), 'browse', path);
  }
});

test('a build slug is matched, and its path round-trips', () => {
  const match = matchRoute(buildPath('abc123', ROOT), ROOT);
  assert.equal(match.id, 'build');
  assert.equal(match.slug, 'abc123');
});

test('a build slug round-trips under a subpath too', () => {
  const match = matchRoute(buildPath('abc123', SUB), SUB);
  assert.equal(match.id, 'build');
  assert.equal(match.slug, 'abc123');
});

test('a malformed slug is not a build page', () => {
  // Including the glyphs the alphabet deliberately excludes, so a mistyped
  // link lands on the list rather than on a build page that will 404.
  for (const slug of ['ab', 'has space', 'has/slash', 'toolongtobeaslugatall', 'O0Il', '']) {
    assert.notEqual(matchRoute(`/builds/${slug}`, ROOT).id, 'build', slug);
  }
});

test('"mine" is a legal slug, which is why my-creations is not under /builds', () => {
  // If the author page lived at /builds/mine, publishing a build that got the
  // slug `mine` would shadow it. It lives at /me instead.
  assert.equal(matchRoute('/builds/mine', ROOT).id, 'build');
  assert.equal(routeAt('/me', ROOT), 'mine');
});

test('the editor carries the build it is editing in a query parameter', () => {
  assert.equal(editPath(undefined, ROOT), '/edit');
  assert.equal(editPath('abc123', ROOT), '/edit?slug=abc123');
  // Encoded, so a slug alphabet that ever gains a reserved character cannot
  // silently produce a second query parameter.
  assert.equal(editPath('a b', ROOT), '/edit?slug=a%20b');
  // And the route still resolves with the parameter attached.
  assert.equal(routeAt('/edit', ROOT), 'edit');
});

test('a fragment carrying a loadout is recognised in both shapes', () => {
  assert.equal(carriesBuildPayload('#b=7.AAAA'), true);
  assert.equal(carriesBuildPayload('#7.AAAA'), true);
});

test('a fragment that is not a loadout is left alone', () => {
  for (const hash of ['', '#', '#section=gear', '#b=']) {
    assert.equal(carriesBuildPayload(hash), false, JSON.stringify(hash));
  }
});

test('a shared loadout has a page of its own, carrying the payload in the fragment', () => {
  /*
   * The reader's half of `#b=`. `/edit#b=…` was the only shape a board in a URL
   * had, which meant sharing a build meant sharing an editor — so this is the
   * same fragment against a route that only draws it.
   */
  assert.equal(viewPath('8.abc', {}, ROOT), '/view#b=8.abc');
  assert.equal(viewPath('8.abc', {}, SUB), '/dota-aow5-utils/view#b=8.abc');
  assert.equal(viewPath('', {}, ROOT), '/view', 'nothing to carry, no fragment');

  /*
   * The two facts that are about a build rather than in it. They ride in the
   * query because the fragment is the codec's, and the query goes *before* the
   * fragment or the browser reads it as part of the payload.
   */
  assert.equal(viewPath('8.abc', { price: 1250000, referral: 'AOW5DEV' }, ROOT), '/view?price=1250000&ref=AOW5DEV#b=8.abc');
  assert.equal(viewPath('8.abc', { price: 0, referral: '' }, ROOT), '/view#b=8.abc', 'zero is "not given", not free');
  assert.equal(viewPath('8.abc', { price: 2.7 }, ROOT), '/view?price=2#b=8.abc', 'gold has no fractions');

  assert.equal(matchRoute('/view', ROOT).id, 'view');
  assert.equal(routeAt('/view/', ROOT), 'view', 'a trailing slash is the same route');
  assert.equal(carriesBuildPayload('#b=8.abc'), true);
});

/**
 * `/wiki/items/<id>`, the second route with a variable in it.
 *
 * Same contract as a build's: a well-formed id matches, a malformed one falls
 * through to the browse list rather than rendering an error, and the prefix on
 * its own is not a page.
 */
test('an item id matches, in every shape the addon uses', () => {
  for (const id of ['item_0123', 'item_G410_2', 'item_s_MT002', 'item_MTB001_easy', 'item_H0001', 'item_pet_cat_sly']) {
    assert.deepEqual(matchRoute(`/wiki/items/${id}`, '/'), { id: 'item', itemId: id }, id);
  }
});

test('a malformed item id is the browse list, not an error', () => {
  // `''` is not in this list: `/wiki/items/` is the catalogue, asserted below.
  for (const bad of ['nope', 'Item_0123', 'item_', 'item_0123/extra', `item_${'a'.repeat(41)}`]) {
    assert.deepEqual(matchRoute(`/wiki/items/${bad}`, '/'), { id: 'browse' }, JSON.stringify(bad));
  }
  // The prefix alone is the catalogue, not an item and not a fall-through.
  assert.deepEqual(matchRoute('/wiki/items', '/'), { id: 'wiki', section: 'items', path: [] });
  assert.deepEqual(matchRoute('/wiki/items/', '/'), { id: 'wiki', section: 'items', path: [] });
});

test('itemPath and matchRoute are inverses, base and all', () => {
  for (const base of ['/', '/dota-aow5-utils/']) {
    const path = itemPath('item_G502_3', base);
    assert.equal(path, `${base}wiki/items/item_G502_3`);
    assert.deepEqual(matchRoute(path, base), { id: 'item', itemId: 'item_G502_3' });
  }
});

test('an item id can never be mistaken for a build slug', () => {
  // Both dynamic routes live under their own prefix, so the two id spaces
  // never have to be told apart — but the slug alphabet excludes `_`, which
  // is what would make them ambiguous if they ever shared one.
  assert.equal(/^[1-9A-HJ-NP-Za-km-z]{4,16}$/.test('item_0123'), false);
});

/**
 * The wiki: a section, then up to three segments that section keys on.
 */
test('every wiki section round-trips, bare and with a path, at both bases', () => {
  for (const base of [ROOT, SUB]) {
    for (const section of WIKI_SECTIONS) {
      assert.deepEqual(matchRoute(wikiPathAt(base, section), base), { id: 'wiki', section, path: [] }, section);
      // `items` with one segment is an item page, asserted above.
      if (section === 'items') continue;
      const path = wikiPathAt(base, section, 'tree4', 'T123');
      assert.deepEqual(matchRoute(path, base), { id: 'wiki', section, path: ['tree4', 'T123'] }, path);
    }
  }
});

test('/wiki on its own is the first section', () => {
  assert.deepEqual(matchRoute('/wiki', ROOT), { id: 'wiki', section: 'items', path: [] });
  assert.deepEqual(matchRoute('/wiki/', ROOT), { id: 'wiki', section: 'items', path: [] });
});

test('an unknown section, a hostile segment or too deep a path is the browse list', () => {
  for (const bad of ['/wiki/nope', '/wiki/monsters/a%2Fb', '/wiki/monsters/%E0%A4%A', '/wiki/faq/a/b/c/d', '/wiki/monsters/<x>']) {
    assert.deepEqual(matchRoute(bad, ROOT), { id: 'browse' }, bad);
  }
});

test('the old catalogue addresses lead to the new ones', () => {
  for (const base of [ROOT, SUB]) {
    assert.equal(legacyRedirect(`${base}items`, base), `${base}wiki/items`);
    assert.equal(legacyRedirect(`${base}items/`, base), `${base}wiki/items`);
    assert.equal(legacyRedirect(`${base}items/item_0123`, base), `${base}wiki/items/item_0123`);
    assert.equal(legacyRedirect(`${base}items/nope`, base), null);
    assert.equal(legacyRedirect(`${base}wiki/items`, base), null);
  }
});
