import { dpsItemIds } from './dps-mechanics.ts';

/**
 * The calculator's DPS window: auto-attacks and the item procs/effects that
 * ride on them, against one target. The pipeline mirrors
 * `modules/damagemanager.decrypted.lua` and the item scripts in the pak:
 *
 * - crit chance combines the attack's base chance with the physical type
 *   chance, then adds omni; the multiplier is `total_crit_damage_pct / 100`
 *   with 180 % as the game's default;
 * - outgoing amplifiers multiply, then the target's reductions, armor, and
 *   finally the on-apply multipliers (vulnerable, the bag's mark);
 * - bleed is a pool: 70 % of the source's final damage, ten ticks, each
 *   `pool / ticksLeft × (1 + bleed) × (1 + dot)`, pure HP loss;
 * - 0504 turns a share of every bleed tick into a physical hit — that hit is
 *   NO_PROC, so it cannot start another bleed;
 * - 0665's light/heavy strikes are NO_PROC physical hits scaled by the
 *   target's maximum health (halved on a boss);
 * - the bag's burn is pure HP loss capped by the caster's attributes, and its
 *   mark multiplies every non-HP_LOSS hit from the caster while the target
 *   burns;
 * - 0382 rolls whenever the hero applies any debuff status and adds one more
 *   poison stack at its chance; the script guards its own application, so the
 *   extra stacks do not chain.
 *
 * The engine is deterministic and works in expectations: a 77 % proc adds
 * 0.77 of its effect per hit instead of rolling. That is what a DPS figure
 * wants, and it keeps builds comparable.
 */

export type EnemyKind = 'normal' | 'elite' | 'miniboss' | 'boss';

/** The target the calculator starts from: the endless boss of wave 60 (floor 20). */
export const WAVE60_BOSS: DpsEnemy = {
  maxHp: 7_125_635,
  armor: 188,
  magicResistancePct: 91,
  healthRegen: 0,
  kind: 'boss',
  damageReductionPct: 0,
  damageResistancePct: 0,
  physicalDamageIncreasePct: 0,
};

export interface DpsEnemy {
  maxHp: number;
  armor: number;
  /** Shown in the form; magical sources are not modelled yet, so it does not move the result. */
  magicResistancePct: number;
  healthRegen: number;
  kind: EnemyKind;
  /**
   * `incoming_damage_decrease_pct − incoming_damage_increase_pct +
   * damage_reduction_pct`, in percent: positive reduces damage.
   */
  damageReductionPct: number;
  /** `damage_resistance_pct`: damage is divided by `1 + pct / 100`. */
  damageResistancePct: number;
  /** `incoming_physical_damage_increase_pct`: positive makes the target take more. */
  physicalDamageIncreasePct: number;
}

export interface DpsItemStats {
  id: string;
  stats: Record<string, number>;
  /** `AbilityCooldown` for an active item, already season-patched. */
  cooldown?: number;
}

/** The panel values the engine reads, already summed by the calculator. */
export interface DpsBuild {
  attackDamage: number;
  allAttackDamagePct: number;
  attackSpeed: number;
  attackSpeedPct: number;
  /** `Custom_AttackRate`: seconds per attack at 100 attack speed. */
  baseAttackTime: number;
  /** `crit_chance_pct`, the base-attack chance (the game's 5 % included). */
  critChancePct: number;
  /** `ability_crit_chance_pct`, the non-base-attack base chance. */
  abilityCritChancePct: number;
  physicalCritChancePct: number;
  omniCritChancePct: number;
  /** `crit_damage_pct`, already including the game's 180 %. */
  critDamagePct: number;
  physicalDamageAddPct: number;
  /** `bonus_armor`: 0460 scales its shield hit by it. */
  totalArmor: number;
  /** The product of every `outgoing_damage_pct*` source, as a multiplier. */
  outgoingMultiplier: number;
  spellAmplifyPct: number;
  normalAttackAmpPct: number;
  armorPenetrationPct: number;
  bleedOutgoingPct: number;
  dotOutgoingPct: number;
  /** `extra_damage_pct_1..4` by target kind. */
  extraDamagePct: Record<EnemyKind, number>;
  /** The season filter, which lands after armor; 2 % per contribution/world level. */
  seasonDamagePct: number;
  /** `str + agi + int`, the cap for the bag's burn tick and the poison source value. */
  totalAttributes: number;
  maxHealth: number;
  totalAgility: number;
  /** `all_agility_pct + all_all_stats_pct`; 0360's dynamic grant passes through it. */
  agilityPct: number;
  totalIntelligence: number;
  baseMoveSpeed: number;
  primaryAttr: 'str' | 'agi' | 'int' | 'uni';
  attackDamagePerAgi: number;
  attackDamagePerStr: number;
  /** Total energy shield before the fight; 0377 turns it into physical damage. */
  energyShield: number;
  /** Every lifesteal type summed; 0362's slash scales with it. */
  anyLifestealPct: number;
  /** 0392 / 0240 turn critical strikes off for their owner. */
  noCrit: boolean;
  agilityAttackSpeedCap: number;
  agilityAttackSpeedDecay: number;
  magicalDamageAddPct: number;
  magicalCritChancePct: number;
  poisonOutgoingPct: number;
  /** `poison_damage_faster_pct`; 0 in the pak's poison items we have seen. */
  poisonFasterPct: number;
  /** `cooldown_reduction_pct`, capped at 80 in the engine. */
  cooldownReductionPct: number;
  items: DpsItemStats[];
}

export type DpsSourceId =
  | 'auto'
  | 'talonsLight'
  | 'talonsHeavy'
  | 'bleed'
  | 'bloodEcho'
  | 'burn'
  | 'poison'
  | 'poisonBurst'
  | 'witchBlade'
  | 'feather'
  | 'dartProc'
  | 'crystalProc'
  | 'valorSword'
  | 'corrosiveSpike'
  | 'feast'
  | 'sharpAxe'
  | 'skullcrusher'
  | 'ruinHammer'
  | 'vortex'
  | 'vortexDot'
  | 'gaze'
  | 'maelstrom'
  | 'moonShard'
  | 'mjollnir'
  | 'galeStrike'
  | 'evernight'
  | 'havocHammer'
  | 'soulBlade'
  | 'shatterProc'
  | 'defenderHammer'
  | 'lionheartHammer'
  | 'reaperSlash';

export interface DpsSource {
  id: DpsSourceId;
  damage: number;
  hits: number;
}

/** One second of the window: damage dealt in it and the target's health at its end. */
export interface DpsTimelinePoint {
  second: number;
  damage: number;
  dps: number;
  hp: number;
}

/** One applied hit or tick, for the kill log. */
export interface DpsEvent {
  time: number;
  source: DpsSourceId;
  damage: number;
  hp: number;
}

export interface DpsResult {
  /** Seconds the window actually covers (the kill can end it early). */
  duration: number;
  damage: number;
  dps: number;
  /** Time to kill, or null when the target survives the window. */
  ttk: number | null;
  hpLeft: number;
  sources: DpsSource[];
  /** Damage per whole second of the window; empty seconds included. */
  timeline: DpsTimelinePoint[];
  /** Every applied hit/tick in order; the UI shows the first few. */
  events: DpsEvent[];
  attacks: number;
  /** Effective values the summary shows. */
  attackSpeed: number;
  attacksPerSecond: number;
  critChancePct: number;
  critMultiplier: number;
  armorAfterPen: number;
  armorAfterBreak: number;
  /** Expected poison stacks at the end of the run. */
  poisonStacks: number;
  /** Expected Witch Blade doom stacks at the end of the run. */
  doomStacks: number;
}

export interface DpsOptions {
  duration: number;
  /** `dummy` never loses health (a stable DPS window); `kill` stops at zero. */
  mode: 'dummy' | 'kill';
  /** Active item ids the reader ticked in the DPS form. */
  active?: ReadonlySet<string>;
}

interface HitContext {
  baseAttack: boolean;
  armorStacks: number;
  vulnStacks: number;
  markStacks: number;
  burning: boolean;
  /** Flat armour reduction from 0124 / 0234 / 0300, positive amount. */
  armorDebuff: number;
}

