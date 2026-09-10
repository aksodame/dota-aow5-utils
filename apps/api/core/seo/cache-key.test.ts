import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCardKey, siteCardKey, stale } from './cache-key.ts';

test('a build card is keyed by build, version and language', () => {
  assert.deepEqual(buildCardKey('BG7g', 1700, 'ru'), {
    name: 'BG7g.1700.ru',
    family: 'BG7g',
    generation: 'BG7g.1700',
  });
});

test('an older version of the same build is superseded', () => {
  const files = ['BG7g.1600.en.png', 'BG7g.1600.ru.png', 'BG7g.1700.en.png'];
  assert.deepEqual(stale(files, buildCardKey('BG7g', 1700, 'en')), ['BG7g.1600.en.png', 'BG7g.1600.ru.png']);
});

test('another language of the same version is a peer, not a predecessor', () => {
  // The bug this file exists for: two scrapers in different languages evicting
  // each other forever, which looks exactly like a cache that works.
  const files = ['BG7g.1700.en.png', 'BG7g.1700.zh.png'];
  assert.deepEqual(stale(files, buildCardKey('BG7g', 1700, 'ru')), []);
});

test('a card never supersedes itself', () => {
  assert.deepEqual(stale(['BG7g.1700.en.png'], buildCardKey('BG7g', 1700, 'en')), []);
});

test('another build is left alone, even one whose slug is a prefix of this one', () => {
  const files = ['BG7g.1600.en.png', 'BG7gfLz.1600.en.png'];
  assert.deepEqual(stale(files, buildCardKey('BG7gfLz', 1700, 'en')), ['BG7gfLz.1600.en.png']);
});

test('the site card supersedes nothing, in any language', () => {
  const files = ['site.en.png', 'site.ru.png', 'site.zh.png'];
  for (const lang of ['en', 'ru', 'zh']) {
    assert.deepEqual(stale(files, siteCardKey(lang)), [], lang);
  }
});

test('the site card does not collide with a build that could never be called site', () => {
  // `site` is outside the slug alphabet's length range at four characters only
  // by luck, so this asserts the separator is doing the work rather than luck.
  assert.deepEqual(stale(['sitex.1600.en.png'], siteCardKey('en')), []);
});
