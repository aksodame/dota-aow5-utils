import { useSyncExternalStore } from 'react';

/**
 * What the reader says things sell for on the auction.
 *
 * Typed in by hand on an item's page, a box's page or the crafting tree, and
 * read by Crafting to decide whether buying beats crafting. One value per item
 * for the whole site, so it lives here rather than in any page's state, and in
 * `localStorage` so it survives a reload. Nothing is sent anywhere.
 */

const KEY = 'aow5.wiki.auction';

type Prices = Readonly<Record<string, number>>;

const EMPTY: Prices = {};

function read(): Prices {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return EMPTY;
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[id] = value;
    }
    return out;
  } catch {
    // Storage blocked or the JSON is junk: start empty rather than fail.
    return EMPTY;
  }
}

let prices: Prices | null = null;
const listeners = new Set<() => void>();

function snapshot(): Prices {
  if (prices === null) prices = read();
  return prices;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Digits only, capped at a trillion; empty or zero removes the price. */
export function setAuctionPrice(id: string, input: string | number | null): void {
  const digits = input == null ? '' : String(input).replace(/\D/g, '');
  const value = digits === '' ? 0 : Math.min(Number(digits), 1e12);
  const next: Record<string, number> = { ...snapshot() };
  if (value > 0) next[id] = value;
  else delete next[id];
  prices = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not persisted, still used for this visit.
  }
  for (const listener of listeners) listener();
}

/** Every price, as a subscription: re-renders when any of them changes. */
export function useAuctionPrices(): Prices {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** One item's price, or null when the reader has not given one. */
export function useAuctionPrice(id: string): number | null {
  return useAuctionPrices()[id] ?? null;
}