const EPS = 1e-9;
const MAX_ATTACK_SPEED = 800;
const ARMOR_CONST = 26.66;
const BLEED_TICK = 0.5;
const BLEED_TICKS = 10;
const BLEED_POOL_PCT = 70;
const BURN_TICK = 0.5;
const BURN_HP_PCT = 15;
const BURN_BOSS_FACTOR = 0.1;
const CRIT_DAMAGE_BASE_PCT = 180;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const TALONS = dpsItemIds('talons');
const BAG = dpsItemIds('bag');
const BLOOD_ECHO = dpsItemIds('bloodEcho');
const BLEED_FASTER = dpsItemIds('bleedCrit');
const BLEED_PROC = dpsItemIds('bleedProc');
const FEATHER = dpsItemIds('feather');
const FLAT_PROC = dpsItemIds('flatProc');
const CRIT_BLEED = BLEED_FASTER;
const MKB = dpsItemIds('mkb');
const COBRA = dpsItemIds('cobra');
const GLOOM = dpsItemIds('gloom');
const WITCH = dpsItemIds('witch');
const PENDANT = dpsItemIds('pendant');
const CHAOS = dpsItemIds('chaosPoison');
const MOVE_HUNT = ['item_0360', 'item_0718'] as const;
const PHASE_BOOTS = ['item_0152'] as const;
const MADNESS = ['item_0155'] as const;
const SHADOW_MASK = ['item_0317'] as const;
const SHATTERED_AXE = ['item_0305', 'item_0425'] as const;
const VICIOUS_HORN = ['item_0289', 'item_0711'] as const;
const TOLERANCE = ['item_0392'] as const;
const UNYIELDING = ['item_0240', 'item_0705'] as const;
const BEAST_BOOTS = ['item_0350'] as const;
const BEAST_PENDANT = ['item_0349'] as const;
const LIONHEART = ['item_0329', 'item_0714'] as const;
const VANGUARD = ['item_0225', 'item_0703'] as const;
const INERTIA = ['item_0211'] as const;
const FEARLESS = ['item_0461'] as const;
const BLOOD_RITE = ['item_0332'] as const;
const LEGION_SHIELD = ['item_0255'] as const;

function findItem(build: DpsBuild, ids: readonly string[]): DpsItemStats | undefined {
  return build.items.find((item) => ids.includes(item.id));
}

const value = (item: DpsItemStats | undefined, key: string): number => num(item?.stats[key]);

function enemyExtraPct(build: DpsBuild, kind: EnemyKind): number {
  return num(build.extraDamagePct[kind]);
}

function burnFactor(kind: EnemyKind): number {
  if (kind === 'boss' || kind === 'miniboss') return BURN_BOSS_FACTOR;
  if (kind === 'elite') return 0.5;
  return 1;
}

function armorAfterPenAt(armor: number, penPct: number): number {
  if (armor > 0) return armor * (1 - clamp(penPct, 0, 100) / 100);
  return armor;
}

function armorMultiplier(armor: number): number {
  return 1 - armor / (ARMOR_CONST + Math.abs(armor));
}

function critChancePct(basePct: number, typePct: number, omniPct: number): number {
  const base = clamp(basePct, 0, 100) / 100;
  const type = clamp(typePct, 0, 100) / 100;
  return clamp(100 * (1 - (1 - base) * (1 - type)) + omniPct, 0, 100);
}

interface Constants {
  aps: number;
  attackSpeed: number;
  autoCrit: number;
  abilityCrit: number;
  critMultiplier: number;
  bleedInterval: number;
  mkb: DpsItemStats | undefined;
  mkbChance: number;
  /** `AbilityCooldown` of the 0217/0853 passive; 0.1 s in the pak. */
  mkbCooldown: number;
  mkbMaxStacks: number;
  mkbVulnDuration: number;
  mkbArmorDuration: number;
  bleedProc: DpsItemStats | undefined;
  bleedProcChance: number;
  critBleed: DpsItemStats | undefined;
  critBleedChance: number;
  bloodEcho: DpsItemStats | undefined;
  bloodEchoPct: number;
  talons: DpsItemStats | undefined;
  talonsBossPct: number;
  talonsLightPct: number;
  talonsHeavyPct: number;
  talonsHeavyChance: number;
  bag: DpsItemStats | undefined;
  burnDuration: number;
  burnInterval: number;
  markMax: number;
  markPerStack: number;
  cobra: DpsItemStats | undefined;
  cobraChance: number;
  cobraBurstPct: number;
  cobraCorrosionPct: number;
  gloom: DpsItemStats | undefined;
  gloomChance: number;
  poisonPerAuto: number;
  poisonTick: number;
  witch: DpsItemStats | undefined;
  witchChance: number;
  witchPct: number;
  doomChance: number;
  doomPerStack: number;
  doomMax: number;
  doomDecay: number;
  pendant: DpsItemStats | undefined;
  poisonSettleChance: number;
  chaos: DpsItemStats | undefined;
  /** 0382's roll per debuff status, as a fraction. */
  chaosChance: number;
  flatProcs: ReadonlyArray<{ source: 'dartProc' | 'crystalProc' | 'valorSword' | 'shatterProc'; chance: number; raw: number; armor?: number; duration?: number }>;
  feather: DpsItemStats | undefined;
  featherPct: number;
  featherDuration: number;
  featherInterval: number;
  featherPeriod: number;
  /** Flat armour reduction from 0124 / 0234 / 0300, positive amount. */
  armorDebuffPerHit: number;
  armorProcs: ReadonlyArray<{ source: 'corrosiveSpike' | 'feast'; raw: number; armor: number }>;
  cooldownProcs: ReadonlyArray<{ source: 'sharpAxe' | 'skullcrusher' | 'ruinHammer' | 'havocHammer' | 'defenderHammer' | 'lionheartHammer' | 'reaperSlash'; raw: number; cooldown: number }>;
  vortexChance: number;
  vortexRaw: number;
  vortexDotRaw: number;
  gazePct: number;
  gazeCooldown: number;
  poisonProcs: ReadonlyArray<{ id: string; cooldown: number }>;
  /** 0165's per-attack magic hit; the script hardcodes 20, the text says 60. */
  soulBlade: DpsItemStats | undefined;
  soulBladeRaw: number;
  maelstromChance: number;
  maelstromPct: number;
  moonShardChance: number;
  moonShardPct: number;
  mjollnirChance: number;
  mjollnirPct: number;
  mjollnirCooldown: number;
  galeStrike: { every: number; multiplier: number } | undefined;
  evernight: { every: number; multiplier: number } | undefined;
}

