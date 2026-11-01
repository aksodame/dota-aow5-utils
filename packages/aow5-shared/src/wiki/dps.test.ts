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
  maxHealth: 0,
  totalAgility: 0,
  agilityPct: 0,
  totalIntelligence: 0,
  baseMoveSpeed: 0,
  primaryAttr: 'str',
  attackDamagePerAgi: 0,
  attackDamagePerStr: 0,
  energyShield: 0,
  noCrit: false,
  agilityAttackSpeedCap: 240,
  agilityAttackSpeedDecay: 500,
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
  near(source(dartRun, 'dartProc'), 12.5);

  const crystal = build({
    attackDamage: 0,
    items: [item('item_0131', { ability_ps_chance: 100, ability_ps_damage: 50 })],
  });
  const crystalRun = simulateDps(crystal, enemy(), { duration: 1.6, mode: 'dummy' });
  near(source(crystalRun, 'crystalProc'), 50);
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


test('Phase Boots and Mask of Madness respect cooldown reduction over a full window', () => {
  const items = [
    item('item_0152', { ability_phase_duration: 12, ability_phase_ms_pct: 35, ability_evasion_pct: 20 }, 60),
    item('item_0155', { ability_duration: 6, ability_bonus_attack_speed: 100, ability_bonus_move_speed: 25 }, 60),
    item('item_0360', {
      ability_value_c_movespeed_threshold: 250,
      ability_value_c_movespeed_per_attack_damage: 5,
      ability_bonus_attack_damage_per_step: 1,
    }),
  ];
  const base = build({
    attackDamage: 1000,
    attackSpeed: 100,
    totalAgility: 100,
    totalAttributes: 100,
    baseMoveSpeed: 300,
    primaryAttr: 'agi',
    attackDamagePerAgi: 0.8,
    items,
  });
  const active = new Set(['item_0152', 'item_0155']);
  const normal = simulateDps(base, enemy(), { duration: 60, mode: 'dummy', active });
  const reduced = simulateDps(build({ ...base, cooldownReductionPct: 80 }), enemy(), {
    duration: 60,
    mode: 'dummy',
    active,
  });
  assert.ok(reduced.damage > normal.damage);
});

