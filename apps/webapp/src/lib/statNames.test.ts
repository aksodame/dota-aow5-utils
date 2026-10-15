import assert from 'node:assert/strict';
import test from 'node:test';
import { STAT_NAMES } from '../wiki/i18n/statNames.ts';

/**
 * The wiki's own stat names, kept honest across languages.
 *
 * `STAT_NAMES` shipped once with the Russian column carrying 68 keys and the
 * English and Chinese ones 28: the two fell back to the game's own labels for
 * the rest, so the same stat was named two ways depending on the reader's
 * language — and nothing said so, because a fallback is a name either way.
 * The columns are the one thing here that must not drift, so the check is on
 * their shape rather than on what any single name says.
 */

const columns = Object.entries(STAT_NAMES);

test('every language the site ships has a column', () => {
  assert.deepEqual(Object.keys(STAT_NAMES).sort(), ['en', 'ru', 'zh']);
});

test('the columns hold the same keys', () => {
  const keys = Object.keys(STAT_NAMES.en).sort();
  for (const [lang, column] of columns) {
    assert.deepEqual(Object.keys(column).sort(), keys, `${lang} names a different set of stats than en`);
  }
});

test('a name is a word, not an empty string', () => {
  for (const [lang, column] of columns) {
    for (const [key, name] of Object.entries(column)) {
      assert.notEqual(name.trim(), '', `${lang}'s name for ${key} is empty`);
    }
  }
});