function constants(build: DpsBuild): Constants {
  const attackSpeed = clamp(
    Math.max(0, build.attackSpeed) * (1 + build.attackSpeedPct / 100),
    0,
    MAX_ATTACK_SPEED,
  );
  const bat = build.baseAttackTime > 0 ? build.baseAttackTime : 1.7;
  const mkb = findItem(build, MKB);
  const bleedProc = findItem(build, BLEED_PROC);
  const critBleed = findItem(build, CRIT_BLEED);
  const bloodEcho = findItem(build, BLOOD_ECHO);
  const talons = findItem(build, TALONS);
  const bag = findItem(build, BAG);
  const cobra = findItem(build, COBRA);
  const gloom = findItem(build, GLOOM);
  const witch = findItem(build, WITCH);
  const pendant = findItem(build, PENDANT);
  const chaos = findItem(build, CHAOS);
  const chaosChance = clamp(
    Math.max(
      0,
      value(chaos, 'ability_value_trigger_chance_pct') || value(chaos, 'ability_trigger_chance_pct'),
    ),
    0,
    100,
  ) / 100;
  const feather = findItem(build, FEATHER);
  const bleedFaster = findItem(build, BLEED_FASTER);
  const fasterPct = value(bleedFaster, 'ability_value_bleed_damage_faster_pct');
  const speed = clamp(1 + fasterPct / 100, 0.05, 10);
  const autoCrit = build.noCrit
    ? 0
    : critChancePct(build.critChancePct, build.physicalCritChancePct, build.omniCritChancePct);
  const abilityCrit = build.noCrit
    ? 0
    : critChancePct(build.abilityCritChancePct, build.physicalCritChancePct, build.omniCritChancePct);
  const cdr = 1 - Math.min(80, Math.max(0, build.cooldownReductionPct)) / 100;
  const effCd = (item: DpsItemStats | undefined, fallback: number): number =>
    Math.max(0.1, (item?.cooldown ?? fallback) * cdr);
  const brokenArmor = findItem(build, ['item_0124']);
  const corrosive = findItem(build, ['item_0234']);
  const feast = findItem(build, ['item_0300']);
  const armorProcs: Array<{ source: 'corrosiveSpike' | 'feast'; raw: number; armor: number }> = [];
  if (corrosive) {
    armorProcs.push({
      source: 'corrosiveSpike',
      raw: Math.max(0, build.totalAgility * value(corrosive, 'ability_agility_damage_pct') / 100),
      armor: Math.max(0, value(corrosive, 'ability_armor_reduce')),
    });
  }
  if (feast) {
    armorProcs.push({
      source: 'feast',
      raw: Math.max(0, build.totalAgility * value(feast, 'ability_value_agility_damage_pct') / 100),
      armor: Math.max(0, value(feast, 'ability_armor_reduce')),
    });
  }
  const armorDebuffPerHit =
    (brokenArmor ? 2 : 0) + armorProcs.reduce((sum, proc) => sum + proc.armor, 0);
  const cooldownProcs: Array<{ source: 'sharpAxe' | 'skullcrusher' | 'ruinHammer' | 'havocHammer' | 'defenderHammer' | 'lionheartHammer' | 'reaperSlash'; raw: number; cooldown: number }> = [];
  const sharpAxe = findItem(build, ['item_0121']);
  if (sharpAxe) {
    cooldownProcs.push({
      source: 'sharpAxe',
      raw: Math.max(0, build.maxHealth * value(sharpAxe, 'ability_bonus_max_health_pct') / 100),
      cooldown: effCd(sharpAxe, 3),
    });
  }
  for (const [source, ids] of [
    ['skullcrusher', ['item_0210', 'item_0729']],
    ['ruinHammer', ['item_0340', 'item_0728']],
  ] as const) {
    const item = findItem(build, ids);
    if (!item) continue;
    const pct =
      source === 'skullcrusher'
        ? value(item, 'ability_value_bonus_max_health_pct')
        : value(item, 'ability_value_max_health_damage_pct');
    cooldownProcs.push({
      source,
      raw: Math.max(0, build.maxHealth * pct / 100),
      cooldown: effCd(item, source === 'skullcrusher' ? 1 : 1.5),
    });
  }
  const vortex = findItem(build, ['item_0307', 'item_0731']);
  const vortexChance = Math.max(0, value(vortex, 'ability_value_trigger_chance_pct') / 100);
  const vortexRaw = vortex
    ? Math.max(0, (build.totalAgility + build.totalIntelligence) * value(vortex, 'ability_value_damage_pct') / 100)
    : 0;
  const vortexDotRaw = vortex
    ? Math.max(0, vortexRaw * value(vortex, 'ability_dot_pct') / 100 * 3)
    : 0;
  const gaze = findItem(build, ['item_0161']);
  const poisonProcs: Array<{ id: string; cooldown: number }> = [];
  for (const id of ['item_0166', 'item_0303', 'item_0319']) {
    const item = build.items.find((x) => x.id === id);
    if (item) poisonProcs.push({ id, cooldown: effCd(item, id === 'item_0319' ? 0.5 : 1) });
  }
  const maelstrom = findItem(build, ['item_0117']);
  const moonShard = findItem(build, ['item_0158']);
  const mjollnir = findItem(build, ['item_0428', 'item_0722']);
  const gale = findItem(build, ['item_0351']);
  const evernight = findItem(build, ['item_0406', 'item_0721']);
  const havoc = findItem(build, ['item_0377']);
  if (havoc) {
    cooldownProcs.push({
      source: 'havocHammer',
      raw: Math.max(0, build.energyShield * value(havoc, 'ability_current_shield_damage_pct') / 100),
      cooldown: effCd(havoc, 2),
    });
  }
  const defender = findItem(build, ['item_0331']);
  if (defender) {
    cooldownProcs.push({
      source: 'defenderHammer',
      raw: Math.max(0, build.energyShield * value(defender, 'ability_current_shield_damage_pct') / 100),
      cooldown: effCd(defender, 0.5),
    });
  }
  const lionhammer = findItem(build, ['item_0460']);
  if (lionhammer) {
    const armorPct = Math.min(
      Math.max(0, value(lionhammer, 'ability_value_armor_damage_pct_per_point_max')),
      Math.max(0, build.totalArmor) * Math.max(0, value(lionhammer, 'ability_armor_damage_pct_per_point')),
    );
    cooldownProcs.push({
      source: 'lionheartHammer',
      raw: Math.max(
        0,
        build.energyShield *
          value(lionhammer, 'ability_value_current_shield_damage_pct') / 100 *
          (1 + armorPct / 100),
      ),
      cooldown: effCd(lionhammer, 0.6),
    });
  }
  const reaper = findItem(build, ['item_0362', 'item_0778']);
  if (reaper) {
    const lifestealBonus = Math.min(
      Math.max(0, value(reaper, 'ability_value_lifesteal_damage_bonus_max_pct')),
      Math.max(0, build.anyLifestealPct) * Math.max(0, value(reaper, 'ability_lifesteal_damage_bonus_pct')),
    );
    cooldownProcs.push({
      source: 'reaperSlash',
      raw: Math.max(
        0,
        build.totalAttributes *
          value(reaper, 'ability_value_damage_pct') / 100 *
          (1 + lifestealBonus / 100),
      ),
      cooldown: effCd(reaper, 4.5),
    });
  }
  const flatProcs: Array<{ source: 'dartProc' | 'crystalProc' | 'valorSword' | 'shatterProc'; chance: number; raw: number; armor?: number; duration?: number }> =
    build.items
      .filter((item) => FLAT_PROC.includes(item.id))
      .map((item) => ({
        // 0129's script hardcodes 25 % / 50; 0131 reads the rolled values.
        source: item.id === 'item_0129' ? 'dartProc' as const : 'crystalProc' as const,
        chance: item.id === 'item_0129' ? 0.25 : Math.max(0, value(item, 'ability_ps_chance')) / 100,
        raw: item.id === 'item_0129' ? 50 : Math.max(0, value(item, 'ability_ps_damage')),
      }));
  const valor = findItem(build, ['item_0457']);
  if (valor) {
    flatProcs.push({
      source: 'valorSword',
      chance: Math.max(0, value(valor, 'ability_ps_chance')) / 100,
      raw: Math.max(0, value(valor, 'ability_ps_damage')),
    });
  }
  const shatter = findItem(build, ['item_0206']);
  if (shatter) {
    flatProcs.push({
      source: 'shatterProc',
      chance: Math.max(0, value(shatter, 'ability_ps_chance')) / 100,
      raw: Math.max(0, value(shatter, 'ability_ps_damage')),
      armor: Math.max(0, value(shatter, 'ability_armor_reduce')),
      duration: Math.max(0, value(shatter, 'ability_duration')),
    });
  }
  const soulBlade = findItem(build, ['item_0165']);
  const pollen = findItem(build, ['item_0270']);
  return {
    aps: (1 + attackSpeed / 100) / bat,
    attackSpeed,
    autoCrit,
    abilityCrit,
    critMultiplier: Math.max(1, build.critDamagePct / 100),
    bleedInterval: Math.max(BLEED_TICK / speed, 0.03),
    mkb,
    mkbChance: Math.max(0, value(mkb, 'ability_value_trigger_chance_pct')),
    mkbCooldown: 0.1,
    mkbMaxStacks: Math.max(1, Math.floor(value(mkb, 'ability_value_armor_max_stacks') || 1)),
    mkbVulnDuration: Math.max(0, value(mkb, 'ability_vulnerable_duration') || 5),
    mkbArmorDuration: Math.max(0, value(mkb, 'ability_armor_duration') || 3),
    bleedProc,
    bleedProcChance: Math.max(0, value(bleedProc, 'ability_value_min_trigger_chance_pct')),
    critBleed,
    critBleedChance: Math.max(0, value(critBleed, 'ability_value_trigger_chance_pct')),
    bloodEcho,
    bloodEchoPct: Math.max(0, value(bloodEcho, 'ability_value_bleed_to_physical_pct')),
    talons,
    talonsBossPct: Math.max(0, value(talons, 'ability_boss_damage_pct')),
    talonsLightPct: Math.max(0, value(talons, 'ability_value_light_max_health_pct')),
    talonsHeavyPct: Math.max(0, value(talons, 'ability_value_heavy_max_health_pct')),
    talonsHeavyChance: Math.max(0, value(talons, 'ability_heavy_chance_pct')),
    bag,
    burnDuration: Math.max(0, value(bag, 'ability_burn_duration')),
    burnInterval: Math.max(0.1, value(bag, 'ability_trigger_interval')),
    markMax: Math.max(1, Math.floor(value(bag, 'ability_max_stacks') || 1)),
    markPerStack: Math.max(0, value(bag, 'ability_value_damage_pct_per_stack')),
    cobra,
    cobraChance: Math.max(0, value(cobra, 'ability_value_poison_trigger_chance_pct')),
    cobraBurstPct: Math.max(0, value(cobra, 'ability_value_all_stats_damage_pct')),
    cobraCorrosionPct: Math.max(0, value(cobra, 'ability_magical_damage_increase_pct_per_stack')),
    gloom,
    gloomChance: Math.max(0, value(gloom, 'ability_value_poison_chance_pct')),
    poisonPerAuto:
      (cobra ? Math.max(0, value(cobra, 'ability_value_poison_trigger_chance_pct')) / 100 : 0) +
      (gloom ? Math.max(0, value(gloom, 'ability_value_poison_chance_pct')) / 100 : 0) +
      (pollen ? 0.4 : 0),
    poisonTick: Math.max(
      0.03,
      0.25 / clamp(1 + build.poisonFasterPct / 100, 0.05, 10),
    ),
    witch,
    witchChance: Math.max(0, value(witch, 'ability_value_dot_trigger_chance_pct')),
    witchPct: Math.max(0, value(witch, 'ability_all_stats_damage_pct')),
    doomChance: Math.max(0, value(witch, 'ability_value_trigger_chance_pct')),
    doomPerStack: Math.max(0, value(witch, 'ability_value_magic_resistance_reduce_pct')),
    doomMax: Math.max(1, Math.floor(value(witch, 'ability_max_stacks') || 1)),
    doomDecay: Math.max(0.1, value(witch, 'ability_decay_interval') || 3),
    pendant,
    chaos,
    chaosChance,
    flatProcs,
    feather,
    featherPct: Math.max(0, value(feather, 'ability_all_stats_damage_pct')),
    featherDuration: Math.max(0, value(feather, 'ability_duration')),
    featherInterval: Math.max(0, value(feather, 'ability_interval')),
    featherPeriod:
      feather !== undefined && (feather.cooldown ?? 0) > 0
        ? Math.max(0.1, (feather.cooldown ?? 0) * (1 - Math.min(80, Math.max(0, build.cooldownReductionPct)) / 100))
        : 0,
    poisonSettleChance:
      pendant && (cobra || gloom || pollen)
        ? 1 -
          (1 - (cobra ? Math.max(0, value(cobra, 'ability_value_poison_trigger_chance_pct')) / 100 : 0)) *
            (1 - (gloom ? Math.max(0, value(gloom, 'ability_value_poison_chance_pct')) / 100 : 0)) *
            (1 - (pollen ? 0.4 : 0))
        : 0,
    armorDebuffPerHit,
    armorProcs,
    cooldownProcs,
    vortexChance,
    vortexRaw,
    vortexDotRaw,
    gazePct: Math.max(0, value(gaze, 'ability_damage')),
    gazeCooldown: effCd(gaze, 4),
    poisonProcs,
    soulBlade,
    soulBladeRaw: 20,
    maelstromChance: maelstrom ? Math.max(0, value(maelstrom, 'ability_trigger_chance_pct')) / 100 : 0,
    maelstromPct: Math.max(0, value(maelstrom, 'ability_damage')),
    moonShardChance: moonShard ? Math.max(0, value(moonShard, 'ability_trigger_chance_pct')) / 100 : 0,
    moonShardPct: Math.max(0, value(moonShard, 'ability_damage')),
    mjollnirChance: mjollnir ? Math.max(0, value(mjollnir, 'ability_trigger_chance_pct')) / 100 : 0,
    mjollnirPct: Math.max(0, value(mjollnir, 'ability_value_damage')),
    mjollnirCooldown: effCd(mjollnir, 1),
    galeStrike: gale
      ? {
          every: Math.max(1, Math.floor(value(gale, 'ability_required_attack_count'))),
          multiplier: Math.max(0, value(gale, 'ability_damage_multiplier')) / 100,
        }
      : undefined,
    evernight: evernight
      ? {
          every: Math.max(1, Math.floor(value(evernight, 'ability_value_c_required_attack_count'))),
          multiplier: Math.max(0, value(evernight, 'ability_value_damage_multiplier')) / 100,
        }
      : undefined,
  };
}

