import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_IDS, DEFAULT_CARDS, isCardId, readCards } from './cards.ts';

/**
 * The reader, because it is the invariant the HUD depends on and cannot check
 * for itself: at least one card, always. A HUD drawn from an empty list is a
 * blank panel whose only remedy lives in another window.
 */

test('a config that never heard of cards gets the six defaults', () => {
  assert.deepEqual(readCards(undefined), DEFAULT_CARDS);
  assert.deepEqual(readCards(null), DEFAULT_CARDS);
  assert.deepEqual(readCards('session'), DEFAULT_CARDS, 'a string is not a list');
});

test('the defaults are copied, never handed out', () => {
  // A caller mutating what it read must not edit the constant every later read
  // is built from.
  const first = readCards(undefined);
  first.push('goldPerHour');
  assert.deepEqual(readCards(undefined), DEFAULT_CARDS);
});

test('an empty list falls back rather than being honoured', () => {
  assert.deepEqual(readCards([]), DEFAULT_CARDS);
});

test('a list of nothing but junk falls back too', () => {
  assert.deepEqual(readCards(['nope', 42, null, {}]), DEFAULT_CARDS);
});

test('unknown ids are dropped, the rest survive', () => {
  // What a file from a newer build looks like on an older one.
  assert.deepEqual(readCards(['session', 'somethingNew', 'mapGold']), ['session', 'mapGold']);
});

test('one card is a legal answer', () => {
  assert.deepEqual(readCards(['sessionBest']), ['sessionBest']);
});

test('duplicates collapse', () => {
  assert.deepEqual(readCards(['mapGold', 'mapGold', 'mapGold']), ['mapGold']);
});

test('draw order is CARD_IDS, whatever order the file lists', () => {
  assert.deepEqual(readCards(['mapGold', 'session', 'sessionGold']), ['session', 'sessionGold', 'mapGold']);
});

test('every default is a real card, and the defaults fill both rows', () => {
  for (const id of DEFAULT_CARDS) assert.ok(isCardId(id), `${id} is not in CARD_IDS`);
  assert.equal(DEFAULT_CARDS.length, 6, 'two full rows of three');
});

test('ids are unique', () => {
  assert.equal(new Set(CARD_IDS).size, CARD_IDS.length);
});
