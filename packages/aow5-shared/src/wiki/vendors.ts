/**
 * The three in-town vendors — `wiki/vendors.json` and
 * `wiki/locale.<lang>.vendors.json`.
 *
 *   - the **regular** merchant (gold, restocks on a timer, shop level 1-10),
 *   - the **ancient** merchant (Ancient Coins, `item_M512`),
 *   - the **guild** merchant (acquisition orders for Bounty Gold, and a point
 *     exchange).
 *
 * The JSON holds what the pak states: which items each vendor can stock,
 * derived from the item table's own flags (`ItemSellable`,
 * `ItemSellableInAncient`, `ExchangeInventory`, `Subclass: precious`) in the
 * wiki season's ruleset; the client bundle's refresh timers and counters; and
 * the talent nodes that touch each vendor. The vendors' server code
 * (`shop/shop.lua`, `shop/ancient_shop.lua`, `my_game_axe/merchant/*.lua`) is
 * shipped encrypted, so its constants — price multipliers, fixed goods, order
 * tiers, the exchange price formula — are **not** in the JSON. The partner
 * wiki states them; they are the `PARTNER_*` constants below, each marked as
 * such, so a page can show them while saying where they came from.
 *
 * Items are referenced by id. Level, quality, cost and type come from the
 * items index (`items.index.json`); the prices below are computed from cost.
 */

import type { RulesetId } from './pools.ts';
import type { TalentEffect } from './sky.ts';

export type { TalentEffect } from './sky.ts';

/**
 * A refresh timer as the client bundle computes it when the server has not
 * sent one: `floor(baseSec × (100 - min(maxReductionPct, shop_time)) / 100)`.
 * These are the client's fallbacks; the server may send another interval.
 */
export interface VendorRefresh {
  baseSec: number;
  maxReductionPct: number;
  /** Item spent on a manual refresh. */
  manualItem: string;
  /** Client default for refreshes per day. */
  manualLimit: number;
  /** Client default for the next manual refresh's cost. */
  manualCost: number;
}

/** The parts of a vendor's stock that differ in another season, in full. */
export interface RegularStock {
  /** Shop level (the item's `Level`, 1-10) -> item ids it unlocks. */
  byLevel: Record<string, string[]>;
  /** Items in `byLevel` that are `Subclass: precious`. */
  precious: string[];
}

export interface RegularVendor extends RegularStock {
  refresh: VendorRefresh;
  talents: TalentEffect[];
  bySeason?: Partial<Record<RulesetId, RegularStock>>;
}

export interface AncientVendor {
  currencyItem: string;
  refresh: VendorRefresh;
  /** Every item with `ItemSellableInAncient: 1` — what the merchant's random slots draw from. */
  accepts: string[];
  talents: TalentEffect[];
  bySeason?: Partial<Record<RulesetId, { accepts: string[] }>>;
}

/** `[itemId, stock]` — an exchange offer and its `ExchangeInventory`. */
export type ExchangeOffer = [itemId: string, stock: number];

export interface GuildVendor {
  /** Client defaults for the order board (`merchant_panel`). */
  tasks: {
    targetCount: number;
    rewardPoints: number;
    slotStart: number;
    slotMax: number;
    nextUnlockCost: number;
    dailyLimit: number;
    refresh: { item: string; dailyLimit: number; cost: number };
  };
  exchange: {
    refresh: { item: string; dailyLimit: number; cost: number };
    /** Every item with `ExchangeInventory > 0`. */
    offers: ExchangeOffer[];
  };
  talents: TalentEffect[];
  bySeason?: Partial<Record<RulesetId, { offers: ExchangeOffer[] }>>;
}

/** `wiki/vendors.json`. */
export interface VendorsFile {
  schema: 1;
  generatedAt: string;
  ruleset: RulesetId;
  regular: RegularVendor;
  ancient: AncientVendor;
  guild: GuildVendor;
}

