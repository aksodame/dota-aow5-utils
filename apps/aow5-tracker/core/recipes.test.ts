import assert from 'node:assert/strict';
import test from 'node:test';
import type { ItemNeed } from 'aow5-shared/types';
import { completion, craftPlan, directNeeds, flattenNeeds, progress, type Requirement } from './recipes.ts';

/**
 * A miniature recipe graph with the shapes the real data has: a shared
 * ingredient reached by two paths, an intermediate that is itself crafted, and
 * base materials that are not.
 *
 *   sword  <- blade x1, hilt x2, ore x1
 *   blade  <- ore x3, coal x1
 *   hilt   <- ore x1
 */
const GRAPH: Record<string, ItemNeed[]> = {
  sword: [
    { id: 'blade', count: 1 },
    { id: 'hilt', count: 2 },
    { id: 'ore', count: 1 },
  ],
  blade: [
    { id: 'ore', count: 3 },
    { id: 'coal', count: 1 },
  ],
  hilt: [{ id: 'ore', count: 1 }],
};

const needsOf = (id: string) => GRAPH[id];

const asMap = (rows: Requirement[]) => new Map(rows.map((r) => [r.id, r.count]));

test('directNeeds reports one level only', () => {
  assert.deepEqual(asMap(directNeeds('sword', needsOf)), new Map([['blade', 1], ['hilt', 2], ['ore', 1]]));
});

test('directNeeds scales by the number being crafted', () => {
  assert.deepEqual(asMap(directNeeds('sword', needsOf, 3)), new Map([['blade', 3], ['hilt', 6], ['ore', 3]]));
});

test('a base material has no needs', () => {
  assert.deepEqual(directNeeds('ore', needsOf), []);
});

test('flattenNeeds sums an ingredient reached by several paths', () => {
  // ore: 3 through blade, 1 each through two hilts, 1 direct = 6.
  assert.deepEqual(asMap(flattenNeeds('sword', needsOf)), new Map([['ore', 6], ['coal', 1]]));
});

test('flattenNeeds scales the whole tree', () => {
  assert.deepEqual(asMap(flattenNeeds('sword', needsOf, { count: 2 })), new Map([['ore', 12], ['coal', 2]]));
});

test('stopAt keeps an intermediate whole instead of expanding it', () => {
  // blade is counted as itself, so the ore and coal inside it are not wanted:
  // 1 ore through each of two hilts, plus 1 direct.
  assert.deepEqual(
    asMap(flattenNeeds('sword', needsOf, { stopAt: new Set(['blade']) })),
    new Map([['blade', 1], ['ore', 3]]),
  );
});

test('an uncraftable target flattens to nothing', () => {
  assert.deepEqual(flattenNeeds('ore', needsOf), []);
});

test('a cycle is cut rather than followed', () => {
  const cyclic: Record<string, ItemNeed[]> = {
    a: [{ id: 'b', count: 1 }],
    b: [{ id: 'a', count: 1 }],
  };
  // The assertion that matters is that this returns at all.
  const rows = flattenNeeds('a', (id) => cyclic[id]);
  assert.deepEqual(asMap(rows), new Map([['a', 1]]));
});

test('progress pairs requirements with what is held, unfilled first', () => {
  const rows = progress(flattenNeeds('sword', needsOf), new Map([['ore', 2], ['coal', 5]]));
  assert.deepEqual(
    rows.map((r) => [r.id, r.have, r.count, r.done]),
    [
      ['ore', 2, 6, false],
      ['coal', 5, 1, true],
    ],
  );
});

test('a missing item counts as zero held', () => {
  const rows = progress([{ id: 'ore', count: 4 }], new Map());
  assert.equal(rows[0]?.have, 0);
  assert.equal(rows[0]?.done, false);
});

test('completion caps each requirement at its own target', () => {
  // 6 ore and 1 coal wanted; 6 ore held plus a surplus of coal must not exceed 1.
  const rows = progress(flattenNeeds('sword', needsOf), new Map([['ore', 6], ['coal', 99]]));
  assert.equal(completion(rows), 1);
});

