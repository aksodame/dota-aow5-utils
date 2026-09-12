import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageMeta, type BuildFacts } from 'aow5-shared/seo';
import { escapeHtml, headTags, renderPrerender } from './html.ts';

const ORIGIN = 'https://aow5.example';

const BUILD: BuildFacts = {
  slug: '7kQm2',
  title: 'Frost-lock Axe',
  body: 'Rush the boots.',
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

const buildDoc = (lang: 'en' | 'ru' | 'zh' = 'en') =>
  renderPrerender({
    meta: pageMeta({ kind: 'build', build: BUILD }, lang),
    origin: ORIGIN,
    heading: BUILD.title,
    paragraphs: ['Axe · T6', BUILD.body],
  });

test('escaping closes every hole a title could open', () => {
  assert.equal(escapeHtml('<script>&"\'</script>'), '&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
});

test('an ampersand is escaped once, not twice', () => {
  assert.equal(escapeHtml('Q&A'), 'Q&amp;A');
  assert.ok(!escapeHtml('Q&A').includes('&amp;amp;'));
});

test('a title that is an injection attempt cannot escape its tag', () => {
  const nasty = { ...BUILD, title: '</title><script>alert(1)</script>' };
  const html = renderPrerender({
    meta: pageMeta({ kind: 'build', build: nasty }, 'en'),
    origin: ORIGIN,
    heading: nasty.title,
  });
  assert.ok(!html.includes('<script>'), html.slice(0, 400));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('a title with a quote in it cannot escape a meta attribute', () => {
  const nasty = { ...BUILD, title: 'a" content="b' };
  const html = renderPrerender({ meta: pageMeta({ kind: 'build', build: nasty }, 'en'), origin: ORIGIN, heading: 'x' });
  assert.ok(!html.includes('content="b'), 'the quote must not close the attribute');
});

test('every tag a scraper looks for is present on a build', () => {
  const html = buildDoc();
  for (const needle of [
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    'property="og:url"',
    'property="og:type" content="article"',
    'property="og:site_name"',
    'property="og:locale" content="en_US"',
    'name="twitter:card" content="summary_large_image"',
    'name="twitter:image"',
    'name="description"',
    'rel="canonical"',
  ]) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
});

test('the image is absolute and carries its dimensions', () => {
  const html = buildDoc();
  // `<slug>.<updated_at>.<lang>.png` — the language is in the path because the
  // card is drawn per language and the address promises to be immutable.
  assert.ok(html.includes(`content="${ORIGIN}/api/og/builds/7kQm2.${BUILD.updatedAt}.en.png"`), html);
  assert.ok(html.includes('property="og:image:width" content="1200"'));
  assert.ok(html.includes('property="og:image:height" content="630"'));
});

test('og:image follows og:title, for the scrapers that stop at the first pair', () => {
  const tags = headTags({ meta: pageMeta({ kind: 'build', build: BUILD }, 'en'), origin: ORIGIN, heading: 'x' });
  const title = tags.findIndex((tag) => tag.includes('og:title'));
  const image = tags.findIndex((tag) => tag.includes('property="og:image"'));
  assert.ok(title >= 0 && image > title, `title at ${title}, image at ${image}`);
});

test('the canonical of a non-default language carries its lang, and English does not', () => {
  assert.ok(buildDoc('ru').includes(`rel="canonical" href="${ORIGIN}/builds/7kQm2?lang=ru"`));
  assert.ok(buildDoc('en').includes(`rel="canonical" href="${ORIGIN}/builds/7kQm2"`));
});

test('all three languages plus x-default are declared, whichever one is being served', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const html = buildDoc(lang);
    assert.ok(html.includes('hreflang="en"'), lang);
    assert.ok(html.includes('hreflang="ru"'), lang);
    assert.ok(html.includes('hreflang="zh-Hans"'), lang);
    assert.ok(html.includes('hreflang="x-default"'), lang);
  }
});

test('the alternates are the other two languages, never the one being served', () => {
  const html = buildDoc('ru');
  assert.ok(html.includes('og:locale" content="ru_RU"'));
  assert.ok(html.includes('og:locale:alternate" content="en_US"'));
  assert.ok(html.includes('og:locale:alternate" content="zh_CN"'));
  assert.ok(!html.includes('og:locale:alternate" content="ru_RU"'), 'ru is the locale, not an alternate');
});

test('a noindex route says so and declares no translations', () => {
  const html = renderPrerender({ meta: pageMeta({ kind: 'settings' }, 'en'), origin: ORIGIN, heading: 'Settings' });
  assert.ok(html.includes('name="robots" content="noindex, follow"'));
  assert.ok(!html.includes('hreflang='), 'nothing to say about translations of a page nobody should index');
});

test('an indexable route carries no robots tag at all', () => {
  const html = renderPrerender({ meta: pageMeta({ kind: 'browse' }, 'en'), origin: ORIGIN, heading: 'Builds' });
  assert.ok(!html.includes('name="robots"'));
});

test('article timestamps are ISO-8601, from the seconds the database stores', () => {
  const html = buildDoc();
  assert.ok(html.includes(`content="${new Date(BUILD.publishedAt! * 1000).toISOString()}"`), html);
  assert.ok(html.includes('property="article:modified_time"'));
});

test('a website carries no article timestamps', () => {
  const html = renderPrerender({ meta: pageMeta({ kind: 'browse' }, 'en'), origin: ORIGIN, heading: 'Builds' });
  assert.ok(!html.includes('article:published_time'));
});

test('the document declares the language it is written in', () => {
  assert.ok(buildDoc('zh').startsWith('<!doctype html>\n<html lang="zh-Hans">'));
  assert.ok(buildDoc('ru').includes('<html lang="ru">'));
});

test('the body carries the real page text, not an empty shell', () => {
  const html = buildDoc();
  assert.ok(html.includes('<h1>Frost-lock Axe</h1>'));
  assert.ok(html.includes('Rush the boots.'));
});

test('an empty paragraph is dropped rather than rendered blank', () => {
  const html = renderPrerender({
    meta: pageMeta({ kind: 'browse' }, 'en'),
    origin: ORIGIN,
    heading: 'Builds',
    paragraphs: ['', '   ', 'real'],
  });
  assert.equal(html.match(/<p>/g)?.length, 1);
});

test('links are rendered as links, so a crawler has somewhere to go', () => {
  const html = renderPrerender({
    meta: pageMeta({ kind: 'browse' }, 'en'),
    origin: ORIGIN,
    heading: 'Builds',
    links: [{ href: '/builds/7kQm2', text: 'Frost-lock Axe' }],
  });
  assert.ok(html.includes('<a href="/builds/7kQm2">Frost-lock Axe</a>'));
});
