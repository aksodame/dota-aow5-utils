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
 *   burns.
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
  | 'crystalProc';

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
  flatProcs: ReadonlyArray<{ source: 'dartProc' | 'crystalProc'; chance: number; raw: number }>;
  feather: DpsItemStats | undefined;
  featherPct: number;
  featherDuration: number;
  featherInterval: number;
  featherPeriod: number;
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
  const feather = findItem(build, FEATHER);
  const bleedFaster = findItem(build, BLEED_FASTER);
  const fasterPct = value(bleedFaster, 'ability_value_bleed_damage_faster_pct');
  const speed = clamp(1 + fasterPct / 100, 0.05, 10);
  const autoCrit = critChancePct(build.critChancePct, build.physicalCritChancePct, build.omniCritChancePct);
  const abilityCrit = critChancePct(build.abilityCritChancePct, build.physicalCritChancePct, build.omniCritChancePct);
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
      (gloom ? Math.max(0, value(gloom, 'ability_value_poison_chance_pct')) / 100 : 0),
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
    flatProcs: build.items
      .filter((item) => FLAT_PROC.includes(item.id))
      .map((item) => ({
        // 0129's script hardcodes 25 % / 50; 0131 reads the rolled values.
        source: item.id === 'item_0129' ? 'dartProc' as const : 'crystalProc' as const,
        chance: item.id === 'item_0129' ? 0.25 : Math.max(0, value(item, 'ability_ps_chance')) / 100,
        raw: item.id === 'item_0129' ? 50 : Math.max(0, value(item, 'ability_ps_damage')),
      })),
    feather,
    featherPct: Math.max(0, value(feather, 'ability_all_stats_damage_pct')),
    featherDuration: Math.max(0, value(feather, 'ability_duration')),
    featherInterval: Math.max(0, value(feather, 'ability_interval')),
    featherPeriod:
      feather !== undefined && (feather.cooldown ?? 0) > 0
        ? Math.max(0.1, (feather.cooldown ?? 0) * (1 - Math.min(80, Math.max(0, build.cooldownReductionPct)) / 100))
        : 0,
    poisonSettleChance:
      pendant && (cobra || gloom)
        ? 1 -
          (1 - (cobra ? Math.max(0, value(cobra, 'ability_value_poison_trigger_chance_pct')) / 100 : 0)) *
            (1 - (gloom ? Math.max(0, value(gloom, 'ability_value_poison_chance_pct')) / 100 : 0))
        : 0,
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
  const armor = armorMultiplier(armorAfterPenAt(armorAfterBreakAt(enemy.armor, ctx.armorStacks), build.armorPenetrationPct));
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
  const chance = opts.dot
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
  };
}

/**
 * Runs one window. `kill` subtracts health and ends at zero; `dummy` keeps the
 * target at full health, which is what the source bars use.
 */