/** `wiki/locale.<lang>.vendors.json`. Templates keep the game's placeholders. */
export interface VendorsLocale {
  schema: 1;
  lang: string;
  vendors: { regular?: string; ancient?: string; guild?: string };
  currencies: { gold?: string; ancientCoins?: string; bountyGold?: string; points?: string };
  /** Guild order level (1-4) -> its label. */
  orderLevels: Record<string, string>;
  /** "Shop Level {level}" and friends. */
  labels: Record<string, string>;
}

// --- constants the pak does not carry --------------------------------------

/** The vendors' NPC units, as the partner names them. Each exists in `ak_units`; the binding is server-side. */
export const PARTNER_NPC = { regular: 'npc_7', ancient: 'npc_11', guild: 'npc_8' } as const;

/**
 * Regular merchant pricing, **as stated by the partner wiki**: a restock
 * prices each slot at a random `minMul…maxMul` × the item's cost, floored;
 * a precious item additionally ×`preciousMul`.
 */
export const PARTNER_REGULAR_PRICE = { minMul: 1.5, maxMul: 3.5, preciousMul: 1.5 } as const;

/** Five slots the regular merchant always stocks, `[itemId, count]`. Partner wiki. */
export const PARTNER_REGULAR_FIXED: readonly (readonly [string, number])[] = [
  ['item_M007', 20],
  ['item_M011', 20],
  ['item_2000', 5],
  ['item_2001', 5],
  ['item_2004', 5],
];

/**
 * Regular merchant rules the partner states and the pak does not: up to
 * `formulaSlots` blueprint slots; a non-equipment item only appears once it
 * has dropped for the player `unlockDrops` times; a slot's stack is
 * `1 + min(4, floor(drops / 3))`, precious always 1; unlocked items weigh 2,
 * the rest 1. The partner's refresh base is 1200 s where the client's
 * fallback is 1800 s — see `RegularVendor.refresh`.
 */
export const PARTNER_REGULAR_RULES = { formulaSlots: 2, unlockDrops: 4, refreshBaseSec: 1200, unlockedWeight: 2 } as const;

/**
 * The ancient merchant's eight fixed slots, partner wiki. `price` is in
 * Ancient Coins; `gold: true` sells for gold at the regular formula instead.
 * `requiredLevel` is the ancient shop level that unlocks the slot.
 */
export const PARTNER_ANCIENT_FIXED: readonly {
  id: string;
  count: number;
  price: number | null;
  requiredLevel: number;
  gold?: true;
}[] = [
  { id: 'item_M512', count: 3000, price: null, requiredLevel: 1, gold: true },
  { id: 'item_M315', count: 10, price: 2000, requiredLevel: 1 },
  { id: 'item_M507', count: 3, price: 10000, requiredLevel: 1 },
  { id: 'item_M318', count: 3, price: 3000, requiredLevel: 1 },
  { id: 'item_5001', count: 10, price: 3500, requiredLevel: 2 },
  { id: 'item_5002', count: 10, price: 7000, requiredLevel: 3 },
  { id: 'item_5003', count: 10, price: 14000, requiredLevel: 4 },
  { id: 'item_5101', count: 10, price: 20000, requiredLevel: 5 },
];

/**
 * Ancient merchant rules, partner wiki: a random slot costs
 * `floor(goldPrice / coinDivisor)` coins where the gold price is the regular
 * formula's; total slots are `min(slotsCap, slotsBase + ancient_shop_count)`;
 * it buys items from the player for gold at `cost / 2`.
 */
export const PARTNER_ANCIENT_RULES = { coinDivisor: 5, slotsBase: 27, slotsCap: 32, sellBackDivisor: 2 } as const;

/** Guild order levels, partner wiki: target value range of an order and how many slots it takes. */
export const PARTNER_GUILD_LEVELS: readonly { level: 1 | 2 | 3 | 4; slots: number; valueMin: number; valueMax: number }[] = [
  { level: 1, slots: 1, valueMin: 50, valueMax: 300 },
  { level: 2, slots: 2, valueMin: 380, valueMax: 520 },
  { level: 3, slots: 2, valueMin: 1200, valueMax: 6200 },
  { level: 4, slots: 3, valueMin: 4500, valueMax: 15000 },
];

