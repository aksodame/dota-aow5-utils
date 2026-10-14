import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { RollTables } from '../types/rolls.ts';
import {
  copyStats,
  defaultPos,
  drawAt,
  effectSteps,
  effectTone,
  enhanceTone,
  hydrateRollState,
  newRollState,
  ordinaryWindow,
  statBounds,
  statTone,
  statValue,
  stoneStatValue,
  valueAtPos,
  type RollState,
} from './itemroll.ts';

/**
 * Against the emitted roll table, and against numbers the partner wiki's own
 * `itemroll.js` produced for the same inputs (run once under Node with its
 * `meta.statRoll`, which is identical to `rolls.json`). The port must give the
 * same value for every slider position, bonus combination and reforge level a
 * reader can set.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const tables = JSON.parse(fs.readFileSync(path.resolve(HERE, '../../public/data/rolls.json'), 'utf8')) as RollTables;

const state = (patch: Partial<RollState>): RollState => ({ ...newRollState(), ...patch });

/** [key, base, slider position, state patch, partner's value — or its step list for an effect stat]. */
type Case = [string, number, number, Partial<RollState>, number | Array<[number, number]>];
const PARTNER: Case[] = [
  ["bonus_health",550,0,{},341],
  ["bonus_health",550,0,{"refine":9},466],
  ["bonus_health",550,0,{"refine":4,"fix":["bonus_health"]},552],
  ["bonus_health",550,0,{"enhance":["bonus_health"],"enhancePct":38,"divine":true},565],
  ["bonus_health",550,0,{"fix":["bonus_health"],"enhance":["bonus_health"],"divine":true,"refine":7,"enhancePct":21},852],
  ["bonus_health",550,37,{},496],
  ["bonus_health",550,37,{"refine":9},575],
  ["bonus_health",550,37,{"refine":4,"fix":["bonus_health"]},713],
  ["bonus_health",550,37,{"enhance":["bonus_health"],"enhancePct":38,"divine":true},821],
  ["bonus_health",550,37,{"fix":["bonus_health"],"enhance":["bonus_health"],"divine":true,"refine":7,"enhancePct":21},1067],
  ["bonus_health",550,50,{},550],
  ["bonus_health",550,50,{"refine":9},613],
  ["bonus_health",550,50,{"refine":4,"fix":["bonus_health"]},769],
  ["bonus_health",550,50,{"enhance":["bonus_health"],"enhancePct":38,"divine":true},911],
  ["bonus_health",550,50,{"fix":["bonus_health"],"enhance":["bonus_health"],"divine":true,"refine":7,"enhancePct":21},1143],
  ["bonus_health",550,100,{},759],
  ["bonus_health",550,100,{"refine":9},759],
  ["bonus_health",550,100,{"refine":4,"fix":["bonus_health"]},987],
  ["bonus_health",550,100,{"enhance":["bonus_health"],"enhancePct":38,"divine":true},1257],
  ["bonus_health",550,100,{"fix":["bonus_health"],"enhance":["bonus_health"],"divine":true,"refine":7,"enhancePct":21},1433],
  ["bonus_all_stats",65,0,{},40],
  ["bonus_all_stats",65,0,{"refine":9},55],
  ["bonus_all_stats",65,0,{"refine":4,"fix":["bonus_all_stats"]},65],
  ["bonus_all_stats",65,0,{"enhance":["bonus_all_stats"],"enhancePct":38,"divine":true},67],
  ["bonus_all_stats",65,0,{"fix":["bonus_all_stats"],"enhance":["bonus_all_stats"],"divine":true,"refine":7,"enhancePct":21},101],
  ["bonus_all_stats",65,37,{},59],
  ["bonus_all_stats",65,37,{"refine":9},68],
  ["bonus_all_stats",65,37,{"refine":4,"fix":["bonus_all_stats"]},84],
  ["bonus_all_stats",65,37,{"enhance":["bonus_all_stats"],"enhancePct":38,"divine":true},97],
  ["bonus_all_stats",65,37,{"fix":["bonus_all_stats"],"enhance":["bonus_all_stats"],"divine":true,"refine":7,"enhancePct":21},126],
  ["bonus_all_stats",65,50,{},65],
  ["bonus_all_stats",65,50,{"refine":9},72],
  ["bonus_all_stats",65,50,{"refine":4,"fix":["bonus_all_stats"]},91],
  ["bonus_all_stats",65,50,{"enhance":["bonus_all_stats"],"enhancePct":38,"divine":true},108],
  ["bonus_all_stats",65,50,{"fix":["bonus_all_stats"],"enhance":["bonus_all_stats"],"divine":true,"refine":7,"enhancePct":21},135],
  ["bonus_all_stats",65,100,{},90],
  ["bonus_all_stats",65,100,{"refine":9},90],
  ["bonus_all_stats",65,100,{"refine":4,"fix":["bonus_all_stats"]},117],
  ["bonus_all_stats",65,100,{"enhance":["bonus_all_stats"],"enhancePct":38,"divine":true},149],
  ["bonus_all_stats",65,100,{"fix":["bonus_all_stats"],"enhance":["bonus_all_stats"],"divine":true,"refine":7,"enhancePct":21},169],
  ["all_all_stats_pct",26,0,{},16],
  ["all_all_stats_pct",26,0,{"refine":9},22],
  ["all_all_stats_pct",26,0,{"refine":4,"fix":["all_all_stats_pct"]},26],
  ["all_all_stats_pct",26,0,{"enhance":["all_all_stats_pct"],"enhancePct":38,"divine":true},27],
  ["all_all_stats_pct",26,0,{"fix":["all_all_stats_pct"],"enhance":["all_all_stats_pct"],"divine":true,"refine":7,"enhancePct":21},40],
  ["all_all_stats_pct",26,37,{},23],
  ["all_all_stats_pct",26,37,{"refine":9},27],
  ["all_all_stats_pct",26,37,{"refine":4,"fix":["all_all_stats_pct"]},34],
  ["all_all_stats_pct",26,37,{"enhance":["all_all_stats_pct"],"enhancePct":38,"divine":true},39],
  ["all_all_stats_pct",26,37,{"fix":["all_all_stats_pct"],"enhance":["all_all_stats_pct"],"divine":true,"refine":7,"enhancePct":21},50],
  ["all_all_stats_pct",26,50,{},26],
  ["all_all_stats_pct",26,50,{"refine":9},29],
  ["all_all_stats_pct",26,50,{"refine":4,"fix":["all_all_stats_pct"]},36],
  ["all_all_stats_pct",26,50,{"enhance":["all_all_stats_pct"],"enhancePct":38,"divine":true},43],
  ["all_all_stats_pct",26,50,{"fix":["all_all_stats_pct"],"enhance":["all_all_stats_pct"],"divine":true,"refine":7,"enhancePct":21},54],
  ["all_all_stats_pct",26,100,{},36],
  ["all_all_stats_pct",26,100,{"refine":9},36],
  ["all_all_stats_pct",26,100,{"refine":4,"fix":["all_all_stats_pct"]},47],
  ["all_all_stats_pct",26,100,{"enhance":["all_all_stats_pct"],"enhancePct":38,"divine":true},59],
  ["all_all_stats_pct",26,100,{"fix":["all_all_stats_pct"],"enhance":["all_all_stats_pct"],"divine":true,"refine":7,"enhancePct":21},68],
  ["mana_regen",7.5,0,{},4.7],
  ["mana_regen",7.5,0,{"refine":9},6.4],
  ["mana_regen",7.5,0,{"refine":4,"fix":["mana_regen"]},7.5],
  ["mana_regen",7.5,0,{"enhance":["mana_regen"],"enhancePct":38,"divine":true},7.7],
  ["mana_regen",7.5,0,{"fix":["mana_regen"],"enhance":["mana_regen"],"divine":true,"refine":7,"enhancePct":21},11.6],
  ["mana_regen",7.5,37,{},6.8],
  ["mana_regen",7.5,37,{"refine":9},7.8],
  ["mana_regen",7.5,37,{"refine":4,"fix":["mana_regen"]},9.7],
  ["mana_regen",7.5,37,{"enhance":["mana_regen"],"enhancePct":38,"divine":true},11.2],
  ["mana_regen",7.5,37,{"fix":["mana_regen"],"enhance":["mana_regen"],"divine":true,"refine":7,"enhancePct":21},14.6],
  ["mana_regen",7.5,50,{},7.5],
  ["mana_regen",7.5,50,{"refine":9},8.4],
  ["mana_regen",7.5,50,{"refine":4,"fix":["mana_regen"]},10.5],
  ["mana_regen",7.5,50,{"enhance":["mana_regen"],"enhancePct":38,"divine":true},12.4],
  ["mana_regen",7.5,50,{"fix":["mana_regen"],"enhance":["mana_regen"],"divine":true,"refine":7,"enhancePct":21},15.6],
  ["mana_regen",7.5,100,{},10.4],
  ["mana_regen",7.5,100,{"refine":9},10.4],
  ["mana_regen",7.5,100,{"refine":4,"fix":["mana_regen"]},13.5],
  ["mana_regen",7.5,100,{"enhance":["mana_regen"],"enhancePct":38,"divine":true},17.1],
  ["mana_regen",7.5,100,{"fix":["mana_regen"],"enhance":["mana_regen"],"divine":true,"refine":7,"enhancePct":21},19.5],
  ["base_magic_resistance",12,0,{},8],
  ["base_magic_resistance",12,0,{"refine":9},10],
  ["base_magic_resistance",12,0,{"refine":4,"fix":["base_magic_resistance"]},13],
  ["base_magic_resistance",12,0,{"enhance":["base_magic_resistance"],"enhancePct":38,"divine":true},13],
  ["base_magic_resistance",12,0,{"fix":["base_magic_resistance"],"enhance":["base_magic_resistance"],"divine":true,"refine":7,"enhancePct":21},19],
  ["base_magic_resistance",12,37,{},11],
  ["base_magic_resistance",12,37,{"refine":9},12],
  ["base_magic_resistance",12,37,{"refine":4,"fix":["base_magic_resistance"]},16],
  ["base_magic_resistance",12,37,{"enhance":["base_magic_resistance"],"enhancePct":38,"divine":true},18],
  ["base_magic_resistance",12,37,{"fix":["base_magic_resistance"],"enhance":["base_magic_resistance"],"divine":true,"refine":7,"enhancePct":21},23],
  ["base_magic_resistance",12,50,{},12],
  ["base_magic_resistance",12,50,{"refine":9},13],
  ["base_magic_resistance",12,50,{"refine":4,"fix":["base_magic_resistance"]},17],
  ["base_magic_resistance",12,50,{"enhance":["base_magic_resistance"],"enhancePct":38,"divine":true},20],
  ["base_magic_resistance",12,50,{"fix":["base_magic_resistance"],"enhance":["base_magic_resistance"],"divine":true,"refine":7,"enhancePct":21},25],
  ["base_magic_resistance",12,100,{},16],
  ["base_magic_resistance",12,100,{"refine":9},16],
  ["base_magic_resistance",12,100,{"refine":4,"fix":["base_magic_resistance"]},21],
  ["base_magic_resistance",12,100,{"enhance":["base_magic_resistance"],"enhancePct":38,"divine":true},26],
  ["base_magic_resistance",12,100,{"fix":["base_magic_resistance"],"enhance":["base_magic_resistance"],"divine":true,"refine":7,"enhancePct":21},30],
  ["outgoing_damage_pct",28,0,{},17],
  ["outgoing_damage_pct",28,0,{"refine":9},24],
  ["outgoing_damage_pct",28,0,{"refine":4,"fix":["outgoing_damage_pct"]},28],
  ["outgoing_damage_pct",28,0,{"enhance":["outgoing_damage_pct"],"enhancePct":38,"divine":true},29],
  ["outgoing_damage_pct",28,0,{"fix":["outgoing_damage_pct"],"enhance":["outgoing_damage_pct"],"divine":true,"refine":7,"enhancePct":21},43],
  ["outgoing_damage_pct",28,37,{},25],
  ["outgoing_damage_pct",28,37,{"refine":9},29],
  ["outgoing_damage_pct",28,37,{"refine":4,"fix":["outgoing_damage_pct"]},36],
  ["outgoing_damage_pct",28,37,{"enhance":["outgoing_damage_pct"],"enhancePct":38,"divine":true},42],
  ["outgoing_damage_pct",28,37,{"fix":["outgoing_damage_pct"],"enhance":["outgoing_damage_pct"],"divine":true,"refine":7,"enhancePct":21},54],
  ["outgoing_damage_pct",28,50,{},28],
  ["outgoing_damage_pct",28,50,{"refine":9},31],
  ["outgoing_damage_pct",28,50,{"refine":4,"fix":["outgoing_damage_pct"]},39],
  ["outgoing_damage_pct",28,50,{"enhance":["outgoing_damage_pct"],"enhancePct":38,"divine":true},46],
  ["outgoing_damage_pct",28,50,{"fix":["outgoing_damage_pct"],"enhance":["outgoing_damage_pct"],"divine":true,"refine":7,"enhancePct":21},58],
  ["outgoing_damage_pct",28,100,{},39],
  ["outgoing_damage_pct",28,100,{"refine":9},39],
  ["outgoing_damage_pct",28,100,{"refine":4,"fix":["outgoing_damage_pct"]},50],
  ["outgoing_damage_pct",28,100,{"enhance":["outgoing_damage_pct"],"enhancePct":38,"divine":true},64],
  ["outgoing_damage_pct",28,100,{"fix":["outgoing_damage_pct"],"enhance":["outgoing_damage_pct"],"divine":true,"refine":7,"enhancePct":21},73],
  ["ability_value_boost_pct",32,0,{},[[-0.211438,27],[-0.011438,32],[0.188562,36],[0.388562,41],[0.5,43]]],
  ["ability_value_boost_pct",32,0,{"divine":true},[[-0.211438,31],[-0.011438,36],[0.188562,41],[0.388562,46],[0.5,49]]],
  ["ability_value_boost_pct",32,0,{"divine":true,"fix":["ability_value_boost_pct"],"refine":9},[[-0.211438,31],[-0.011438,36],[0.188562,41],[0.388562,46],[0.5,49]]],
  ["ability_value_c_reduce_pct",15,0,{},[[-0.211438,17],[-0.011438,15],[0.188562,13],[0.388562,11],[0.5,10]]],
  ["ability_value_c_reduce_pct",15,0,{"divine":true},[[-0.211438,15],[-0.011438,13],[0.188562,11],[0.388562,9],[0.5,8]]],
  ["ability_value_c_reduce_pct",15,0,{"divine":true,"fix":["ability_value_c_reduce_pct"],"refine":9},[[-0.211438,15],[-0.011438,13],[0.188562,11],[0.388562,9],[0.5,8]]],
  ["ability_value_c_crit_cap_pct",100,0,{},[[-0.211438,115],[-0.011438,101],[0.188562,87],[0.388562,73],[0.5,65]]],
  ["ability_value_c_crit_cap_pct",100,0,{"divine":true},[[-0.211438,99],[-0.011438,87],[0.188562,75],[0.388562,63],[0.5,56]]],
  ["ability_value_c_crit_cap_pct",100,0,{"divine":true,"fix":["ability_value_c_crit_cap_pct"],"refine":9},[[-0.211438,99],[-0.011438,87],[0.188562,75],[0.388562,63],[0.5,56]]],
  ["ability_value_convert_pct",150,0,{},[[-0.211438,128],[-0.011438,149],[0.188562,170],[0.388562,191],[0.5,203]]],
  ["ability_value_convert_pct",150,0,{"divine":true},[[-0.211438,146],[-0.011438,170],[0.188562,194],[0.388562,218],[0.5,231]]],
  ["ability_value_convert_pct",150,0,{"divine":true,"fix":["ability_value_convert_pct"],"refine":9},[[-0.211438,146],[-0.011438,170],[0.188562,194],[0.388562,218],[0.5,231]]],
  ["ability_crit_chance_pct",20,0,{},[[-0.211438,17],[-0.011438,20],[0.188562,23],[0.388562,26],[0.5,28]]],
  ["ability_crit_chance_pct",20,0,{"divine":true},[[-0.211438,19],[-0.011438,23],[0.188562,26],[0.388562,30],[0.5,31]]],
  ["ability_crit_chance_pct",20,0,{"divine":true,"fix":["ability_crit_chance_pct"],"refine":9},[[-0.211438,25],[-0.011438,29],[0.188562,34],[0.388562,38],[0.5,41]]],
  ["ability_value_c_trigger_cooldown",8,0,{},[[-0.211438,9.3],[-0.011438,8.1],[0.188562,6.9],[0.388562,5.6],[0.5,5]]],
  ["ability_value_c_trigger_cooldown",8,0,{"divine":true},[[-0.211438,8],[-0.011438,6.9],[0.188562,5.9],[0.388562,4.8],[0.5,4.3]]],
  ["ability_value_c_trigger_cooldown",8,0,{"divine":true,"fix":["ability_value_c_trigger_cooldown"],"refine":9},[[-0.211438,8],[-0.011438,6.9],[0.188562,5.9],[0.388562,4.8],[0.5,4.3]]],
];