function directDamage(
  build: DpsBuild,
  enemy: DpsEnemy,
  c: Constants,
  raw: number,
  ctx: HitContext,
): number {
  if (!(raw > 0)) return 0;
  const chance = ctx.baseAttack ? c.autoCrit : c.abilityCrit;
  const crit = 1 + (chance / 100) * (c.critMultiplier - 1);
  const physical = 1 + build.physicalDamageAddPct / 100;
  const spell = ctx.baseAttack ? 1 + build.normalAttackAmpPct / 100 : 1 + build.spellAmplifyPct / 100;
  const extra = 1 + enemyExtraPct(build, enemy.kind) / 100;
  const reduction = Math.max(0.001, 1 - (enemy.damageReductionPct - enemy.physicalDamageIncreasePct) / 100);
  const resistance = 1 / (1 + Math.max(0, enemy.damageResistancePct) / 100);
  const armor = armorMultiplier(armorAfterPenAt(armorAfterBreakAt(enemy.armor - ctx.armorDebuff, ctx.armorStacks), build.armorPenetrationPct));
  const vulnerable = c.mkb && ctx.vulnStacks > 0 ? 1 + Math.min(25, 15 + 2 * ctx.vulnStacks) / 100 : 1;
  const mark = c.bag && ctx.burning ? 1 + Math.min(c.markMax, ctx.markStacks) * c.markPerStack / 100 : 1;
  const season = 1 + build.seasonDamagePct / 100;
  return (
    raw *
    crit *
    build.outgoingMultiplier *
    physical *
    spell *
    extra *
    reduction *
    resistance *
    armor *
    vulnerable *
    mark *
    season
  );
}

function magicalDamage(
  build: DpsBuild,
  enemy: DpsEnemy,
  c: Constants,
  raw: number,
  opts: {
    dot: boolean;
    poisonSource: boolean;
    corrosionStacks: number;
    vulnStacks: number;
    burning: boolean;
    markStacks: number;
    doomStacks: number;
  },
): number {
  if (!(raw > 0)) return 0;
  const chance = opts.dot || build.noCrit
    ? 0
    : critChancePct(build.abilityCritChancePct, build.magicalCritChancePct, build.omniCritChancePct);
  const crit = 1 + (chance / 100) * (c.critMultiplier - 1);
  const magical = 1 + build.magicalDamageAddPct / 100;
  const spell = 1 + build.spellAmplifyPct / 100;
  const extra = 1 + enemyExtraPct(build, enemy.kind) / 100;
  const reduction = Math.max(0.001, 1 - enemy.damageReductionPct / 100);
  const resistance = 1 / (1 + Math.max(0, enemy.damageResistancePct) / 100);
  const effectiveMr = enemy.magicResistancePct - opts.doomStacks * c.doomPerStack;
  const magicResist = Math.max(0.001, 1 - Math.min(effectiveMr / 100, 0.99));
  const corrosion = c.cobra
    ? 1 + Math.min(30, opts.corrosionStacks * c.cobraCorrosionPct) / 100
    : 1;
  const dot = opts.dot ? 1 + build.dotOutgoingPct / 100 : 1;
  const poison = opts.poisonSource ? 1 + build.poisonOutgoingPct / 100 : 1;
  const vulnerable = c.mkb && opts.vulnStacks > 0 ? 1 + Math.min(25, 15 + 2 * opts.vulnStacks) / 100 : 1;
  const mark = c.bag && opts.burning ? 1 + Math.min(c.markMax, opts.markStacks) * c.markPerStack / 100 : 1;
  const season = 1 + build.seasonDamagePct / 100;
  return (
    raw *
    crit *
    build.outgoingMultiplier *
    magical *
    spell *
    extra *
    reduction *
    resistance *
    magicResist *
    corrosion *
    dot *
    poison *
    vulnerable *
    mark *
    season
  );
}

function pureDamage(
  build: DpsBuild,
  enemy: DpsEnemy,
  c: Constants,
  raw: number,
  opts: { vulnStacks: number; burning: boolean; markStacks: number },
): number {
  if (!(raw > 0)) return 0;
  const extra = 1 + enemyExtraPct(build, enemy.kind) / 100;
  const reduction = Math.max(0.001, 1 - enemy.damageReductionPct / 100);
  const resistance = 1 / (1 + Math.max(0, enemy.damageResistancePct) / 100);
  const vulnerable = c.mkb && opts.vulnStacks > 0 ? 1 + Math.min(25, 15 + 2 * opts.vulnStacks) / 100 : 1;
  const mark = c.bag && opts.burning ? 1 + Math.min(c.markMax, opts.markStacks) * c.markPerStack / 100 : 1;
  const season = 1 + build.seasonDamagePct / 100;
  // Type 4: no crit, no armour, no magic resistance, no corrosion or poison
  // outgoing; only the general multipliers and the on-apply debuffs.
  return (
    raw *
    build.outgoingMultiplier *
    (1 + build.spellAmplifyPct / 100) *
    extra *
    reduction *
    resistance *
    vulnerable *
    mark *
    season
  );
}

function armorAfterBreakAt(armor: number, stacks: number): number {
  return armor > 0 ? armor * (1 - clamp(stacks * 0.01, 0, 1)) : armor;
}

/**
 * Applies the two movement-speed actives on their cooldowns and, with 0360 /
 * 0718 equipped, turns the resulting average movement speed into agility. The
 * active is used at t = 0 and again whenever its cooldown is ready, so a
 * 10-second window sees a 12-second Phase buff for its whole length while a
 * 60-second window gets its 12/60 duty cycle.
 */