/** What completing an order of each level pays, partner wiki: Bounty Gold range and a chest item. */
export const PARTNER_GUILD_REWARDS: readonly { level: 1 | 2 | 3 | 4; pointsMin: number; pointsMax: number; chest: string }[] = [
  { level: 1, pointsMin: 3, pointsMax: 4, chest: 'item_P300' },
  { level: 2, pointsMin: 4, pointsMax: 6, chest: 'item_P301' },
  { level: 3, pointsMin: 6, pointsMax: 10, chest: 'item_P302' },
  { level: 4, pointsMin: 48, pointsMax: 90, chest: 'item_P303' },
];

/** Sigil orders, partner wiki: a `chancePct` chance an order of `difficulty` asks for Sigils instead. */
export const PARTNER_GUILD_RUNE_TASKS: readonly {
  difficulty: number;
  chancePct: number;
  itemId: string;
  needMin: number;
  needMax: number;
  rewards: readonly string[];
}[] = [
  { difficulty: 2, chancePct: 20, itemId: 'item_M010', needMin: 15, needMax: 20, rewards: ['item_P310', 'item_P311', 'item_P312'] },
  { difficulty: 3, chancePct: 20, itemId: 'item_M010', needMin: 45, needMax: 60, rewards: ['item_P310_2', 'item_P311_2', 'item_P312_2'] },
];

/**
 * Guild constants the partner states differently from (or beyond) the
 * client's defaults: order-board refresh costs `manualCost` Guild Charters up
 * to `manualLimit` a day, resetting one order costs `taskResetCost`, an order
 * never asks for more than `needCap` of an item.
 */
export const PARTNER_GUILD_RULES = { manualCost: 6, manualLimit: 6, taskResetCost: 2, needCap: 10 } as const;

/**
 * The point exchange's price, partner wiki:
 * `min(priceCap, ceil(cost / divisor) + baseCost + max(0, quality - qualityFloor))`,
 * with per-item overrides. Exchanges per day: `dailyBase`, +`perSlot` per
 * unlocked order slot, up to `dailyMax`.
 */
export const PARTNER_EXCHANGE = {
  divisor: 150,
  baseCost: 20,
  qualityFloor: 3,
  priceCap: 800,
  dailyBase: 10,
  dailyMax: 25,
  perSlot: 5,
  manual: { item_M318: 500 } as Record<string, number>,
} as const;

// --- logic ------------------------------------------------------------------

/** A regular-merchant price range for an item of `cost`, floored. `precious` adds the precious ceiling. */
export function regularPrice(cost: number, precious = false): { min: number; max: number; precious?: number } {
  const p = PARTNER_REGULAR_PRICE;
  const out: { min: number; max: number; precious?: number } = {
    min: Math.floor(cost * p.minMul),
    max: Math.floor(cost * p.maxMul),
  };
  if (precious) out.precious = Math.floor(cost * p.maxMul * p.preciousMul);
  return out;
}

/** An ancient-merchant price range in coins, and what it pays the player in gold for one. */
export function ancientPrice(cost: number): { coinMin: number; coinMax: number; sellGold: number } {
  const r = regularPrice(cost);
  const d = PARTNER_ANCIENT_RULES.coinDivisor;
  return {
    coinMin: Math.floor(r.min / d),
    coinMax: Math.floor(r.max / d),
    sellGold: Math.floor(cost / PARTNER_ANCIENT_RULES.sellBackDivisor),
  };
}

/** An exchange offer's price in points. */
export function exchangePoints(itemId: string, cost: number, quality: number): number {
  const e = PARTNER_EXCHANGE;
  const manual = e.manual[itemId];
  if (manual !== undefined) return manual;
  return Math.min(e.priceCap, Math.ceil(cost / e.divisor) + e.baseCost + Math.max(0, quality - e.qualityFloor));
}

/** The regular merchant's stock as one season sees it. */
export function regularStock(v: RegularVendor, ruleset?: RulesetId): RegularStock {
  return (ruleset && v.bySeason?.[ruleset]) || v;
}