test('every slider value matches the partner wiki', () => {
  for (const [key, base, pos, patch, expected] of PARTNER) {
    const s = state(patch);
    if (Array.isArray(expected)) {
      const got = effectSteps(tables, key, base, s).map((x) => [Number(x.roll.toFixed(6)), x.value]);
      assert.deepEqual(got, expected, `${key} ${JSON.stringify(patch)}`);
    } else {
      assert.equal(valueAtPos(tables, key, base, pos, s), expected, `${key} @${pos} ${JSON.stringify(patch)}`);
    }
  }
});

test('the ordinary window: ±0.5 fresh, +0.3 floor at the ninth reforge', () => {
  assert.deepEqual(ordinaryWindow(tables, 0), { lo: -0.5, hi: 0.5 });
  assert.ok(Math.abs(ordinaryWindow(tables, 9).lo - -0.2) < 1e-12);
  assert.equal(drawAt(tables, 50, 0), 0);
});

test('effect steps: five chips, k = 0 hidden, the cap reached', () => {
  // The partner's checks against v1.505: the crown's boost tops out at 43 = 32·(1 + 0.5·0.7).
  const steps = effectSteps(tables, 'ability_value_boost_pct', 32, newRollState());
  assert.equal(steps.length, 5);
  assert.equal(steps.at(-1)!.value, 43);
  assert.equal(steps.at(-1)!.roll, 0.5);
  // A reverse key runs the other way: 100 → 65 at the best draw.
  assert.equal(effectSteps(tables, 'ability_value_c_crit_cap_pct', 100, newRollState()).at(-1)!.value, 65);
  // The default chip is the one nearest the table's own number.
  const at = defaultPos(tables, 'ability_value_boost_pct', 32, newRollState());
  assert.equal(statValue(tables, 'ability_value_boost_pct', 32, newRollState()), steps[at]!.value);
});

