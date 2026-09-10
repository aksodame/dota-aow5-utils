import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeUser } from 'aow5-api-contract';
import { loadCore, type CoreData } from 'aow5-shared/data';
import { makeIdTable, type HeroTable, type IdTable } from 'aow5-shared/codec';
import { getMe, signOut as postSignOut } from '@/builds/api';
import { readSignedInHint, writeSignedInHint } from '@/lib/session';
import { ItemDetailsProvider } from './ItemDetailsProvider';
import { detectLang, storeLang, LANG_PARAM, STRINGS, type Lang, type Strings } from '@/i18n/strings';

/**
 * The three things every screen needs and none of them owns: the game data, the
 * viewer, and the language a visitor picks once for the site.
 *
 * One context rather than three, because they are always read together and a
 * screen that has one without the others cannot render anyway. The game data is
 * the reason this exists at all — `items.index.json` is 97 kB and `heroes.json`
 * another 60, and fetching them per page would be absurd.
 */

interface AppData {
  lang: Lang;
  setLang: (lang: Lang) => void;
  strings: Strings;

  /** null while loading, then the extracted data for the active language. */
  core: CoreData | null;
  coreError: string | null;
  /** The frozen tables in the shape the codec wants. Null until `core` arrives. */
  tables: { items: IdTable; heroes: HeroTable } | null;

  /** null when signed out, undefined while the first `/me` is in flight. */
  me: MeUser | null | undefined;
  /**
   * Whether to draw the parts of the site that only exist for an account.
   *
   * `me != null` once `/me` has answered, and the *remembered* answer from the
   * last visit before that. It exists because `me === undefined` is a third
   * state with no honest rendering: treating it as signed out makes the My
   * Creations tab pop into the bar a moment after the rest of it, and treating
   * it as signed in does the same in reverse for a visitor with no account.
   *
   * Only ever gates chrome. Anything that matters — the redirect off My
   * Creations, every request — waits for `me` itself.
   */
  hasAccount: boolean;
  /** Re-reads `/me`. Called after publishing, deleting, and signing in. */
  refreshMe: () => void;
  signOut: () => Promise<void>;
}

const Context = createContext<AppData | null>(null);

export function useApp(): AppData {
  const value = useContext(Context);
  if (value === null) throw new Error('useApp outside AppDataProvider');
  return value;
}

/** The game data, or a thrown-away render. Convenience for screens that require it. */
export function useCore(): CoreData | null {
  return useApp().core;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang());
  const [core, setCore] = useState<CoreData | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [me, setMe] = useState<MeUser | null | undefined>(undefined);
  const [meNonce, setMeNonce] = useState(0);
  /*
   * Read once, at mount, so the very first render already has it. Read on every
   * render it would be a source of truth competing with `me`.
   */
  const [signedInBefore] = useState(readSignedInHint);

  /*
   * Reloaded when the language changes, because the names are joined onto the
   * data at load time rather than looked up per render — a grid of fifteen
   * tiles should not do fifteen map lookups on every paint.
   */
  useEffect(() => {
    let cancelled = false;
    setCoreError(null);
    loadCore(lang)
      .then((data) => {
        if (!cancelled) setCore(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCoreError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    const controller = new AbortController();
    getMe(controller.signal)
      .then((response) => {
        setMe(response.user);
        writeSignedInHint(response.user !== null);
      })
      // A failed /me is "not signed in" as far as the UI is concerned: every
      // screen works signed out, and an error banner over a browse list because
      // one request lost a race would be noise. The hint is left alone here:
      // a request that never arrived is not evidence about the session, and
      // clearing it would make one flaky load cost the next one its first paint.
      .catch(() => {
        if (!controller.signal.aborted) setMe(null);
      });
    return () => controller.abort();
  }, [meNonce]);

  // `lang` on the document as well as in React, so the browser hyphenates and
  // a screen reader pronounces the Russian copy as Russian.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    storeLang(next);

    /*
     * And into the URL, so the page can be shared as it is being read.
     *
     * `replaceState` rather than a router navigation: the language is not a
     * different page, and pushing an entry would make Back step through
     * somebody changing their mind rather than leave the page. Written
     * directly for the same reason — the router's `navigateTo` announces a
     * navigation, and nothing here has navigated.
     */
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(LANG_PARAM, next);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // A URL this browser will not parse is not worth failing a click over.
    }
  }, []);

  const refreshMe = useCallback(() => setMeNonce((n) => n + 1), []);

  const signOut = useCallback(async () => {
    await postSignOut();
    setMe(null);
    writeSignedInHint(false);
  }, []);

  /*
   * The codec's tables, derived from what the browser loaded rather than from
   * the frozen files. The browser only ships playable items, so this table has
   * holes where hidden ones were — which is correct: a link pointing at one
   * must decode as unknown and re-encode unchanged, not resolve to ''.
   */
  const tables = useMemo(() => {
    if (core === null) return null;
    return {
      items: makeIdTable(core.ids, core.meta.idTableHash),
      heroes: {
        abilityIds: core.heroes.abilityIds,
        heroIds: core.heroes.heroIds,
        mapIds: core.maps.mapIds,
      } satisfies HeroTable,
    };
  }, [core]);

  const value = useMemo<AppData>(
    () => ({
      lang,
      setLang,
      strings: STRINGS[lang],
      core,
      coreError,
      tables,
      me,
      hasAccount: me === undefined ? signedInBefore : me !== null,
      refreshMe,
      signOut,
    }),
    [lang, setLang, core, coreError, tables, me, signedInBefore, refreshMe, signOut],
  );

  /*
   * The item-details store is nested inside rather than merged in, because it
   * is lazy: it holds over a megabyte and must not be fetched until a hover
   * asks for it. Keeping it a separate provider is what lets `useApp` stay
   * something every screen reads on mount.
   */
  return (
    <Context.Provider value={value}>
      <ItemDetailsProvider lang={lang} byId={core?.byId ?? EMPTY_ITEMS}>
        {children}
      </ItemDetailsProvider>
    </Context.Provider>
  );
}

/** Stable identity, so the details provider does not remount before data lands. */
const EMPTY_ITEMS = new Map<string, never>();
