/**
 * The Skyfall Realm ("Sky", the addon's Greed Cave, room `G001`) —
 * `wiki/sky.json` and `wiki/locale.<lang>.sky.json`.
 *
 * Where each part comes from, so a reader can judge how far to trust it:
 *
 *   - tables in `scripts/npc/ak_greed_cave_*.txt` (plain KV): the tier shops,
 *     the spawn pools, the wave combos and the endless reward rows;
 *   - `scripts/vscripts/my_game_axe/greed_cave/config.lua` (plain Lua, read
 *     because no table carries these): the floor -> pool map, floor counts,
 *     the monster stat curve, coin chances, wave sizes, endless growth;
 *   - `scripts/vscripts/abilities/items/item_greed_cave_chests.lua` (plain
 *     Lua): which drop pool each shop chest opens and how many draws it makes;
 *   - the talent table (`ak_talent`, S2 ruleset): which talent nodes touch
 *     the realm.
 *
 * What the server decides in encrypted code is not in the JSON. The handful
 * of numbers the partner wiki states for those — the end-of-run chest, the
 * "deep floor" growth — are the `PARTNER_*` constants below, each marked as
 * such. Nothing in this module invents a number.
 *
 * The greed-cave tables have no per-season copies in the pak's ruleset tree,
 * so unlike the item-bound files nothing here carries `bySeason`; the talent
 * list is the only seasonal part and is checked by the extractor.
 */

import type { PoolEntry, RulesetId } from './pools.ts';

/** `[talentId, playerDataKey, value]`, e.g. `['T927', 'greed_cave_ancient_coin_gain_pct', 8]`. */
export type TalentEffect = [talentId: string, key: string, value: number];

/** A floor's spawn pools. A boss floor has only `boss`; ids may name pools no table defines (see `SpawnPool`). */
export interface SkyFloor {
  floor: number;
  normal?: string;
  elite?: string;
  boss?: string;
}

/** One offer in the tier shop that opens after a floor (`ak_greed_cave_shop_pools`). Prices are in Mystic Crystals. */
export interface SkyShopOffer {
  /** Row id, e.g. `GC_SHOP_T1_MATERIAL`. */
  id: string;
  /** The row id with its `GC_SHOP_T<n>_` prefix removed: `MATERIAL`, `EQUIP_NORMAL`, `GEM_CHEST`, … */
  kind: string;
  /** The chest item the offer sells. */
  itemId: string;
  count: number;
  priceMin: number;
  priceMax: number;
  weight: number;
  priceTierMultiplier: number;
  /** The drop pool the chest opens (`wiki/pools.json`), from the chest's own script. */
  poolId?: string;
  /** How many items one chest draws from `poolId`. */
  draws?: number;
}

/** The monster stat modifiers one tier applies on top of the shared curve. */
export interface SkyTierAttr {
  /** HP multiplier (`difficultyMultiplier`). The addon applies it to attack as well; see `tierFloorStats`. */
  mult: number;
  /** Movement speed bonus, percent. */
  move: number;
  /** Attack speed bonus, percent. */
  aspd: number;
  armor: number;
  /** Magic resistance, percent. */
  mr: number;
}

export interface SkyTier {
  tier: 1 | 2 | 3;
  maxFloor: number;
  /** The invitation item that opens this tier. */
  compassItem: string;
  attr: SkyTierAttr;
  floors: SkyFloor[];
  shop: SkyShopOffer[];
}

/**
 * One spawn pool (`ak_greed_cave_monster_pools`). An entry's id is either a
 * monster (`monster_10001`) or another pool (`GCM_T1_NORMAL`), which then
 * takes that share of the draw recursively — see `isPoolRef`.
 */
export interface SpawnPool {
  id: string;
  /** The table's `Level`: 1-3 for the tiers, 4 for the endless pools. */
  level: number;
  /** `level` when it is 1-3, else null. */
  tier: 1 | 2 | 3 | null;
  endless: boolean;
  entries: PoolEntry[];
}

/** `[monsterId, x, y, z, role]`. Offsets are from the arena centre. `role` is null for the combo's own kind. */
export type ComboMember = [monsterId: string, x: number, y: number, z: number, role: 'elite' | 'normal' | null];

/** A pre-arranged elite or boss wave (`ak_greed_cave_monster_combos`). */
export interface Combo {
  id: string;
  tier: number;
  floor: number;
  kind: 'elite' | 'boss';
  weight: number;
  members: ComboMember[];
}

/**
 * Mystic Crystals dropped by kills. `lucky` and `bonus` are the alternative
 * amounts a kill can roll instead of `amount`, at `luckyPct` / `bonusPct`.
 */
