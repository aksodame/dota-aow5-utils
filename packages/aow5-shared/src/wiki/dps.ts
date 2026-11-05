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
  /** Total mana; 0219 spends it, 0408 and 0551 scale damage from it. */
  maxMana: number;
  /** Every lifesteal type summed; 0362's slash scales with it. */
  anyLifestealPct: number;
  /** `lifesteal_amp_pct` in percent: 0543/0625 reduce every lifesteal heal. */
  lifestealAmpPct: number;
  /**
   * 0241 reads only the `attack_lifesteal` and `spell_lifesteal` heal events.
   * The engine maps the pak's five stats onto them as attack = attack +
   * physical + omni, spell = spell + magical + omni (omni heals both).
   */
  attackHealPct: number;
  spellHealPct: number;
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
  | 'reaperSlash'
  | 'curseRibbon'
  | 'omniStrike'
  | 'assassinCreed'
  | 'frostChain'
  | 'radiance'
  | 'soulScatter'
  | 'skyrend'
  | 'vulnDetonate'
  | 'ignite'
  | 'verdict'
  | 'ashCodex'
  | 'manaSpring'
  // Level 7 (v1.522)
  | 'critChain'
  | 'bloodMoon'
  | 'frostbite';

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
/** Items whose script grants agility from movement speed through `GetAttributeBonus`. */
export const MOVE_HUNT_IDS = ['item_0205', 'item_0360', 'item_0718'] as const;
const PHASE_BOOTS = ['item_0152'] as const;
const MADNESS = ['item_0155'] as const;
const SHADOW_MASK = ['item_0317'] as const;
const SHATTERED_AXE = ['item_0305', 'item_0425'] as const;
const VICIOUS_HORN = ['item_0289', 'item_0711'] as const;
const TOLERANCE = ['item_0392'] as const;
// 0447 (Shiva's Guard) and 0448 (Magic Wand) point at the 0240 script in the
// pak without its ability values: they force no crits and add no bonus. The
// engine models the script, which is what the game runs.
const UNYIELDING = ['item_0240', 'item_0705', 'item_0447', 'item_0448'] as const;
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

/**
 * Damage sources that are spell-type rather than attack-type, for 0241's two
 * heal channels. Everything else counts as attack (physical item hits and
 * attack modifiers); pure damage does not lifesteal at all.
 */
const SPELL_SOURCES: ReadonlySet<DpsSourceId> = new Set<DpsSourceId>([
  'witchBlade',
  'poison',
  'poisonBurst',
  'burn',
  'gaze',
  'maelstrom',
  'moonShard',
  'mjollnir',
  'frostChain',
  'omniStrike',
  'soulBlade',
  'curseRibbon',
  'vortex',
  'vortexDot',
  'soulScatter',
  'ashCodex',
  'bloodMoon',
  'frostbite',
]);
const NO_HEAL_SOURCES: ReadonlySet<DpsSourceId> = new Set<DpsSourceId>([
  'feather',
  'reaperSlash',
  'radiance',
  'ignite',
  'verdict',
  'manaSpring',
  'critChain',
]);

/**
 * The agility 0205 / 0360 / 0718 grant at `movespeed`.
 *
 * All three run `floor(max(0, total_movespeed − threshold) / per) × step` and
 * return the result from `GetAttributeBonus`, so it is a real agility bonus:
 * the panel's agility row — and everything derived from it, attack damage and
 * attack speed included — must see the same number the DPS window does.
 * 0205 hardcodes 250 / 5 / 1 in its script; 0360 and 0718 read them from the
 * ability values (0718's step is 2). Every such item equipped counts.
 */
export function moveHuntAgility(items: readonly DpsItemStats[], movespeed: number): number {
  let agility = 0;
  for (const item of items) {
    if (!(MOVE_HUNT_IDS as readonly string[]).includes(item.id)) continue;
    const stat = (key: string, fallback: number): number => {
      const v = item.stats[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    };
    const threshold = Math.max(0, stat('ability_value_c_movespeed_threshold', 250));
    const per = Math.max(1, stat('ability_value_c_movespeed_per_attack_damage', 5));
    const step = Math.max(0, stat('ability_bonus_attack_damage_per_step', item.id === 'item_0205' ? 1 : 0));
    agility += Math.floor(Math.max(0, movespeed - threshold) / per) * step;
  }
  return agility;
}

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
  magicCrit: number;
  omniCrit: number;
  critMultiplier: number;
  bleedInterval: number;
  mkb: DpsItemStats | undefined;
  mkbChance: number;
  /** `AbilityCooldown` of the 0217/0853 passive; 0.1 s in the pak. */
  mkbCooldown: number;
  mkbMaxStacks: number;
  mkbVulnDuration: number;
  mkbArmorDuration: number;
  /**
   * Attack-triggered vulnerability besides 0217: 0196 (25 %, 1 s cooldown)
   * and 0363 (50 %, no cooldown), both 5 s. They share the generic
   * `modifier_generic_vulnerable` with MKB, so the stacks pool together.
   */
  vulnSources: ReadonlyArray<{ chance: number; cooldown: number }>;
  vulnDuration: number;
  /**
   * 0361 / 0453 "assassin's creed": a chance-based physical hit scaled by
   * agility and by the TOTAL attack speed (the tooltip says "additional").
   * The scripts share the `assassin_creed` mutex; 0453 has the higher
   * priority, so only it is read when both are equipped.
   */
  creed: { chance: number; agilityPct: number; perAsPct: number; targetPct: number; cooldown: number } | undefined;
  /** 0342 Frost Chain: on attack, 180 % of attack damage as magic on a 0.5 s cooldown. */
  frostChain: { pct: number; cooldown: number } | undefined;
  /** 0241 Bloodthirsty Heart: heal → stored attack damage, capped and decaying. */
  heart: { perPct: number; maxAd: number; decayPct: number; decayMin: number } | undefined;
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
  curseRibbon: DpsItemStats | undefined;
  curseRibbonPct: number;
  omniStrike: DpsItemStats | undefined;
  omniStrikePct: number;
  /** 0216 Radiance: a toggle aura of max-shield pure damage plus burn. */
  radiance: { pct: number; interval: number; burn: number } | undefined;
  /** 0219 Soul Scatter: mana spent per attack becomes magic damage. */
  soulScatter:
    | { costThresholdPct: number; costPct: number; multiplier: number; restoreThresholdPct: number; restore: number }
    | undefined;
  /** 0309 Hurricane Glaive: physical non-DOT damage can start a bleed. */
  glaiveChance: number;
  /** 0517 Skyrend: chance for a physical hit scaled by all attributes. */
  skyrend: { chance: number; pct: number } | undefined;
  /** 0567 / 0586: a stacking damage mark applied by real attacks. */
  huntMark: { chance: number; perStack: number; maxStacks: number; duration: number; doubleAtMax: boolean } | undefined;
  /** 0528 Thousand Blades: extra vulnerable stacks and a detonation at the cap. */
  thousandBlades: { extraChance: number; detonatePct: number } | undefined;
  /** 0407 Ember Ring: burn a target that is not burning yet. */
  emberRing: { duration: number; cooldown: number } | undefined;
  /** 0550 Flaming Fury: attacks can burn. */
  flameFury: { chance: number; duration: number; cooldown: number } | undefined;
  /** 0408 Ash Codex: a burning target explodes for a share of max mana. */
  ashCodex: { pct: number; cooldown: number } | undefined;
  /** 0534 / 0582: burn applications add Ignite stacks. */
  ignite: { chance: number; pctPerStack: number; maxStacks: number; duration: number } | undefined;
  /** 0581 Eye of Judgment: damage per debuff on the target. */
  judgment: { perDebuff: number } | undefined;
  /** 0551 Magic Spring: a passive aura that burns mana as pure damage. */
  manaSpring: { pct: number } | undefined;
  /** 0515 Blood Dominion: lifesteal heals turn into attack damage. */
  bloodDominion: { perPct: number; maxAd: number; decayPct: number; decayMin: number } | undefined;
  /** 0525 Arcane Forge: non-base physical damage becomes magic. */
  arcaneForge: boolean;
  /** 0218 / 0232 / 0648: a crit can add one more hit of the same size. */
  critChain: { magic: boolean; chance: number; noCrit: boolean } | undefined;
  /** 0348 Buddha's Strike: damage grows as the target loses health. */
  buddha: { stepPct: number; perStep: number; cap: number; duration: number } | undefined;
  /** 0420 / 0638 Blood Thorn: the active wave and its Blood Moon mark. */
  bloodMoon: { pct: number; cooldown: number; markDuration: number; vulnChance: number; vulnDuration: number } | undefined;
  /** 0593 Charged Strike: own DOT ticks add crit chance and crit damage. */
  erosion: { perStack: number; critPerStack: number; max: number; decayPct: number } | undefined;
  /** 0620 Destroyer Blade: ten freeze stacks burst into a magic DOT. */
  frostbite: { threshold: number; duration: number; pct: number; interval: number } | undefined;
  /** 0622 Star Crusher Axe: a physical crit can add vulnerable stacks. */
  starShatter: { chance: number; duration: number; cooldown: number } | undefined;
  /** 0619 Solar Furnace: non-base physical damage becomes magic at 120 %. */
  solarForge: { factor: number } | undefined;
}