function activeBuild(build: DpsBuild, active: ReadonlySet<string> | undefined, duration: number): DpsBuild {
  const phase = findItem(build, PHASE_BOOTS);
  const madness = findItem(build, MADNESS);
  const shadow = findItem(build, SHADOW_MASK);
  const shattered = findItem(build, SHATTERED_AXE);
  const horn = findItem(build, VICIOUS_HORN);
  const tolerance = findItem(build, TOLERANCE);
  const unyielding = findItem(build, UNYIELDING);
  const beastBoots = findItem(build, BEAST_BOOTS);
  const beastPendant = findItem(build, BEAST_PENDANT);
  const lionheart = findItem(build, LIONHEART);
  const vanguard = findItem(build, VANGUARD);
  const inertia = findItem(build, INERTIA);
  const fearless = findItem(build, FEARLESS);
  const bloodRite = findItem(build, BLOOD_RITE);
  const legionShield = findItem(build, LEGION_SHIELD);
  const cdr = 1 - Math.min(80, Math.max(0, build.cooldownReductionPct)) / 100;
  const duty = (item: DpsItemStats | undefined, durationKey: string): number => {
    if (!item || active?.has(item.id) !== true) return 0;
    const activeFor = Math.max(0, value(item, durationKey));
    const cooldown = Math.max(0.1, (item.cooldown ?? 0) * cdr);
    if (activeFor <= 0 || cooldown <= 0 || duration <= 0) return 0;
    let uptime = 0;
    for (let at = 0; at < duration; at += cooldown) uptime += Math.min(activeFor, duration - at);
    return Math.min(1, uptime / duration);
  };
  const phaseDuty = duty(phase, 'ability_phase_duration');
  const madnessDuty = duty(madness, 'ability_duration');
  const shadowDuty = duty(shadow, 'ability_duration');
  const shatteredDuty = duty(shattered, 'ability_duration');
  const hornDuty = duty(horn, 'ability_duration');
  const vanguardDuty = duty(vanguard, 'ability_duration');
  const bloodRiteDuty = duty(bloodRite, 'ability_value_duration');
  const legionDuty = duty(legionShield, 'ability_duration');

  // Percent movement buffs and penalties first, then the flat grants. The
  // exact order only matters a little, but it keeps 0152 + 0305 sensible.
  let averageMovespeed = build.baseMoveSpeed;
  if (phase) averageMovespeed *= 1 + (Math.max(0, value(phase, 'ability_phase_ms_pct')) * phaseDuty) / 100;
  if (shattered) averageMovespeed *= 1 - (Math.max(0, value(shattered, 'ability_self_movespeed_pct')) * shatteredDuty) / 100;
  if (vanguard) averageMovespeed *= 1 - (Math.max(0, value(vanguard, 'ability_self_movespeed_pct')) * vanguardDuty) / 100;
  if (madness) averageMovespeed += Math.max(0, value(madness, 'ability_bonus_move_speed')) * madnessDuty;
  if (shadow) averageMovespeed += Math.max(0, value(shadow, 'ability_bonus_move_speed')) * shadowDuty;
  if (beastBoots) averageMovespeed += Math.max(0, value(beastBoots, 'ability_bonus_movespeed'));
  if (bloodRite) averageMovespeed += Math.max(0, value(bloodRite, 'ability_value_bonus_move_speed')) * bloodRiteDuty;
  if (legionShield) averageMovespeed -= Math.max(0, value(legionShield, 'ability_self_movespeed')) * legionDuty;

  const hunt = findItem(build, MOVE_HUNT);
  const huntThreshold = Math.max(0, value(hunt, 'ability_value_c_movespeed_threshold'));
  const huntPer = Math.max(1, value(hunt, 'ability_value_c_movespeed_per_attack_damage') || 1);
  const huntStep = Math.max(0, value(hunt, 'ability_bonus_attack_damage_per_step'));
  const dynamicAgility =
    hunt !== undefined ? Math.floor(Math.max(0, averageMovespeed - huntThreshold) / huntPer) * huntStep : 0;
  const effectiveDynamicAgility = dynamicAgility * (1 + build.agilityPct / 100);

  const baseAgility = Math.max(0, build.totalAgility);
  const agility = baseAgility + effectiveDynamicAgility;
  const cap = Math.max(0, build.agilityAttackSpeedCap);
  const decay = Math.max(1, build.agilityAttackSpeedDecay);
  const agilityAsDelta = cap * (agility / (agility + decay) - baseAgility / (baseAgility + decay));

  const madnessAs = Math.max(0, value(madness, 'ability_bonus_attack_speed')) * madnessDuty;
  const shadowAs = Math.max(0, value(shadow, 'ability_bonus_attack_speed')) * shadowDuty;
  const pendantAs = beastPendant !== undefined ? Math.max(0, value(beastPendant, 'ability_attack_speed')) * 2 : 0;
  const hornStrength = Math.max(0, value(horn, 'ability_bonus_strength')) * hornDuty;
  const shatteredAd = shattered !== undefined ? build.attackDamage * Math.max(0, value(shattered, 'ability_value_all_attack_damage_percent')) / 100 * shatteredDuty : 0;
  const shatteredHp = shattered !== undefined ? build.maxHealth * Math.max(0, value(shattered, 'ability_value_base_health_pct')) / 100 * shatteredDuty : 0;
  const activeMaxHealth = build.maxHealth + shatteredHp + hornStrength * 6;
  const vanguardShield = vanguard
    ? (Math.max(0, value(vanguard, 'ability_value_shield_amount')) +
        activeMaxHealth * Math.max(0, value(vanguard, 'ability_value_max_health_pct')) / 100) *
      vanguardDuty
    : 0;
  const toleranceBonus = tolerance !== undefined
    ? Math.min(
        Math.max(0, value(tolerance, 'ability_bonus_pct_max')),
        Math.floor(Math.max(0, Math.max(0, value(tolerance, 'ability_movespeed_threshold')) - averageMovespeed) / Math.max(1, value(tolerance, 'ability_movespeed_step'))) *
          Math.max(0, value(tolerance, 'ability_bonus_pct_per_step')),
      )
    : 0;
  const inertiaAs = inertia
    ? Math.floor(
        Math.max(0, averageMovespeed - Math.max(0, value(inertia, 'ability_movespeed_threshold'))) /
          Math.max(1, value(inertia, 'ability_movespeed_per_attack_speed')),
      ) * Math.max(0, value(inertia, 'ability_bonus_attack_speed_per_step'))
    : 0;
  const fearlessBonus = fearless
    ? Math.min(
        Math.max(0, value(fearless, 'ability_value_bonus_pct_max')),
        Math.floor(
          Math.max(
            0,
            Math.max(0, value(fearless, 'ability_value_movespeed_threshold')) - averageMovespeed,
          ) / Math.max(1, value(fearless, 'ability_movespeed_step')),
        ) * Math.max(0, value(fearless, 'ability_bonus_pct_per_step')),
      )
    : 0;
  const bloodRiteAs = Math.max(0, value(bloodRite, 'ability_value_bonus_attack_speed')) * bloodRiteDuty;
  const legionShieldAmount = legionShield
    ? activeMaxHealth * Math.max(0, value(legionShield, 'ability_value_shield_amount')) / 100 * legionDuty
    : 0;

  return {
    ...build,
    maxHealth: activeMaxHealth,
    attackDamage:
      build.attackDamage +
      effectiveDynamicAgility * build.attackDamagePerAgi +
      shatteredAd +
      hornStrength * build.attackDamagePerStr,
    attackSpeed: build.attackSpeed + agilityAsDelta + madnessAs + shadowAs + pendantAs + inertiaAs + bloodRiteAs,
    totalAgility: agility,
    totalAttributes: build.totalAttributes + effectiveDynamicAgility + hornStrength,
    energyShield:
      build.energyShield +
      vanguardShield +
      legionShieldAmount +
      (lionheart !== undefined ? hornStrength * Math.max(0, value(lionheart, 'ability_shield_per_strength')) : 0),
    outgoingMultiplier: build.outgoingMultiplier * (1 + (toleranceBonus + fearlessBonus) / 100),
    cooldownReductionPct:
      build.cooldownReductionPct +
      Math.max(0, value(bloodRite, 'ability_cooldown_reduction_pct')) * bloodRiteDuty,
    noCrit: build.noCrit || tolerance !== undefined || unyielding !== undefined,
  };
}

function sourceRecord(): Record<DpsSourceId, number> {
  return {
    auto: 0,
    talonsLight: 0,
    talonsHeavy: 0,
    bleed: 0,
    bloodEcho: 0,
    burn: 0,
    poison: 0,
    poisonBurst: 0,
    witchBlade: 0,
    feather: 0,
    dartProc: 0,
    crystalProc: 0,
    valorSword: 0,
    corrosiveSpike: 0,
    feast: 0,
    sharpAxe: 0,
    skullcrusher: 0,
    ruinHammer: 0,
    vortex: 0,
    vortexDot: 0,
    gaze: 0,
    maelstrom: 0,
    moonShard: 0,
    mjollnir: 0,
    galeStrike: 0,
    evernight: 0,
    havocHammer: 0,
    soulBlade: 0,
    shatterProc: 0,
    defenderHammer: 0,
    lionheartHammer: 0,
    reaperSlash: 0,
  };
}

function hitRecord(): Record<DpsSourceId, number> {
  return {
    auto: 0,
    talonsLight: 0,
    talonsHeavy: 0,
    bleed: 0,
    bloodEcho: 0,
    burn: 0,
    poison: 0,
    poisonBurst: 0,
    witchBlade: 0,
    feather: 0,
    dartProc: 0,
    crystalProc: 0,
    valorSword: 0,
    corrosiveSpike: 0,
    feast: 0,
    sharpAxe: 0,
    skullcrusher: 0,
    ruinHammer: 0,
    vortex: 0,
    vortexDot: 0,
    gaze: 0,
    maelstrom: 0,
    moonShard: 0,
    mjollnir: 0,
    galeStrike: 0,
    evernight: 0,
    havocHammer: 0,
    soulBlade: 0,
    shatterProc: 0,
    defenderHammer: 0,
    lionheartHammer: 0,
    reaperSlash: 0,
  };
}