export interface SkyCoins {
  /** No base `amount`: the pak does not state it — see `PARTNER_NORMAL_COIN_AMOUNT`. */
  normal: { lucky: number; luckyPct: number; bonus: number; bonusPct: number };
  elite: { amount: number; lucky: number; luckyPct: number };
  boss: { amount: number };
  /** Share of crystals kept when the whole team dies. */
  deathRetain: number;
}

export interface SkyWaveCounts {
  normalTotal: number;
  maxAlive: number;
  /** The config's elite count; a picked elite combo overrides it (see `eliteComboRange`). */
  eliteTotal: number;
  /** A follow-up boss enters when the first falls below this share of HP. */
  bossFollowupPct: number;
}

/** `{ hp, atk }` at the anchor floor, before any multiplier. */
export interface StatPair {
  hp: number;
  atk: number;
}

export interface SkyScaling {
  tierScale: {
    anchor: number;
    /** Per-floor growth, applied to HP and attack alike. */
    growth: number;
    normal: StatPair;
    elite: StatPair;
    boss: StatPair;
  };
  /** Multipliers normal and elite monsters get on top (bosses are exempt). */
  normalEliteMult: StatPair;
  endless: {
    /** The tier whose curve the endless floors reuse up to `softStart - 1`. */
    curveTier: 1 | 2 | 3;
    /** First floor on the soft per-floor growth. */
    softStart: number;
    hpGrowth: number;
    atkGrowth: number;
    armorPer3: number;
    mrPer3: number;
    mrCap: number;
    /** Hard cap on any stat, to stay inside the engine's integer range. */
    valueCap: number;
  };
}

/** One row of `ak_greed_cave_endless_config`. */
export interface EndlessRow {
  id: string;
  /** `boss_reward`, `merchant_base` or `merchant_bag` today. */
  kind: string;
  level: number;
  /** `[group, pct]` — how a roll splits between groups (`equipment:90|stone:10`). Groups without a list (`none`, `shop_slot`) are kept. */
  groups: [group: string, pct: number][];
  /** Each group's weighted item list, keyed by group name. */
  lists: Record<string, PoolEntry[]>;
  /** Any other numeric column, e.g. `CoinGainChancePct`. */
  extra?: Record<string, number>;
}

export interface SkyEndless {
  compassItem: string;
  /** Endless runs reuse this tier's chest and tier semantics. */
  combatTier: number;
  /** The floor from which every deeper floor reads the "16+" data row. */
  deepDataFloor: number;
  joinMaxFloor: number;
  baseBagCapacity: number;
  dailyLimit: number;
  floorPools: SkyFloor[];
  rows: EndlessRow[];
}

/** `wiki/sky.json`. */
export interface SkyFile {
  schema: 1;
  generatedAt: string;
  ruleset: RulesetId;
  roomId: string;
  /** Daily entries per tier-1..3 invitation. */
  dailyLimit: number;
  reviveCount: number;
  shopOfferCount: number;
  tiers: SkyTier[];
  coins: SkyCoins;
  waveCounts: SkyWaveCounts;
  scaling: SkyScaling;
  spawnPools: SpawnPool[];
  combos: Combo[];
  endless: SkyEndless;
  talents: TalentEffect[];
}

/** `wiki/locale.<lang>.sky.json`. Templates keep the game's `{tier}` / `{floor}` placeholders. */
export interface SkyLocale {
  schema: 1;
  lang: string;
  names: {
    realm?: string;
    endless?: string;
    /** "Tier {tier} Skyfall Realm". */
    tierTitle?: string;
    shop?: string;
    merchant?: string;
    crystals?: string;
    ancientCoins?: string;
    floor?: string;
  };
  /** Shop offer kind (`MATERIAL`, …) -> the game's chest label. */
  shopKinds: Record<string, string>;
}

// --- constants the pak does not carry --------------------------------------

/**
 * The end-of-run reward chest, **as stated by the partner wiki** (v1.507
 * snapshot). Its config is `greed_cave_chest_reward_config.lua`, which the pak
 * ships encrypted; no plain file or table names these numbers. The pool
 * contents themselves are in `wiki/pools.json`. `rewardTiers` is ascending:
 * a run reaches the last tier whose `minCoins` it meets.
 */
export const PARTNER_CHEST_REWARD = {
  poolByTier: { 1: 'P803', 2: 'P804', 3: 'P805' } as Record<1 | 2 | 3, string>,
  coinsPerDraw: 70,
  ancientItemId: 'item_M512',
  ancientPerCoin: 10,
  rewardTiers: [
    { tier: 1, minCoins: 0, extraDraw: 0, multMin: 0.9, multMax: 1.1 },
    { tier: 2, minCoins: 600, extraDraw: 1, multMin: 1.1, multMax: 1.4 },
    { tier: 3, minCoins: 800, extraDraw: 3, multMin: 1.4, multMax: 1.6 },
  ],
} as const;