test('bounds, stone stats and a whole copy', () => {
  assert.deepEqual(statBounds(tables, 'bonus_health', 550, newRollState()), { min: 341, max: 759 });
  const s = state({ stoneRoll: { crit_damage_pct: 100 }, stoneFix: ['crit_damage_pct'], divine: true, refine: 9 });
  // A stone ignores the item's forge and reforge: its own window, its own fixed affix.
  assert.equal(stoneStatValue(tables, 'crit_damage_pct', 17, s), valueAtPos(tables, 'crit_damage_pct', 17, 100, state({ fix: ['crit_damage_pct'] })));
  const total = copyStats(tables, { crit_damage_pct: 17, spell_amplify_pct: 15, name: 'x' }, { crit_damage_pct: 17 }, s);
  assert.equal(total.crit_damage_pct, statValue(tables, 'crit_damage_pct', 17, s) + stoneStatValue(tables, 'crit_damage_pct', 17, s));
  assert.equal(total.name, undefined);
});

test('colours by draw', () => {
  assert.equal(statTone(0.5), 'red');
  assert.equal(statTone(0.4), 'gold');
  assert.equal(statTone(0.3), 'purple');
  assert.equal(statTone(0.08), 'green');
  assert.equal(statTone(0), 'white');
  assert.equal(statTone(-0.2), 'grey');
  assert.equal(effectTone(0.37), 'gold');
  assert.equal(effectTone(-0.4), 'green');
  assert.deepEqual([20, 25, 26].map(enhanceTone), ['purple', 'gold', 'red']);
});

test('a stored state is read back defensively', () => {
  assert.deepEqual(hydrateRollState(null), newRollState());
  const s = hydrateRollState({ roll: { a: 3, b: 'x' }, fix: ['a', 1], refine: 42, enhancePct: 5, divine: 'yes' });
  assert.deepEqual(s.roll, { a: 3 });
  assert.deepEqual(s.fix, ['a']);
  assert.equal(s.refine, 9);
  assert.equal(s.enhancePct, 20);
  assert.equal(s.divine, false);
});