/** Every item a shop of `level` can stock: everything unlocked at that level or below. */
export function regularPoolAt(v: RegularVendor, level: number, ruleset?: RulesetId): string[] {
  const s = regularStock(v, ruleset);
  return Object.keys(s.byLevel)
    .map(Number)
    .filter((l) => l <= level)
    .sort((a, b) => a - b)
    .flatMap((l) => s.byLevel[String(l)] ?? []);
}

/** The client's refresh interval for a `shop_time` talent total. */
export function refreshSeconds(r: VendorRefresh, shopTime = 0): number {
  const t = Math.max(0, Math.min(r.maxReductionPct, Math.floor(shopTime)));
  return Math.floor((r.baseSec * (100 - t)) / 100);
}

/** The talent keys a vendor responds to, de-duplicated — the partner's `talentKeys`. */
export function talentKeys(talents: TalentEffect[]): string[] {
  return [...new Set(talents.map(([, key]) => key))];
}

// --- the guild's order lists (partner content) -------------------------------

/**
 * `aow5-shared/content/guild-orders.json`: which materials an acquisition
 * order of each level may ask for, and how many.
 *
 * The guild merchant draws orders in server code the pak ships encrypted, so
 * the extractor cannot emit this; it is the partner wiki's v1.507 snapshot,
 * kept as authored content beside the FAQ and shown with a footnote naming it.
 * `_source` says where it came from, `version` which game version it describes.
 */
export interface GuildOrdersFile {
  _source: string;
  version: string;
  /** Order level (`"1"`…`"4"`) → `[itemId, needMin, needMax]`. */
  levels: Record<string, [itemId: string, needMin: number, needMax: number][]>;
}

/** One material an order may ask for, with the order level that asks. */
export interface GuildOrderRow {
  level: number;
  id: string;
  needMin: number;
  needMax: number;
}

/**
 * Every order row, level by level — or just `level`'s. A material several
 * levels ask for appears once per level, as the partner showed it.
 */
export function guildOrderRows(file: GuildOrdersFile, level?: number): GuildOrderRow[] {
  return Object.keys(file.levels)
    .map(Number)
    .filter((l) => level === undefined || l === level)
    .sort((a, b) => a - b)
    .flatMap((l) => (file.levels[String(l)] ?? []).map(([id, needMin, needMax]) => ({ level: l, id, needMin, needMax })));
}

// --- addresses and the page's sentence ----------------------------------------

export type VendorKey = 'regular' | 'ancient' | 'guild';
export type GuildTab = 'tasks' | 'exchange';

/** What a `/wiki/vendors/...` address shows. */
export interface VendorAddress {
  vendor: VendorKey;
  /** Only for the guild merchant. */
  guild?: GuildTab;
}

export const VENDOR_KEYS: readonly VendorKey[] = ['regular', 'ancient', 'guild'];
export const GUILD_TABS: readonly GuildTab[] = ['tasks', 'exchange'];

/**
 * The address's vendor, or undefined for one that names nothing. The bare
 * section is the regular merchant, and the bare guild merchant is its orders —
 * the partner's defaults.
 */
export function vendorAddress(path: readonly string[]): VendorAddress | undefined {
  if (path.length === 0) return { vendor: 'regular' };
  const [vendor, sub, ...rest] = path;
  if (rest.length > 0) return undefined;
  if (vendor === 'regular' || vendor === 'ancient') return sub === undefined ? { vendor } : undefined;
  if (vendor !== 'guild') return undefined;
  if (sub === undefined) return { vendor, guild: 'tasks' };
  return (GUILD_TABS as readonly string[]).includes(sub) ? { vendor, guild: sub as GuildTab } : undefined;
}

/** Every page of the section, in canonical form. */
export function vendorPaths(): string[][] {
  return [['regular'], ['ancient'], ['guild', 'tasks'], ['guild', 'exchange']];
}

type FactsLang = 'en' | 'ru' | 'zh';
const FACTS_LOCALE: Record<FactsLang, string> = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };

interface VendorFactsStrings {
  fallback: Record<VendorKey, string>;
  tab: Record<GuildTab, string>;
  gold: string;
  coins: string;
  points: string;
  bounty: string;
  hours: string;
  minutes: string;
  restock: (time: string) => string;
  refreshes: (n: number) => string;
  items: (n: string) => string;
  slots: (from: number, to: number) => string;
  perDay: (n: number) => string;
  regular: (name: string, time: string, pool: string, fixed: number) => string;
  ancient: (name: string, time: string, pool: string, fixed: number) => string;
  tasks: (name: string, from: number, to: number, perDay: number) => string;
  exchange: (name: string, offers: string, from: number, to: number) => string;
}

const VENDOR_FACTS: Record<FactsLang, VendorFactsStrings> = {
  en: {
    fallback: { regular: 'Shady Merchant', ancient: 'Ancient Merchant', guild: 'Guild Merchant' },
    tab: { tasks: 'orders', exchange: 'Point Exchange' },
    gold: 'Gold',
    coins: 'Ancient Coins',
    points: 'Exchange points',
    bounty: 'Bounty Gold',
    hours: 'h',
    minutes: 'min',
    restock: (time) => `restocks every ${time}`,
    refreshes: (n) => `${n} refreshes a day`,
    items: (n) => `${n} items`,
    slots: (from, to) => `${from}→${to} order slots`,
    perDay: (n) => `up to ${n} orders a day`,
    regular: (name, time, pool, fixed) =>
      `${name}, Age of Weapons 5: sells for gold and restocks every ${time}; ${pool} items across shop levels 1–10 plus ${fixed} permanent slots, with prices and talents.`,
    ancient: (name, time, pool, fixed) =>
      `${name}, Age of Weapons 5: sells for Ancient Coins and restocks every ${time}; ${fixed} permanent slots and ${pool} items its random slots draw from, with coin prices.`,
    tasks: (name, from, to, perDay) =>
      `${name}, Age of Weapons 5: acquisition orders for Bounty Gold — ${from}→${to} order slots, up to ${perDay} orders a day, rewards per order level and what each level asks for.`,
    exchange: (name, offers, from, to) =>
      `${name}, Age of Weapons 5: the point exchange — ${offers} offers with their prices in points, ${from}→${to} exchanges a day.`,
  },
  ru: {
    fallback: { regular: 'Злой торговец', ancient: 'Древний торговец', guild: 'Торговец гильдии' },
    tab: { tasks: 'заказы', exchange: 'обмен очков' },
    gold: 'Золото',
    coins: 'Древние монеты',
    points: 'Очки обмена',
    bounty: 'Наградные монеты',
    hours: 'ч',
    minutes: 'мин',
    restock: (time) => `обновление каждые ${time}`,
    refreshes: (n) => `обновлений в день: ${n}`,
    items: (n) => `предметов: ${n}`,
    slots: (from, to) => `слотов заказов ${from}→${to}`,
    perDay: (n) => `до ${n} заказов в день`,
    regular: (name, time, pool, fixed) =>
      `${name}, Age of Weapons 5: торгует за золото, обновляет витрину каждые ${time}; ${pool} предметов по уровням лавки 1–10 и ${fixed} постоянных позиций — с ценами и талантами.`,
    ancient: (name, time, pool, fixed) =>
      `${name}, Age of Weapons 5: торгует за древние монеты, обновляется каждые ${time}; ${fixed} постоянных позиций и ${pool} предметов для случайных — с ценами в монетах.`,
    tasks: (name, from, to, perDay) =>
      `${name}, Age of Weapons 5: заказы на закупку за наградные монеты — слотов ${from}→${to}, до ${perDay} заказов в день, награды по уровням и что принимают в заказ.`,
    exchange: (name, offers, from, to) =>
      `${name}, Age of Weapons 5: обмен очков — ${offers} предложений с ценой в очках, обменов в день ${from}→${to}.`,
  },
  zh: {
    fallback: { regular: '黑心商贩', ancient: '远古商贩', guild: '会馆商人' },
    tab: { tasks: '订单', exchange: '积分兑换' },
    gold: '金币',
    coins: '远古币',
    points: '兑换积分',
    bounty: '悬赏金币',
    hours: '小时',
    minutes: '分钟',
    restock: (time) => `每 ${time} 刷新`,
    refreshes: (n) => `每日可刷新 ${n} 次`,
    items: (n) => `${n} 种物品`,
    slots: (from, to) => `订单栏位 ${from}→${to}`,
    perDay: (n) => `每日最多 ${n} 单`,
    regular: (name, time, pool, fixed) =>
      `${name}（Age of Weapons 5）：以金币出售，每 ${time} 刷新货架；商店等级 1–10 共 ${pool} 种物品及 ${fixed} 个固定货位，含价格与相关天赋。`,
    ancient: (name, time, pool, fixed) =>
      `${name}（Age of Weapons 5）：以远古币出售，每 ${time} 刷新；${fixed} 个固定货位，随机货位从 ${pool} 种物品中抽取，含远古币价格。`,
    tasks: (name, from, to, perDay) =>
      `${name}（Age of Weapons 5）：收购订单，奖励悬赏金币——订单栏位 ${from}→${to}，每日最多 ${perDay} 单，各订单等级的奖励与可交付物品。`,
    exchange: (name, offers, from, to) =>
      `${name}（Age of Weapons 5）：积分兑换——${offers} 件商品及其积分价格，每日兑换 ${from}→${to} 次。`,
  },
};