/**
 * A normal monster's base crystal drop. The config names the chances and the
 * 30/6 alternatives but not the base amount; 1 is the partner wiki's figure.
 */
export const PARTNER_NORMAL_COIN_AMOUNT = 1;

/**
 * Endless "deep floor" behaviour, **as stated by the partner wiki**. None of
 * these appear in a plain file: from `deepFrom` on, monsters gain `deepDmg`%
 * outgoing damage and `deepResist`% damage resistance per floor, and endless
 * bosses' stun resistance is `stunBase + (floor - 1)`. `tableFloors` is how
 * far the partner tabulated the curve.
 */
export const PARTNER_DEEP = { deepFrom: 50, deepDmg: 30, deepResist: 20, stunBase: 92, tableFloors: 50 } as const;

// --- logic ------------------------------------------------------------------

/** True when a spawn-pool entry names another pool rather than a monster. */
export function isPoolRef(id: string): boolean {
  return id.startsWith('GCM_');
}

/** A pool's rows as `{ id, weight, share, pool }`, share in percent rounded to 0.1 — the partner's display. */
export function spawnShares(pool: SpawnPool): { id: string; weight: number; share: number; pool: boolean }[] {
  const total = pool.entries.reduce((s, [, w]) => s + w, 0);
  return pool.entries.map(([id, weight]) => ({
    id,
    weight,
    share: total > 0 ? Math.round((weight / total) * 1000) / 10 : 0,
    pool: isPoolRef(id),
  }));
}

/** The normal pool of a tier's first floor — what the partner listed as "the tier's monsters". */
export function tierMonsterPool(sky: SkyFile, tier: 1 | 2 | 3): SpawnPool | undefined {
  const t = sky.tiers.find((x) => x.tier === tier);
  const id = t?.floors.find((f) => f.normal !== undefined)?.normal;
  return id === undefined ? undefined : sky.spawnPools.find((p) => p.id === id);
}

/** Smallest and largest member count among elite combos — the size of a normal floor's elite segment. */
export function eliteComboRange(sky: SkyFile): { min: number; max: number } {
  const sizes = sky.combos.filter((c) => c.kind === 'elite').map((c) => c.members.length);
  return { min: Math.min(...sizes), max: Math.max(...sizes) };
}

export interface FloorStats {
  floor: number;
  normal: StatPair;
  elite: StatPair;
  boss: StatPair;
  armor: number;
  mr: number;
  move: number;
  aspd: number;
}

function curve(sky: SkyFile, kind: 'normal' | 'elite' | 'boss', floor: number, mult: number): { hp: number; atk: number } {
  const s = sky.scaling;
  const g = Math.pow(s.tierScale.growth, floor - s.tierScale.anchor);
  const m = kind === 'boss' ? { hp: 1, atk: 1 } : s.normalEliteMult;
  return { hp: s.tierScale[kind].hp * g * mult * m.hp, atk: s.tierScale[kind].atk * g * mult * m.atk };
}

/**
 * Monster stats on one floor of a regular tier: the shared curve, the tier's
 * multiplier, and normal/elite's ×2 HP / ×0.7 attack. Floors are floored at
 * the end, which reproduces the partner's endless table to the unit.
 */
export function tierFloorStats(sky: SkyFile, tier: 1 | 2 | 3, floor: number): FloorStats {
  const t = sky.tiers.find((x) => x.tier === tier);
  if (!t) throw new Error(`no tier ${tier}`);
  const out = (k: 'normal' | 'elite' | 'boss'): StatPair => {
    const v = curve(sky, k, floor, t.attr.mult);
    return { hp: Math.floor(v.hp), atk: Math.floor(v.atk) };
  };
  return { floor, normal: out('normal'), elite: out('elite'), boss: out('boss'), armor: t.attr.armor, mr: t.attr.mr, move: t.attr.move, aspd: t.attr.aspd };
}

/**
 * Monster stats on one endless floor. Up to `softStart - 1` the endless run
 * uses tier 3's curve; from `softStart` HP grows ×`hpGrowth` and attack
 * ×`atkGrowth` per floor, unrounded, floored once; armor and magic resistance
 * step up every three floors past `softStart - 1`, resistance capped.
 * Checked against all 300 numbers of the partner's 50-floor table.
 */