function constants(build: DpsBuild): Constants {
  const attackSpeed = clamp(
    Math.max(0, build.attackSpeed) * (1 + build.attackSpeedPct / 100),
    0,
    MAX_ATTACK_SPEED,
  );
  const bat = build.baseAttackTime > 0 ? build.baseAttackTime : 1.7;
  const mkb = findItem(build, MKB);
  // 0196 and 0363 hang the same generic vulnerability as 0217 from an attack.
  // 0196's passive has a 1 s item cooldown; 0363 has none.
  const vulnSources = [findItem(build, ['item_0196']), findItem(build, ['item_0363']), findItem(build, ['item_0311'])]
    .map((item) => {
      if (item === undefined) return null;
      const chance = Math.max(
        0,
        value(item, 'ability_trigger_chance_pct') || value(item, 'ability_value_trigger_chance_pct'),
      ) / 100;
      if (!(chance > 0)) return null;
      return { chance, cooldown: Math.max(0, item.cooldown ?? 0), duration: Math.max(0, value(item, 'ability_vulnerable_duration') || 5) };
    })
    .filter((x): x is { chance: number; cooldown: number; duration: number } => x !== null);
  const vulnDuration = Math.max(
    mkb !== undefined ? Math.max(0, value(mkb, 'ability_vulnerable_duration') || 5) : 0,
    ...vulnSources.map((s) => s.duration),
  );
  // 0453 (mutex priority 200) wins over 0361 (100) when both are equipped.
  const creedItem = findItem(build, ['item_0453']) ?? findItem(build, ['item_0361']);
  const creed = creedItem === undefined
    ? undefined
    : {
        chance: Math.max(0, value(creedItem, 'ability_value_trigger_chance_pct')) / 100,
        agilityPct: Math.max(0, value(creedItem, 'ability_value_agility_damage_pct')),
        perAsPct: Math.max(0, value(creedItem, 'ability_damage_pct_per_attack_speed')),
        // 0453 splits the hit: the target takes target_damage_pct of the base,
        // the area around it takes area_damage_pct. Only the target is counted.
        targetPct: creedItem.id === 'item_0453' ? Math.max(0, value(creedItem, 'ability_target_damage_pct')) : 100,
        // 0361 hardcodes a 0.2 s internal cooldown; 0453 reads its value.
        cooldown: Math.max(0, creedItem.id === 'item_0453' ? value(creedItem, 'ability_internal_cooldown') : 0.2),
      };
  const chainItem = findItem(build, ['item_0342']);
  const frostChain = chainItem === undefined
    ? undefined
    : {
        pct: Math.max(0, value(chainItem, 'ability_value_attack_damage_pct')),
        cooldown: Math.max(0, chainItem.cooldown ?? 0.5),
      };
  const heartItem = findItem(build, ['item_0241']);
  const heart = heartItem === undefined
    ? undefined
    : {
        perPct: Math.max(0, value(heartItem, 'ability_attack_per_lifesteal_pct')),
        maxAd: Math.max(0, value(heartItem, 'ability_max_bonus_attack')),
        decayPct: Math.max(0, value(heartItem, 'ability_decay_pct_per_second')),
        decayMin: Math.max(0, value(heartItem, 'ability_decay_min_per_second')),
      };
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
  const magicCrit = build.noCrit
    ? 0
    : critChancePct(build.abilityCritChancePct, build.magicalCritChancePct, build.omniCritChancePct);
  const omniCrit = build.noCrit ? 0 : clamp(build.omniCritChancePct, 0, 100);
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
  const curseRibbon = findItem(build, ['item_0379']);
  const omniStrike = findItem(build, ['item_0372']);
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
  // 0206 and 0229 run the same shatter script (different numbers); both can
  // be equipped, and each rolls its own proc and armour debuff.
  for (const id of ['item_0206', 'item_0229']) {
    const shatter = findItem(build, [id]);
    if (shatter) {
      flatProcs.push({
        source: 'shatterProc',
        chance: Math.max(0, value(shatter, 'ability_ps_chance')) / 100,
        raw: Math.max(0, value(shatter, 'ability_ps_damage')),
        armor: Math.max(0, value(shatter, 'ability_armor_reduce')),
        duration: Math.max(0, value(shatter, 'ability_duration')),
      });
    }
  }
  const soulBlade = findItem(build, ['item_0165']);
  const pollen = findItem(build, ['item_0270']);

  const radianceItem = findItem(build, ['item_0216', 'item_0864']);
  const radiance = radianceItem
    ? {
        pct: Math.max(0, value(radianceItem, 'ability_value_shield_damage_pct')),
        interval: Math.max(0.1, value(radianceItem, 'ability_damage_interval') || 1),
        burn: Math.max(0, value(radianceItem, 'ability_burn_duration')),
      }
    : undefined;
  const soulScatterItem = findItem(build, ['item_0219', 'item_0865']);
  const soulScatter = soulScatterItem
    ? {
        costThresholdPct: Math.max(0, value(soulScatterItem, 'ability_mana_cost_threshold_pct')),
        costPct: Math.max(0, value(soulScatterItem, 'ability_mana_cost_current_pct')),
        multiplier: Math.max(0, value(soulScatterItem, 'ability_value_bonus_damage_multiplier')),
        restoreThresholdPct: Math.max(0, value(soulScatterItem, 'ability_mana_restore_threshold_pct')),
        restore: Math.max(0, value(soulScatterItem, 'ability_value_mana_restore')),
      }
    : undefined;
  const glaive = findItem(build, ['item_0309']);
  const skyrendItem = findItem(build, ['item_0517']);
  const skyrend = skyrendItem
    ? {
        chance: Math.min(100, Math.max(0, value(skyrendItem, 'ability_trigger_chance_pct'))) / 100,
        pct: Math.max(0, value(skyrendItem, 'ability_aoe_damage_pct')),
      }
    : undefined;
  // 0567 and 0586 share the same mark mutex; 0567 wins when both are worn.
  const huntMarkItem = findItem(build, ['item_0567', 'item_0773']) ?? findItem(build, ['item_0586']);
  const huntMark = huntMarkItem
    ? {
        chance: huntMarkItem.id === 'item_0586'
          ? 1
          : Math.min(100, Math.max(0, value(huntMarkItem, 'ability_value_trigger_chance_pct'))) / 100,
        perStack: Math.max(0, value(huntMarkItem, 'ability_dmg_pct_per_stack')),
        maxStacks: Math.max(1, Math.floor(value(huntMarkItem, huntMarkItem.id === 'item_0586' ? 'ability_max_stacks' : 'ability_value_max_stacks'))),
        duration: Math.max(0, value(huntMarkItem, 'ability_mark_duration')),
        doubleAtMax: huntMarkItem.id === 'item_0567',
      }
    : undefined;
  const thousandBladesItem = findItem(build, ['item_0528', 'item_0767']);
  const thousandBlades = thousandBladesItem
    ? {
        extraChance: Math.min(100, Math.max(0, value(thousandBladesItem, 'ability_value_extra_stack_chance_pct'))) / 100,
        detonatePct: Math.max(0, value(thousandBladesItem, 'ability_value_detonate_damage_pct')),
      }
    : undefined;
  const emberRingItem = findItem(build, ['item_0407']);
  const emberRing = emberRingItem
    ? { duration: Math.max(0, value(emberRingItem, 'ability_burn_duration')), cooldown: effCd(emberRingItem, 1.5) }
    : undefined;
  const flameFuryItem = findItem(build, ['item_0550', 'item_0770']);
  const flameFury = flameFuryItem
    ? {
        chance: Math.min(100, Math.max(0, value(flameFuryItem, 'ability_value_burn_trigger_chance_pct'))) / 100,
        duration: Math.max(0, value(flameFuryItem, 'ability_burn_duration')),
        cooldown: effCd(flameFuryItem, 0.5),
      }
    : undefined;
  const ashCodexItem = findItem(build, ['item_0408', 'item_0866']);
  const ashCodex = ashCodexItem
    ? { pct: Math.max(0, value(ashCodexItem, 'ability_value_explode_mana_pct')), cooldown: effCd(ashCodexItem, 3) }
    : undefined;
  // 0534 and 0582 share the same mutex; 0534 has the higher priority.
  const igniteItem = findItem(build, ['item_0534', 'item_0768']) ?? findItem(build, ['item_0582']);
  const ignite = igniteItem
    ? {
        chance: Math.min(100, Math.max(0, value(igniteItem, 'ability_value_ignite_trigger_chance_pct'))) / 100,
        pctPerStack: Math.max(0, value(igniteItem, 'ability_value_ignite_pct_per_stack')),
        maxStacks: Math.max(1, Math.floor(value(igniteItem, 'ability_ignite_max_stacks'))),
        duration: Math.max(0.1, value(igniteItem, 'ability_ignite_duration')),
      }
    : undefined;
  const judgmentItem = findItem(build, ['item_0581', 'item_0869']);
  const judgment = judgmentItem
    ? { perDebuff: Math.max(0, value(judgmentItem, 'ability_value_dmg_per_debuff')) }
    : undefined;
  const manaSpringItem = findItem(build, ['item_0551', 'item_0771']);
  // The aura's damage is hardcoded to 100 % of max mana per second; the
  // ability value only sets the mana restored to allies.
  const manaSpring = manaSpringItem ? { pct: 100 } : undefined;
  const bloodDominionItem = findItem(build, ['item_0515', 'item_0760']);
  const bloodDominion = bloodDominionItem
    ? {
        perPct: Math.max(0, value(bloodDominionItem, 'ability_value_attack_per_lifesteal_pct')),
        maxAd: Math.max(0, value(bloodDominionItem, 'ability_value_max_bonus_attack')),
        decayPct: Math.max(0, value(bloodDominionItem, 'ability_decay_pct_per_second')),
        decayMin: Math.max(0, value(bloodDominionItem, 'ability_decay_min_per_second')),
      }
    : undefined;
  const arcaneForge = findItem(build, ['item_0525']) !== undefined;
  // 0218 and 0648 share priority 200; 0232 is the lower-priority epic copy.
  const critChainItem = findItem(build, ['item_0218', 'item_0774', 'item_0648', 'item_0874', 'item_0232']);
  const critChain = critChainItem
    ? {
        magic: critChainItem.id === 'item_0648',
        chance: clamp(
          Math.max(
            0,
            value(critChainItem, 'ability_value_chain_chance_pct') || value(critChainItem, 'ability_chain_chance_pct'),
          ),
          0,
          100,
        ) / 100,
        // s3 adds this key to 0218/0232/0648; it makes the extra hit unable to crit.
        noCrit: Math.max(0, value(critChainItem, 'ability_chain_no_crit')) > 0,
      }
    : undefined;
  const buddhaItem = findItem(build, ['item_0348', 'item_0777']);
  const buddha = buddhaItem
    ? {
        stepPct: Math.max(1, value(buddhaItem, 'ability_loss_health_step_pct')),
        perStep: Math.max(0, value(buddhaItem, 'ability_damage_bonus_per_step_pct')),
        cap: Math.max(0, value(buddhaItem, 'ability_value_damage_bonus_limit_pct')),
        duration: Math.max(0, value(buddhaItem, 'ability_mark_duration')),
      }
    : undefined;
  const bloodMoonItem = findItem(build, ['item_0420', 'item_0784']) ?? findItem(build, ['item_0638']);
  const bloodMoon = bloodMoonItem
    ? {
        pct: Math.max(0, value(bloodMoonItem, 'ability_attack_damage_pct')),
        cooldown: effCd(bloodMoonItem, 45),
        markDuration: Math.max(0, value(bloodMoonItem, 'ability_bloodmoon_duration')),
        vulnChance: Math.min(100, Math.max(0, value(bloodMoonItem, 'ability_value_vulnerable_chance_pct') || value(bloodMoonItem, 'ability_vulnerable_chance_pct'))) / 100,
        vulnDuration: Math.max(0, value(bloodMoonItem, 'ability_vulnerable_duration')),
      }
    : undefined;
  const erosionItem = findItem(build, ['item_0593', 'item_0795']);
  const erosion = erosionItem
    ? {
        perStack: Math.max(0, value(erosionItem, 'ability_crit_per_stack')),
        critPerStack: Math.max(0, value(erosionItem, 'ability_critdmg_per_stack')),
        max: Math.max(1, Math.floor(value(erosionItem, 'ability_value_max_stacks'))),
        decayPct: Math.max(0, value(erosionItem, 'ability_erode_decay_pct')),
      }
    : undefined;
  const frostbiteItem = findItem(build, ['item_0620', 'item_0800']);
  const frostbite = frostbiteItem
    ? {
        threshold: Math.max(1, Math.floor(value(frostbiteItem, 'ability_freeze_stack_threshold'))),
        duration: Math.max(0, value(frostbiteItem, 'ability_frostbite_duration')),
        pct: Math.max(0, value(frostbiteItem, 'ability_value_damage_all_stats_pct') || value(frostbiteItem, 'ability_damage_all_stats_pct')),
        interval: 1,
      }
    : undefined;
  const starShatterItem = findItem(build, ['item_0622']);
  const starShatter = starShatterItem
    ? {
        chance: Math.min(100, Math.max(0, value(starShatterItem, 'ability_trigger_chance_pct'))) / 100,
        duration: Math.max(0, value(starShatterItem, 'ability_vulnerable_duration')),
        cooldown: Math.max(0.1, starShatterItem.cooldown ?? 0.25),
      }
    : undefined;
  const solarForgeItem = findItem(build, ['item_0619', 'item_0799']);
  const solarForge = solarForgeItem
    ? { factor: Math.max(0, value(solarForgeItem, 'ability_value_magic_amp_pct') || 120) / 100 }
    : undefined;

  return {
    aps: (1 + attackSpeed / 100) / bat,
    attackSpeed,
    autoCrit,
    abilityCrit,
    magicCrit,
    omniCrit,
    critMultiplier: Math.max(1, build.critDamagePct / 100),
    bleedInterval: Math.max(BLEED_TICK / speed, 0.03),
    mkb,
    mkbChance: Math.max(0, value(mkb, 'ability_value_trigger_chance_pct')),
    mkbCooldown: 0.1,
    mkbMaxStacks: Math.max(1, Math.floor(value(mkb, 'ability_value_armor_max_stacks') || 1)),
    mkbVulnDuration: Math.max(0, value(mkb, 'ability_vulnerable_duration') || 5),
    mkbArmorDuration: Math.max(0, value(mkb, 'ability_armor_duration') || 3),
    vulnSources,
    vulnDuration,
    creed,
    frostChain,
    heart,
    bleedProc,
    bleedProcChance: Math.max(0, value(bleedProc, 'ability_value_min_trigger_chance_pct') || value(bleedProc, 'ability_trigger_chance_pct')),
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
    curseRibbon,
    curseRibbonPct: Math.max(0, value(curseRibbon, 'ability_magical_damage_add_pct')),
    omniStrike,
    omniStrikePct: Math.max(0, value(omniStrike, 'ability_all_stats_damage_pct')),
    radiance,
    soulScatter,
    glaiveChance: Math.min(100, Math.max(0, value(glaive, 'ability_trigger_chance_pct'))) / 100,
    skyrend,
    huntMark,
    thousandBlades,
    emberRing,
    flameFury,
    ashCodex,
    ignite,
    judgment,
    manaSpring,
    bloodDominion,
    arcaneForge,
    critChain,
    buddha,
    bloodMoon,
    erosion,
    frostbite,
    starShatter,
    solarForge,
  };
}

