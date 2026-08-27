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
 * Icons ship with the app: `icons/items/…`, relative to the renderer's own
 * document.
 *
 * They used to be fetched from the deployed planner, and that made them the one
 * part of an otherwise entirely local overlay that could fail on a machine
 * where everything else worked. Two ways it did:
 *
 *   1. The builder moved to `dota-aow5-utils.duckdns.org` and retired its old
 *      origin with a single splat in `_redirects`, which caught `/icons/*`
 *      along with everything else and rewrote it to an SPA route. Every icon
 *      request came back as 200 `text/html`, and an <img> handed HTML draws a
 *      broken-image glyph and reports nothing — so the only symptom was a panel
 *      that had quietly lost its art on every machine without a warm cache.
 *   2. A player whose resolver would not answer for the art host. Nothing to
 *      clear, nothing to retry, nothing the app could do about it.
 *
 * The staleness argument for keeping them remote was that the art could be
 * refreshed without a release — but the item *tables* are a bundled import from
 * `aow5-shared`, so a new item has always meant a new release, and the icons
 * were never the thing holding that back. Bundling them costs ~14 MB in a 94 MB
 * installer, downloaded once: `electron-updater`'s differential update skips
 * blocks that did not change, and between releases these do not.
 *
 * `scripts/gen-icons.ts` is what puts them there, out of the same
 * `aow5-shared/public/icons` the planner deploys. Relative and not root-
 * relative: a packaged renderer is loaded with `loadFile`, where `/icons/…`
 * resolves against the filesystem root rather than the app.
 */
const ICON_BASE = 'icons/items';

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

  /**
   * Every item of a grade, cheapest first, with either half left open.
   *
   * For browsing rather than finding, which is why it is not `search`: the mute
   * list is filled in by looking at a tier and picking out the drops that
   * arrive by the fistful, and those have no name you would think to type.
   *
   * Cheapest first, against the house style of every other list here. The other
   * lists answer "what carried this session", where this one answers "what is
   * making all the noise" — and the answer to that is at the bottom of the
   * price order, which is exactly what a descending list would push off the end
   * of a capped view.
   */
  grade(quality: number | null, level: number | null): ItemInfo[] {
    const hits = this.all.filter(
      (i) => (quality === null || i.quality === quality) && (level === null || i.level === level),
    );
    // By name after price, so the order is total: two items worth the same gold
    // hold their places instead of reshuffling under a re-render.
    hits.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    return hits;
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
