import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEO_LANGS, SEO_STRINGS } from './strings.ts';
import { SOCIAL_TITLE_BUDGET, TITLE_BUDGET, buildCardPath, buildFactLine, pageMeta, type BuildFacts } from './meta.ts';
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

test('the card title is the author words and nothing else', () => {
  // The brand is on `og:site_name` and the hero and tier open the description,
  // so an embed that repeated them here would show each twice and truncate the
  // one line nothing else says — which is what it did.
  for (const lang of SEO_LANGS) {
    const meta = pageMeta({ kind: 'build', build: BUILD }, lang);
    assert.equal(meta.socialTitle, 'Frost-lock Axe', lang);
    assert.ok(!meta.socialTitle.includes(SEO_STRINGS[lang].brand), lang);
    assert.ok(!meta.socialTitle.includes('Axe ·'), lang);
  }
});

test('a card title is still clamped, and to more than a search result gets', () => {
  const long = { ...BUILD, title: 'Поздний яд-билд на башню, где важна только вторая половина пассивки и порядок покупки' };
  const meta = pageMeta({ kind: 'build', build: long }, 'ru');
  assert.ok(textWidth(meta.socialTitle) <= SOCIAL_TITLE_BUDGET, meta.socialTitle);
  assert.ok(SOCIAL_TITLE_BUDGET > TITLE_BUDGET);
  // And the clamp keeps more of the author than the search title does, which is
  // the whole reason there are two budgets.
  const searchHead = meta.title.split(' — ')[0] ?? '';
  assert.ok(meta.socialTitle.length > searchHead.length, meta.socialTitle);
});

test('an untitled build still has a card title', () => {
  const meta = pageMeta({ kind: 'build', build: { ...BUILD, title: '   ' } }, 'en');
  assert.equal(meta.socialTitle, SEO_STRINGS.en.untitled);
});

test('a route that is not a build drops the brand from its card title too', () => {
  const browse = pageMeta({ kind: 'browse' }, 'en');
  assert.equal(browse.socialTitle, SEO_STRINGS.en.routes.browse.title);
  assert.ok(browse.title.includes(SEO_STRINGS.en.brand), browse.title);
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
  // Version then language: the card is drawn per language, so the address
  // names which one rather than leaving it to `Accept-Language`.
  assert.equal(meta.image, `/api/og/builds/7kQm2.${BUILD.updatedAt}.en.png`);
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


test('an edit moves the card to a new address', () => {
  // The whole reason the version is in the path: the response calls itself
  // immutable, so the picture may only change by changing the URL. Keyed on
  // `updated_at` rather than on a hash of the card, because that is the one
  // field that already means "this build is not what it was".
  const before = pageMeta({ kind: 'build', build: BUILD }, 'en');
  const after = pageMeta({ kind: 'build', build: { ...BUILD, updatedAt: BUILD.updatedAt + 1 } }, 'en');
  assert.notEqual(before.image, after.image);
  assert.ok(after.image.startsWith('/api/og/builds/7kQm2.'));
  assert.ok(after.image.endsWith('.png'));
});

test('a card path with no version is still a legal address', () => {
  // Links shared before the version existed keep pointing at this shape, and
  // the route still answers them — see `seo.controller.ts`.
  assert.equal(buildCardPath('7kQm2'), '/api/og/builds/7kQm2.png');
});

test('the language follows the version, and is optional too', () => {
  assert.equal(buildCardPath('7kQm2', 1756100000, 'ru'), '/api/og/builds/7kQm2.1756100000.ru.png');
  assert.equal(buildCardPath('7kQm2', 1756100000, 'zh'), '/api/og/builds/7kQm2.1756100000.zh.png');
  // Shared before the language was in the path. The route falls back to
  // `Accept-Language` for these rather than refusing them.
  assert.equal(buildCardPath('7kQm2', 1756100000), '/api/og/builds/7kQm2.1756100000.png');
  // A language with no version is not a shape this ever emits: the version is
  // what makes the address safe to call immutable, and the language alone
  // would be a second unversioned URL for the same picture.
  assert.equal(buildCardPath('7kQm2', undefined, 'ru'), '/api/og/builds/7kQm2.png');
});