export function endlessFloorStats(sky: SkyFile, floor: number): FloorStats {
  const e = sky.scaling.endless;
  const t = sky.tiers.find((x) => x.tier === e.curveTier);
  if (!t) throw new Error(`no tier ${e.curveTier}`);
  const last = e.softStart - 1;
  const deep = Math.max(0, floor - last);
  const out = (k: 'normal' | 'elite' | 'boss'): StatPair => {
    const v = curve(sky, k, Math.min(floor, last), t.attr.mult);
    return {
      hp: Math.min(e.valueCap, Math.floor(v.hp * Math.pow(e.hpGrowth, deep))),
      atk: Math.min(e.valueCap, Math.floor(v.atk * Math.pow(e.atkGrowth, deep))),
    };
  };
  const steps = Math.floor(deep / 3);
  return {
    floor,
    normal: out('normal'),
    elite: out('elite'),
    boss: out('boss'),
    armor: t.attr.armor + e.armorPer3 * steps,
    mr: Math.min(e.mrCap, t.attr.mr + e.mrPer3 * steps),
    move: t.attr.move,
    aspd: t.attr.aspd,
  };
}

/** An endless boss-reward row as the partner showed it: the wave is three times the boss's ordinal. */
export interface EndlessWave {
  wave: number;
  boss: number;
  level: number;
  poolId: string;
  equipment: PoolEntry[];
  stones: PoolEntry[];
  /** `[group, pct]` split between equipment and stones. */
  groups: [string, number][];
  /** The last wave this pool is drawn on; null when it holds at any depth. */
  to: number | null;
}

/**
 * The floors a ladder's pools serve. The server draws the pool with the
 * highest `Level` at or below `floor(floor / 3)`, so a pool of level L is
 * dealt from wave `L × 3` until the wave before the next pool's — and the
 * deepest pool holds to any depth.
 */
export interface EndlessSpan {
  level: number;
  /** The first wave the pool is drawn on (`level × 3`). */
  from: number;
  /** The last wave it is drawn on, or null when it holds at any depth. */
  to: number | null;
}

export function endlessSpans(rows: readonly { level: number }[]): EndlessSpan[] {
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  return levels.map((level, i) => {
    const next = levels[i + 1];
    return { level, from: level * 3, to: next === undefined ? null : next * 3 - 1 };
  });
}

/** The boss-reward ladder's spans. */
export function endlessBossSpans(sky: SkyFile): EndlessSpan[] {
  return endlessSpans(sky.endless.rows.filter((r) => r.kind === 'boss_reward'));
}

/** The merchant ladder's spans — one step shorter than the bosses'. */
export function endlessMerchantSpans(sky: SkyFile): EndlessSpan[] {
  return endlessSpans(sky.endless.rows.filter((r) => r.kind === 'merchant_base'));
}

/** `24–29`, or `48+` for a pool that holds at any depth (an en dash, as elsewhere in the wiki). */
export function endlessSpanLabel(from: number, to: number | null): string {
  return to === null ? `${from}+` : `${from}–${to}`;
}

/**
 * The endless boss-reward rows, one per boss ordinal (`Level`). Bosses come
 * every third floor (the config's floor map leaves floors 3, 6, … to the
 * boss), hence `wave = level * 3` — and the row's pool serves further floors
 * than its own wave (see `EndlessSpan`).
 */
export function endlessBossWaves(sky: SkyFile): EndlessWave[] {
  const rows = sky.endless.rows.filter((r) => r.kind === 'boss_reward');
  const to = new Map(endlessSpans(rows).map((s) => [s.level, s.to]));
  return rows
    .map((r) => ({
      wave: r.level * 3,
      boss: r.level,
      level: r.level,
      poolId: r.id,
      equipment: r.lists['equipment'] ?? [],
      stones: r.lists['stone'] ?? [],
      groups: r.groups,
      to: to.get(r.level) ?? null,
    }))
    .sort((a, b) => a.level - b.level);
}

/**
 * Draws and ancient coins for a run's crystals, per the partner's chest rule:
 * `floor(crystals / coinsPerDraw)` plus the reward tier's bonus draws, and
 * `ceil(crystals × ancientPerCoin × mult)` coins (min/max of the tier's range).
 */
export function chestPayout(crystals: number): { level: number; draws: number; coinsMin: number; coinsMax: number } {
  const c = PARTNER_CHEST_REWARD;
  let rt: (typeof c.rewardTiers)[number] = c.rewardTiers[0];
  for (const t of c.rewardTiers) if (crystals >= t.minCoins) rt = t;
  return {
    level: rt.tier,
    draws: Math.floor(crystals / c.coinsPerDraw) + rt.extraDraw,
    coinsMin: Math.ceil(crystals * c.ancientPerCoin * rt.multMin),
    coinsMax: Math.ceil(crystals * c.ancientPerCoin * rt.multMax),
  };
}

