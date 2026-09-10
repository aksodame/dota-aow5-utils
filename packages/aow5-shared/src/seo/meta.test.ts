import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEO_LANGS, SEO_STRINGS } from './strings.ts';
import { TITLE_BUDGET, buildFactLine, pageMeta, type BuildFacts } from './meta.ts';
import { formatGold } from '../format/gold.ts';
import { textWidth } from './text.ts';

const BUILD: BuildFacts = {
  slug: '7kQm2',
  title: 'Frost-lock Axe',
  body: 'Rush the boots, then stack cooldown. The third slot is flexible.',
  hero: 'Axe',
  maps: ['Frozen Plain'],
  tier: '6',
  price: 12_400,
  spell: "Berserker's Call",
  author: 'kozorez',
  likeCount: 34,
  commentCount: 2,
  publishedAt: 1_756_000_000,
  updatedAt: 1_756_100_000,
};

test('a build title leads with the author words and ends with the brand', () => {
  const meta = pageMeta({ kind: 'build', build: BUILD }, 'en');
  assert.ok(meta.title.startsWith('Frost-lock Axe'), meta.title);
  assert.ok(meta.title.endsWith('AOW5 Builds'), meta.title);
});

test('a title carries the hero and the tier, and leaves the rest to the description', () => {
  const meta = pageMeta({ kind: 'build', build: BUILD }, 'en');
  assert.equal(meta.title, 'Frost-lock Axe — Axe · T6 — AOW5 Builds');
  // The room, the ability and the price are all in the description instead.
  assert.ok(meta.description.includes('Frozen Plain'), meta.description);
  assert.ok(meta.description.includes('12.4k'), meta.description);
});

test('the brand survives a title long enough to be clipped', () => {
  const long = { ...BUILD, title: 'A'.repeat(200) };
  for (const lang of SEO_LANGS) {
    const meta = pageMeta({ kind: 'build', build: long }, lang);
    assert.ok(meta.title.endsWith(SEO_STRINGS[lang].brand), `${lang}: ${meta.title}`);
    assert.ok(meta.title.includes('…'), `${lang} should say it was cut`);
  }
});

test('the clipped part of a title stays inside its budget', () => {
  const long = { ...BUILD, title: '配装'.repeat(80) };
  const meta = pageMeta({ kind: 'build', build: long }, 'zh');
  const head = meta.title.slice(0, meta.title.length - `${SEO_STRINGS.zh.sep}${SEO_STRINGS.zh.brand}`.length);
  assert.ok(textWidth(head) <= TITLE_BUDGET, `${head} is ${textWidth(head)}`);
});

test('a build with no title at all still gets one', () => {
  const meta = pageMeta({ kind: 'build', build: { ...BUILD, title: '   ' } }, 'ru');
  assert.ok(meta.title.startsWith(SEO_STRINGS.ru.untitled), meta.title);
});

test('the fact line lists what the author filled in, and nothing else', () => {
  assert.equal(buildFactLine(BUILD, 'en'), "Axe · T6 · Frozen Plain · Berserker's Call · 12.4k gold");
});

test('a build that named no hero, tier, room, spell or price has no fact line', () => {
  const bare = { ...BUILD, hero: null, tier: null, maps: [], spell: null, price: 0 };
  assert.equal(buildFactLine(bare, 'en'), '');
  // And the description still says something rather than being a bare full stop.
  const meta = pageMeta({ kind: 'build', build: bare }, 'en');
  assert.ok(meta.description.length > 10, meta.description);
});

test('Event is a word rather than a tier number', () => {
  assert.ok(buildFactLine({ ...BUILD, tier: 'event' }, 'ru').includes('Событие'));
  assert.ok(buildFactLine({ ...BUILD, tier: 'event' }, 'zh').includes('活动'));
});

test('the description leads with the facts and then the author notes', () => {
  const meta = pageMeta({ kind: 'build', build: BUILD }, 'en');
  assert.ok(meta.description.startsWith('Axe · T6'), meta.description);
  assert.ok(meta.description.includes('Rush the boots'), meta.description);
});

