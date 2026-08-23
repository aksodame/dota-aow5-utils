import { INDEX_COST, INDEX_ICON, INDEX_ID, INDEX_LEVEL, INDEX_QUALITY, INDEX_TYPE } from 'aow5-shared/types';
import type { IndexRow, ItemNeed } from 'aow5-shared/types';

/**
 * Resolves the bare item ids the addon reports into something worth showing.
 *
 * Everything here comes from `aow5-shared` — the same extracted tables the
 * planner renders — so this project re-derives none of it. `cost` in particular
 * is the only reason a gold figure is computable at all, since the addon runs
 * its own economy and it is invisible from outside the game.
 *
 * Browser-safe: no `node:` imports and no I/O, so the renderer owns this and the
 * main process never has to.
 */

export type { IndexRow, ItemNeed };

export interface ItemInfo {
  id: string;
  name: string;
  cost: number;
  quality: number;
  level: number;
  type: string;
  icon: string;
  /** Lowercased `name id`, for the tracked-item search. */
  search: string;
}

/**
 * Icons are ~22 MB across 1,088 files.
 *
 * They live in `aow5-shared/public/icons` and are deployed with the planner, but
 * shipping them inside a desktop app would multiply its size for art that is
 * already on a CDN. They load from the deployed planner and are left to
 * Chromium's cache; a miss degrades to a broken image rather than a broken
 * overlay.
 *
 * **This value is compiled into every binary that ships.** An installed copy
 * keeps asking the host below forever, so wherever it points has to keep
 * serving files — and it cannot be fixed by redirecting, because the renderer's
 * Content-Security-Policy (src/index.html) allowlists the host, and a redirect
 * to a different one is refused by the policy rather than followed.
 *
 * Which is why it is overridable: `AOW5_ICON_BASE` in the environment wins, so
 * a move can be tested, and a future one does not strand whatever is already
 * installed. Changing the default is a release, and the new host must be added
 * to the CSP in the same commit.
 */
const DEFAULT_ICON_BASE = 'https://aow5-builder.pages.dev/icons/items';

export const ICON_BASE: string = readIconBase();

function readIconBase(): string {
  // Read off globalThis rather than naming `process`, because this file is part
  // of core/ and core/ is checked against the browser libs — it has to compile
  // with no Node types at all, the same rule that keeps Electron out of here.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const override = env?.['AOW5_ICON_BASE'];
  return override !== undefined && override !== '' ? override.replace(/\/+$/, '') : DEFAULT_ICON_BASE;
}

export function iconUrl(icon: string): string {
  return `${ICON_BASE}/${icon}`;
}

/** The unknown-id row. Shared so an id the tables have never heard of still renders identically everywhere. */
function unknown(id: string): ItemInfo {
  return { id, name: id, cost: 0, quality: 0, level: 0, type: 'unknown', icon: 'placeholder.png', search: id.toLowerCase() };
}

export class ItemTable {
  readonly byId: Map<string, ItemInfo>;
  readonly all: ItemInfo[];

  private constructor(items: ItemInfo[]) {
    this.all = items;
    this.byId = new Map(items.map((i) => [i.id, i]));
  }

  static from(rows: readonly IndexRow[], names: Record<string, string>): ItemTable {
    return new ItemTable(
      rows.map((row) => {
        const id = row[INDEX_ID];
        const name = names[id] ?? id;
        return {
          id,
          name,
          cost: row[INDEX_COST],
          quality: row[INDEX_QUALITY],
          level: row[INDEX_LEVEL],
          type: row[INDEX_TYPE],
          icon: row[INDEX_ICON],
          search: `${name} ${id}`.toLowerCase(),
        };
      }),
    );
  }

  /** Never returns undefined: an unknown id still needs a row in the UI. */
  get(id: string): ItemInfo {
    return this.byId.get(id) ?? unknown(id);
  }

  /** Gold value of a quantity of an item. */
  value(id: string, qty: number): number {
    return this.get(id).cost * qty;
  }

  /** Substring search over name and id, best (cheapest to type) first. */
  search(query: string, limit = 40): ItemInfo[] {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    const hits = this.all.filter((i) => i.search.includes(q));
    hits.sort((a, b) => {
      // Prefix matches first — typing "flame" should not bury "Flame Elementium".
      const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.cost - a.cost;
    });
    return hits.slice(0, limit);
  }
}

/** Rarity tint, matching the planner's 1–7 quality scale. */
export function qualityColor(quality: number): string {
  const q = Number.isInteger(quality) && quality >= 0 && quality <= 7 ? quality : 0;
  return `var(--quality-${q})`;
}
