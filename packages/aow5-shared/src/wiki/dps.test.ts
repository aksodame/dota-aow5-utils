import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateDps, type DpsBuild, type DpsEnemy, type DpsItemStats } from './dps.ts';
import {
  DPS_FAMILY_COUNT,
  DPS_ITEM_COUNT,
  MODELED_ITEM_COUNT,
  PANEL_FAMILY_COUNT,
  PANEL_ITEM_COUNT,
  mechanicFamilyOf,
} from './dps-mechanics.ts';

const enemy = (over: Partial<DpsEnemy> = {}): DpsEnemy => ({
  maxHp: 1_000_000_000,
  armor: 0,
  magicResistancePct: 0,
  healthRegen: 0,
  kind: 'normal',
  damageReductionPct: 0,
  damageResistancePct: 0,
  physicalDamageIncreasePct: 0,
  ...over,
});

const build = (over: Partial<DpsBuild> = {}): DpsBuild => ({
  attackDamage: 1000,
  allAttackDamagePct: 0,
  attackSpeed: 0,
  attackSpeedPct: 0,
  baseAttackTime: 1,
  critChancePct: 0,
  abilityCritChancePct: 0,
  physicalCritChancePct: 0,
  omniCritChancePct: 0,
  critDamagePct: 180,
  physicalDamageAddPct: 0,
  outgoingMultiplier: 1,
  spellAmplifyPct: 0,
  normalAttackAmpPct: 0,
  armorPenetrationPct: 0,
  bleedOutgoingPct: 0,
  dotOutgoingPct: 0,
  extraDamagePct: { normal: 0, elite: 0, miniboss: 0, boss: 0 },
  seasonDamagePct: 0,
  totalAttributes: 0,
  magicalDamageAddPct: 0,
  magicalCritChancePct: 0,
  poisonOutgoingPct: 0,
  poisonFasterPct: 0,
  cooldownReductionPct: 0,
  items: [],
  ...over,
});

const item = (id: string, stats: Record<string, number>, cooldown?: number): DpsItemStats => ({
  id,
  stats,
  ...(cooldown !== undefined ? { cooldown } : {}),
});
const source = (r: ReturnType<typeof simulateDps>, id: string): number => r.sources.find((s) => s.id === id)?.damage ?? 0;
const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('auto-attacks use the armor curve and armor penetration', () => {
  const noArmor = simulateDps(build(), enemy(), { duration: 10, mode: 'dummy' });
  near(noArmor.damage, 10_000);
  near(noArmor.dps, 1000);

  // 188 armor passes 1 − 188 / (26.66 + 188) = 12.42 %.
  const armored = simulateDps(build(), enemy({ armor: 188 }), { duration: 10, mode: 'dummy' });
  near(armored.damage, 10_000 * (1 - 188 / (26.66 + 188)), 1e-3);

  // Half the armor is pierced: 94 armor, 22.1 % passes.
  const pierced = simulateDps(build({ armorPenetrationPct: 50 }), enemy({ armor: 188 }), { duration: 10, mode: 'dummy' });
  near(pierced.damage, 10_000 * (1 - 94 / (26.66 + 94)), 1e-3);
});

test('attack speed is capped at 800 and becomes attacks per second through BAT', () => {
  const r = simulateDps(build({ attackSpeed: 1000, baseAttackTime: 1 }), enemy(), { duration: 10, mode: 'dummy' });
  near(r.attacksPerSecond, 9);
  assert.equal(r.attacks, 90);
});