// --- the wiki's pages over this data ----------------------------------------

/**
 * Expected crystals for one full, clean run of a tier, and what the end-of-run
 * chest pays for them — the partner's "on average a full run gives ~N".
 *
 * Every floor's elite or boss segment is the weighted mean over that floor's
 * combos, each member counted by its role (a boss combo's elite and normal
 * escorts pay their own crystals); a normal floor adds `normalTotal` normal
 * monsters. Crystal means use the kill's alternatives at their chances, and a
 * normal monster's base amount is `PARTNER_NORMAL_COIN_AMOUNT`. No talents, no
 * team wipe. Reproduces the partner's 895 / 1254 / 1533 for tiers 1-3.
 *
 * `coins` is the ancient coins at the middle of the reward tier's multiplier
 * range, rounded, which is how the partner stated it.
 */
export function expectedRun(
  sky: SkyFile,
  tier: 1 | 2 | 3,
): { floors: number; crystals: number; level: number; draws: number; coins: number } {
  const t = sky.tiers.find((x) => x.tier === tier);
  if (!t) throw new Error(`no tier ${tier}`);
  const c = sky.coins;
  const normal =
    PARTNER_NORMAL_COIN_AMOUNT * (1 - (c.normal.luckyPct + c.normal.bonusPct) / 100) +
    (c.normal.lucky * c.normal.luckyPct) / 100 +
    (c.normal.bonus * c.normal.bonusPct) / 100;
  const elite = c.elite.amount * (1 - c.elite.luckyPct / 100) + (c.elite.lucky * c.elite.luckyPct) / 100;
  const byRole = { normal, elite, boss: c.boss.amount } as const;

  let crystals = 0;
  for (const f of t.floors) {
    const kind = f.boss !== undefined ? 'boss' : 'elite';
    const combos = sky.combos.filter((x) => x.tier === tier && x.floor === f.floor && x.kind === kind);
    const weight = combos.reduce((s, x) => s + x.weight, 0);
    for (const x of combos) {
      let sum = 0;
      for (const m of x.members) sum += byRole[m[4] ?? kind];
      if (weight > 0) crystals += (sum * x.weight) / weight;
    }
    if (kind === 'elite') crystals += sky.waveCounts.normalTotal * normal;
  }

  const pay = chestPayout(crystals);
  const tiers = PARTNER_CHEST_REWARD.rewardTiers;
  const rt = tiers.find((r) => r.tier === pay.level) ?? tiers[0];
  return {
    floors: t.maxFloor,
    crystals,
    level: pay.level,
    draws: pay.draws,
    coins: Math.round(crystals * PARTNER_CHEST_REWARD.ancientPerCoin * ((rt.multMin + rt.multMax) / 2)),
  };
}

/** One monster of a tier: the kinds it appears as there and the floors it appears on. */
export interface TierMonster {
  id: string;
  kinds: ('normal' | 'elite' | 'boss')[];
  floors: number[];
  /** True when it only reaches the tier through a nested spawn pool. */
  nested: boolean;
}

const KIND_ORDER = ['boss', 'elite', 'normal'] as const;

/**
 * Every monster a tier can put in front of you: its floors' normal pools
 * (nested pools followed) and the members of its elite and boss combos. The
 * elite and boss pools the floor map names are not tables — the combos are
 * what those floors spawn. Bosses first, then elites, then normal monsters;
 * each by first floor. The partner listed only the first floor's normal pool
 * (`tierMonsterPool`); this is that and the rest of the tier.
 */
