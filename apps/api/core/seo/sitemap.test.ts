import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRobots, renderSitemap } from './sitemap.ts';

const ORIGIN = 'https://aow5.example';

test('an empty sitemap is still a valid document', () => {
  const xml = renderSitemap(ORIGIN, []);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset'));
  assert.ok(xml.trimEnd().endsWith('</urlset>'));
});

test('the xhtml namespace is declared, or every alternate is ignored', () => {
  assert.ok(renderSitemap(ORIGIN, []).includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
});

test('a URL is absolute and the default language has no query', () => {
  const xml = renderSitemap(ORIGIN, [{ path: '/builds/7kQm2' }]);
  assert.ok(xml.includes(`<loc>${ORIGIN}/builds/7kQm2</loc>`), xml);
});

test('each entry declares all three languages plus x-default inside itself', () => {
  const xml = renderSitemap(ORIGIN, [{ path: '/builds/7kQm2' }]);
  assert.equal(xml.match(/<url>/g)?.length, 1, 'one entry, not one per language');
  assert.ok(xml.includes(`hreflang="en" href="${ORIGIN}/builds/7kQm2"`));
  assert.ok(xml.includes(`hreflang="ru" href="${ORIGIN}/builds/7kQm2?lang=ru"`));
  assert.ok(xml.includes(`hreflang="zh-Hans" href="${ORIGIN}/builds/7kQm2?lang=zh"`));
  assert.ok(xml.includes(`hreflang="x-default" href="${ORIGIN}/builds/7kQm2"`));
});

test('lastmod is a date, not a timestamp that moves on every typo fix', () => {
  const xml = renderSitemap(ORIGIN, [{ path: '/x', lastmod: 1_756_100_000 }]);
  const match = /<lastmod>(.*?)<\/lastmod>/.exec(xml);
  assert.ok(match !== null);
  assert.match(match[1] ?? '', /^\d{4}-\d{2}-\d{2}$/);
});

test('the optional fields are absent rather than empty when not given', () => {
  const xml = renderSitemap(ORIGIN, [{ path: '/x' }]);
  assert.ok(!xml.includes('<lastmod>'));
  assert.ok(!xml.includes('<changefreq>'));
  assert.ok(!xml.includes('<priority>'));
});

test('an ampersand in a path is escaped, or the document does not parse', () => {
  assert.ok(renderSitemap(ORIGIN, [{ path: '/a&b' }]).includes('/a&amp;b'));
});

test('robots names the sitemap by absolute URL', () => {
  assert.ok(renderRobots(ORIGIN).includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
});

test('robots disallows exactly the routes that are noindex', () => {
  const txt = renderRobots(ORIGIN);
  for (const path of ['/edit', '/me', '/settings', '/view']) {
    assert.ok(txt.includes(`Disallow: ${path}`), path);
  }
  assert.ok(!txt.includes('Disallow: /tracker'), 'the tracker page is worth indexing');
  assert.ok(!txt.includes('Disallow: /builds'), 'builds are the point of the site');
});

test('the cards stay fetchable even though the API is disallowed', () => {
  const txt = renderRobots(ORIGIN);
  assert.ok(txt.includes('Disallow: /api/'));
  assert.ok(txt.includes('Allow: /api/og/'));
});
