import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { RollTables } from '../types/rolls.ts';
import {
  affixPool,
  canBeAffix,
  canBeDivine,
  clampReforge,
  divinePctFor,
  statSpan,
  enhancedBand,
  isReverseKey,
  isRolled,
  iterationBonus,
  reachableRolls,
  rollablePool,
  stableLevel,
  statOutcomes,
  valueOf,
} from './rolls.ts';

/**
 * Against the emitted table, not a fixture.
 *
 * The point of these tests is that the maths agrees with the addon, and the
 * addon is what `public/data/rolls.json` was read out of. A fixture would let
 * the two drift apart silently — which is the one failure mode worth catching,
 * because a stat range that is quietly wrong looks exactly like one that is
 * right.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const tables = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '../../public/data/rolls.json'), 'utf8'),
) as RollTables;

test('the shipped tables are the ones the maths expects', () => {
  assert.equal(tables.schema, 1);
  assert.ok(tables.maxReforgeLevel >= 1);
  assert.ok(tables.roll.steps > 0);
  assert.ok(Object.keys(tables.random).length > 50);
});

test('a roll is quantised, not continuous', () => {
  // Six steps at iteration 0: -0.5 to +0.5 in fifths, no bonus yet.
  const zero = reachableRolls(tables, 0);
  assert.equal(zero.length, tables.roll.steps + 1);
  assert.ok(Math.abs((zero[0] as number) - 0.4) < 1e-9, `best roll at level 0 is ${zero[0]}`);
  assert.ok(Math.abs((zero.at(-1) as number) + 0.6) < 1e-9, `worst roll at level 0 is ${zero.at(-1)}`);
});

test('reforging raises the floor and not the ceiling', () => {
  const best = (level: number) => reachableRolls(tables, level)[0] as number;
  const worst = (level: number) => reachableRolls(tables, level).at(-1) as number;

  assert.ok(best(1) > best(0), 'the first reforge does buy a better ceiling');
  for (let level = 2; level <= tables.maxReforgeLevel; level++) {
    assert.equal(best(level), tables.roll.cap, `level ${level} is capped like every level above 1`);
    assert.ok(worst(level) > worst(level - 1), `level ${level} lifts the worst outcome`);
  }
});

test('the top of the set collapses once the bonus passes the cap', () => {
  // Two draws land on the cap from level 6 up, so the list of distinct
  // outcomes shortens — a reader must not be offered the same number twice.
  assert.ok(reachableRolls(tables, 9).length < reachableRolls(tables, 0).length);
  assert.equal(new Set(reachableRolls(tables, 9)).size, reachableRolls(tables, 9).length);
});

test('outcomes are ordered best first, in both directions', () => {
  const forward = statOutcomes(tables, 'bonus_attack_damage', 100, 9).outcomes;
  assert.ok((forward[0] as { value: number }).value > (forward.at(-1) as { value: number }).value);

  // A `c` key is a cooldown: the same high draw makes it smaller, so "best"
  // has to mean the draw rather than the number.
  const key = Object.keys(tables.random).find(isReverseKey);
  assert.ok(key !== undefined, 'the table still has a reverse-signed attribute');
  const reverse = statOutcomes(tables, key as string, 100, 9).outcomes;
  assert.ok((reverse[0] as { value: number }).value < (reverse.at(-1) as { value: number }).value);
});

test('the fixed attribute is drawn at the stable tail and never improves', () => {
  const key = 'bonus_attack_damage';
  const low = statOutcomes(tables, key, 100, 0, { fixed: true });
  const high = statOutcomes(tables, key, 100, 9, { fixed: true });

  assert.equal(low.stable, true);
  assert.deepEqual(low.outcomes, high.outcomes, 'reforging does not move a fixed stat');
  assert.deepEqual(
    low.outcomes.map((outcome) => outcome.roll),
    reachableRolls(tables, stableLevel(tables)),
  );

  // And it is worth 30% more than the same draw unfixed — within the grain the
  // attribute is rounded to, which for a whole-number stat is one point.
  const roll = (low.outcomes[0] as { roll: number }).roll;
  const plain = valueOf(tables, key, 100, roll);
  const fixed = valueOf(tables, key, 100, roll, { fixed: true });
  const grain = 10 ** -(tables.decimals[key] ?? 0);
  assert.ok(fixed > plain, 'the fixed affix is a bonus');
  assert.ok(Math.abs(fixed - plain * (1 + tables.fixedBonusPct / 100)) <= grain, `${fixed} vs ${plain}`);
});

test('an ability_value_* key is stable too, without being the fixed one', () => {
  const key = Object.keys(tables.random).find((name) => name.startsWith('ability_value_') && !isReverseKey(name));
  assert.ok(key !== undefined);
  assert.equal(statOutcomes(tables, key as string, 10, 0).stable, true);
  assert.deepEqual(statOutcomes(tables, key as string, 10, 0), statOutcomes(tables, key as string, 10, 9));
});

test('a stat with no random percentage has exactly one outcome', () => {
  assert.equal(isRolled(tables, 'not_an_attribute_the_addon_has'), false);
  const { outcomes, stable } = statOutcomes(tables, 'not_an_attribute_the_addon_has', 42, 9);
  assert.deepEqual(outcomes, [{ roll: 0, value: 42 }]);
  assert.equal(stable, true);
});

test('rolled values respect the attribute rounding', () => {
  const key = Object.keys(tables.decimals)[0] as string;
  const places = tables.decimals[key] as number;
  for (const { value } of statOutcomes(tables, key, 7, 9).outcomes) {
    assert.equal(value, Number(value.toFixed(places)), `${key} rounds to ${places} places`);
  }
});

test('the affix pool is the rollable stats, sorted, minus the passive tuning', () => {
  const pool = affixPool(tables, {
    bonus_attack_damage: 10,
    ability_value_extra_target_count: 2,
    ability_crit_chance_pct: 5,
    made_up_key: 1,
  });
  assert.deepEqual(pool, ['ability_crit_chance_pct', 'bonus_attack_damage']);
});

test('an enhancement is a band, because its size is not knowable in advance', () => {
  const [low, high] = enhancedBand(tables, 100, 'bonus_attack_damage');
  assert.equal(low, 100 * (1 + tables.enhancedBonusPct[0] / 100));
  assert.equal(high, 100 * (1 + tables.enhancedBonusPct[1] / 100));
});

test('levels outside the game are clamped rather than believed', () => {
  assert.equal(clampReforge(tables, -3), 0);
  assert.equal(clampReforge(tables, 99), tables.maxReforgeLevel);
  assert.equal(clampReforge(tables, Number.NaN), 0);
  assert.equal(clampReforge(tables, 4.7), 4);
  assert.equal(iterationBonus(tables, -1), iterationBonus(tables, 0));
});

test('the divine forge multiplies what it reaches, and skips what it does not', () => {
  const plain = statOutcomes(tables, 'bonus_attack_damage', 100, 9).outcomes[0] as { value: number };
  const forged = statOutcomes(tables, 'bonus_attack_damage', 100, 9, { divine: true }).outcomes[0] as {
    value: number;
  };
  assert.ok(forged.value > plain.value, 'an ordinary stat takes the bonus');
  assert.equal(forged.value, Math.round(plain.value * (1 + tables.divine.bonusPct / 100)));

  // An `ability_*` key that is not a value and not the crit chance is skipped
  // entirely — the addon's own rule, and the reason the panel offers no box.
  assert.equal(canBeDivine('ability_cooldown_pct'), false);
  assert.equal(canBeDivine('ability_crit_chance_pct'), true);
  assert.equal(canBeDivine('bonus_attack_damage'), true);
  assert.equal(canBeDivine('ability_value_shield'), true);
});

test('a divine forge is worth less inside an ability than outside one', () => {
  assert.equal(divinePctFor(tables, 'bonus_attack_damage'), tables.divine.bonusPct);
  assert.equal(divinePctFor(tables, 'ability_value_shield'), tables.divine.abilityBonusPct);
  assert.ok(tables.divine.abilityBonusPct < tables.divine.bonusPct);
});

test('a whole-life span runs from the worst unreforged roll to the best reforged one', () => {
  const span = statSpan(tables, 'bonus_attack_damage', 100);
  assert.ok(span !== null);
  const worst = statOutcomes(tables, 'bonus_attack_damage', 100, 0).outcomes.at(-1) as { value: number };
  const best = statOutcomes(tables, 'bonus_attack_damage', 100, tables.maxReforgeLevel).outcomes[0] as {
    value: number;
  };
  assert.equal(span.min, worst.value);
  assert.equal(span.max, best.value);

  // A stat that cannot roll has no span to show, rather than a range of one.
  assert.equal(statSpan(tables, 'not_an_attribute_the_addon_has', 42), null);
});

test("a passive's numbers roll, and are not part of the affix pool", () => {
  const values = {
    bonus_attack_damage: 100,
    ability_value_item_0102_damage: 100,
    ability_value_c_trigger_cooldown: 4,
    ability_crit_chance_pct: 5,
    ability_cooldown_pct: 10,
  };

  // Stats first, then the passive's own numbers: the order an item's own block
  // reads in, with its sentence underneath.
  assert.deepEqual(rollablePool(tables, values), [
    'ability_crit_chance_pct',
    'bonus_attack_damage',
    'ability_value_c_trigger_cooldown',
    'ability_value_item_0102_damage',
  ]);

  // The crit chance is the one `ability_` key an affix can land on; the
  // passive's numbers roll but never wear the +30%.
  assert.equal(canBeAffix(tables, 'ability_crit_chance_pct'), true);
  assert.equal(canBeAffix(tables, 'ability_value_item_0102_damage'), false);
  assert.equal(canBeAffix(tables, 'ability_cooldown_pct'), false, 'and this one does not roll at all');
  assert.deepEqual(affixPool(tables, values), ['ability_crit_chance_pct', 'bonus_attack_damage']);
});

test('a passive number spans a real range, and reforging does not move it', () => {
  // The default band is 70%, so `100` is anything from 30 to 170 depending on
  // the copy — which is the whole reason a plan can name one.
  const span = statSpan(tables, 'ability_value_item_0102_damage', 100);
  assert.ok(span !== null);
  assert.ok(span.min < 100 && span.max > 100, `${span.min}-${span.max}`);
  assert.deepEqual(
    statOutcomes(tables, 'ability_value_item_0102_damage', 100, 0),
    statOutcomes(tables, 'ability_value_item_0102_damage', 100, tables.maxReforgeLevel),
  );
});
