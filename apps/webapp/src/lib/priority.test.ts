import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import type { BuildItemPriority } from 'aow5-api-contract';
import { createEmptyState, type BuildState } from 'aow5-shared/codec';
import type { ItemFull, RollTables } from 'aow5-shared/types';
import {
  affixable,
  emptyEntry,
  entryAt,
  forSaving,
  isEmptyEntry,
  isPrioritySlot,
  moveStat,
  prioritySlots,
  rankedKeys,
  reconcile,
  setAffix,
  setTarget,
  splitByKind,
  withEntry,
} from './priority.ts';

/**
 * Against the emitted tables, like the stat-block tests beside them: what a
 * card is allowed to rank depends on the addon's own random-attribute table,
 * and a fixture would let the two drift apart without saying so.
 */
const require = createRequire(import.meta.url);
const DATA = path.join(path.dirname(require.resolve('aow5-shared/package.json')), 'public', 'data');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')) as T;

const tables = read<RollTables>('rolls.json');
const full = read<Record<string, ItemFull>>('items.full.json');

/** An item with several rollable stats, chosen from the real catalogue. */
const sample = Object.values(full).find(
  (item) => item.type === 'equip' && rankedKeys(tables, item.values, emptyEntry(3)).length >= 3,
);
assert.ok(sample !== undefined, 'the catalogue still has equipment with three rollable stats');
const values = sample.values;
const keys = rankedKeys(tables, values, emptyEntry(3));

const withStats = (over: Partial<BuildItemPriority> = {}): BuildItemPriority => ({
  ...emptyEntry(3),
  stats: keys.map((key) => ({ key, target: null })),
  ...over,
});

const placed = (slots: Record<number, string>): BuildState => {
  const state = createEmptyState();
  for (const [slot, id] of Object.entries(slots)) state.slots[Number(slot)] = { k: 'id', id };
  return state;
};

test('the panel is about gear, not consumables or runes', () => {
  // Slots 0-2 are potions, 3-8 the worn six, 9-11 runes, 13/14 the carried pair.
  assert.equal(isPrioritySlot(0), false, 'a potion has no copy to prefer');
  assert.equal(isPrioritySlot(3), true);
  assert.equal(isPrioritySlot(8), true);
  assert.equal(isPrioritySlot(9), false, "a rune's values do not roll");
  assert.equal(isPrioritySlot(13), true);
  assert.equal(isPrioritySlot(14), true);
  assert.equal(isPrioritySlot(12), false, 'the pet slot is hidden');
});

test('only filled gear slots get a card, in board order', () => {
  const state = placed({ 0: sample.id, 8: sample.id, 3: sample.id, 9: sample.id });
  assert.deepEqual(prioritySlots(state), [
    { slot: 3, id: sample.id },
    { slot: 8, id: sample.id },
  ]);
});

test('an unresolved item gets no card, having no stats to rank', () => {
  const state = createEmptyState();
  state.slots[3] = { k: 'unknown', idx: 9999 };
  assert.deepEqual(prioritySlots(state), []);
});

test('a slot with no opinion reads as an empty one', () => {
  assert.deepEqual(entryAt([], 5), emptyEntry(5));
  assert.equal(isEmptyEntry(emptyEntry(5)), true);
});

test('entries stay in board order however they are added', () => {
  const list = withEntry(withEntry([], emptyEntry(8)), emptyEntry(3));
  assert.deepEqual(list.map((entry) => entry.slot), [3, 8]);
  // And replacing one does not duplicate it.
  const replaced = withEntry(list, { ...emptyEntry(3), reforge: 9 });
  assert.equal(replaced.length, 2);
  assert.equal(replaced[0]?.reforge, 9);
});

test('only rollable stats are ranked', () => {
  const unrollable = Object.keys(values).filter((key) => !keys.includes(key));
  for (const key of unrollable) {
    assert.ok(!keys.includes(key), `${key} is the same on every copy, so there is nothing to reroll for`);
  }
  assert.ok(keys.length >= 3);
});

test("the author's order wins, and new stats follow in the item's own order", () => {
  const reversed = [...keys].reverse();
  const entry = withStats({ stats: reversed.map((key) => ({ key, target: null })) });
  assert.deepEqual(rankedKeys(tables, values, entry), reversed);

  // A stat the stored order has never heard of — a patch, or a swapped item.
  const partial = withStats({ stats: [{ key: keys[1] as string, target: 0 }] });
  const merged = rankedKeys(tables, values, partial);
  assert.equal(merged[0], keys[1]);
  assert.equal(merged.length, keys.length);
  assert.deepEqual([...merged].sort(), [...keys].sort());
});

test('a stat the item no longer has takes its badge with it', () => {
  const entry = withStats({
    stats: [{ key: 'a_stat_this_item_never_had', target: 2 }, ...keys.map((key) => ({ key, target: null }))],
    fixed: 'a_stat_this_item_never_had',
    enhanced: keys[0] as string,
  });
  const fixedUp = reconcile(tables, values, entry);

  assert.deepEqual(fixedUp.stats.map((stat) => stat.key), keys);
  assert.equal(fixedUp.fixed, null, 'a badge cannot outlive the stat it points at');
  assert.equal(fixedUp.enhanced, keys[0], 'one that still exists is kept');
});

test('reconciling keeps the targets the author set', () => {
  const entry = withStats({ stats: keys.map((key, i) => ({ key, target: i === 1 ? 0 : null })) });
  const kept = reconcile(tables, values, entry);
  assert.equal(kept.stats.find((stat) => stat.key === keys[1])?.target, 0);
});