test('a build with no notes falls back to naming its author', () => {
  const meta = pageMeta({ kind: 'build', build: { ...BUILD, body: '' } }, 'en');
  assert.ok(meta.description.includes('by kozorez'), meta.description);
});

test('newlines in the notes do not reach the description', () => {
  const meta = pageMeta({ kind: 'build', build: { ...BUILD, body: 'one\n\ntwo' } }, 'en');
  assert.ok(!meta.description.includes('\n'));
});

test('a build is an article, points at its own card, and is indexable', () => {
  const meta = pageMeta({ kind: 'build', build: BUILD }, 'en');
  assert.equal(meta.type, 'article');
  assert.equal(meta.image, '/api/og/builds/7kQm2.png');
  assert.equal(meta.path, '/builds/7kQm2');
  assert.equal(meta.noindex, false);
  assert.equal(meta.publishedAt, BUILD.publishedAt);
  assert.equal(meta.modifiedAt, BUILD.updatedAt);
});

test('a draft carries no published timestamp rather than an empty one', () => {
  const meta = pageMeta({ kind: 'build', build: { ...BUILD, publishedAt: null } }, 'en');
  assert.ok(!('publishedAt' in meta), Object.keys(meta).join(','));
});

test('the four private routes are noindex and the two public ones are not', () => {
  const noindex = (kind: 'mine' | 'edit' | 'view' | 'settings') => pageMeta({ kind }, 'en').noindex;
  assert.equal(noindex('mine'), true);
  assert.equal(noindex('edit'), true);
  assert.equal(noindex('view'), true);
  assert.equal(noindex('settings'), true);
  assert.equal(pageMeta({ kind: 'browse' }, 'en').noindex, false);
  assert.equal(pageMeta({ kind: 'tracker' }, 'en').noindex, false);
});

test('every static route canonicalises to the path the router actually serves', () => {
  assert.equal(pageMeta({ kind: 'browse' }, 'en').path, '/');
  assert.equal(pageMeta({ kind: 'mine' }, 'en').path, '/me');
  assert.equal(pageMeta({ kind: 'edit' }, 'en').path, '/edit');
  assert.equal(pageMeta({ kind: 'view' }, 'en').path, '/view');
  assert.equal(pageMeta({ kind: 'settings' }, 'en').path, '/settings');
  assert.equal(pageMeta({ kind: 'tracker' }, 'en').path, '/tracker');
});

test('a subpath build moves the routes but not the API', () => {
  const meta = pageMeta({ kind: 'tracker' }, 'en', '/dota-aow5-utils/');
  assert.equal(meta.path, '/dota-aow5-utils/tracker');
  assert.equal(meta.image, '/api/og/site.png', 'the API is always at the origin root');
});

test('a build that could not be loaded keeps its own URL and is not indexed', () => {
  const meta = pageMeta({ kind: 'missing', slug: 'gone1' }, 'en');
  assert.equal(meta.path, '/builds/gone1');
  assert.equal(meta.noindex, true);
});

test('every language fills in every route', () => {
  for (const lang of SEO_LANGS) {
    for (const kind of ['browse', 'mine', 'edit', 'view', 'settings', 'tracker'] as const) {
      const meta = pageMeta({ kind }, lang);
      assert.ok(meta.title.trim() !== '', `${lang}/${kind} title`);
      assert.ok(meta.description.trim() !== '', `${lang}/${kind} description`);
      assert.ok(meta.title.includes(SEO_STRINGS[lang].brand), `${lang}/${kind} brand`);
    }
  }
});

test('a price is written the compact way every other surface writes it', () => {
  // The specification lives in the webapp's price.test.ts, which now exercises
  // this same implementation. These are here so a card and a description cannot
  // start disagreeing with a browse row unnoticed.
  assert.equal(formatGold(1_500_000), '1.5m');
  assert.equal(formatGold(12_400), '12.4k');
  assert.equal(formatGold(750), '750');
  assert.equal(formatGold(0), '0');
  assert.equal(formatGold(-5), '0');
});
