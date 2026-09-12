import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_VERSION, buildCardKey, siteCardKey, stale, trackerCardKey } from './cache-key.ts';

test('a build card is keyed by build, version, renderer and language', () => {
  const v = CARD_VERSION;
  assert.deepEqual(buildCardKey('BG7g', 1700, 'ru'), {
    name: `BG7g.1700v${v}.ru`,
    family: 'BG7g',
    generation: `BG7g.1700v${v}`,
  });
});

test('a renderer bump supersedes the cards drawn by the one before it', () => {
  // The half of the font bug that outlived the fix: the build had not changed,
  // so the key had not changed, so every scrape kept serving a picture with no
  // words on it until somebody deleted the directory by hand.
  const older = `BG7g.1700v${CARD_VERSION - 1}`;
  const files = [`${older}.en.png`, `${older}.ru.png`];
  assert.deepEqual(stale(files, buildCardKey('BG7g', 1700, 'en')), files);
});

test('the site card is versioned too, and supersedes its own older renders', () => {
  const older = `site.v${CARD_VERSION - 1}`;
  assert.deepEqual(stale([`${older}.en.png`], siteCardKey('en')), [`${older}.en.png`]);
});

test('an older version of the same build is superseded', () => {
  const old1 = `${buildCardKey('BG7g', 1600, 'en').name}.png`;
  const old2 = `${buildCardKey('BG7g', 1600, 'ru').name}.png`;
  const current = `${buildCardKey('BG7g', 1700, 'en').name}.png`;
  assert.deepEqual(stale([old1, old2, current], buildCardKey('BG7g', 1700, 'en')), [old1, old2]);
});

test('another language of the same version is a peer, not a predecessor', () => {
  // The bug this file exists for: two scrapers in different languages evicting
  // each other forever, which looks exactly like a cache that works.
  const files = [`${buildCardKey('BG7g', 1700, 'en').name}.png`, `${buildCardKey('BG7g', 1700, 'zh').name}.png`];
  assert.deepEqual(stale(files, buildCardKey('BG7g', 1700, 'ru')), []);
});

test('a card never supersedes itself', () => {
  const key = buildCardKey('BG7g', 1700, 'en');
  assert.deepEqual(stale([`${key.name}.png`], key), []);
});

test('another build is left alone, even one whose slug is a prefix of this one', () => {
  const other = `${buildCardKey('BG7g', 1600, 'en').name}.png`;
  const mine = `${buildCardKey('BG7gfLz', 1600, 'en').name}.png`;
  assert.deepEqual(stale([other, mine], buildCardKey('BG7gfLz', 1700, 'en')), [mine]);
});

test('the site card supersedes no peer of its own generation, in any language', () => {
  const files = ['en', 'ru', 'zh'].map((lang) => `${siteCardKey(lang).name}.png`);
  for (const lang of ['en', 'ru', 'zh']) {
    assert.deepEqual(stale(files, siteCardKey(lang)), [], lang);
  }
});

test('the site card does not collide with a build that could never be called site', () => {
  // `site` is outside the slug alphabet's length range at four characters only
  // by luck, so this asserts the separator is doing the work rather than luck.
  assert.deepEqual(stale(['sitex.1600.en.png'], siteCardKey('en')), []);
});

test('the tracker card is keyed like the site card, in its own family', () => {
  const en = trackerCardKey('en');
  const ru = trackerCardKey('ru');
  assert.equal(en.family, 'tracker');
  assert.notEqual(en.name, ru.name, 'two languages are two files');
  assert.equal(en.generation, ru.generation, 'and they are peers, not predecessors');
  // Its own family, so it never evicts the site's card or a build's and neither
  // of them evicts it.
  assert.deepEqual(stale([siteCardKey('en').name + '.png', buildCardKey('BG7g', 1, 'en').name + '.png'], en), []);
  assert.deepEqual(stale([en.name + '.png', ru.name + '.png'], siteCardKey('en')), []);
});

test('a renderer bump supersedes the tracker cards of every language', () => {
  const key = trackerCardKey('en');
  const older = ['tracker.v1.en.png', 'tracker.v1.ru.png', 'tracker.v1.zh.png'];
  assert.deepEqual(stale([...older, `${key.name}.png`], key).sort(), older.sort());
});