test('a reforge level from a stale client is clamped on the way through', () => {
  assert.equal(reconcile(tables, values, withStats({ reforge: 99 })).reforge, tables.maxReforgeLevel);
  assert.equal(reconcile(tables, values, withStats({ reforge: -2 })).reforge, 0);
});

test('a stat moves up and down, and never off either end', () => {
  const entry = withStats();
  const first = keys[0] as string;
  assert.deepEqual(moveStat(entry, first, -1).stats.map((s) => s.key), keys, 'the top stays put');

  const moved = moveStat(entry, first, 1);
  assert.deepEqual(moved.stats.map((s) => s.key), [keys[1], keys[0], ...keys.slice(2)]);

  const last = keys.at(-1) as string;
  assert.deepEqual(moveStat(entry, last, 1).stats.map((s) => s.key), keys, 'and so does the bottom');
  assert.deepEqual(moveStat(entry, 'not_a_stat', 1), entry);
});

test('an affix mark moves rather than multiplying, and clicking it again clears it', () => {
  const entry = withStats();
  const one = setAffix(entry, 'fixed', keys[0] as string);
  assert.equal(one.fixed, keys[0]);

  const moved = setAffix(one, 'fixed', keys[1] as string);
  assert.equal(moved.fixed, keys[1], 'the game gives one fixed stat, so the mark moves');

  assert.equal(setAffix(moved, 'fixed', keys[1] as string).fixed, null);
  // The two marks are independent, and may name the same stat.
  const both = setAffix(one, 'enhanced', keys[0] as string);
  assert.equal(both.fixed, keys[0]);
  assert.equal(both.enhanced, keys[0]);
});

test('a target is set per stat and leaves its neighbours alone', () => {
  const entry = setTarget(withStats(), keys[1] as string, 1);
  assert.equal(entry.stats.find((stat) => stat.key === keys[1])?.target, 1);
  assert.equal(entry.stats.find((stat) => stat.key === keys[0])?.target, null);
  assert.equal(isEmptyEntry(entry), false);
});

test('the divine forge is a fact about the item, and enough to save a card for', () => {
  // One roll on the whole item, so it is one field on the entry rather than a
  // flag per stat — and on its own it is an opinion worth storing.
  const forged = { ...withStats(), divine: true };
  assert.equal(isEmptyEntry(forged), false);
  assert.equal(isEmptyEntry({ ...forged, divine: false }), true);
  assert.equal(reconcile(tables, values, forged).divine, true, 'and it survives a reconcile');
});

test('what gets saved is the cards that say something, about slots that hold something', () => {
  const slots = [{ slot: 3 }, { slot: 8 }];
  const priority = [
    withStats({ slot: 3, note: 'the shield half is the point' }),
    withStats({ slot: 8 }),
    withStats({ slot: 14, reforge: 9 }),
  ];
  const saved = forSaving(priority, slots);
  assert.deepEqual(saved.map((entry) => entry.slot), [3], 'untouched cards and emptied slots both go');
});

test("a passive's numbers are ranked too, in a group of their own", () => {
  // Two thirds of this game's equipment carries a passive, and its figures roll
  // like everything else — so a card that ranked only the stat block was
  // leaving half of some items unsaid.
  const passive = Object.values(full).find(
    (item) =>
      item.type === 'equip' &&
      Object.keys(item.values).some((key) => key.startsWith('ability_value_')) &&
      Object.keys(item.values).some((key) => !key.startsWith('ability_')),
  );
  assert.ok(passive !== undefined, 'the catalogue still has equipment with a rolled passive');

  const ranked = rankedKeys(tables, passive.values, emptyEntry(3));
  const { base, passive: inside } = splitByKind(ranked);
  assert.ok(base.length > 0 && inside.length > 0);
  assert.ok(inside.every((key) => key.startsWith('ability_value')));
  // The stats come first, the way the item's own block reads.
  assert.deepEqual(ranked, [...base, ...inside]);

  // No affix lands inside a passive, so those rows carry no marks.
  assert.equal(affixable(tables, inside[0] as string), false);
  assert.equal(affixable(tables, base[0] as string), true);
});

test('reordering stays inside its group', () => {
  // The stored list is one list, but a swap across the boundary would look like
  // a row teleporting into the block below.
  const stats = [
    { key: 'bonus_attack_damage', target: null },
    { key: 'ability_value_one', target: null },
    { key: 'evasion_pct', target: null },
    { key: 'ability_value_two', target: null },
  ];
  const entry = { ...emptyEntry(3), stats };

  const down = moveStat(entry, 'bonus_attack_damage', 1);
  assert.deepEqual(
    splitByKind(down.stats.map((stat) => stat.key)).base,
    ['evasion_pct', 'bonus_attack_damage'],
    'it swaps with the next stat, not with the passive line between them',
  );
  assert.deepEqual(splitByKind(down.stats.map((stat) => stat.key)).passive, ['ability_value_one', 'ability_value_two']);

  const up = moveStat(entry, 'ability_value_two', -1);
  assert.deepEqual(splitByKind(up.stats.map((stat) => stat.key)).passive, ['ability_value_two', 'ability_value_one']);

  // The last of a group has nowhere further to go, whatever follows it.
  assert.deepEqual(moveStat(entry, 'evasion_pct', 1), entry);
  assert.deepEqual(moveStat(entry, 'ability_value_one', -1), entry);
});