test('completion is a fraction of everything wanted, not of the rows filled', () => {
  const rows = progress(flattenNeeds('sword', needsOf), new Map([['coal', 1]]));
  assert.equal(completion(rows), 1 / 7);
});

test('completion of nothing is complete', () => {
  assert.equal(completion([]), 1);
});

test('by default a plan is one level deep', () => {
  const plan = craftPlan([{ id: 'sword', count: 1 }], needsOf);

  assert.deepEqual(plan.map((s) => s.id), ['sword'], 'the target, and nothing under it');
  assert.deepEqual(
    asMap(plan[0]?.needs ?? []),
    new Map([['blade', 1], ['hilt', 2], ['ore', 1]]),
    'a crafted ingredient is a material like any other until it is asked for',
  );
});

test('expanding an ingredient turns it into a step and takes it out of its parent', () => {
  const plan = craftPlan([{ id: 'sword', count: 1 }], needsOf, { expand: new Set(['blade']) });

  assert.deepEqual(plan.map((s) => s.id), ['sword', 'blade']);
  assert.deepEqual(
    asMap(plan[0]?.needs ?? []),
    new Map([['hilt', 2], ['ore', 1]]),
    'the blade is a job now, not a thing to find',
  );
  assert.deepEqual(asMap(plan[1]?.needs ?? []), new Map([['ore', 3], ['coal', 1]]));
});

test('expanding something nothing asks for adds nothing', () => {
  const plan = craftPlan([{ id: 'hilt', count: 1 }], needsOf, { expand: new Set(['blade']) });
  assert.deepEqual(plan.map((s) => s.id), ['hilt']);
});

test('a derived step is scaled by everything above it', () => {
  const plan = craftPlan([{ id: 'sword', count: 2 }], needsOf, { expand: new Set(['hilt']) });
  const hilt = plan.find((s) => s.id === 'hilt');
  // Two swords, two hilts each.
  assert.equal(hilt?.count, 4);
  assert.deepEqual(asMap(hilt?.needs ?? []), new Map([['ore', 4]]));
});

test('what the player asked for is marked apart from what was opened up', () => {
  const plan = craftPlan([{ id: 'sword', count: 1 }], needsOf, { expand: new Set(['blade']) });
  assert.equal(plan.find((s) => s.id === 'sword')?.derived, false);
  assert.equal(plan.find((s) => s.id === 'blade')?.derived, true);
});

test('an ingredient two steps want is one step with the counts added', () => {
  const plan = craftPlan([{ id: 'sword', count: 1 }, { id: 'blade', count: 2 }], needsOf);
  const blades = plan.filter((s) => s.id === 'blade');
  assert.equal(blades.length, 1, 'one step, not two');
  assert.equal(blades[0]?.count, 3, 'one for the sword, two asked for directly');
  assert.equal(blades[0]?.derived, false, 'asked for outranks opened up');
  assert.deepEqual(
    asMap(plan[0]?.needs ?? []),
    new Map([['hilt', 2], ['ore', 1]]),
    'and being a target of its own takes it out of the sword’s materials',
  );
});

test('a target with no recipe is a step with nothing to gather', () => {
  const plan = craftPlan([{ id: 'ore', count: 5 }], needsOf);
  assert.deepEqual(plan, [{ id: 'ore', count: 5, needs: [], derived: false }]);
});

test('a cycle in the graph terminates instead of hanging', () => {
  const loop: Record<string, ItemNeed[]> = {
    a: [{ id: 'b', count: 1 }],
    b: [{ id: 'a', count: 1 }],
  };
  const plan = craftPlan([{ id: 'a', count: 1 }], (id) => loop[id], { expand: new Set(['a', 'b']) });
  assert.ok(plan.length >= 2, 'it produced steps');
  assert.ok(plan.length < 100, 'and stopped');
});
