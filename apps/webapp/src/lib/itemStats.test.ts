import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import { formatValue, gemRows, isTuningKey, prettifyKey, statRows } from './itemStats.ts';

/**
 * The stat block, against the real data.
 *
 * These exist because the hover card shipped once with stats filtered on
 * "has a localized label", which showed nothing for 841 of the 879 items that
 * have stats — and looked exactly like an item with no stats rather than like a
 * bug. The coverage assertion at the bottom is the one that would have caught
 * it, so it is written in terms of the whole catalogue rather than a fixture.
 */

const require = createRequire(import.meta.url);
const DATA = path.join(path.dirname(require.resolve('aow5-shared/package.json')), 'public', 'data');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')) as T;

const full = read<Record<string, ItemFull>>('items.full.json');
const details = read<Record<string, LocaleDetail>>('locale.en.details.json');

test('a raw key becomes something a person can read', () => {
  assert.equal(prettifyKey('bonus_attack_damage'), 'Attack damage');
  assert.equal(prettifyKey('physical_crit_chance_pct'), 'Physical crit chance');
  assert.equal(prettifyKey('tag_gem_damage'), 'Damage');
  // `bonus_` and `_pct` are dropped because the `+` and the `%` on the value
  // already say both — printing them twice is noise the game does not print.
  assert.equal(prettifyKey('bonus_all_stats'), 'All stats');
});

test('a value carries its own sign and unit', () => {
  assert.equal(formatValue('attack_speed', 40), '+40');
  assert.equal(formatValue('evasion_pct', 15), '+15%');
  assert.equal(formatValue('bonus_armor', -4), '-4');
  assert.equal(formatValue('some_ratio', 1.5), '+1.5');
  assert.equal(formatValue('odd_one', 'text'), 'text');
});

test("the game's own label wins, without doubling the plus sign", () => {
  const rows = statRows(
    { values: { bonus_all_stats: 12 } } as unknown as ItemFull,
    { values: { bonus_all_stats: '+All Stats Bonus' } },
  );
  assert.deepEqual(rows, [{ key: 'bonus_all_stats', label: 'All Stats Bonus', value: '+12' }]);
});

test('the numbers a passive already states are not repeated above it', () => {
  assert.equal(isTuningKey('ability_value_extra_target_count'), true);
  assert.equal(isTuningKey('attack_speed'), false);

  const item = { values: { attack_speed: 40, ability_value_extra_target_count: 2 } } as unknown as ItemFull;
  assert.deepEqual(statRows(item, undefined).map((r) => r.key), ['attack_speed']);
  assert.deepEqual(statRows(item, undefined, 'tuning').map((r) => r.key), ['ability_value_extra_target_count']);
});

test('an item with no stats yields no rows rather than throwing', () => {
  assert.deepEqual(statRows(undefined, undefined), []);
  assert.deepEqual(gemRows(undefined), []);
  assert.deepEqual(statRows({ values: {} } as unknown as ItemFull, undefined), []);
});

// --- the regression that started this ---------------------------------------

test('every item with stats produces at least one readable row', () => {
  /*
   * The assertion that matters. Only 38 items in the catalogue carry a full set
   * of localized labels, so any implementation that requires one shows an empty
   * card for the rest — which is indistinguishable from an item that genuinely
   * has no stats.
   */
  const withStats = Object.entries(full).filter(([, item]) => {
    return Object.keys(item.values ?? {}).some((key) => !isTuningKey(key));
  });
  assert.ok(withStats.length > 500, `expected a catalogue, got ${withStats.length} items with stats`);

  const empty = withStats.filter(([id, item]) => statRows(item, details[id]).length === 0);
  assert.deepEqual(empty.slice(0, 5).map(([id]) => id), [], `${empty.length} items would show an empty stat block`);
});

test('no row is labelled with a bare raw key', () => {
  // A leaked `bonus_all_stats` in the UI means prettifyKey was skipped.
  const leaked: string[] = [];
  for (const [id, item] of Object.entries(full)) {
    for (const row of statRows(item, details[id])) {
      if (row.label.includes('_')) leaked.push(`${id}: ${row.label}`);
    }
  }
  assert.deepEqual(leaked.slice(0, 5), [], `${leaked.length} rows show a raw key`);
});

test('a real item reads the way the game states it', () => {
  // item_0323 is the Focus Bow: six stats, none of them labelled by the addon.
  const item = full['item_0323'];
  if (item === undefined) return; // renamed by a data refresh; the sweeps above still cover it
  const rows = statRows(item, details['item_0323']);
  assert.ok(rows.length >= 5, `expected the full stat block, got ${rows.length}`);
  assert.ok(
    rows.some((r) => r.label === 'Attack speed' && r.value === '+40'),
    JSON.stringify(rows),
  );
});

test("a passive's key is the only label it will ever have", () => {
  // The addon ships no token for these, in any language — so the key has to
  // read as a label on its own.
  assert.equal(prettifyKey('ability_value_item_0102_damage'), 'Damage');
  assert.equal(prettifyKey('ability_value_aggressive_outgoing_damage_pct'), 'Aggressive outgoing damage');
  assert.equal(prettifyKey('ability_value_c_trigger_cooldown'), 'Trigger cooldown');
  assert.equal(prettifyKey('ability_value_extra_target_count'), 'Extra target count');
  // The bare key is a name in its own right; only one stripped to nothing
  // falls back, because a blank label is worse than a raw key.
  assert.equal(prettifyKey('ability_value'), 'Ability value');
  assert.equal(prettifyKey('ability_value_'), 'ability_value_');
});