export function simulateDps(build: DpsBuild, enemy: DpsEnemy, options: DpsOptions): DpsResult {
  const c = constants(build);
  const duration = Math.max(1, Math.min(3600, options.duration));
  const dummy = options.mode === 'dummy';
  const maxHp = Math.max(1, enemy.maxHp);
  const attrs = Math.max(0, build.totalAttributes);
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
  let lastVuln = Number.NEGATIVE_INFINITY;
  let lastArmor = Number.NEGATIVE_INFINITY;
  let mkbReady = 0;
  let poisonStacks = 0;
  let poisonAt: number | null = null;
  let poisonDecayAt = 0;
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

  // One expected proc chance per auto-attack. Both bleed items are separate,
  // and 0398 requires a crit while 0467 does not.
  const autoProcChance = (): number =>
    (c.bleedProc ? c.bleedProcChance / 100 : 0) + (c.critBleed ? (c.autoCrit / 100) * (c.critBleedChance / 100) : 0);

  const applyBleed = (pool: number): void => {
    if (!(pool > 0)) return;
    bleedPool += pool;
    bleedLeft = BLEED_TICKS;
    if (bleedAt === null) bleedAt = time + c.bleedInterval;
  };

  const onAttack = (): void => {
    attacks += 1;
    if (c.mkb && time - lastVuln > c.mkbVulnDuration) vulnStacks = 0;
    if (c.mkb && time - lastArmor > c.mkbArmorDuration) armorStacks = 0;
    const burning = burnUntil > time;
    const autoRaw = Math.max(0, build.attackDamage) * (1 + build.allAttackDamagePct / 100);
    const auto = directDamage(build, enemy, c, autoRaw, ctx(burning, true));
    add('auto', auto, 1);
    // On-hit items check the target is still alive; a killing auto-attack does
    // not also get its talons strike or start a bleed.
    if (!dummy && hp <= 0) {
      if (c.aps > 0) attackAt += 1 / c.aps;
      return;
    }

    if (c.mkb && auto > 0 && c.autoCrit > 0 && time + EPS >= mkbReady) {
      const proc = (c.autoCrit / 100) * (c.mkbChance / 100);
      if (proc > 0) {
        vulnStacks = Math.min(5, vulnStacks + proc);
        armorStacks = Math.min(c.mkbMaxStacks, armorStacks + proc);
        lastVuln = time;
        lastArmor = time;
        mkbReady = time + c.mkbCooldown;
      }
    }

    // Flat on-attack procs (0129 Dart, 0131 Crystal Sword). The DPS tab
    // deliberately counts one target only; 0131's radius is not multiplied.
    for (const proc of c.flatProcs) {
      if (proc.chance > 0 && proc.raw > 0) {
        const hit = directDamage(build, enemy, c, proc.raw, ctx(burnUntil > time));
        add(proc.source, hit * proc.chance, proc.chance);
      }
    }

    const procChance = autoProcChance();
    if (procChance > 0 && auto > 0) applyBleed(auto * (BLEED_POOL_PCT / 100) * procChance);

    if (c.talons) {
      const scaled = maxHp * (enemy.kind === 'boss' ? c.talonsBossPct / 100 : 1);
      const light = directDamage(build, enemy, c, (scaled * c.talonsLightPct) / 100, ctx(burnUntil > time));
      add('talonsLight', light, 1);
      const heavyChance = c.talonsHeavyChance / 100;
      if (heavyChance > 0) {
        const heavy = directDamage(build, enemy, c, (scaled * c.talonsHeavyPct) / 100, ctx(burnUntil > time));
        add('talonsHeavy', heavy * heavyChance, heavyChance);
      }
    }

    if (c.bag && c.burnDuration > 0 && time + EPS >= burnReady) {
      burnUntil = time + c.burnDuration;
      burnReady = time + c.burnInterval;
      markStacks = Math.min(c.markMax, markStacks + 1);
      if (burnAt === null) burnAt = time + BURN_TICK;
    }

    // Witch Blade's doom lowers magic resistance for every magical source.
    // It is applied after the hit and decays one stack every 3 s.
    if (c.witch && c.doomChance > 0) {
      doomStacks = Math.min(c.doomMax, doomStacks + c.doomChance / 100);
      if (doomAt === null) doomAt = time + c.doomDecay;
    }

    // Witch Blade's spellblade proc: with a fast attack it refreshes faster
    // than the 1 s tick, so each proc pays the full all-stats tick.
    if (c.witch && c.witchChance > 0 && c.witchPct > 0) {
      const witchRaw = build.totalAttributes * (c.witchPct / 100) * (c.witchChance / 100);
      const witch = magicalDamage(build, enemy, c, witchRaw, {
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
    if (c.poisonPerAuto > 0) {
      if (c.cobra && c.cobraBurstPct > 0 && c.cobraChance > 0) {
        const burstRaw = build.totalAttributes * (c.cobraBurstPct / 100) * (c.cobraChance / 100);
        const burst = magicalDamage(build, enemy, c, burstRaw, {
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
      poisonStacks += c.poisonPerAuto;
      if (poisonAt === null) {
        poisonAt = time + c.poisonTick;
        poisonDecayAt = time + 3;
      }
      // Poison Pendant: one extra tick after a poison application, expected
      // over the chance that at least one of the two poison items rolled.
      if (c.pendant && c.poisonSettleChance > 0) applyPoisonTick(false, c.poisonSettleChance);
    }

    if (c.aps > 0) attackAt += 1 / c.aps;
  };

  const onBleedTick = (): void => {
    if (bleedPool <= 0 || bleedLeft <= 0) {
      bleedAt = null;
      return;
    }
    const base = bleedPool / bleedLeft;
    const tick = base * (1 + build.bleedOutgoingPct / 100) * (1 + build.dotOutgoingPct / 100);
    add('bleed', tick, 1);
    bleedPool = Math.max(0, bleedPool - base);
    bleedLeft -= 1;
    if (c.bloodEcho && tick > 0 && c.bloodEchoPct > 0 && (dummy || hp > 0)) {
      const echo = directDamage(build, enemy, c, tick * (c.bloodEchoPct / 100), ctx(burnUntil > time));
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
    // The modifier decays on the 3-second boundary and skips that tick's
    // damage entirely (`ApplyStackDecay` returns before the hit).
    if (time + EPS >= poisonDecayAt) {
      const decay = Math.max(1, Math.floor(poisonStacks * 0.2));
      poisonStacks = Math.max(0, poisonStacks - decay);
      poisonDecayAt += 3;
      if (advance) poisonAt = poisonAt === null ? time + c.poisonTick : poisonAt + c.poisonTick;
      if (poisonStacks <= 0) poisonAt = null;
      return;
    }
    const stacks = poisonStacks;
    const base = (0.4 * (stacks - 1)) / (0.4 * (stacks - 1) + 50) * 80 + 1;
    const total = (1 * (stacks - 1)) / (1 * (stacks - 1) + 120) * 4 + 1;
    // Monster path: poisonDamagePerSecond × 0.25 × 0.5 per tick.
    const perSecond = Math.floor(base * total * build.totalAttributes * 0.25 * 1.3);
    const tick = perSecond * 0.25 * 0.5;
    const damage = magicalDamage(build, enemy, c, tick, {
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
    if (featherOn && Math.abs(time - featherActivateAt) <= EPS) {
      featherUntil = time + c.featherDuration;
      featherTickAt = time + c.featherInterval;
      featherActivateAt += c.featherPeriod;
    }
    if (featherOn && featherTickAt !== null && Math.abs(time - featherTickAt) <= EPS) {
      if (time <= featherUntil + EPS) {
        const raw = build.totalAttributes * (c.featherPct / 100);
        const hit = pureDamage(build, enemy, c, raw, {
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

  const armorAfterBreak = armorAfterBreakAt(enemy.armor, c.mkb ? armorStacks : 0);
  const armorAfterPen = armorAfterPenAt(armorAfterBreak, build.armorPenetrationPct);

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