/**
 * Runs one window. `kill` subtracts health and ends at zero; `dummy` keeps the
 * target at full health, which is what the source bars use.
 */
export function simulateDps(build: DpsBuild, enemy: DpsEnemy, options: DpsOptions): DpsResult {
  const duration = Math.max(1, Math.min(3600, options.duration));
  const b = activeBuild(build, options.active, duration);
  const c = constants(b);
  const dummy = options.mode === 'dummy';
  const maxHp = Math.max(1, enemy.maxHp);
  const attrs = Math.max(0, b.totalAttributes);
  const seconds = Math.ceil(duration);
  const secondDamage = Array.from({ length: seconds }, () => 0);
  const events: DpsEvent[] = [];

  let hp = maxHp;
  let time = 0;
  let attackAt = c.aps > 0 ? 1 / c.aps : Number.POSITIVE_INFINITY;
  let bleedPool = 0;
  let bleedLeft = 0;
  let bleedAt: number | null = null;
  let burnUntil = 0;
  let burnAt: number | null = null;
  let burnReady = 0;
  let markStacks = 0;
  let vulnStacks = 0;
  let armorStacks = 0;
  let armorDebuff = 0;
  let lastArmorDebuff = Number.NEGATIVE_INFINITY;
  /** 0206's own −5 armour debuff, expected by its proc chance. */
  let shatterArmor = 0;
  let shatterUntil = 0;
  let sharpAxeReady = 0;
  let skullReady = 0;
  let ruinReady = 0;
  let havocReady = 0;
  let defenderReady = 0;
  let lionhammerReady = 0;
  let reaperReady = 0;
  let mjollnirReady = 0;
  let gazeAt = c.gazePct > 0 ? c.gazeCooldown : Number.POSITIVE_INFINITY;
  const poisonReady = c.poisonProcs.map(() => 0);
  let lastVuln = Number.NEGATIVE_INFINITY;
  let lastArmor = Number.NEGATIVE_INFINITY;
  let mkbReady = 0;
  let poisonStacks = 0;
  let poisonAt: number | null = null;
  let poisonDecayAt = 0;
  /** Expected non-poison debuff applications in the current attack. */
  let chaosEvents = 0;
  /** `∏(1 − 0382 chance × p)` over those events: at least one extra stack. */
  let chaosProcMiss = 1;
  let doomStacks = 0;
  let doomAt: number | null = null;
  const featherOn =
    c.feather !== undefined &&
    options.active?.has(c.feather.id) === true &&
    c.featherPct > 0 &&
    c.featherDuration > 0 &&
    c.featherInterval > 0 &&
    c.featherPeriod > 0;
  let featherActivateAt = featherOn ? 0 : Number.POSITIVE_INFINITY;
  let featherUntil = 0;
  let featherTickAt: number | null = null;
  let attacks = 0;
  let ttk: number | null = null;
  const damage = sourceRecord();
  const hits = hitRecord();

  const ctx = (burning: boolean, baseAttack = false): HitContext => ({
    baseAttack,
    armorStacks,
    vulnStacks,
    markStacks,
    burning,
    armorDebuff: armorDebuff + (time < shatterUntil ? shatterArmor : 0),
  });

  const add = (id: DpsSourceId, amount: number, count = 0): void => {
    if (!(amount > 0)) return;
    damage[id] = (damage[id] ?? 0) + amount;
    hits[id] = (hits[id] ?? 0) + count;
    if (!dummy) hp = Math.max(0, hp - amount);
    // Whole-second buckets: an event exactly on the boundary belongs to the
    // second it closes, so the first attack at 1/aps lands in second 1.
    const bucket = Math.min(seconds - 1, Math.max(0, Math.ceil(time - EPS) - 1));
    secondDamage[bucket] = (secondDamage[bucket] ?? 0) + amount;
    if (events.length < 5000) {
      events.push({ time, source: id, damage: amount, hp: dummy ? maxHp : hp });
    }
  };

  const applyBleed = (pool: number): void => {
    if (!(pool > 0)) return;
    bleedPool += pool;
    bleedLeft = BLEED_TICKS;
    if (bleedAt === null) bleedAt = time + c.bleedInterval;
  };

  // 0382 (`乱毒`): each debuff status the hero applies to an enemy rolls once
  // for one extra poison stack. Its own stack is wrapped in a flag in the
  // script, so the extra application cannot roll again.
  const chaosEvent = (p: number): void => {
    if (!(c.chaos && c.chaosChance > 0 && p > 0)) return;
    const chance = Math.min(1, p);
    chaosEvents += chance;
    chaosProcMiss *= 1 - c.chaosChance * chance;
  };

  // Every physical damage instance can feed the on-damage passives: 0467
  // bleeds from any physical hit, 0398 only from physical crits, and 0217
  // rolls its vulnerable/armour break from physical crits. They are evaluated
  // as expected values, so the source bars do not need per-hit crit labels.
  // `mkb` is false for 0351, whose bonus belongs to the same auto-attack event
  // as the auto itself.
  const physicalTriggers = (hit: number, critChancePct: number, mkb = true): void => {
    if (!(hit > 0)) return;
    if (c.bleedProc && c.bleedProcChance > 0) {
      applyBleed(hit * (c.bleedProcChance / 100) * (BLEED_POOL_PCT / 100));
      chaosEvent(c.bleedProcChance / 100);
    }
    if (c.critBleed && critChancePct > 0 && c.critBleedChance > 0) {
      const critFactor = 1 + (critChancePct / 100) * (c.critMultiplier - 1);
      const critHit = (hit / critFactor) * c.critMultiplier;
      applyBleed(critHit * (critChancePct / 100) * (c.critBleedChance / 100) * (BLEED_POOL_PCT / 100));
      chaosEvent((critChancePct / 100) * (c.critBleedChance / 100));
    }
    if (mkb && c.mkb && c.mkbChance > 0 && critChancePct > 0 && time + EPS >= mkbReady) {
      const proc = (critChancePct / 100) * (c.mkbChance / 100);
      if (proc > 0) {
        vulnStacks = Math.min(5, vulnStacks + proc);
        armorStacks = Math.min(c.mkbMaxStacks, armorStacks + proc);
        lastVuln = time;
        lastArmor = time;
        mkbReady = time + c.mkbCooldown;
        chaosEvent(proc);
      }
    }
  };

  const addPoisonStacks = (count: number): void => {
    if (!(count > 0)) return;
    poisonStacks += count;
    if (poisonAt === null) {
      poisonAt = time + c.poisonTick;
      poisonDecayAt = time + 3;
    }
  };

  // 0165: every landed attack (including 0351/0406 sub-attacks) adds a magic
  // hit. The script hardcodes 20; its text still says 60.
  const soulBladeHit = (): void => {
    if (!c.soulBlade || c.soulBladeRaw <= 0) return;
    const hit = magicalDamage(b, enemy, c, c.soulBladeRaw, {
      dot: false,
      poisonSource: false,
      corrosionStacks: poisonStacks,
      vulnStacks,
      burning: burnUntil > time,
      markStacks,
      doomStacks,
    });
    add('soulBlade', hit, 1);
  };

  const onAttack = (): void => {
    attacks += 1;
    chaosEvents = 0;
    chaosProcMiss = 1;
    if (c.mkb && time - lastVuln > c.mkbVulnDuration) vulnStacks = 0;
    if (c.mkb && time - lastArmor > c.mkbArmorDuration) armorStacks = 0;
    if (time - lastArmorDebuff > 5) armorDebuff = 0;
    const burning = burnUntil > time;
    const autoRaw = Math.max(0, b.attackDamage) * (1 + b.allAttackDamagePct / 100);
    const auto = directDamage(b, enemy, c, autoRaw, ctx(burning, true));
    add('auto', auto, 1);
    physicalTriggers(auto, c.autoCrit);
    soulBladeHit();
    // On-hit items check the target is still alive; a killing auto-attack does
    // not also get its talons strike or start a bleed.
    if (!dummy && hp <= 0) {
      if (c.aps > 0) attackAt += 1 / c.aps;
      return;
    }

    // Flat on-attack procs (0129 Dart, 0131 Crystal Sword). The DPS tab
    // deliberately counts one target only; 0131's radius is not multiplied.
    for (const proc of c.flatProcs) {
      if (proc.chance > 0 && proc.raw > 0) {
        const hit = directDamage(b, enemy, c, proc.raw, ctx(burnUntil > time));
        add(proc.source, hit * proc.chance, proc.chance);
        physicalTriggers(hit, c.abilityCrit);
        if (proc.source === 'shatterProc' && proc.armor !== undefined && proc.duration !== undefined) {
          // The debuff is applied on the proc, not on every hit. Its expected
          // uptime is the chance of at least one proc in the last duration.
          const rolls = Math.max(0, c.aps * proc.duration);
          const uptime = proc.chance >= 1 ? 1 : 1 - Math.pow(1 - proc.chance, rolls);
          shatterArmor = proc.armor * uptime;
          shatterUntil = time + proc.duration;
        }
      }
    }

    // 0117 / 0158 / 0428: attack-damage-scaled procs. The first two are
    // straight rolls; Mjollnir also has a 1 s trigger cooldown.
    if (c.maelstromChance > 0 && c.maelstromPct > 0) {
      const raw = autoRaw * c.maelstromPct / 100;
      const hit = magicalDamage(b, enemy, c, raw, {
        dot: false,
        poisonSource: false,
        corrosionStacks: poisonStacks,
        vulnStacks,
        burning: burnUntil > time,
        markStacks,
        doomStacks,
      });
      add('maelstrom', hit * c.maelstromChance, c.maelstromChance);
    }
    if (c.moonShardChance > 0 && c.moonShardPct > 0) {
      const raw = autoRaw * c.moonShardPct / 100;
      const hit = directDamage(b, enemy, c, raw, ctx(burnUntil > time));
      add('moonShard', hit * c.moonShardChance, c.moonShardChance);
      physicalTriggers(hit, c.abilityCrit);
    }
    if (c.mjollnirChance > 0 && c.mjollnirPct > 0 && time + EPS >= mjollnirReady) {
      const raw = autoRaw * c.mjollnirPct / 100;
      const hit = magicalDamage(b, enemy, c, raw, {
        dot: false,
        poisonSource: false,
        corrosionStacks: poisonStacks,
        vulnStacks,
        burning: burnUntil > time,
        markStacks,
        doomStacks,
      });
      add('mjollnir', hit * c.mjollnirChance, c.mjollnirChance);
      mjollnirReady = time + c.mjollnirCooldown;
    }

    // 0351 / 0406: every N consecutive base attacks arms the next one. The
    // bonus therefore lands on attack N+1, N*2+1, ...; one target only.
    if (c.galeStrike && attacks > c.galeStrike.every && (attacks - 1) % c.galeStrike.every === 0) {
      const hit = directDamage(b, enemy, c, autoRaw * c.galeStrike.multiplier, ctx(burnUntil > time, true));
      add('galeStrike', hit, 1);
      physicalTriggers(hit, c.autoCrit, false);
      soulBladeHit();
    }
    if (c.evernight && attacks > c.evernight.every && (attacks - 1) % c.evernight.every === 0) {
      const hit = directDamage(b, enemy, c, autoRaw * c.evernight.multiplier, ctx(burnUntil > time));
      add('evernight', hit, 1);
      physicalTriggers(hit, c.abilityCrit);
      soulBladeHit();
    }

    // 0121 / 0210 / 0340 / 0377: one hit when their own cooldown is ready.
    for (const proc of c.cooldownProcs) {
      const ready =
        proc.source === 'sharpAxe'
          ? sharpAxeReady
          : proc.source === 'skullcrusher'
            ? skullReady
            : proc.source === 'ruinHammer'
              ? ruinReady
              : proc.source === 'havocHammer'
                ? havocReady
                : proc.source === 'defenderHammer'
                  ? defenderReady
                  : proc.source === 'reaperSlash'
                    ? reaperReady
                    : lionhammerReady;
      if (time + EPS < ready) continue;
      if (proc.source === 'reaperSlash') {
        // 0362: the slash is pure damage (type 4), so no armour, magic
        // resistance, crit or physical on-hit triggers.
        const hit = pureDamage(b, enemy, c, proc.raw, {
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
        });
        add(proc.source, hit, 1);
      } else {
        const hit = directDamage(b, enemy, c, proc.raw, ctx(burnUntil > time));
        add(proc.source, hit, 1);
        physicalTriggers(hit, c.abilityCrit);
      }
      if (proc.source === 'sharpAxe') sharpAxeReady = time + proc.cooldown;
      else if (proc.source === 'skullcrusher') skullReady = time + proc.cooldown;
      else if (proc.source === 'ruinHammer') ruinReady = time + proc.cooldown;
      else if (proc.source === 'havocHammer') havocReady = time + proc.cooldown;
      else if (proc.source === 'defenderHammer') defenderReady = time + proc.cooldown;
      else if (proc.source === 'reaperSlash') reaperReady = time + proc.cooldown;
      else lionhammerReady = time + proc.cooldown;
    }

    // 0234 / 0300: agility-scaled physical damage on every attack, then their
    // broken-armour debuff. Each source has its own bar.
    for (const proc of c.armorProcs) {
      if (!(proc.raw > 0)) continue;
      const hit = directDamage(b, enemy, c, proc.raw, ctx(burnUntil > time));
      add(proc.source, hit, 1);
      physicalTriggers(hit, c.abilityCrit);
    }
    // 0124 / 0234 / 0300 stack one broken-armour modifier; it is refreshed by
    // every attack and expires after 5 s without one. The first hit of the
    // fight therefore lands before the debuff exists.
    if (c.armorDebuffPerHit > 0) {
      armorDebuff = c.armorDebuffPerHit;
      lastArmorDebuff = time;
    }

    // 0307 / 0731: a chance-based magic hit and a 3 s vortex. The vortex is
    // counted as one target; its 0.5 s ticks are shown separately.
    if (c.vortexChance > 0 && c.vortexRaw > 0) {
      const vortex = magicalDamage(b, enemy, c, c.vortexRaw, {
        dot: false,
        poisonSource: false,
        corrosionStacks: poisonStacks,
        vulnStacks,
        burning: burnUntil > time,
        markStacks,
        doomStacks,
      });
      add('vortex', vortex * c.vortexChance, c.vortexChance);
      if (c.vortexDotRaw > 0) {
        const dot = magicalDamage(b, enemy, c, c.vortexDotRaw, {
          dot: false,
          poisonSource: false,
          corrosionStacks: poisonStacks,
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
          doomStacks,
        });
        add('vortexDot', dot * c.vortexChance, c.vortexChance);
      }
    }

    if (c.talons) {
      const scaled = maxHp * (enemy.kind === 'boss' ? c.talonsBossPct / 100 : 1);
      const light = directDamage(b, enemy, c, (scaled * c.talonsLightPct) / 100, ctx(burnUntil > time));
      add('talonsLight', light, 1);
      const heavyChance = c.talonsHeavyChance / 100;
      if (heavyChance > 0) {
        const heavy = directDamage(b, enemy, c, (scaled * c.talonsHeavyPct) / 100, ctx(burnUntil > time));
        add('talonsHeavy', heavy * heavyChance, heavyChance);
      }
    }

    if (c.bag && c.burnDuration > 0 && time + EPS >= burnReady) {
      burnUntil = time + c.burnDuration;
      burnReady = time + c.burnInterval;
      markStacks = Math.min(c.markMax, markStacks + 1);
      if (burnAt === null) burnAt = time + BURN_TICK;
      chaosEvent(1);
    }

    // Witch Blade's doom lowers magic resistance for every magical source.
    // It is applied after the hit and decays one stack every 3 s. The item
    // asks for a custom-debuff query once per attack when either the dot or
    // the doom rolls, so that is the 0382 event probability.
    if (c.witch) {
      const dot = c.witchPct > 0 ? Math.min(1, Math.max(0, c.witchChance / 100)) : 0;
      const doom = Math.min(1, Math.max(0, c.doomChance / 100));
      const application = 1 - (1 - dot) * (1 - doom);
      if (application > 0) chaosEvent(application);
    }
    if (c.witch && c.doomChance > 0) {
      doomStacks = Math.min(c.doomMax, doomStacks + c.doomChance / 100);
      if (doomAt === null) doomAt = time + c.doomDecay;
    }

    // Witch Blade's spellblade proc: with a fast attack it refreshes faster
    // than the 1 s tick, so each proc pays the full all-stats tick.
    if (c.witch && c.witchChance > 0 && c.witchPct > 0) {
      const witchRaw = b.totalAttributes * (c.witchPct / 100) * (c.witchChance / 100);
      const witch = magicalDamage(b, enemy, c, witchRaw, {
        dot: true,
        poisonSource: false,
        corrosionStacks: poisonStacks,
        vulnStacks,
        burning: burnUntil > time,
        markStacks,
        doomStacks,
      });
      add('witchBlade', witch, c.witchChance);
    }

    // Poison is applied after the hit. The Cobra burst sees the stacks that
    // were already there; the new stack only feeds the ticks that follow.
    let poisonApplicationChance = 0;
    let poisonApplications = 0;
    if (c.poisonPerAuto > 0) {
      if (c.cobra && c.cobraBurstPct > 0 && c.cobraChance > 0) {
        const burstRaw = b.totalAttributes * (c.cobraBurstPct / 100) * (c.cobraChance / 100);
        const burst = magicalDamage(b, enemy, c, burstRaw, {
          dot: false,
          poisonSource: true,
          corrosionStacks: poisonStacks,
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
          doomStacks,
        });
        add('poisonBurst', burst, c.cobraChance);
      }
      addPoisonStacks(c.poisonPerAuto);
      poisonApplications += c.poisonPerAuto;
      poisonApplicationChance = c.poisonSettleChance;
    }
    // 0166 / 0303: one poison stack whenever their 1 s cooldown is ready.
    c.poisonProcs.forEach((proc, i) => {
      if (time + EPS < poisonReady[i]!) return;
      addPoisonStacks(1);
      poisonApplications += 1;
      poisonReady[i] = time + proc.cooldown;
      poisonApplicationChance = 1;
    });
    // 0382: every poison application above and every non-poison debuff applied
    // in this attack rolls for one more stack. The script's own stack is
    // guarded, so these cannot chain.
    const chaosStacks = c.chaosChance * (poisonApplications + chaosEvents);
    if (chaosStacks > 0) addPoisonStacks(chaosStacks);
    // Poison Pendant: one extra tick after a poison application, one per
    // attack even if several poisons applied together. A 0382 stack from a
    // non-poison debuff can also create the first stack.
    const settleChance =
      1 - (1 - poisonApplicationChance) * (1 - (c.chaosChance > 0 ? 1 - chaosProcMiss : 0));
    if (c.pendant && settleChance > 0) applyPoisonTick(false, settleChance);

    if (c.aps > 0) attackAt += 1 / c.aps;
  };

  const onBleedTick = (): void => {
    if (bleedPool <= 0 || bleedLeft <= 0) {
      bleedAt = null;
      return;
    }
    const base = bleedPool / bleedLeft;
    const tick = base * (1 + b.bleedOutgoingPct / 100) * (1 + b.dotOutgoingPct / 100);
    add('bleed', tick, 1);
    bleedPool = Math.max(0, bleedPool - base);
    bleedLeft -= 1;
    if (c.bloodEcho && tick > 0 && c.bloodEchoPct > 0 && (dummy || hp > 0)) {
      const echo = directDamage(b, enemy, c, tick * (c.bloodEchoPct / 100), ctx(burnUntil > time));
      add('bloodEcho', echo, 1);
    }
    if (bleedLeft <= 0 || bleedPool <= 0 || bleedAt === null) {
      bleedAt = null;
      bleedPool = 0;
    } else {
      bleedAt += c.bleedInterval;
    }
  };

  const onBurnTick = (): void => {
    if (burnUntil <= time || burnAt === null) {
      burnAt = null;
      return;
    }
    const hpForBurn = dummy ? maxHp : Math.max(0, hp);
    const pct = hpForBurn * (BURN_HP_PCT / 100) * BURN_TICK * burnFactor(enemy.kind);
    const cap = 10 * attrs;
    add('burn', Math.min(pct, cap), 1);
    burnAt += BURN_TICK;
  };

  // Shared by the 0.25 s timer and the pendant's extra settle. `expected` is
  // 1 for a real tick and the chance of a pendant tick otherwise.
  const applyPoisonTick = (advance: boolean, expected: number): void => {
    if (poisonStacks <= 0) return;
    // `ApplyStackDecay` drops 20 % of the stacks on the 3-second boundary and
    // only stops the tick when the last stack is gone; otherwise the hit still
    // lands with the reduced stack count.
    if (time + EPS >= poisonDecayAt) {
      const decay = Math.max(1, Math.floor(poisonStacks * 0.2));
      poisonStacks = Math.max(0, poisonStacks - decay);
      poisonDecayAt = time + 3;
      if (poisonStacks <= 0) {
        poisonAt = null;
        return;
      }
    }
    const stacks = poisonStacks;
    const base = (0.4 * (stacks - 1)) / (0.4 * (stacks - 1) + 50) * 80 + 1;
    const total = (1 * (stacks - 1)) / (1 * (stacks - 1) + 120) * 4 + 1;
    // Monster path: poisonDamagePerSecond × 0.25 × 0.5 per tick.
    const perSecond = Math.floor(base * total * b.totalAttributes * 0.25 * 1.3);
    const tick = perSecond * 0.25 * 0.5;
    const damage = magicalDamage(b, enemy, c, tick, {
      dot: true,
      poisonSource: true,
      corrosionStacks: stacks,
      vulnStacks,
      burning: burnUntil > time,
      markStacks,
      doomStacks,
    });
    add('poison', damage * expected, expected);
    if (advance) poisonAt = poisonAt === null ? time + c.poisonTick : poisonAt + c.poisonTick;
  };

  const onPoisonTick = (): void => {
    if (poisonAt === null) return;
    applyPoisonTick(true, 1);
  };

  while (time + EPS < duration) {
    const next = Math.min(
      attackAt,
      bleedAt ?? Number.POSITIVE_INFINITY,
      burnAt ?? Number.POSITIVE_INFINITY,
      poisonAt ?? Number.POSITIVE_INFINITY,
      doomAt ?? Number.POSITIVE_INFINITY,
      gazeAt,
      featherActivateAt,
      featherTickAt ?? Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(next) || next > duration + EPS) break;
    const step = Math.max(0, next - time);
    if (step > 0) {
      if (!dummy) hp = Math.min(maxHp, hp + Math.max(0, enemy.healthRegen) * step);
      time = next;
    }

    // The order matches one tick of the game loop: the hit, then the DOTs.
    if (Math.abs(time - attackAt) <= EPS) onAttack();
    if (bleedAt !== null && Math.abs(time - bleedAt) <= EPS) onBleedTick();
    if (burnAt !== null && Math.abs(time - burnAt) <= EPS) onBurnTick();
    if (doomAt !== null && Math.abs(time - doomAt) <= EPS) {
      const nextDoom: number = doomAt;
      doomStacks = Math.max(0, doomStacks - 1);
      doomAt = doomStacks <= 0 ? null : nextDoom + c.doomDecay;
    }
    if (poisonAt !== null && Math.abs(time - poisonAt) <= EPS) onPoisonTick();
    if (Math.abs(time - gazeAt) <= EPS) {
      const raw = b.totalAttributes * c.gazePct / 100;
      if (raw > 0) {
        const hit = magicalDamage(b, enemy, c, raw, {
          dot: false,
          poisonSource: false,
          corrosionStacks: poisonStacks,
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
          doomStacks,
        });
        add('gaze', hit, 1);
      }
      gazeAt = time + c.gazeCooldown;
    }
    if (featherOn && Math.abs(time - featherActivateAt) <= EPS) {
      featherUntil = time + c.featherDuration;
      featherTickAt = time + c.featherInterval;
      featherActivateAt += c.featherPeriod;
    }
    if (featherOn && featherTickAt !== null && Math.abs(time - featherTickAt) <= EPS) {
      if (time <= featherUntil + EPS) {
        const raw = b.totalAttributes * (c.featherPct / 100);
        const hit = pureDamage(b, enemy, c, raw, {
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
        });
        add('feather', hit, 1);
        const next: number = featherTickAt + c.featherInterval;
        featherTickAt = next > featherUntil + EPS ? null : next;
      } else {
        featherTickAt = null;
      }
    }

    if (c.bag && burnUntil > 0 && time - burnUntil > c.burnDuration) markStacks = 0;

    if (!dummy && hp <= 0) {
      hp = 0;
      ttk = time;
      break;
    }
  }

  const covered = ttk ?? duration;
  const total = Object.values(damage).reduce((sum, x) => sum + x, 0);
  const sources: DpsSource[] = (Object.keys(damage) as DpsSourceId[])
    .map((id) => ({ id, damage: damage[id] ?? 0, hits: hits[id] ?? 0 }))
    .filter((s) => s.damage > 0)
    .sort((a, b) => b.damage - a.damage);

  const timeline: DpsTimelinePoint[] = [];
  let cumulative = 0;
  for (let i = 0; i < seconds; i += 1) {
    const dealt = secondDamage[i] ?? 0;
    cumulative += dealt;
    timeline.push({
      second: i + 1,
      damage: dealt,
      dps: dealt,
      hp: dummy ? maxHp : Math.max(0, maxHp + Math.max(0, enemy.healthRegen) * (i + 1) - cumulative),
    });
  }

  const armorAfterBreak = armorAfterBreakAt(enemy.armor - armorDebuff, c.mkb ? armorStacks : 0);
  const armorAfterPen = armorAfterPenAt(armorAfterBreak, b.armorPenetrationPct);

  return {
    duration: covered,
    damage: total,
    dps: covered > 0 ? total / covered : 0,
    ttk,
    hpLeft: dummy ? maxHp : Math.max(0, hp),
    sources,
    timeline,
    events,
    attacks,
    attackSpeed: c.attackSpeed,
    attacksPerSecond: c.aps,
    critChancePct: c.autoCrit,
    critMultiplier: c.critMultiplier,
    armorAfterPen,
    armorAfterBreak,
    poisonStacks,
    doomStacks,
  };
}

/** Both figures the DPS tab shows: a stable dummy window and the real kill time. */
export function analyzeDps(
  build: DpsBuild,
  enemy: DpsEnemy,
  duration: number,
  active?: ReadonlySet<string>,
): { window: DpsResult; kill: DpsResult } {
  return {
    window: simulateDps(build, enemy, { duration, mode: 'dummy', active }),
    kill: simulateDps(build, enemy, { duration, mode: 'kill', active }),
  };
}

/** `180 + panel` is the game's `total_crit_damage_pct`; the panel's row starts at 0. */
export function critDamageTotal(panelPct: number): number {
  return CRIT_DAMAGE_BASE_PCT + panelPct;
}