function directDamage(
  build: DpsBuild,
  enemy: DpsEnemy,
  c: Constants,
  raw: number,
  ctx: HitContext,
  noCrit = false,
): number {
  if (!(raw > 0)) return 0;
  const chance = noCrit ? 0 : ctx.baseAttack ? c.autoCrit : c.abilityCrit;
  const crit = 1 + (chance / 100) * (c.critMultiplier - 1);
  const physical = 1 + build.physicalDamageAddPct / 100;
  const spell = ctx.baseAttack ? 1 + build.normalAttackAmpPct / 100 : 1 + build.spellAmplifyPct / 100;
  const extra = 1 + enemyExtraPct(build, enemy.kind) / 100;
  const reduction = Math.max(0.001, 1 - (enemy.damageReductionPct - enemy.physicalDamageIncreasePct) / 100);
  const resistance = 1 / (1 + Math.max(0, enemy.damageResistancePct) / 100);
  const armor = armorMultiplier(armorAfterPenAt(armorAfterBreakAt(enemy.armor - ctx.armorDebuff, ctx.armorStacks), build.armorPenetrationPct));
  const vulnerable = ctx.vulnStacks > 0 ? 1 + Math.min(25, 15 + 2 * ctx.vulnStacks) / 100 : 1;
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
    curseRibbonActive: boolean;
  },
  noCrit = false,
): number {
  if (!(raw > 0)) return 0;
  const chance = opts.dot || build.noCrit || noCrit ? 0 : c.magicCrit;
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
  const vulnerable = opts.vulnStacks > 0 ? 1 + Math.min(25, 15 + 2 * opts.vulnStacks) / 100 : 1;
  const mark = c.bag && opts.burning ? 1 + Math.min(c.markMax, opts.markStacks) * c.markPerStack / 100 : 1;
  const season = 1 + build.seasonDamagePct / 100;
  const curseRibbon = opts.curseRibbonActive && c.curseRibbonPct > 0 ? 1 + c.curseRibbonPct / 100 : 1;
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
    season *
    curseRibbon
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
  // Type 4 gets no physical/magical/ability crit chance, but the game adds
  // `omni_crit_chance_pct` to every damage type. 0362's slash and 0646's
  // feather ticks are pure and carry no DOT tag, so they can crit off omni.
  const chance = c.omniCrit;
  const crit = 1 + (chance / 100) * (c.critMultiplier - 1);
  const extra = 1 + enemyExtraPct(build, enemy.kind) / 100;
  const reduction = Math.max(0.001, 1 - enemy.damageReductionPct / 100);
  const resistance = 1 / (1 + Math.max(0, enemy.damageResistancePct) / 100);
  const vulnerable = opts.vulnStacks > 0 ? 1 + Math.min(25, 15 + 2 * opts.vulnStacks) / 100 : 1;
  const mark = c.bag && opts.burning ? 1 + Math.min(c.markMax, opts.markStacks) * c.markPerStack / 100 : 1;
  const season = 1 + build.seasonDamagePct / 100;
  // Type 4: no armour, no magic resistance, no corrosion or poison outgoing;
  // only the general multipliers, omni crit and the on-apply debuffs.
  return (
    raw *
    crit *
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
 * Applies the two movement-speed actives on their cooldowns and, with 0205 /
 * 0360 / 0718 equipped, turns the movement they add over the static build into
 * agility. The static grant is already on the panel; only this surplus is the
 * engine's to add. The active is used at t = 0 and again whenever its cooldown
 * is ready, so a 10-second window sees a 12-second Phase buff for its whole
 * length while a 60-second window gets its 12/60 duty cycle.
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
  const frenzy = findItem(build, ['item_0533']);
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
  const frenzyDuty = duty(frenzy, 'ability_value_duration');

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

  // The panel already carries the agility these items grant at the build's
  // own movement speed (`buildDpsInput` folds it into the agility row), so the
  // engine adds only the movement the actives push on top of it. The
  // subtraction happens in agility, not in movement-speed steps, so a step
  // worth 2 (0718) is counted as 2.
  const staticHuntAgility = moveHuntAgility(build.items, build.baseMoveSpeed);
  const averageHuntAgility = moveHuntAgility(build.items, averageMovespeed);
  const dynamicAgility = averageHuntAgility - staticHuntAgility;
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
    // 0533 Unholy Frenzy doubles magic and physical lifesteal while active.
    anyLifestealPct: build.anyLifestealPct * (1 + frenzyDuty),
    attackHealPct: build.attackHealPct * (1 + frenzyDuty),
    spellHealPct: build.spellHealPct * (1 + frenzyDuty),
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
    curseRibbon: 0,
    omniStrike: 0,
    assassinCreed: 0,
    frostChain: 0,
    radiance: 0,
    soulScatter: 0,
    skyrend: 0,
    vulnDetonate: 0,
    ignite: 0,
    verdict: 0,
    ashCodex: 0,
    manaSpring: 0,
    critChain: 0,
    bloodMoon: 0,
    frostbite: 0,
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
    curseRibbon: 0,
    omniStrike: 0,
    assassinCreed: 0,
    frostChain: 0,
    radiance: 0,
    soulScatter: 0,
    skyrend: 0,
    vulnDetonate: 0,
    ignite: 0,
    verdict: 0,
    ashCodex: 0,
    manaSpring: 0,
    critChain: 0,
    bloodMoon: 0,
    frostbite: 0,
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
  /** Expected burn uptime when a chance-based source is the only one applying it. */
  let burnWeight = 0;
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
  /** 0379 curse ribbon: once any magical damage has been dealt, the target takes increased magical damage. */
  let curseRibbonActive = false;
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
  /** 0241: stored attack damage from lifesteal heals, floored like its stack count. */
  let heartStacks = 0;
  let heartDecayAt = c.heart !== undefined ? 1 : Number.POSITIVE_INFINITY;
  /** 0515: a second lifesteal→attack accumulator with its own cap and decay. */
  let dominionStacks = 0;
  let dominionDecayAt = c.bloodDominion !== undefined ? 1 : Number.POSITIVE_INFINITY;
  /** 0567 / 0586: expected mark stacks on the target and the last application. */
  let huntMarkStacks = 0;
  let lastHuntMark = Number.NEGATIVE_INFINITY;
  /** 0534 / 0582: expected Ignite stacks and their expiry. */
  let igniteStacks = 0;
  let igniteUntil = 0;
  let igniteTickAt: number | null = null;
  // A toggle in the game; the DPS tab treats it as switched on when equipped.
  const radianceOn = c.radiance !== undefined;
  let radianceAt = radianceOn ? c.radiance!.interval : Number.POSITIVE_INFINITY;
  let manaSpringAt = c.manaSpring !== undefined ? 1 : Number.POSITIVE_INFINITY;
  let emberReady = 0;
  let flameReady = 0;
  let ashReady = 0;
  /** 0219: current mana, starting full. */
  let mana = Math.max(0, b.maxMana);
  /** 0593: own DOT ticks add crit chance and crit damage. */
  let erosionStacks = 0;
  let erosionDecayAt = Number.POSITIVE_INFINITY;
  const baseAutoCrit = c.autoCrit;
  const baseAbilityCrit = c.abilityCrit;
  const baseMagicCrit = c.magicCrit;
  const baseOmniCrit = c.omniCrit;
  const baseCritMultiplier = c.critMultiplier;
  const syncErosion = (): void => {
    if (c.erosion === undefined) return;
    const bonus = erosionStacks * c.erosion.perStack;
    c.autoCrit = build.noCrit ? 0 : clamp(baseAutoCrit + bonus, 0, 100);
    c.abilityCrit = build.noCrit ? 0 : clamp(baseAbilityCrit + bonus, 0, 100);
    c.magicCrit = build.noCrit ? 0 : clamp(baseMagicCrit + bonus, 0, 100);
    c.omniCrit = build.noCrit ? 0 : clamp(baseOmniCrit + bonus, 0, 100);
    c.critMultiplier = baseCritMultiplier + (erosionStacks * c.erosion.critPerStack) / 100;
  };
  /** 0348: the target's missing health amplifies the wearer's damage. */
  let buddhaUntil = 0;
  /** 0420 / 0638: the active wave and the Blood Moon mark it leaves. */
  const bloodMoonItem = findItem(b, ['item_0420', 'item_0784']) ?? findItem(b, ['item_0638']);
  const bloodMoonOn = c.bloodMoon !== undefined && bloodMoonItem !== undefined && options.active?.has(bloodMoonItem.id) === true;
  let bloodMoonAt = bloodMoonOn ? 0 : Number.POSITIVE_INFINITY;
  let bloodMoonMarkUntil = 0;
  /** 0620: freeze stacks on the target and the Frostbite DOT they burst into. */
  let freezeStacks = 0;
  let freezeUntil = 0;
  let frostbiteUntil = 0;
  let frostbiteTickAt: number | null = null;
  let frostbiteDamage = 0;
  const damage = sourceRecord();
  const hits = hitRecord();

  /**
   * The number of distinct debuff modifier names on the target, for 0581.
   * s3 sets `ability_count_debuff_kinds = 1`, which makes the script dedup
   * modifiers by name; the engine's per-source flags already do that.
   */
  const debuffCount = (): number => {
    let n = 0;
    if (bleedPool > 0 || bleedLeft > 0) n += 1;
    if (burnUntil > time) n += 1;
    if (poisonStacks > 0) n += 1;
    if (vulnStacks > 0) n += 1;
    if (doomStacks > 0) n += 1;
    if (c.bag && markStacks > 0) n += 1;
    if (huntMarkStacks > 0) n += 1;
    if (igniteStacks > 0) n += 1;
    if (armorDebuff > 0) n += 1;
    // Level-7 debuffs: 0348's mark, 0420's Blood Moon, 0620's Freeze/Frostbite.
    if (c.buddha !== undefined && buddhaUntil > time) n += 1;
    if (c.bloodMoon !== undefined && bloodMoonMarkUntil > time) n += 1;
    if (freezeStacks > 0) n += 1;
    if (frostbiteUntil > time) n += 1;
    return n;
  };
  /** 0581: the outgoing multiplier from the target's debuffs. */
  const judgmentAmp = (): number =>
    c.judgment !== undefined ? 1 + (debuffCount() * c.judgment.perDebuff) / 100 : 1;
  /** 0567 / 0586: the mark multiplier; 0567 doubles it at the cap. */
  const huntMarkAmp = (): number => {
    if (c.huntMark === undefined || huntMarkStacks <= 0) return 1;
    const stacks = Math.min(c.huntMark.maxStacks, huntMarkStacks);
    const doubled = c.huntMark.doubleAtMax && stacks >= c.huntMark.maxStacks ? 2 : 1;
    return 1 + (stacks * c.huntMark.perStack * doubled) / 100;
  };
  /** 0348: the target's missing health turns into extra damage. */
  const buddhaAmp = (): number => {
    if (c.buddha === undefined || buddhaUntil <= time) return 1;
    const missingPct = dummy ? 0 : Math.max(0, ((maxHp - hp) * 100) / maxHp);
    const steps = Math.floor(missingPct / c.buddha.stepPct);
    return 1 + Math.min(c.buddha.cap, steps * c.buddha.perStep) / 100;
  };
  /** Sources whose damage carries the game's DOT tag; 0581 duplicates these. */
  const isDotSource = (id: DpsSourceId): boolean =>
    id === 'bleed' ||
    id === 'burn' ||
    id === 'poison' ||
    id === 'ignite' ||
    id === 'witchBlade' ||
    id === 'frostbite';

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
    // 0567/0586's mark, 0581's Judgment and 0348's mark skip HP_LOSS damage
    // (bleed, burn, ignite). 0581's own verdict hit skips Judgment but still
    // takes the marks.
    const hpLoss = id === 'bleed' || id === 'burn' || id === 'ignite';
    amount *= id === 'verdict'
      ? huntMarkAmp() * buddhaAmp()
      : hpLoss
        ? 1
        : huntMarkAmp() * judgmentAmp() * buddhaAmp();
    damage[id] = (damage[id] ?? 0) + amount;
    hits[id] = (hits[id] ?? 0) + count;
    // 0593: every tick of the wearer's own DOT adds one Erosion stack.
    if (c.erosion !== undefined && isDotSource(id)) {
      const before = erosionStacks;
      erosionStacks = Math.min(c.erosion.max, erosionStacks + (count > 0 ? count : 1));
      if (before === 0) erosionDecayAt = time + 1;
      syncErosion();
    }
    if (c.heart !== undefined && !NO_HEAL_SOURCES.has(id)) {
      // 0241: 25 % of the attack/spell lifesteal heal becomes stored attack
      // damage, capped; the heal is the damage dealt times that channel's %.
      const healPct = SPELL_SOURCES.has(id) ? build.spellHealPct : build.attackHealPct;
      const healAmp = Math.max(0, 1 + build.lifestealAmpPct / 100);
      if (healPct > 0) {
        heartStacks = Math.min(
          c.heart.maxAd,
          heartStacks + (amount * healPct * healAmp / 100) * (c.heart.perPct / 100),
        );
      }
    }
    if (c.bloodDominion !== undefined && !NO_HEAL_SOURCES.has(id)) {
      // 0515: the same heal events, but 35 % of the heal becomes attack damage
      // with its own cap and decay.
      const healPct = SPELL_SOURCES.has(id) ? build.spellHealPct : build.attackHealPct;
      const healAmp = Math.max(0, 1 + build.lifestealAmpPct / 100);
      if (healPct > 0) {
        dominionStacks = Math.min(
          c.bloodDominion.maxAd,
          dominionStacks + (amount * healPct * healAmp / 100) * (c.bloodDominion.perPct / 100),
        );
      }
    }
    // 0581: DOT damage additionally hits for its own share of the Judgment
    // bonus as pure damage (the script's NO_PROC follow-up). The share is
    // taken from the DOT's final damage, so the amplified poison tick feeds
    // a larger follow-up, while HP_LOSS DOTs stay unamplified.
    if (c.judgment !== undefined && id !== 'verdict' && isDotSource(id)) {
      const share = judgmentAmp() - 1;
      if (share > 0) add('verdict', amount * share);
    }
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

  /** The game's total attack damage, the base for 0528's detonation. */
  const totalAttackDamage = (): number =>
    Math.max(0, b.attackDamage + Math.floor(heartStacks) + Math.floor(dominionStacks)) *
    (1 + b.allAttackDamagePct / 100);

  /** A non-base physical hit, re-typed as magic by 0525 Arcane Forge. */
  // 0525 Arcane Forge turns every non-base physical hit into magic; 0619
  // Solar Furnace does the same at 120 % (the script multiplies the final
  // damage by its conversion percentage).
  const procDamage = (raw: number, noCrit = false): number =>
    c.arcaneForge || c.solarForge !== undefined
      ? magicalDamage(
          b,
          enemy,
          c,
          raw * (c.solarForge?.factor ?? 1),
          {
            dot: false,
            poisonSource: false,
            corrosionStacks: poisonStacks,
            vulnStacks,
            burning: burnUntil > time,
            markStacks,
            doomStacks,
            curseRibbonActive,
          },
          noCrit,
        )
      : directDamage(b, enemy, c, raw, ctx(burnUntil > time), noCrit);

  /** 0534 / 0582: add expected Ignite stacks; the duration does not refresh. */
  const addIgnite = (stacks: number): void => {
    if (c.ignite === undefined || !(stacks > 0)) return;
    if (igniteStacks <= 0 || time >= igniteUntil) {
      igniteStacks = 0;
      igniteUntil = time + c.ignite.duration;
    }
    igniteStacks = Math.min(c.ignite.maxStacks, igniteStacks + stacks);
    if (igniteTickAt === null) igniteTickAt = time + 0.5;
  };

  /**
   * Starts the generic burn; every burn application rolls 0534/0582's Ignite.
   * `weight` is the expected uptime a chance-based source contributes (1 for
   * the guaranteed ones: the bag, 0407).
   */
  const startBurn = (duration: number, weight = 1): void => {
    if (!(duration > 0) || !(weight > 0)) return;
    burnWeight = burnUntil <= time ? weight : Math.max(burnWeight, weight);
    burnUntil = time + duration;
    if (burnAt === null) burnAt = time + BURN_TICK;
    if (c.ignite !== undefined) addIgnite(c.ignite.chance * weight);
  };

  /**
   * The generic vulnerable modifier (15 % + 2 %/stack, cap 5). 0528 adds an
   * expected extra stack on every application and detonates the target when
   * the cap is reached, removing the stacks.
   */
  const addVulnerable = (amount: number): void => {
    if (!(amount > 0)) return;
    const before = vulnStacks;
    const gain = amount * (c.thousandBlades !== undefined ? 1 + c.thousandBlades.extraChance : 1);
    vulnStacks = Math.min(5, vulnStacks + gain);
    lastVuln = time;
    if (c.thousandBlades !== undefined && before < 5 && vulnStacks >= 5) {
      const raw = totalAttackDamage() * (c.thousandBlades.detonatePct / 100);
      if (raw > 0) {
        const hit = procDamage(raw);
        add('vulnDetonate', hit, 1);
      }
      vulnStacks = 0;
    }
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
    // 0309 Hurricane Glaive: any physical non-DOT damage can start a bleed
    // with the full hit as its pool.
    if (c.glaiveChance > 0) {
      applyBleed(hit * c.glaiveChance);
      chaosEvent(c.glaiveChance);
    }
    if (c.bleedProc && c.bleedProcChance > 0) {
      // 0467: 70 % of hit becomes bleed pool; 0243: 100 % of hit (script passes full final damage)
      const poolPct = c.bleedProc?.id === 'item_0243' ? 1 : BLEED_POOL_PCT / 100;
      applyBleed(hit * (c.bleedProcChance / 100) * poolPct);
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
        addVulnerable(proc);
        armorStacks = Math.min(c.mkbMaxStacks, armorStacks + proc);
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
      curseRibbonActive,
    });
    add('soulBlade', hit, 1);
  };

  const onAttack = (): void => {
    attacks += 1;
    chaosEvents = 0;
    chaosProcMiss = 1;
    if (vulnStacks > 0 && c.vulnDuration > 0 && time - lastVuln > c.vulnDuration) vulnStacks = 0;
    if (c.mkb && time - lastArmor > c.mkbArmorDuration) armorStacks = 0;
    if (time - lastArmorDebuff > 5) armorDebuff = 0;
    const burning = burnUntil > time;
    // 0348: every real attack applies Slaughter; the mark then amplifies the
    // wearer's damage by the target's missing health.
    if (c.buddha !== undefined && c.buddha.duration > 0) buddhaUntil = time + c.buddha.duration;
    const autoRaw =
      Math.max(0, b.attackDamage + Math.floor(heartStacks) + Math.floor(dominionStacks)) *
      (1 + b.allAttackDamagePct / 100);
    const auto = directDamage(b, enemy, c, autoRaw, ctx(burning, true));
    add('auto', auto, 1);
    physicalTriggers(auto, c.autoCrit);
    // 0218 / 0232 / 0648: a critical hit can add a second hit of the same
    // size. The script takes the hit's base damage times the crit multiplier
    // and forbids the extra hit from critting itself.
    if (c.critChain !== undefined && c.critChain.chance > 0 && c.autoCrit > 0) {
      const raw = autoRaw * c.critMultiplier;
      const chance = (c.autoCrit / 100) * c.critChain.chance;
      const hit = c.critChain.magic
        ? magicalDamage(
            b,
            enemy,
            c,
            raw,
            {
              dot: false,
              poisonSource: false,
              corrosionStacks: poisonStacks,
              vulnStacks,
              burning: burnUntil > time,
              markStacks,
              doomStacks,
              curseRibbonActive,
            },
            c.critChain.noCrit,
          )
        : procDamage(raw, c.critChain.noCrit);
      add('critChain', hit * chance, chance);
    }
    // 0622: physical crits can add one vulnerable stack; its 0.25 s internal
    // cooldown caps the expected rate.
    if (c.starShatter !== undefined && c.starShatter.chance > 0 && c.autoCrit > 0) {
      const perAttack = Math.min(
        c.starShatter.chance,
        c.aps > 0 ? 1 / (c.starShatter.cooldown * c.aps) : 1,
      ) * (c.autoCrit / 100);
      if (perAttack > 0) {
        addVulnerable(perAttack);
        chaosEvent(perAttack);
      }
    }
    // 0420 / 0638: while the Blood Moon mark is up, attacks roll for one
    // vulnerable stack.
    if (c.bloodMoon !== undefined && time < bloodMoonMarkUntil && c.bloodMoon.vulnChance > 0) {
      addVulnerable(c.bloodMoon.vulnChance);
      chaosEvent(c.bloodMoon.vulnChance);
    }
    // 0620: direct attacks stack Freeze; at the threshold they burst into
    // Frostbite, a magic DOT scaled by the wearer's attributes.
    if (c.frostbite !== undefined && c.frostbite.duration > 0) {
      if (time > freezeUntil) freezeStacks = 0;
      freezeStacks += 1;
      freezeUntil = time + 4;
      if (freezeStacks >= c.frostbite.threshold) {
        freezeStacks = 0;
        freezeUntil = 0;
        const burst = b.totalAttributes * (c.frostbite.pct / 100);
        frostbiteDamage = Math.max(frostbiteDamage, burst);
        frostbiteUntil = time + c.frostbite.duration;
        if (frostbiteTickAt === null) frostbiteTickAt = time + c.frostbite.interval;
      }
    }
    // 0196 / 0363: attack-triggered vulnerability, as expected stacks per hit.
    // 0196's 1 s item cooldown caps its share at one proc per cooldown; 0363
    // has no cooldown. Both feed the same generic modifier as 0217, so the
    // stacks are capped together at 5.
    for (const src of c.vulnSources) {
      const perAttack = src.cooldown > 0 && c.aps > 0
        ? Math.min(src.chance, 1 / (src.cooldown * c.aps))
        : src.chance;
      if (perAttack > 0) {
        addVulnerable(perAttack);
        chaosEvent(perAttack);
      }
    }
    soulBladeHit();
    // On-hit items check the target is still alive; a killing auto-attack does
    // not also get its talons strike or start a bleed.
    if (!dummy && hp <= 0) {
      if (c.aps > 0) attackAt += 1 / c.aps;
      return;
    }

    // 0219 Soul Scatter: while above the mana threshold every attack spends a
    // share of the current mana for magic damage; below the restore threshold
    // each attack gives a flat amount back.
    if (c.soulScatter !== undefined && b.maxMana > 0) {
      const manaPct = (mana / b.maxMana) * 100;
      if (manaPct > c.soulScatter.costThresholdPct) {
        const spend = mana * (c.soulScatter.costPct / 100);
        if (spend > 0) {
          mana = Math.max(0, mana - spend);
          const raw = spend * c.soulScatter.multiplier;
          if (raw > 0) {
            const hit = magicalDamage(b, enemy, c, raw, {
              dot: false,
              poisonSource: false,
              corrosionStacks: poisonStacks,
              vulnStacks,
              burning: burnUntil > time,
              markStacks,
              doomStacks,
              curseRibbonActive,
            });
            add('soulScatter', hit, 1);
          }
        }
      } else if (manaPct < c.soulScatter.restoreThresholdPct && c.soulScatter.restore > 0) {
        mana = Math.min(b.maxMana, mana + c.soulScatter.restore);
      }
    }

    // 0567 / 0586: real attacks add expected mark stacks; the mark multiplies
    // every hit from the wearer and decays once its duration runs out.
    if (c.huntMark !== undefined && c.huntMark.chance > 0 && c.huntMark.duration > 0) {
      huntMarkStacks = Math.min(c.huntMark.maxStacks, huntMarkStacks + c.huntMark.chance);
      lastHuntMark = time;
    }

    // 0407 Ember Ring: a target that is not burning catches fire on the next
    // non-DOT damage, on the item's cooldown.
    if (c.emberRing !== undefined && burnUntil <= time && time + EPS >= emberReady) {
      startBurn(c.emberRing.duration);
      emberReady = time + c.emberRing.cooldown;
      chaosEvent(1);
    }
    // 0550 Flaming Fury: attacks can burn; a 0.5 s cooldown caps the rate.
    // Its uptime is modelled from the proc rate rather than assuming a hit
    // every time the cooldown is ready.
    if (c.flameFury !== undefined && c.flameFury.chance > 0 && time + EPS >= flameReady) {
      const attemptsPerSecond = Math.min(c.aps, 1 / Math.max(0.1, c.flameFury.cooldown));
      const uptime = 1 - Math.exp(-attemptsPerSecond * c.flameFury.chance * c.flameFury.duration);
      startBurn(c.flameFury.duration, uptime);
      flameReady = time + c.flameFury.cooldown;
      chaosEvent(c.flameFury.chance);
    }
    // 0408 Ash Codex: non-DOT damage to a burning target explodes for a share
    // of max mana, on the item's cooldown.
    if (c.ashCodex !== undefined && burnUntil > time && b.maxMana > 0 && time + EPS >= ashReady) {
      const raw = b.maxMana * (c.ashCodex.pct / 100);
      if (raw > 0) {
        const hit = magicalDamage(b, enemy, c, raw, {
          dot: false,
          poisonSource: false,
          corrosionStacks: poisonStacks,
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
          doomStacks,
          curseRibbonActive,
        });
        add('ashCodex', hit, 1);
      }
      ashReady = time + c.ashCodex.cooldown;
    }

    // Flat on-attack procs (0129 Dart, 0131 Crystal Sword). The DPS tab
    // deliberately counts one target only; 0131's radius is not multiplied.
    let shatterThisAttack = 0;
    let shatterApplied = false;
    for (const proc of c.flatProcs) {
      if (proc.chance > 0 && proc.raw > 0) {
        const hit = procDamage(proc.raw);
        add(proc.source, hit * proc.chance, proc.chance);
        physicalTriggers(hit, c.abilityCrit);
        if (proc.source === 'shatterProc' && proc.armor !== undefined && proc.duration !== undefined) {
          // The debuff is applied on the proc, not on every hit. Its expected
          // uptime is the chance of at least one proc in the last duration.
          // Two shatter items (0206 / 0229) stack their expected armour.
          const rolls = Math.max(0, c.aps * proc.duration);
          const uptime = proc.chance >= 1 ? 1 : 1 - Math.pow(1 - proc.chance, rolls);
          shatterThisAttack += proc.armor * uptime;
          shatterUntil = time + proc.duration;
          shatterApplied = true;
        }
      }
    }
    if (shatterApplied) shatterArmor = shatterThisAttack;

    // 0361 / 0453 assassin's creed: physical, agility-scaled, multiplied by
    // the total attack speed. The script's internal cooldown caps the rate.
    if (c.creed !== undefined && c.creed.chance > 0 && c.creed.agilityPct > 0) {
      const perAttack = c.creed.cooldown > 0 && c.aps > 0
        ? Math.min(c.creed.chance, 1 / (c.creed.cooldown * c.aps))
        : c.creed.chance;
      if (perAttack > 0) {
        const raw =
          b.totalAgility *
          (c.creed.agilityPct / 100) *
          (1 + (c.attackSpeed * c.creed.perAsPct) / 100) *
          (c.creed.targetPct / 100);
        const hit = procDamage(raw);
        add('assassinCreed', hit * perAttack, perAttack);
        physicalTriggers(hit * perAttack, c.abilityCrit);
      }
    }

    // 0517 Skyrend: a chance-based physical hit scaled by all attributes.
    if (c.skyrend !== undefined && c.skyrend.chance > 0 && c.skyrend.pct > 0) {
      const raw = b.totalAttributes * (c.skyrend.pct / 100);
      if (raw > 0) {
        const hit = procDamage(raw);
        add('skyrend', hit * c.skyrend.chance, c.skyrend.chance);
        physicalTriggers(hit * c.skyrend.chance, c.abilityCrit);
      }
    }

    // 0342 Frost Chain: on attack, 180 % of attack damage as magic, 0.5 s
    // internal cooldown. Its on-cast half (240 % of intelligence) needs a cast
    // cadence the DPS window does not model.
    if (c.frostChain !== undefined && c.frostChain.pct > 0) {
      const perAttack = c.frostChain.cooldown > 0 && c.aps > 0
        ? Math.min(1, 1 / (c.frostChain.cooldown * c.aps))
        : 1;
      if (perAttack > 0) {
        const raw =
          Math.max(0, b.attackDamage + Math.floor(heartStacks) + Math.floor(dominionStacks)) *
          (1 + b.allAttackDamagePct / 100) *
          (c.frostChain.pct / 100);
        const hit = magicalDamage(b, enemy, c, raw, {
          dot: false,
          poisonSource: false,
          corrosionStacks: poisonStacks,
          vulnStacks,
          burning: burnUntil > time,
          markStacks: markStacks,
          doomStacks,
          curseRibbonActive,
        });
        add('frostChain', hit * perAttack, perAttack);
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
        curseRibbonActive,
      });
      add('maelstrom', hit * c.maelstromChance, c.maelstromChance);
    }
    if (c.moonShardChance > 0 && c.moonShardPct > 0) {
      const raw = autoRaw * c.moonShardPct / 100;
      const hit = procDamage(raw);
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
        curseRibbonActive,
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
        // 0362: the slash is pure damage (type 4): no armour, magic
        // resistance or physical on-hit triggers; only omni crit applies.
        const hit = pureDamage(b, enemy, c, proc.raw, {
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
        });
        add(proc.source, hit, 1);
      } else {
        const hit = procDamage(proc.raw);
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
      const hit = procDamage(proc.raw);
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
        curseRibbonActive,
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
          curseRibbonActive,
        });
        add('vortexDot', dot * c.vortexChance, c.vortexChance);
      }
    }

    if (c.talons) {
      const scaled = maxHp * (enemy.kind === 'boss' ? c.talonsBossPct / 100 : 1);
      const light = procDamage((scaled * c.talonsLightPct) / 100);
      add('talonsLight', light, 1);
      const heavyChance = c.talonsHeavyChance / 100;
      if (heavyChance > 0) {
        const heavy = procDamage((scaled * c.talonsHeavyPct) / 100);
        add('talonsHeavy', heavy * heavyChance, heavyChance);
      }
    }

    if (c.bag && c.burnDuration > 0 && time + EPS >= burnReady) {
      startBurn(c.burnDuration);
      burnReady = time + c.burnInterval;
      markStacks = Math.min(c.markMax, markStacks + 1);
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
        curseRibbonActive,
      });
      add('witchBlade', witch, c.witchChance);
    }

    // 0372: flat magical proc on every attack = totalAttributes × omniStrikePct/100.
    // Always triggers (no chance roll in the script).
    if (c.omniStrikePct > 0) {
      const hit = magicalDamage(b, enemy, c, b.totalAttributes * (c.omniStrikePct / 100), {
        dot: false,
        poisonSource: false,
        corrosionStacks: poisonStacks,
        vulnStacks,
        burning: burnUntil > time,
        markStacks,
        doomStacks,
        curseRibbonActive,
      });
      add('omniStrike', hit, 1);
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
          curseRibbonActive,
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

    // curseRibbon's debuff applies on magical damage dealt; once active it
    // refreshes on every subsequent magical hit.
    if (c.curseRibbonPct > 0) curseRibbonActive = true;
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
      const echo = procDamage(tick * (c.bloodEchoPct / 100));
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
      burnWeight = 0;
      return;
    }
    const hpForBurn = dummy ? maxHp : Math.max(0, hp);
    const pct = hpForBurn * (BURN_HP_PCT / 100) * BURN_TICK * burnFactor(enemy.kind) * burnWeight;
    const cap = 10 * attrs * burnWeight;
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
      curseRibbonActive,
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
      heartDecayAt,
      dominionDecayAt,
      radianceAt,
      manaSpringAt,
      igniteTickAt ?? Number.POSITIVE_INFINITY,
      bloodMoonAt,
      erosionDecayAt,
      frostbiteTickAt ?? Number.POSITIVE_INFINITY,
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
    if (c.heart !== undefined && Math.abs(time - heartDecayAt) <= EPS) {
      // The script decays every 0.1 s; a one-second step is the same total:
      // max(10, 15 % of the stored amount) per second.
      const decay = Math.max(c.heart.decayMin, (heartStacks * c.heart.decayPct) / 100);
      heartStacks = Math.max(0, heartStacks - decay);
      heartDecayAt = time + 1;
    }
    if (c.bloodDominion !== undefined && Math.abs(time - dominionDecayAt) <= EPS) {
      const decay = Math.max(
        c.bloodDominion.decayMin,
        (dominionStacks * c.bloodDominion.decayPct) / 100,
      );
      dominionStacks = Math.max(0, dominionStacks - decay);
      dominionDecayAt = time + 1;
    }
    // 0216 Radiance: a toggle; every interval it burns max-shield pure damage
    // into the area and refreshes the generic burn.
    if (radianceOn && Math.abs(time - radianceAt) <= EPS) {
      const raw = Math.max(0, b.energyShield) * (c.radiance!.pct / 100) * 0.8;
      if (raw > 0) add('radiance', raw, 1);
      startBurn(c.radiance!.burn);
      radianceAt += c.radiance!.interval;
    }
    // 0551 Magic Spring: a passive aura, 100 % of max mana as pure damage per
    // second to every enemy in range (one target in the DPS tab).
    if (Math.abs(time - manaSpringAt) <= EPS) {
      const raw = Math.max(0, b.maxMana) * (c.manaSpring!.pct / 100);
      if (raw > 0) add('manaSpring', raw, 1);
      manaSpringAt += 1;
    }
    // 0534 / 0582: Ignite ticks every 0.5 s for attributes × %/stack × stacks.
    if (igniteTickAt !== null && Math.abs(time - igniteTickAt) <= EPS) {
      if (c.ignite !== undefined && igniteStacks > 0 && time < igniteUntil - EPS) {
        const raw =
          b.totalAttributes *
          (c.ignite.pctPerStack / 100) *
          igniteStacks *
          0.5 *
          (1 + b.dotOutgoingPct / 100);
        if (raw > 0) add('ignite', raw, 1);
        igniteTickAt = (igniteTickAt as number) + 0.5;
      } else {
        igniteStacks = 0;
        igniteTickAt = null;
      }
    }
    // 0420 / 0638: the active wave on its cooldown, then the Blood Moon mark
    // that lets attacks add vulnerable stacks.
    if (bloodMoonOn && Math.abs(time - bloodMoonAt) <= EPS) {
      const raw = totalAttackDamage() * (c.bloodMoon!.pct / 100);
      const hit = procDamage(raw);
      add('bloodMoon', hit, 1);
      if (hit > 0) applyBleed(hit * (BLEED_POOL_PCT / 100));
      bloodMoonMarkUntil = time + c.bloodMoon!.markDuration;
      bloodMoonAt += c.bloodMoon!.cooldown;
    }
    // 0593: Erosion loses max(1, 5 % of the stacks) every second.
    if (c.erosion !== undefined && Math.abs(time - erosionDecayAt) <= EPS) {
      const decay = Math.max(1, Math.floor((erosionStacks * c.erosion.decayPct) / 100));
      erosionStacks = Math.max(0, erosionStacks - decay);
      syncErosion();
      erosionDecayAt = time + 1;
    }
    // 0620: Frostbite pays 200 % of all attributes as magic damage each
    // second while it lasts.
    if (frostbiteTickAt !== null && Math.abs(time - frostbiteTickAt) <= EPS) {
      if (time <= frostbiteUntil + EPS && frostbiteDamage > 0) {
        const hit = magicalDamage(b, enemy, c, frostbiteDamage, {
          dot: true,
          poisonSource: false,
          corrosionStacks: poisonStacks,
          vulnStacks,
          burning: burnUntil > time,
          markStacks,
          doomStacks,
          curseRibbonActive,
        });
        add('frostbite', hit, 1);
        frostbiteTickAt = (frostbiteTickAt as number) + c.frostbite!.interval;
      } else {
        frostbiteTickAt = null;
        frostbiteDamage = 0;
      }
    }
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
          curseRibbonActive,
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
    if (
      c.huntMark !== undefined &&
      huntMarkStacks > 0 &&
      time - lastHuntMark > c.huntMark.duration
    ) {
      huntMarkStacks = 0;
    }

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