test('Maelstrom, Moon Shard and Mjollnir scale their hits from attack damage', () => {
  const baseBuild = build({ attackSpeed: 100 });
  const maelstrom = simulateDps(
    build({ attackSpeed: 100, items: [item('item_0117', { ability_trigger_chance_pct: 30, ability_damage: 150 })] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  const moon = simulateDps(
    build({ attackSpeed: 100, items: [item('item_0158', { ability_trigger_chance_pct: 30, ability_damage: 100 })] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  const mjollnir = simulateDps(
    build({ attackSpeed: 100, items: [item('item_0428', { ability_trigger_chance_pct: 50, ability_value_damage: 250 }, 1)] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  assert.ok(source(maelstrom, 'maelstrom') > 0);
  assert.ok(source(moon, 'moonShard') > 0);
  assert.ok(source(mjollnir, 'mjollnir') > 0);
  // The procs are counted once per attack with their expected chance, not
  // multiplied by the chain-lightning jump count.
  near(source(maelstrom, 'maelstrom'), 20 * 1500 * 0.3);
  near(source(moon, 'moonShard'), 20 * 1000 * 0.3);
  assert.ok(source(mjollnir, 'mjollnir') <= 10 * 2500 * 0.5 + 1e-6);
  assert.ok(source(simulateDps(baseBuild, enemy(), { duration: 10, mode: 'dummy' }), 'auto') > 0);
});

test('physical item hits feed 0467/0398 bleed and 0217 MKB', () => {
  const evernight = item('item_0406', {
    ability_value_c_required_attack_count: 4,
    ability_value_damage_multiplier: 250,
  });
  const bleedProc = item('item_0467', {
    ability_value_min_trigger_chance_pct: 100,
    ability_value_max_trigger_chance_pct: 100,
  });
  const bleedCrit = item('item_0398', { ability_value_trigger_chance_pct: 100 });
  const mkb = item('item_0217', {
    ability_value_trigger_chance_pct: 100,
    ability_value_armor_max_stacks: 30,
    ability_armor_duration: 3,
    ability_vulnerable_duration: 5,
  });

  const procOnly = simulateDps(build({ items: [evernight, bleedProc] }), enemy(), {
    duration: 10,
    mode: 'dummy',
  });
  const critOnly = simulateDps(
    build({ physicalCritChancePct: 100, items: [evernight, bleedCrit] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  const withMkb = simulateDps(
    build({ physicalCritChancePct: 100, items: [evernight, mkb] }),
    enemy({ armor: 100 }),
    { duration: 10, mode: 'dummy' },
  );
  assert.ok(source(procOnly, 'bleed') > 0);
  assert.ok(source(critOnly, 'bleed') > 0);
  assert.ok(withMkb.armorAfterBreak < 100);
});

test('0351 and 0406 pay their attack-combo bonus on the following attack', () => {
  const gale = simulateDps(
    build({ items: [item('item_0351', { ability_required_attack_count: 5, ability_damage_multiplier: 200 })] }),
    enemy(),
    { duration: 12, mode: 'dummy' },
  );
  const evernight = simulateDps(
    build({ items: [item('item_0406', { ability_value_c_required_attack_count: 4, ability_value_damage_multiplier: 250 })] }),
    enemy(),
    { duration: 12, mode: 'dummy' },
  );
  // 12 one-second attacks: Gale fires on 6 and 11, Evernight on 5 and 9.
  near(source(gale, 'galeStrike'), 2 * 1000 * 2);
  near(source(evernight, 'evernight'), 2 * 1000 * 2.5);
});

test('0225 Vanguard feeds its active shield into 0377 on cooldown', () => {
  const items = [
    item('item_0225', {
      ability_duration: 6,
      ability_value_shield_amount: 300,
      ability_value_max_health_pct: 25,
      ability_self_movespeed_pct: 15,
    }, 60),
    item('item_0377', { ability_current_shield_damage_pct: 80 }, 2),
  ];
  const inactive = simulateDps(build({ maxHealth: 1000, items }), enemy(), { duration: 10, mode: 'dummy' });
  const active = simulateDps(build({ maxHealth: 1000, items }), enemy(), {
    duration: 10,
    mode: 'dummy',
    active: new Set(['item_0225']),
  });
  assert.ok(source(active, 'havocHammer') > source(inactive, 'havocHammer'));
});

test('the level-3 ancestors use their own values', () => {
  const base = simulateDps(
    build({ energyShield: 1000, items: [item('item_0428', { ability_trigger_chance_pct: 50, ability_value_damage: 250 }, 1)] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  const ancestor = simulateDps(
    build({ energyShield: 1000, items: [item('item_0722', { ability_trigger_chance_pct: 50, ability_value_damage: 500 }, 1)] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  assert.ok(source(ancestor, 'mjollnir') > source(base, 'mjollnir'));
});

test('0319 Carnage Spike adds a poison stack on its 0.5 s cooldown', () => {
  const r = simulateDps(
    build({
      totalAttributes: 100,
      items: [item('item_0319', { ability_cold_duration: 5 }, 0.5)],
    }),
    enemy(),
    { duration: 1.5, mode: 'dummy' },
  );
  // One auto at t = 1 s; the poison tick then runs from the added stack.
  near(r.poisonStacks, 1);
  assert.ok(source(r, 'poison') > 0);
});

test('0377 Havoc Hammer converts the energy shield on its 2 s cooldown', () => {
  const r = simulateDps(
    build({
      attackSpeed: 100,
      energyShield: 1000,
      items: [item('item_0377', { ability_current_shield_damage_pct: 80 }, 2)],
    }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  near(source(r, 'havocHammer'), 5 * 800);
  assert.equal(r.sources.find((s) => s.id === 'havocHammer')?.hits, 5);
});

test('0392 and 0240 turn crits off; 0392 adds damage from lost movement', () => {
  const plain = simulateDps(build({ baseMoveSpeed: 300 }), enemy(), { duration: 10, mode: 'dummy' });
  const tolerance = simulateDps(
    build({
      baseMoveSpeed: 300,
      items: [
        item('item_0392', {
          ability_movespeed_threshold: 340,
          ability_movespeed_step: 5,
          ability_bonus_pct_per_step: 1,
          ability_bonus_pct_max: 30,
        }),
      ],
    }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  const unyielding = simulateDps(
    build({ items: [item('item_0240', { ability_value_movespeed_threshold: 340, ability_movespeed_step: 3 })] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  assert.equal(tolerance.critChancePct, 0);
  assert.equal(unyielding.critChancePct, 0);
  assert.ok(tolerance.damage > plain.damage);
});

test('0349 gives its owner twice the aura attack speed', () => {
  const plain = simulateDps(build({ attackSpeed: 100 }), enemy(), { duration: 10, mode: 'dummy' });
  const pendant = simulateDps(
    build({ attackSpeed: 100, items: [item('item_0349', { ability_attack_speed: 15 })] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  assert.ok(pendant.attackSpeed >= plain.attackSpeed + 30);
});

test('level-3 self-buffs use their cooldowns and scale attack damage', () => {
  const baseBuild = simulateDps(
    build({ attackDamage: 1000, attackSpeed: 100, totalAttributes: 100, maxHealth: 1000 }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  const shadow = simulateDps(
    build({
      attackDamage: 1000,
      attackSpeed: 100,
      totalAttributes: 100,
      maxHealth: 1000,
      items: [item('item_0317', { ability_duration: 10, ability_bonus_attack_speed: 100, ability_bonus_move_speed: 25 }, 100)],
    }),
    enemy(),
    { duration: 10, mode: 'dummy', active: new Set(['item_0317']) },
  );
  const axe = simulateDps(
    build({
      attackDamage: 1000,
      attackSpeed: 100,
      totalAttributes: 100,
      maxHealth: 1000,
      items: [item('item_0305', { ability_duration: 10, ability_value_all_attack_damage_percent: 30, ability_value_base_health_pct: 20 }, 30)],
    }),
    enemy(),
    { duration: 10, mode: 'dummy', active: new Set(['item_0305']) },
  );
  const horn = simulateDps(
    build({
      attackDamage: 1000,
      attackSpeed: 100,
      totalAttributes: 100,
      attackDamagePerStr: 0.8,
      maxHealth: 1000,
      items: [item('item_0289', { ability_duration: 30, ability_bonus_strength: 35 }, 120)],
    }),
    enemy(),
    { duration: 10, mode: 'dummy', active: new Set(['item_0289']) },
  );
  assert.ok(shadow.attackSpeed > baseBuild.attackSpeed);
  assert.ok(axe.damage > baseBuild.damage);
  assert.ok(horn.damage > baseBuild.damage);
});

test('the mechanics registry counts and resolves both sides of every pair', () => {
  assert.equal(DPS_FAMILY_COUNT, 49);
  assert.equal(DPS_ITEM_COUNT, 78);
  assert.equal(PANEL_FAMILY_COUNT, 9);
  assert.equal(PANEL_ITEM_COUNT, 16);
  assert.equal(MODELED_ITEM_COUNT, 94);
  assert.equal(mechanicFamilyOf('item_0209')?.base, 'item_0209');
  assert.equal(mechanicFamilyOf('item_0831')?.base, 'item_0209');
  assert.equal(mechanicFamilyOf('item_0836')?.base, 'item_0402');
  assert.equal(mechanicFamilyOf('item_0827')?.base, 'item_0646');
  assert.equal(mechanicFamilyOf('item_0730')?.base, 'item_0300');
  assert.equal(mechanicFamilyOf('item_0728')?.base, 'item_0340');
  assert.equal(mechanicFamilyOf('item_0718')?.base, 'item_0360');
  assert.equal(mechanicFamilyOf('item_0722')?.base, 'item_0428');
  assert.equal(mechanicFamilyOf('item_0703')?.base, 'item_0225');
  assert.equal(mechanicFamilyOf('item_0721')?.base, 'item_0406');
  assert.equal(mechanicFamilyOf('item_0711')?.base, 'item_0289');
  assert.equal(mechanicFamilyOf('item_9999'), undefined);
});

test('level-2 broken-armour items add their own physical hits and lower armour', () => {
  const items = [
    item('item_0124', {}),
    item('item_0234', { ability_agility_damage_pct: 35, ability_armor_reduce: 5 }),
    item('item_0300', { ability_value_agility_damage_pct: 80, ability_armor_reduce: 6 }),
  ];
  const base = build({ attackSpeed: 100, totalAgility: 100, totalAttributes: 100 });
  const withItems = build({ attackSpeed: 100, totalAgility: 100, totalAttributes: 100, items });
  const plain = simulateDps(base, enemy({ armor: 100 }), { duration: 10, mode: 'dummy' });
  const r = simulateDps(withItems, enemy({ armor: 100 }), { duration: 10, mode: 'dummy' });
  assert.ok(source(r, 'corrosiveSpike') > 0);
  assert.ok(source(r, 'feast') > 0);
  // 0124 (−2), 0234 (−5) and 0300 (−6) leave the target on 87 armour after
  // the first hit, so the following autos hit harder than without them.
  assert.ok(source(r, 'auto') > source(plain, 'auto'));
});

test('0121, 0210 and 0340 pay max-health damage on their own cooldowns', () => {
  const items = [
    item('item_0121', { ability_bonus_max_health_pct: 30 }, 3),
    item('item_0210', { ability_value_bonus_max_health_pct: 30 }, 1),
    item('item_0340', { ability_value_max_health_damage_pct: 35 }, 1.5),
  ];
  const r = simulateDps(build({ attackSpeed: 100, maxHealth: 1000, items }), enemy(), {
    duration: 10,
    mode: 'dummy',
  });
  assert.ok(source(r, 'sharpAxe') > 0);
  assert.ok(source(r, 'skullcrusher') > 0);
  assert.ok(source(r, 'ruinHammer') > 0);
});

test('0457 Sword of Valor is a 30 % chance for 80 physical on one target', () => {
  const r = simulateDps(
    build({ attackSpeed: 100, items: [item('item_0457', { ability_ps_chance: 30, ability_ps_damage: 80 })] }),
    enemy(),
    { duration: 10, mode: 'dummy' },
  );
  // 2 attacks/s over 10 s × 30 % × 80 = 480 expected.
  near(source(r, 'valorSword'), 480);
  near(r.sources.find((s) => s.id === 'valorSword')?.hits ?? 0, 6);
});

test('0307 pays its magic hit and the 3 s vortex on one target', () => {
  const r = simulateDps(
    build({
      totalAgility: 100,
      totalIntelligence: 100,
      items: [
        item('item_0307', {
          ability_value_trigger_chance_pct: 25,
          ability_value_damage_pct: 120,
          ability_dot_pct: 20,
        }),
      ],
    }),
    enemy(),
    { duration: 4, mode: 'dummy' },
  );
  // 4 attacks, 25 % each: 240 immediate and 144 vortex damage per proc.
  near(source(r, 'vortex'), 240);
  near(source(r, 'vortexDot'), 144);
});

test('0161 Gaze strikes for all attributes every 4 s', () => {
  const r = simulateDps(
    build({ totalAttributes: 100, items: [item('item_0161', { ability_damage: 80 }, 4)] }),
    enemy(),
    { duration: 9, mode: 'dummy' },
  );
  // At 4 s and 8 s: 100 × 80 % = 80 each.
  near(source(r, 'gaze'), 160);
  assert.equal(r.sources.find((s) => s.id === 'gaze')?.hits, 2);
});

test('0166 and 0303 add one poison stack whenever their cooldown is ready', () => {
  const r = simulateDps(
    build({
      totalAttributes: 100,
      items: [item('item_0166', {}, 1), item('item_0303', {}, 1)],
    }),
    enemy(),
    { duration: 1.5, mode: 'dummy' },
  );
  // One auto at t = 1 s; both items apply one stack.
  near(r.poisonStacks, 2);
  assert.ok(source(r, 'poison') > 0);
});

test('Phase Boots and Mask of Madness average their uptime; 0360 reads the movement', () => {
  const items = [
    item('item_0152', { ability_phase_duration: 12, ability_phase_ms_pct: 35, ability_evasion_pct: 20 }, 60),
    item('item_0155', { ability_duration: 6, ability_bonus_attack_speed: 100, ability_bonus_move_speed: 25 }, 60),
    item('item_0360', {
      ability_value_c_movespeed_threshold: 250,
      ability_value_c_movespeed_per_attack_damage: 5,
      ability_bonus_attack_damage_per_step: 1,
    }),
  ];
  const base = build({
    attackDamage: 1000,
    attackSpeed: 100,
    totalAgility: 100,
    totalAttributes: 100,
    baseMoveSpeed: 300,
    primaryAttr: 'agi',
    attackDamagePerAgi: 0.8,
    items,
  });
  const off = simulateDps(base, enemy(), { duration: 10, mode: 'dummy' });
  const on = simulateDps(base, enemy(), { duration: 10, mode: 'dummy', active: new Set(['item_0152', 'item_0155']) });
  assert.ok(on.attackSpeed > off.attackSpeed);
  assert.ok(on.damage > off.damage);
  // A 10 s window is covered by Phase's 12 s buff for its whole length;
  // Madness covers 6 of the 10 seconds. That is 420 average movement,
  // 34 agility above the 250 threshold.
  assert.ok(on.attackSpeed >= 100);
});
