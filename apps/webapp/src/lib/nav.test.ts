import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNavCurrent } from './nav.ts';

const lit = (route: Parameters<typeof isNavCurrent>[1], own: boolean | null = null) =>
  (['landing', 'builds', 'mine', 'tracker'] as const).filter((entry) => isNavCurrent(entry, route, own));

test('each ordinary page lights exactly its own entry', () => {
  assert.deepEqual(lit('landing'), ['landing']);
  assert.deepEqual(lit('builds'), ['builds']);
  assert.deepEqual(lit('mine'), ['mine']);
  assert.deepEqual(lit('tracker'), ['tracker']);
});

test('the planner counts as Builds, since an unsaved board lives there', () => {
  assert.deepEqual(lit('planner'), ['builds']);
});

test("somebody else's build stays under Builds", () => {
  assert.deepEqual(lit('build', false), ['builds']);
});

test('your own build stays under My builds', () => {
  assert.deepEqual(lit('build', true), ['mine']);
});

test('ownership not yet known holds the highlight on Builds', () => {
  // The alternative is the nav flickering from one entry to another as the
  // fetch lands, which is worse than being briefly wrong in the quiet direction.
  assert.deepEqual(lit('build', null), ['builds']);
});

test('exactly one entry is ever lit', () => {
  for (const route of ['landing', 'planner', 'builds', 'mine', 'tracker', 'build'] as const) {
    for (const own of [null, true, false]) {
      assert.equal(lit(route, own).length, 1, `${route} / own=${own} lit ${lit(route, own).join(', ')}`);
    }
  }
});
