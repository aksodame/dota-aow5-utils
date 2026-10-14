/**
 * Paid acquisition routes — `wiki/sources.json` and
 * `wiki/locale.<lang>.sources.json`.
 *
 *   - `mall`: the sponsor shop's bundles (`scripts/npc/ak_shop_list.txt`),
 *     each a price in points and the items it grants;
 *   - `gacha`: the treasure chests (`scripts/npc/ak_treasure.txt`), each a
 *     key cost, a weighted set of treasure pools, and its pity rule.
 *
 * Neither table has per-season copies. The treasure *pools* do, and live in
 * `wiki/pools.json` (step 08d), so a chest here names its pools by id and
 * `gachaByItem` reads their contents from that file.
 *
 * The partner wiki shipped both indexed by item (`sources.mall[itemId]`,
 * `sources.gacha[itemId]`); `mallByItem` and `gachaByItem` rebuild exactly
 * that from the per-pack and per-chest records here.
 */

import { poolInSeason, PRIMARY_RULESET, type PoolsFile, type RulesetId } from './pools.ts';

/** `[itemId, count]`. */
export type ItemCount = [itemId: string, count: number];

/** One sponsor-shop bundle. */
export interface MallPack {
  /** The row id in `ak_shop_list` — also the `shop_item_<id>_name` locale key. */
  id: string;
  /** Price in points (the table's `amout`). */
  price: number;
  /** Purchase limit; 0 means unlimited. */
  limit: number;
  /** What the server grants. Empty for packs that grant a status (month card, pass). */
  rewards: ItemCount[];
  /**
   * What the store card shows, when it differs from `rewards` — usually the
   * boxed `item_YP…` twin of a reward, or a different count (weekly deal 18:
   * 18 granted, 20 shown).
   */
  display?: ItemCount[];
  /** `gift_pack_show`: whether the pack is a gift-pack card. */
  giftPack: boolean;
  /** `shop_item_quality`: the card's frame quality. */
  quality: number;
}

/** A treasure chest's pity rule (`ak_treasure`), rates in basis points of 10 000. */
export interface TreasurePity {
  quality: number;
  count: number;
  softStart: number;
  softStartRate: number;
  softStep: number;
  softMaxRate: number;
  specialPool?: string;
  specialCount?: number;
}

export interface TreasureChest {
  /** Row id in `ak_treasure` — also `treasure_<id>_name`. */
  id: string;
  keyCost: number;
  /** `[poolId, weight]` — which treasure pool a draw lands in. */
  pools: [poolId: string, weight: number][];
  hidden: boolean;
  pity?: TreasurePity;
}

/** `wiki/sources.json`. */
export interface SourcesFile {
  schema: 1;
  generatedAt: string;
  ruleset: RulesetId;
  mall: MallPack[];
  gacha: TreasureChest[];
}

/** `wiki/locale.<lang>.sources.json`. A pack without a game name falls back to its card tip (English in every language). */
export interface SourcesLocale {
  schema: 1;
  lang: string;
  packs: Record<string, string>;
  chests: Record<string, string>;
}

/** The partner's per-item mall record. `packed` marks a row that is only on the card (`display`), not granted. */
export interface MallSource {
  pack: string;
  price: number;
  count: number;
  packed: boolean;
}

/**
 * Item -> every pack that grants or shows it. A display row that matches a
 * reward row (same id and count) is not repeated. `packName` maps a pack to
 * its label; by default the pack id.
 */
export function mallByItem(file: SourcesFile, packName: (pack: MallPack) => string = (p) => p.id): Record<string, MallSource[]> {
  const out: Record<string, MallSource[]> = {};
  const add = (id: string, rec: MallSource) => (out[id] ??= []).push(rec);
  for (const pack of file.mall) {
    const name = packName(pack);
    for (const [id, count] of pack.rewards) add(id, { pack: name, price: pack.price, count, packed: false });
    for (const [id, count] of pack.display ?? []) {
      if (pack.rewards.some(([rid, rc]) => rid === id && rc === count)) continue;
      add(id, { pack: name, price: pack.price, count, packed: true });
    }
  }
  return out;
}

/** Item -> the chests whose pools can give it, and which pools. */
export function gachaByItem(
  file: SourcesFile,
  pools: PoolsFile,
  ruleset: RulesetId = PRIMARY_RULESET,
): Record<string, { chest: string; pools: string[] }[]> {
  const out: Record<string, { chest: string; pools: string[] }[]> = {};
  for (const chest of file.gacha) {
    const byItem = new Map<string, string[]>();
    for (const [poolId] of chest.pools) {
      const pool = pools.pools[poolId];
      if (!pool) continue;
      for (const [id] of poolInSeason(pool, ruleset).entries) {
        const list = byItem.get(id) ?? [];
        if (!list.includes(poolId)) list.push(poolId);
        byItem.set(id, list);
      }
    }
    for (const [id, list] of byItem) (out[id] ??= []).push({ chest: chest.id, pools: list });
  }
  return out;
}

/** A chest's chance to land in each pool on one draw, before pity. */
export function chestPoolShares(chest: TreasureChest): { pool: string; share: number }[] {
  const total = chest.pools.reduce((s, [, w]) => s + w, 0);
  return chest.pools.map(([pool, w]) => ({ pool, share: total > 0 ? w / total : 0 }));
}
