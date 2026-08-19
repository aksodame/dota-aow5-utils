import { useEffect, useState } from 'react';
import { loadDetails, loadFull } from 'aow5-shared/data';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';

export interface DetailData {
  full: Record<string, ItemFull> | null;
  detail: Record<string, LocaleDetail> | null;
  loading: boolean;
  error: string | null;
}

/**
 * Lazily pulls the full item records and localized descriptions.
 *
 * Together these are well over a megabyte, so they are deliberately not part of
 * the initial load — the board only needs names and icons. `enabled` defers the
 * fetch until something actually wants to show details, and both loaders cache
 * internally so switching slots costs nothing.
 */
export function useItemDetails(lang: string, enabled: boolean): DetailData {
  const [state, setState] = useState<DetailData>({ full: null, detail: null, loading: false, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([loadFull(), loadDetails(lang)])
      .then(([full, detail]) => {
        if (!cancelled) setState({ full, detail, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            full: null,
            detail: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lang, enabled]);

  return state;
}
