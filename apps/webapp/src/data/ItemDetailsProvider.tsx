import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import type { ItemSummary } from 'aow5-shared/data';
import { useItemDetails } from './useItemDetails';

export interface ItemDetailsStore {
  full: Record<string, ItemFull> | null;
  detail: Record<string, LocaleDetail> | null;
  loading: boolean;
  error: string | null;
  /** Every playable item by id, for naming the parts of a recipe. */
  byId: Map<string, ItemSummary>;
  /**
   * Ask for the heavy files. Idempotent and cheap — call it from a hover.
   */
  request: () => void;
}

const ItemDetailsContext = createContext<ItemDetailsStore | null>(null);

/**
 * One copy of the full item records for the whole board.
 *
 * Both places that show stats — the picker's detail pane and a slot's hover
 * card — read from here rather than each pulling the files themselves. That
 * matters because they are over a megabyte together: two independent loaders
 * racing on the first hover would fetch them twice, and a hundred slot tiles
 * each holding their own copy of the loading state would be a hundred effects
 * to no purpose. The fetch still waits for somebody to actually want it.
 */
export function ItemDetailsProvider({
  lang,
  byId,
  children,
}: {
  lang: string;
  byId: Map<string, ItemSummary>;
  children: ReactNode;
}) {
  const [wanted, setWanted] = useState(false);
  const data = useItemDetails(lang, wanted);
  const request = useCallback(() => setWanted(true), []);

  const value = useMemo<ItemDetailsStore>(() => ({ ...data, byId, request }), [data, byId, request]);

  return <ItemDetailsContext.Provider value={value}>{children}</ItemDetailsContext.Provider>;
}

/**
 * The shared store, or null outside a provider.
 *
 * Null is a real answer rather than an error: a slot rendered somewhere that
 * has no business loading a megabyte of stats falls back to its short tooltip.
 */
export function useItemDetailsStore(): ItemDetailsStore | null {
  return useContext(ItemDetailsContext);
}
