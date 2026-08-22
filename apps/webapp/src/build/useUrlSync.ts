import { useEffect, useRef, useState } from 'react';
import {
  createEmptyState,
  decodeBuild,
  encodeBuild,
  type BuildState,
  type DecodeWarning,
  type HeroTable,
  type IdTable,
} from 'aow5-shared/codec';

/**
 * Keeps the board in sync with `location.hash`.
 *
 * The hash is the single source of truth for sharing, which means writes have
 * to be careful:
 *   - `replaceState`, not `pushState`, so Back does not step through every
 *     keystroke of a section rename.
 *   - debounced, because Safari throttles history writes to roughly 100 per
 *     30 seconds and typing a name would blow straight through that.
 *   - guarded by a `lastWritten` ref so our own write does not come back as a
 *     `hashchange` and fight the reducer. This also makes the effect idempotent
 *     under StrictMode's double-invoke in development.
 */

const WRITE_DEBOUNCE_MS = 250;
const PARAM = 'b';

export interface UrlSyncState {
  /** Decoded from the URL on first load, if there was anything to decode. */
  initial: BuildState | null;
  warnings: DecodeWarning[];
  /** Set when the link uses a codec version this build cannot read. */
  unsupportedVersion: number | null;
  malformed: boolean;
}

/** Reads the payload from the hash, falling back to a `?b=` query parameter. */
function readPayload(): { payload: string; fromQuery: boolean } {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash !== '') {
    const params = new URLSearchParams(hash);
    const fromHash = params.get(PARAM);
    if (fromHash !== null) return { payload: fromHash, fromQuery: false };
    // Tolerate a bare `#<payload>` too.
    if (!hash.includes('=')) return { payload: hash, fromQuery: false };
  }
  const query = new URLSearchParams(window.location.search).get(PARAM);
  if (query !== null) return { payload: query, fromQuery: true };
  return { payload: '', fromQuery: false };
}

/** Decodes whatever is in the URL right now. Safe to call before hydration. */
export function readInitialFromUrl(table: IdTable, heroes?: HeroTable): UrlSyncState {
  if (typeof window === 'undefined') {
    return { initial: null, warnings: [], unsupportedVersion: null, malformed: false };
  }
  const { payload } = readPayload();
  if (payload === '') return { initial: null, warnings: [], unsupportedVersion: null, malformed: false };

  const result = decodeBuild(payload, table, heroes);
  if (!result.ok) {
    return {
      initial: createEmptyState(),
      warnings: [],
      unsupportedVersion: result.reason === 'unsupported-version' ? (result.version ?? 0) : null,
      malformed: result.reason === 'malformed',
    };
  }
  return { initial: result.state, warnings: result.warnings, unsupportedVersion: null, malformed: false };
}

export function useUrlSync(
  state: BuildState,
  table: IdTable | null,
  heroes: HeroTable | null,
  onExternalChange: (state: BuildState) => void,
): void {
  const lastWritten = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the page was opened with `?b=`, move it to the hash so every later
  // share produces the same shape of link.
  useEffect(() => {
    const { payload, fromQuery } = readPayload();
    if (fromQuery && payload !== '') {
      const url = new URL(window.location.href);
      url.searchParams.delete(PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}#${PARAM}=${payload}`);
    }
  }, []);

  // State -> URL.
  useEffect(() => {
    if (!table) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const payload = encodeBuild(state, table, heroes ?? undefined);
      if (payload === lastWritten.current) return;
      lastWritten.current = payload;
      const { pathname, search } = window.location;
      // An untouched board leaves no hash at all, so a fresh visit has a clean URL.
      const next = payload === '' ? `${pathname}${search}` : `${pathname}${search}#${PARAM}=${payload}`;
      window.history.replaceState(null, '', next);
    }, WRITE_DEBOUNCE_MS);

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [state, table, heroes]);

  // URL -> state, for Back/Forward and pasted links.
  useEffect(() => {
    if (!table) return;
    const onHashChange = () => {
      const { payload } = readPayload();
      if (payload === lastWritten.current) return; // our own write echoing back
      const result = decodeBuild(payload, table, heroes ?? undefined);
      if (result.ok) {
        lastWritten.current = payload;
        onExternalChange(result.state);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [table, heroes, onExternalChange]);
}

/**
 * Current shareable URL, recomputed as the board changes.
 *
 * `queryKey` is anything else that lives in the query string — the referral
 * code, today. The link is built from `window.location.search`, so without it
 * the copied URL would keep whatever the search string was when the board last
 * changed.
 */
export function useShareUrl(
  state: BuildState,
  table: IdTable | null,
  heroes: HeroTable | null,
  queryKey?: string,
): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!table) return;
    const payload = encodeBuild(state, table, heroes ?? undefined);
    const { origin, pathname, search } = window.location;
    setUrl(payload === '' ? `${origin}${pathname}${search}` : `${origin}${pathname}${search}#${PARAM}=${payload}`);
  }, [state, table, heroes, queryKey]);
  return url;
}
