import assert from 'node:assert/strict';
import { test } from 'node:test';
import { otherLangs, parseAcceptLanguage, pickLang } from './lang.ts';

test('the weights decide the order, not the position', () => {
  assert.deepEqual(parseAcceptLanguage('ru;q=0.5,en;q=0.9'), ['en', 'ru']);
});

test('an unweighted tag outranks a weighted one', () => {
  assert.deepEqual(parseAcceptLanguage('ru-RU,ru;q=0.9,en;q=0.8'), ['ru-ru', 'ru', 'en']);
});

test('equal weights keep the order they were sent in', () => {
  assert.deepEqual(parseAcceptLanguage('de,fr,es'), ['de', 'fr', 'es']);
});

test('q=0 is a refusal and is dropped', () => {
  assert.deepEqual(parseAcceptLanguage('en;q=0,ru'), ['ru']);
});

test('nonsense parses to nothing rather than throwing', () => {
  assert.deepEqual(parseAcceptLanguage(''), []);
  assert.deepEqual(parseAcceptLanguage(undefined), []);
  assert.deepEqual(parseAcceptLanguage(',,;;'), []);
  assert.deepEqual(parseAcceptLanguage('en;q=banana'), ['en'], 'a bad q means "no preference", not "never"');
});

test('the query wins over the header', () => {
  assert.equal(pickLang('zh', 'ru-RU,ru;q=0.9'), 'zh');
});

test('a query naming a language the site does not speak falls through to the header', () => {
  assert.equal(pickLang('de', 'ru'), 'ru');
  assert.equal(pickLang('', 'ru'), 'ru');
});

test('a region subtag still reaches its language', () => {
  assert.equal(pickLang(undefined, 'ru-RU'), 'ru');
  assert.equal(pickLang(undefined, 'zh-Hans-CN'), 'zh');
});

test('English is the answer when nobody asked for anything', () => {
  assert.equal(pickLang(undefined, undefined), 'en');
  assert.equal(pickLang(undefined, '*'), 'en');
  assert.equal(pickLang(undefined, 'de-DE,fr;q=0.8'), 'en');
});

test('the alternates are the other two, never the one asked for', () => {
  assert.deepEqual(otherLangs('ru'), ['en', 'zh']);
  assert.deepEqual(otherLangs('en'), ['ru', 'zh']);
});