test('crit chance combines the base 5 % with the physical chance and omni', () => {
  const r = simulateDps(
    build({ critChancePct: 5, physicalCritChancePct: 50, critDamagePct: 200 }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  // 100 × (1 − 0.95 × 0.5) = 52.5 %, and a 2.0× crit adds 52.5 %.
  near(r.critChancePct, 52.5);
  near(r.damage, 10_000 * 1.525);
});

test('bleed is a 70 % pool paid over ten ticks', () => {
  const r = simulateDps(
    build({
      items: [item('item_0467', { ability_value_min_trigger_chance_pct: 100, ability_value_max_trigger_chance_pct: 100 })],
    }),
    enemy(),
    { duration: 1.6, mode: 'dummy' },
  );
  // One attack at 1 s, one tick at 1.5 s; the pool was 700, so the tick is 70.
  near(source(r, 'auto'), 1000);
  near(source(r, 'bleed'), 70);
});

test('0504 turns its share of a bleed tick into a physical hit', () => {
  const r = simulateDps(
    build({
      items: [
        item('item_0467', { ability_value_min_trigger_chance_pct: 100, ability_value_max_trigger_chance_pct: 100 }),
        item('item_0504', { ability_value_bleed_to_physical_pct: 50 }),
      ],
    }),
    enemy(),
    { duration: 1.6, mode: 'dummy' },
  );
  near(source(r, 'bleed'), 70);
  near(source(r, 'bloodEcho'), 35);
});

test('0665 strikes scale from the boss maximum health and do not start a bleed', () => {
  const r = simulateDps(
    build({
      attackDamage: 0,
      items: [
        item('item_0665', {
          ability_boss_damage_pct: 50,
          ability_value_light_max_health_pct: 1,
          ability_value_heavy_max_health_pct: 10,
          ability_heavy_chance_pct: 50,
        }),
        item('item_0467', { ability_value_min_trigger_chance_pct: 100, ability_value_max_trigger_chance_pct: 100 }),
      ],
    }),
    enemy({ kind: 'boss', maxHp: 1_000_000 }),
    { duration: 1.2, mode: 'dummy' },
  );
  // 1,000,000 × 50 % = 500,000 scaled health; light 1 % = 5,000, heavy 10 % = 50,000 at 50 %.
  near(source(r, 'talonsLight'), 5000);
  near(source(r, 'talonsHeavy'), 25_000);
  assert.equal(source(r, 'bleed'), 0);
});

test('the bag burns for a capped share of health and its mark amplifies later hits', () => {
  const r = simulateDps(
    build({
      totalAttributes: 1000,
      items: [
        item('item_0659', {
          ability_burn_duration: 3,
          ability_trigger_interval: 1,
          ability_max_stacks: 10,
          ability_value_damage_pct_per_stack: 5,
        }),
      ],
    }),
    enemy({ kind: 'boss', maxHp: 1_000_000 }),
    { duration: 3.2, mode: 'dummy' },
  );
  // 1,000,000 × 15 % × 0.5 × 0.1 = 7,500 per tick, four ticks while burn lasts.
  near(source(r, 'burn'), 30_000);
  // First hit has no mark; the next two have one and two stacks.
  near(source(r, 'auto'), 1000 + 1050 + 1100);
});

test('kill mode stops at zero and reports the time to kill', () => {
  const r = simulateDps(build(), enemy({ maxHp: 2500 }), { duration: 10, mode: 'kill' });
  near(r.ttk ?? -1, 3);
  near(r.damage, 3000);
  near(r.dps, 1000);
  assert.equal(r.hpLeft, 0);
});

test('the window timeline sums to the window damage and the kill log stops at zero', () => {
  const window = simulateDps(build(), enemy(), { duration: 10, mode: 'dummy' });
  assert.equal(window.timeline.length, 10);
  near(window.timeline.reduce((sum, p) => sum + p.damage, 0), window.damage);
  near(window.timeline[0]?.damage ?? -1, 1000);
  assert.equal(window.events.length, 10);

  const kill = simulateDps(build(), enemy({ maxHp: 2500 }), { duration: 10, mode: 'kill' });
  assert.equal(kill.timeline[0]?.hp, 1500);
  assert.equal(kill.timeline[2]?.hp, 0);
  assert.ok((kill.events.at(-1)?.hp ?? 1) === 0);
});

test('poison applies a stack, a burst and magical ticks that ignore armor', () => {
  const poisonBuild = build({
    attackDamage: 0,
    totalAttributes: 1000,
    items: [
      item('item_0365', {
        ability_value_poison_trigger_chance_pct: 100,
        ability_value_all_stats_damage_pct: 80,
      }),
    ],
  });
  const unarmored = simulateDps(poisonBuild, enemy({ kind: 'boss', magicResistancePct: 0 }), {
    duration: 1.6,
    mode: 'dummy',
  });
  // One attack at 1 s: burst 1000 × 80 % = 800; two poison ticks at 1.25 and 1.5 s.
  near(source(unarmored, 'poisonBurst'), 800);
  assert.ok(source(unarmored, 'poison') > 0);
  assert.equal(unarmored.poisonStacks, 1);

  const armored = simulateDps(poisonBuild, enemy({ kind: 'boss', magicResistancePct: 0, armor: 1000 }), {
    duration: 1.6,
    mode: 'dummy',
  });
  near(source(armored, 'poisonBurst'), source(unarmored, 'poisonBurst'));
  near(source(armored, 'poison'), source(unarmored, 'poison'));
});

test('Witch Blade pays a spellblade tick and its doom stacks', () => {
  const witch = build({
    attackDamage: 0,
    totalAttributes: 1000,
    items: [
      item('item_0209', {
        ability_value_dot_trigger_chance_pct: 100,
        ability_all_stats_damage_pct: 80,
        ability_value_trigger_chance_pct: 100,
        ability_value_magic_resistance_reduce_pct: 10,
        ability_max_stacks: 5,
        ability_decay_interval: 3,
      }),
    ],
  });
  const r = simulateDps(witch, enemy({ kind: 'boss', magicResistancePct: 50 }), { duration: 1.6, mode: 'dummy' });
  assert.ok(source(r, 'witchBlade') > 0);
  assert.equal(r.doomStacks, 1);
});

test('the poison pendant settles an extra tick on a poison application', () => {
  const base = build({
    attackDamage: 0,
    totalAttributes: 1000,
    items: [
      item('item_0365', {
        ability_value_poison_trigger_chance_pct: 100,
        ability_value_all_stats_damage_pct: 0,
      }),
    ],
  });
  const withPendant = build({
    ...base,
    items: [...base.items, item('item_0402', {})],
  });
  const plain = simulateDps(base, enemy({ kind: 'boss', magicResistancePct: 0 }), { duration: 1.6, mode: 'dummy' });
  const pendant = simulateDps(withPendant, enemy({ kind: 'boss', magicResistancePct: 0 }), { duration: 1.6, mode: 'dummy' });
  assert.ok(source(pendant, 'poison') > source(plain, 'poison'));
});

test('ancestral poison items use the same mechanics as their bases', () => {
  const ancestral = build({
    attackDamage: 0,
    totalAttributes: 1000,
    items: [
      item('item_0719', {
        ability_value_poison_trigger_chance_pct: 100,
        ability_value_all_stats_damage_pct: 0,
      }),
      item('item_0831', {
        ability_value_dot_trigger_chance_pct: 100,
        ability_all_stats_damage_pct: 80,
      }),
    ],
  });
  const r = simulateDps(ancestral, enemy({ kind: 'boss', magicResistancePct: 0 }), { duration: 1.6, mode: 'dummy' });
  assert.ok(source(r, 'poison') > 0);
  assert.ok(source(r, 'witchBlade') > 0);
  assert.equal(r.doomStacks, 0);
});

test('the feather pendant active runs on cooldown and respects CDR', () => {
  const pendant = build({
    attackDamage: 0,
    totalAttributes: 1000,
    items: [
      item(
        'item_0646',
        { ability_all_stats_damage_pct: 50, ability_duration: 10, ability_interval: 1 },
        30,
      ),
    ],
  });
  const off = simulateDps(pendant, enemy({ armor: 1000, magicResistancePct: 99 }), { duration: 60, mode: 'dummy' });
  assert.equal(source(off, 'feather'), 0);

  const on = simulateDps(pendant, enemy({ armor: 1000, magicResistancePct: 99 }), {
    duration: 60,
    mode: 'dummy',
    active: new Set(['item_0646']),
  });
  // Activations at 0 and 30 s, ten ticks each of 50 % × 1000; armour and MR do not apply.
  near(source(on, 'feather'), 20 * 500);

  const reduced = simulateDps(
    build({ ...pendant, cooldownReductionPct: 50 }),
    enemy(),
    { duration: 60, mode: 'dummy', active: new Set(['item_0646']) },
  );
  // 15 s cooldown: activations at 0, 15, 30 and 45 s.
  near(source(reduced, 'feather'), 40 * 500);
});

test('the dart and crystal sword pay one flat physical proc on one target', () => {
  const dart = build({
    attackDamage: 0,
    items: [item('item_0129', {})],
  });
  const dartRun = simulateDps(dart, enemy(), { duration: 1.6, mode: 'dummy' });
  // 25 % × 50, one auto-attack at 1 s; no crit, armour or amplifiers.
  near(source(dartRun, 'flatProc'), 12.5);

  const crystal = build({
    attackDamage: 0,
    items: [item('item_0131', { ability_ps_chance: 100, ability_ps_damage: 50 })],
  });
  const crystalRun = simulateDps(crystal, enemy(), { duration: 1.6, mode: 'dummy' });
  near(source(crystalRun, 'flatProc'), 50);
});

test('0853 lowers armor and adds vulnerable only after its first proc', () => {
  const r = simulateDps(
    build({
      critChancePct: 100,
      items: [
        item('item_0217', {
          ability_value_trigger_chance_pct: 100,
          ability_value_armor_max_stacks: 30,
          ability_vulnerable_duration: 5,
          ability_armor_duration: 3,
        }),
      ],
    }),
    enemy(),
    { duration: 3.2, mode: 'dummy' },
  );
  // 1.8× crit; the first hit has no vulnerable stack, the next two have 17 % and 19 %.
  near(source(r, 'auto'), 1800 + 2106 + 2142);
});


test('the mechanics registry counts and resolves both sides of every pair', () => {
  assert.equal(DPS_FAMILY_COUNT, 14);
  assert.equal(DPS_ITEM_COUNT, 26);
  assert.equal(PANEL_FAMILY_COUNT, 9);
  assert.equal(PANEL_ITEM_COUNT, 16);
  assert.equal(MODELED_ITEM_COUNT, 42);
  assert.equal(mechanicFamilyOf('item_0209')?.base, 'item_0209');
  assert.equal(mechanicFamilyOf('item_0831')?.base, 'item_0209');
  assert.equal(mechanicFamilyOf('item_0836')?.base, 'item_0402');
  assert.equal(mechanicFamilyOf('item_0827')?.base, 'item_0646');
  assert.equal(mechanicFamilyOf('item_9999'), undefined);
});
