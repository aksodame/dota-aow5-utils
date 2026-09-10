import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PRIORITY_ITEMS, MAX_PRIORITY_NOTE, MAX_PRIORITY_STATS, MAX_REFORGE_LEVEL } from 'aow5-api-contract';
import { parsePriority, readPriority, serialisePriority } from './priority.ts';

const NUL = String.fromCharCode(0);

/** One item's worth of priority, with the fields a test is not about filled in. */
const item = (over: Record<string, unknown> = {}) => ({
  slot: 3,
  reforge: 9,
  fixed: 'bonus_attack_damage',
  enhanced: null,
  divine: true,
  stats: [
    { key: 'bonus_attack_damage', target: 0 },
    { key: 'evasion_pct', target: null },
  ],
  note: '',
  ...over,
});

test('nothing sent is nothing stored', () => {
  for (const empty of [undefined, null, []]) {
    const result = parsePriority(empty);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.priority, []);
  }
  assert.equal(serialisePriority([]), '');
});

test('a plan round-trips through the column', () => {
  const parsed = parsePriority([item()]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const stored = serialisePriority(parsed.priority);
  assert.notEqual(stored, '');
  assert.deepEqual(readPriority(stored), parsed.priority);
});

test('entries come back in board order, whatever order they arrived in', () => {
  const result = parsePriority([item({ slot: 8 }), item({ slot: 0 }), item({ slot: 4 })]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.priority.map((entry) => entry.slot),
    [0, 4, 8],
  );
});

test('a card nobody touched is not stored', () => {
  // What the editor sends for every item on the board: a stat list, no targets,
  // no affixes, no note. Storing these would make "has a priority" true for
  // every build that has merely been opened.
  const untouched = {
    slot: 5,
    reforge: 0,
    divine: false,
    fixed: null,
    enhanced: null,
    stats: [{ key: 'bonus_attack_damage', target: null }],
    note: '',
  };
  const result = parsePriority([untouched, item()]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.priority.map((entry) => entry.slot), [3]);
});

test('the order of the stats is the priority, and it is kept', () => {
  const stats = [
    { key: 'crit_chance_pct', target: 1 },
    { key: 'bonus_attack_damage', target: null },
    { key: 'evasion_pct', target: null },
  ];
  const result = parsePriority([item({ stats, fixed: 'crit_chance_pct' })]);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok && result.priority[0]?.stats.map((stat) => stat.key),
    ['crit_chance_pct', 'bonus_attack_damage', 'evasion_pct'],
  );
});

test('an affix has to be a stat the plan actually ranks', () => {
  const result = parsePriority([item({ enhanced: 'movespeed_pct' })]);
  assert.equal(result.ok, false);
  assert.match(String(result.ok === false && result.errors['priority']), /movespeed_pct/);
});

test('an empty affix means none rather than a key', () => {
  for (const value of [null, undefined, '']) {
    const result = parsePriority([item({ fixed: value })]);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.priority[0]?.fixed, null);
  }
});

test('a slot off the board is refused', () => {
  for (const slot of [-1, MAX_PRIORITY_ITEMS, 1.5, '3', null]) {
    assert.equal(parsePriority([item({ slot })]).ok, false, `slot ${String(slot)}`);
  }
});

test('one slot cannot have two opinions', () => {
  const result = parsePriority([item({ slot: 2 }), item({ slot: 2, reforge: 4 })]);
  assert.equal(result.ok, false);
  assert.match(String(result.ok === false && result.errors['priority']), /twice/);
});

test('a stat cannot be ranked twice', () => {
  const stats = [
    { key: 'evasion_pct', target: 0 },
    { key: 'evasion_pct', target: 3 },
  ];
  assert.equal(parsePriority([item({ stats, fixed: null })]).ok, false);
});

test('a reforge level outside the game is refused, not clamped', () => {
  assert.equal(parsePriority([item({ reforge: MAX_REFORGE_LEVEL + 1 })]).ok, false);
  assert.equal(parsePriority([item({ reforge: -1 })]).ok, false);
  assert.equal(parsePriority([item({ reforge: 4.5 })]).ok, false);
  assert.equal(parsePriority([item({ reforge: MAX_REFORGE_LEVEL })]).ok, true);
});

test('a missing reforge level is level zero, which is an untouched item', () => {
  const result = parsePriority([item({ reforge: undefined, note: 'keep it as it drops' })]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.priority[0]?.reforge, 0);
});

test('a stat key is checked against the shape the data uses', () => {
  for (const key of ['Bonus_Attack', 'bonus attack', 'bonus-attack', '', 'a'.repeat(65)]) {
    assert.equal(parsePriority([item({ stats: [{ key, target: null }], fixed: null })]).ok, false, key);
  }
});

test('the divine forge is one boolean on the item, and absent is false', () => {
  // Nothing else on this card says anything, so the mark is what decides
  // whether it is stored at all.
  const card = (divine: unknown) =>
    item({ divine, fixed: null, reforge: 0, stats: [{ key: 'evasion_pct', target: null }] });

  const marked = parsePriority([card(true)]);
  assert.equal(marked.ok, true);
  assert.equal(marked.ok && marked.priority[0]?.divine, true);
  assert.equal(marked.ok && marked.priority.length, 1, 'the mark alone is worth storing');

  for (const absent of [undefined, null, false]) {
    const result = parsePriority([card(absent)]);
    assert.equal(result.ok, true, String(absent));
    assert.deepEqual(result.ok && result.priority, [], String(absent));
  }

  for (const junk of ['yes', 1, {}]) {
    assert.equal(parsePriority([card(junk)]).ok, false, JSON.stringify(junk));
  }
});

test('a target is a rank, and a wild one is refused', () => {
  const stat = (target: unknown) => item({ stats: [{ key: 'evasion_pct', target }], fixed: null });
  assert.equal(parsePriority([stat(0)]).ok, true);
  assert.equal(parsePriority([stat(-1)]).ok, false);
  assert.equal(parsePriority([stat(99)]).ok, false);
  assert.equal(parsePriority([stat('best')]).ok, false);
});

test('a note is trimmed, stripped of control characters and capped', () => {
  const result = parsePriority([item({ note: `  the shield half${NUL} is the point  ` })]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.priority[0]?.note, 'the shield half is the point');

  assert.equal(parsePriority([item({ note: 'x'.repeat(MAX_PRIORITY_NOTE) })]).ok, true);
  assert.equal(parsePriority([item({ note: 'x'.repeat(MAX_PRIORITY_NOTE + 1) })]).ok, false);
});

test('the caps are enforced rather than trusted from the editor', () => {
  const stats = Array.from({ length: MAX_PRIORITY_STATS + 1 }, (_, i) => ({ key: `stat_${i}`, target: null }));
  assert.equal(parsePriority([item({ stats, fixed: null })]).ok, false);

  const many = Array.from({ length: MAX_PRIORITY_ITEMS + 1 }, (_, i) => item({ slot: i }));
  assert.equal(parsePriority(many).ok, false);
});

test('anything that is not a list of objects is refused', () => {
  for (const junk of ['[]', 42, { slot: 0 }, [null], ['bonus_attack_damage']]) {
    assert.equal(parsePriority(junk).ok, false, JSON.stringify(junk));
  }
});

test('unreadable storage renders as no priority rather than breaking the page', () => {
  assert.deepEqual(readPriority(''), []);
  assert.deepEqual(readPriority('not json'), []);
  assert.deepEqual(readPriority('{"slot":3}'), []);
  // A row written by a deployment that allowed something this one does not.
  assert.deepEqual(readPriority('[{"slot":99,"reforge":0,"stats":[]}]'), []);
});