function shortDuration(seconds: number, s: VendorFactsStrings): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} ${s.minutes}`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} ${s.hours}` : `${h} ${s.hours} ${m % 60} ${s.minutes}`;
}

/**
 * A vendor page's title, short facts and one-sentence description — the same
 * sentence in the browser tab and on the server's card. The facts are the
 * currency, the restock time and the stock size.
 */
export function vendorPageFacts(
  file: VendorsFile,
  locale: VendorsLocale,
  address: VendorAddress,
  lang: FactsLang,
): { name: string; facts: string; description: string } {
  const s = VENDOR_FACTS[lang];
  const n = (value: number) => new Intl.NumberFormat(FACTS_LOCALE[lang]).format(value);
  const vendorName = locale.vendors[address.vendor] ?? s.fallback[address.vendor];
  const currency = (key: keyof VendorsLocale['currencies'], fallback: string) =>
    (locale.currencies[key] ?? fallback).replace('{cost}', '').trim();

  if (address.vendor === 'regular') {
    const time = shortDuration(file.regular.refresh.baseSec, s);
    const pool = regularPoolAt(file.regular, 10).length;
    return {
      name: vendorName,
      facts: [currency('gold', s.gold), s.restock(time), s.items(n(pool + PARTNER_REGULAR_FIXED.length))].join(' · '),
      description: s.regular(vendorName, time, n(pool), PARTNER_REGULAR_FIXED.length),
    };
  }
  if (address.vendor === 'ancient') {
    const time = shortDuration(file.ancient.refresh.baseSec, s);
    const pool = file.ancient.accepts.length;
    return {
      name: vendorName,
      facts: [currency('ancientCoins', s.coins), s.restock(time), s.items(n(pool + PARTNER_ANCIENT_FIXED.length))].join(' · '),
      description: s.ancient(vendorName, time, n(pool), PARTNER_ANCIENT_FIXED.length),
    };
  }
  const tab = address.guild ?? 'tasks';
  const name = `${vendorName}: ${s.tab[tab]}`;
  if (tab === 'tasks') {
    const t = file.guild.tasks;
    return {
      name,
      facts: [currency('bountyGold', s.bounty), s.slots(t.slotStart, t.slotMax), s.perDay(t.dailyLimit)].join(' · '),
      description: s.tasks(vendorName, t.slotStart, t.slotMax, t.dailyLimit),
    };
  }
  const offers = file.guild.exchange.offers.length;
  return {
    name,
    facts: [s.points, s.refreshes(file.guild.exchange.refresh.dailyLimit), s.items(n(offers))].join(' · '),
    description: s.exchange(vendorName, n(offers), PARTNER_EXCHANGE.dailyBase, PARTNER_EXCHANGE.dailyMax),
  };
}