export function tierMonsters(sky: SkyFile, tier: 1 | 2 | 3): TierMonster[] {
  const t = sky.tiers.find((x) => x.tier === tier);
  if (!t) return [];
  const pools = new Map(sky.spawnPools.map((p) => [p.id, p]));
  const out = new Map<string, TierMonster>();
  const add = (id: string, kind: 'normal' | 'elite' | 'boss', floor: number, nested: boolean) => {
    let m = out.get(id);
    if (!m) {
      m = { id, kinds: [], floors: [], nested };
      out.set(id, m);
    }
    if (!m.kinds.includes(kind)) m.kinds.push(kind);
    if (!m.floors.includes(floor)) m.floors.push(floor);
    m.nested = m.nested && nested;
  };
  const walk = (poolId: string, floor: number, nested: boolean, seen: Set<string>) => {
    if (seen.has(poolId)) return;
    seen.add(poolId);
    for (const [id] of pools.get(poolId)?.entries ?? []) {
      if (isPoolRef(id)) walk(id, floor, true, seen);
      else add(id, 'normal', floor, nested);
    }
  };
  for (const f of t.floors) if (f.normal !== undefined) walk(f.normal, f.floor, false, new Set());
  for (const c of sky.combos) {
    if (c.tier !== tier) continue;
    for (const [id, , , , role] of c.members) add(id, role ?? c.kind, c.floor, false);
  }
  const rank = (m: TierMonster) => KIND_ORDER.indexOf(m.kinds[0] ?? 'normal');
  for (const m of out.values()) {
    m.floors.sort((a, b) => a - b);
    m.kinds.sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
  }
  return [...out.values()].sort(
    (a, b) => rank(a) - rank(b) || (a.floors[0] ?? 0) - (b.floors[0] ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** One item of the endless boss rewards: which bosses drop it and its share of each one's list. */
export interface EndlessDrop {
  id: string;
  kind: 'equipment' | 'stones';
  waves: { wave: number; boss: number; to: number | null; weight: number; chance: number }[];
  /** The best of `waves[].chance`. */
  best: number;
}

/**
 * Endless rewards by item, the partner's "drop from bosses" grid: for every
 * item, the boss waves whose list carries it and its share of that list
 * (weight over the list's total — the split between equipment and stones is
 * shown beside it, as the partner did). Best chance first; ties by id.
 */
export function endlessDrops(sky: SkyFile): EndlessDrop[] {
  const byItem = new Map<string, EndlessDrop>();
  for (const w of endlessBossWaves(sky)) {
    for (const kind of ['stones', 'equipment'] as const) {
      const list = w[kind];
      const total = list.reduce((s, [, weight]) => s + weight, 0);
      if (total <= 0) continue;
      for (const [id, weight] of list) {
        let rec = byItem.get(id);
        if (!rec) {
          rec = { id, kind, waves: [], best: 0 };
          byItem.set(id, rec);
        }
        rec.waves.push({ wave: w.wave, boss: w.boss, to: w.to, weight, chance: weight / total });
      }
    }
  }
  for (const rec of byItem.values()) {
    rec.waves.sort((a, b) => a.wave - b.wave);
    rec.best = Math.max(...rec.waves.map((x) => x.chance));
  }
  return [...byItem.values()].sort((a, b) => b.best - a.best || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The realm's pages, `/wiki/sky/<key>`. The bare section shows `tier1`. */
export const SKY_SUBTABS = ['tier1', 'tier2', 'tier3', 'endless', 'spawns', 'combos', 'scaling'] as const;
export type SkySubtab = (typeof SKY_SUBTABS)[number];

export function isSkySubtab(key: string | undefined): key is SkySubtab {
  return key !== undefined && (SKY_SUBTABS as readonly string[]).includes(key);
}

/** The tier a `tierN` page shows, or null for the other pages. */
export function skySubtabTier(key: SkySubtab): 1 | 2 | 3 | null {
  return key === 'tier1' ? 1 : key === 'tier2' ? 2 : key === 'tier3' ? 3 : null;
}

/** The part of `wiki/pools.json` the realm's pages read. */
interface PoolsLike {
  pools: Record<string, { entries: PoolEntry[] } | undefined>;
}

/**
 * The items a page's card shows: a tier's chest pool or the deepest endless
 * reward row, heaviest first. The other pages have none of their own.
 */
export function skyPageItems(sky: SkyFile, pools: PoolsLike, key: SkySubtab, limit = 6): string[] {
  const tier = skySubtabTier(key);
  let entries: PoolEntry[] = [];
  if (tier !== null) entries = pools.pools[PARTNER_CHEST_REWARD.poolByTier[tier]]?.entries ?? [];
  else if (key === 'endless') entries = endlessBossWaves(sky).at(-1)?.equipment ?? [];
  const out: string[] = [];
  for (const [id] of [...entries].sort((a, b) => b[1] - a[1])) {
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

type Lang = 'en' | 'ru' | 'zh';
const NUMBER_LOCALE: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };

const ruPlural = (n: number, one: string, few: string, many: string): string => {
  const r = new Intl.PluralRules('ru-RU').select(n);
  return r === 'one' ? one : r === 'few' ? few : many;
};

interface SkyFactsStrings {
  realm: string;
  endless: string;
  tierTitle: (tier: number) => string;
  spawns: string;
  combos: string;
  scaling: string;
  floors: (n: number) => string;
  rewardPool: (n: number) => string;
  crystals: (n: string) => string;
  bossPools: (n: number) => string;
  items: (n: number) => string;
  everyThird: string;
  pools: (n: number) => string;
  monsters: (n: number) => string;
  comboCount: (n: number) => string;
  elite: (n: number) => string;
  boss: (n: number) => string;
  growth: (x: string) => string;
  softFrom: (floor: number) => string;
  tierDesc: (title: string, floors: number, size: number, crystals: string) => string;
  endlessDesc: (title: string, waves: string) => string;
  spawnsDesc: (realm: string, n: number) => string;
  combosDesc: (realm: string, n: number) => string;
  scalingDesc: (realm: string, growth: string) => string;
}

const SKY_FACTS: Record<Lang, SkyFactsStrings> = {
  en: {
    realm: 'Skyfall Realm',
    endless: 'Endless Skyfall Realm',
    tierTitle: (tier) => `Tier ${tier} Skyfall Realm`,
    spawns: 'Spawn pools',
    combos: 'Waves',
    scaling: 'Monster scaling',
    floors: (n) => `${n} floors`,
    rewardPool: (n) => `reward chest of ${n} items`,
    crystals: (n) => `~${n} crystals per run`,
    bossPools: (n) => `${n} boss reward pools`,
    items: (n) => `${n} items`,
    everyThird: 'a boss every third floor',
    pools: (n) => `${n} pools`,
    monsters: (n) => `${n} monsters`,
    comboCount: (n) => `${n} combos`,
    elite: (n) => `${n} elite`,
    boss: (n) => `${n} boss`,
    growth: (x) => `×${x} per floor`,
    softFrom: (floor) => `endless growth from floor ${floor}`,
    tierDesc: (title, floors, size, crystals) =>
      `${title}: ${floors} floors, the end-of-run reward chest (${size} items with their shares), the Mystic Crystal economy (~${crystals} per full run) and the tier's monsters.`,
    endlessDesc: (title, waves) => `${title}: what each boss drops — equipment and fate stones with their chances, by wave (${waves}).`,
    spawnsDesc: (realm, n) => `The ${n} spawn pools of the ${realm}: which monsters each floor draws from, and their shares.`,
    combosDesc: (realm, n) => `The ${n} pre-arranged elite and boss waves of the ${realm}: members, roles and positions.`,
    scalingDesc: (realm, growth) =>
      `How monsters in the ${realm} grow with the floor: ×${growth} per floor in the tiers, and the endless curve floor by floor.`,
  },
  ru: {
    realm: 'Небо',
    endless: 'Бесконечка',
    tierTitle: (tier) => `Небо ${tier}`,
    spawns: 'Пулы спавна',
    combos: 'Волны',
    scaling: 'Скейл монстров',
    floors: (n) => `${n} ${ruPlural(n, 'этаж', 'этажа', 'этажей')}`,
    rewardPool: (n) => `сундук-награда: ${n} ${ruPlural(n, 'предмет', 'предмета', 'предметов')}`,
    crystals: (n) => `~${n} кристаллов за заход`,
    bossPools: (n) => `${n} ${ruPlural(n, 'пул', 'пула', 'пулов')} наград боссов`,
    items: (n) => `${n} ${ruPlural(n, 'предмет', 'предмета', 'предметов')}`,
    everyThird: 'босс каждый третий этаж',
    pools: (n) => `${n} ${ruPlural(n, 'пул', 'пула', 'пулов')}`,
    monsters: (n) => `${n} ${ruPlural(n, 'монстр', 'монстра', 'монстров')}`,
    comboCount: (n) => `${n} комбо`,
    elite: (n) => `элитных ${n}`,
    boss: (n) => `боссовых ${n}`,
    growth: (x) => `×${x} за этаж`,
    softFrom: (floor) => `рост бесконечки с ${floor}-го этажа`,
    tierDesc: (title, floors, size, crystals) =>
      `${title}: ${floors} ${ruPlural(floors, 'этаж', 'этажа', 'этажей')}, сундук-награда в конце захода (${size} ${ruPlural(size, 'предмет', 'предмета', 'предметов')} с долями), экономика кристаллов души (~${crystals} за полный заход) и монстры тира.`,
    endlessDesc: (title, waves) => `${title}: что падает с каждого босса — снаряжение и грани с шансами, по волнам (${waves}).`,
    spawnsDesc: (realm, n) => `${n} ${ruPlural(n, 'пул', 'пула', 'пулов')} спавна (${realm}): из каких монстров набираются этажи и с какими долями.`,
    combosDesc: (realm, n) => `${n} готовых элитных и боссовых волн (${realm}): состав, роли и расстановка.`,
    scalingDesc: (realm, growth) => `Как растут монстры (${realm}) от этажа: ×${growth} за этаж в тирах и кривая бесконечки по этажам.`,
  },
  zh: {
    realm: '倾天秘境',
    endless: '无尽倾天秘境',
    tierTitle: (tier) => `${tier}阶倾天秘境`,
    spawns: '刷怪池',
    combos: '波次',
    scaling: '怪物成长',
    floors: (n) => `${n}层`,
    rewardPool: (n) => `结算宝箱 ${n} 件物品`,
    crystals: (n) => `每次约 ${n} 秘晶`,
    bossPools: (n) => `${n} 个首领奖励池`,
    items: (n) => `${n} 件物品`,
    everyThird: '每三层一个首领',
    pools: (n) => `${n} 个池`,
    monsters: (n) => `${n} 种怪物`,
    comboCount: (n) => `${n} 个组合`,
    elite: (n) => `精英 ${n}`,
    boss: (n) => `首领 ${n}`,
    growth: (x) => `每层 ×${x}`,
    softFrom: (floor) => `第 ${floor} 层起无尽成长`,
    tierDesc: (title, floors, size, crystals) =>
      `${title}：共 ${floors} 层，结算宝箱（${size} 件物品及各自占比）、秘晶收益（完整一次约 ${crystals}）以及本阶怪物。`,
    endlessDesc: (title, waves) => `${title}：每个首领掉落什么——装备与命石及其概率，按波次（${waves}）。`,
    spawnsDesc: (realm, n) => `${realm}的 ${n} 个刷怪池：每层从哪些怪物中抽取，以及各自占比。`,
    combosDesc: (realm, n) => `${realm}的 ${n} 个预设精英与首领波次：成员、定位与站位。`,
    scalingDesc: (realm, growth) => `${realm}怪物随层数的成长：各阶每层 ×${growth}，以及无尽模式逐层曲线。`,
  },
};

/**
 * A realm page's title, short facts and one-sentence description — the same
 * sentence in the browser tab and on the server's card. Undefined for an
 * address that is not one of `SKY_SUBTABS`.
 *
 * `locale` supplies the game's own names for the realm and its tiers where it
 * has them; `pools` is `wiki/pools.json`, for a tier chest's size.
 */
export function skyPageFacts(
  sky: SkyFile,
  locale: SkyLocale | null,
  pools: PoolsLike,
  path: readonly string[],
  lang: Lang,
): { name: string; facts: string; description: string } | undefined {
  const key = path[0];
  if (path.length !== 1 || !isSkySubtab(key)) return undefined;
  const s = SKY_FACTS[lang];
  const n = (v: number) => new Intl.NumberFormat(NUMBER_LOCALE[lang], { maximumFractionDigits: 2 }).format(v);
  const realm = locale?.names.realm ?? s.realm;
  const tier = skySubtabTier(key);

  if (tier !== null) {
    const t = sky.tiers.find((x) => x.tier === tier);
    if (!t) return undefined;
    const name = locale?.names.tierTitle?.replace('{tier}', String(tier)) ?? s.tierTitle(tier);
    const size = new Set((pools.pools[PARTNER_CHEST_REWARD.poolByTier[tier]]?.entries ?? []).map(([id]) => id)).size;
    const crystals = n(Math.round(expectedRun(sky, tier).crystals));
    return {
      name,
      facts: [s.floors(t.maxFloor), s.rewardPool(size), s.crystals(crystals)].join(' · '),
      description: s.tierDesc(name, t.maxFloor, size, crystals),
    };
  }
  if (key === 'endless') {
    const waves = endlessBossWaves(sky);
    const name = locale?.names.endless ?? s.endless;
    return {
      name,
      facts: [s.bossPools(waves.length), s.items(endlessDrops(sky).length), s.everyThird].join(' · '),
      description: s.endlessDesc(name, waves.map((w) => endlessSpanLabel(w.wave, w.to)).join(', ')),
    };
  }
  if (key === 'spawns') {
    const monsters = new Set(sky.spawnPools.flatMap((p) => p.entries.map(([id]) => id)).filter((id) => !isPoolRef(id)));
    return {
      name: `${s.spawns} — ${realm}`,
      facts: [s.pools(sky.spawnPools.length), s.monsters(monsters.size)].join(' · '),
      description: s.spawnsDesc(realm, sky.spawnPools.length),
    };
  }
  if (key === 'combos') {
    const elite = sky.combos.filter((c) => c.kind === 'elite').length;
    return {
      name: `${s.combos} — ${realm}`,
      facts: [s.comboCount(sky.combos.length), s.elite(elite), s.boss(sky.combos.length - elite)].join(' · '),
      description: s.combosDesc(realm, sky.combos.length),
    };
  }
  const growth = n(sky.scaling.tierScale.growth);
  return {
    name: `${s.scaling} — ${realm}`,
    facts: [s.growth(growth), s.softFrom(sky.scaling.endless.softStart)].join(' · '),
    description: s.scalingDesc(realm, growth),
  };
}
