/**
 * Drop and treasure pools — `wiki/pools.json` and `wiki/locale.<lang>.pools.json`.
 *
 * A pool is a weighted list of items the server draws from. The addon keeps
 * two tables of them, and both are emitted here:
 *
 *   - `ak_drop_pools` (`kind: 'drop'`) — what a container, a magic-tower
 *     chest, a dispatch run or a Greed Cave reward chest draws from. The
 *     container itself names its pool in code; see `ItemExtra.container` and
 *     `ItemExtra.chest` in `items-extra.ts` for which item opens which pool.
 *   - `ak_treasure_pool` (`kind: 'treasure'`) — the paid treasure chests'
 *     tiers, which carry a few more numbers (`treasure`).
 *
 * Weights are relative. A share of one draw is `weight / poolTotal(pool)`;
 * this module does that arithmetic so every consumer agrees on it. A share is
 * not a "chance per open" unless the container makes exactly one draw at 100% —
 * see `containerChance` in `items-extra.ts`.
 *
 * Values are the S2 ruleset's. A season whose copy of a pool differs carries a
 * full replacement under `bySeason`; `poolInSeason` picks the right one.
 */

/** The rulesets the pak ships, by their own ids. */
export type RulesetId = 's1' | 's2' | 's3';

/** The season the wiki describes: every default below reads its copy of a row. */
export const CURRENT_RULESET: RulesetId = 's3';

/**
 * The season the files' own (base) rows describe.
 *
 * The pipeline emits each table from the S2 copy and puts a season that differs
 * under `bySeason` — so a caller that asks for nothing gets that season's data,
 * not the base rows. Kept for the few places that mean the file's own season
 * rather than the one the wiki shows (and for the files' `ruleset` field).
 */
export const PRIMARY_RULESET: RulesetId = 's2';

/**
 * One row of a pool, tuple-packed for size: `[itemId, weight]`.
 *
 * The weight may be fractional — the magic-tower chests use weights like
 * `363.4` — so do not assume an integer.
 */
export type PoolEntry = [itemId: string, weight: number];

/** The extra numbers a treasure-chest tier carries. */
export interface TreasureTier {
  /** The tier's own weight when a chest first picks a tier. */
  baseWeight: number;
  /**
   * The tier this one escalates into and that tier's weight, as the table
   * states it (`T002:22000000`). How the server uses it is not in any plain
   * file; the value is shipped verbatim so a page can at least show it.
   */
  target?: [poolId: string, weight: number][];
  minCount?: number;
  maxCount?: number;
  weightCurve?: number;
}

/** What a pool holds in one ruleset. */
export interface PoolBody {
  level: number;
  entries: PoolEntry[];
  treasure?: TreasureTier;
}

export interface Pool extends PoolBody {
  id: string;
  kind: 'drop' | 'treasure';
  /**
   * A season whose copy of this pool is not the S2 one, in full. Absent means
   * every season agrees with the primary values.
   */
  bySeason?: Partial<Record<RulesetId, PoolBody>>;
}

/** `wiki/pools.json`. */
export interface PoolsFile {
  schema: 1;
  generatedAt: string;
  /** The ruleset the primary values describe. Always `s2` today. */
  ruleset: RulesetId;
  pools: Record<string, Pool>;
}

/**
 * `wiki/locale.<lang>.pools.json`: the game's own name for a pool, where it
 * has one (`P600` -> "Tier 1 Treasure Chest"). Pools without a token are
 * absent; show the id.
 */
export interface PoolsLocale {
  schema: 1;
  lang: string;
  names: Record<string, string>;
}

/** The pool as one season sees it. */
export function poolInSeason(pool: Pool, ruleset: RulesetId = CURRENT_RULESET): PoolBody {
  return pool.bySeason?.[ruleset] ?? pool;
}

/** Sum of every weight in the pool. Zero for an empty pool. */
export function poolTotal(body: PoolBody): number {
  let total = 0;
  for (const [, weight] of body.entries) total += weight;
  return total;
}

/**
 * The share of one draw that lands on `itemId`, in `[0, 1]`.
 *
 * An item listed twice counts twice — the server draws by row, so a
 * duplicated row really is twice as likely.
 */
export function entryShare(body: PoolBody, itemId: string): number {
  const total = poolTotal(body);
  if (total <= 0) return 0;
  let mine = 0;
  for (const [id, weight] of body.entries) if (id === itemId) mine += weight;
  return mine / total;
}

/** Every row as `{ id, weight, share }`, heaviest first. */
export function poolShares(body: PoolBody): { id: string; weight: number; share: number }[] {
  const total = poolTotal(body);
  return body.entries
    .map(([id, weight]) => ({ id, weight, share: total > 0 ? weight / total : 0 }))
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Every pool that can give `itemId`, with its share of one draw. The reverse
 * index the partner wiki shipped as `items[].containers`, computed on demand
 * instead of stored twice.
 */
export function poolsContaining(
  file: PoolsFile,
  itemId: string,
  ruleset: RulesetId = CURRENT_RULESET,
): { pool: string; share: number }[] {
  const out: { pool: string; share: number }[] = [];
  for (const pool of Object.values(file.pools)) {
    const share = entryShare(poolInSeason(pool, ruleset), itemId);
    if (share > 0) out.push({ pool: pool.id, share });
  }
  return out.sort((a, b) => b.share - a.share || (a.pool < b.pool ? -1 : 1));
}
