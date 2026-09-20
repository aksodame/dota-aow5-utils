import { useCallback, useMemo } from 'react';
import { Notice } from '@/ui';
import { AppDataProvider, useApp } from '@/data/AppData';
import { SiteFooter } from '@/components/SiteFooter';
import { TopBar } from '@/components/TopBar';
import type { FilterState } from '@/components/Filters';
import { BrowsePage } from '@/routes/BrowsePage';
import { BuildPage } from '@/routes/BuildPage';
import { EditorPage } from '@/routes/EditorPage';
import { MyCreationsPage } from '@/routes/MyCreationsPage';
import { SettingsPage } from '@/routes/SettingsPage';
import { ItemPage } from '@/routes/ItemPage';
import { ItemsPage } from '@/routes/ItemsPage';
import { ViewPage } from '@/routes/ViewPage';
import { TrackerPage } from '@/routes/TrackerPage';
import { navigateTo, pathOf, useMatch, useScrollReset, useSearch } from '@/router';
import { browseSearch, readBrowseParams, type BrowseQueryState } from '@/lib/browseParams';
import { LANG_PARAM } from '@/i18n/strings';
import { useDocumentMeta } from '@/lib/meta';
import type { MetaTarget } from 'aow5-shared/seo';
import styles from './App.module.css';

/**
 * The shell the pages draw inside.
 *
 * It owns exactly what is true of more than one page and belongs to none of
 * them: the top bar, the footer, and the browse query — filters and search
 * text — which survives navigating to a build and back.
 *
 * Every page gets the same chrome, the build page included. It was the one
 * exception for a while, on the argument that a row of tabs over something
 * somebody wrote to be read is an invitation to leave before reading it. In
 * practice the cost landed elsewhere: arriving on a shared build link put you
 * on a page with no way to reach the rest of the site, no language switcher and
 * nowhere to sign in — and the back link only helps if you got there from the
 * list in the first place.
 */
export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}

function Shell() {
  const match = useMatch();
  const search = useSearch();
  const { strings, coreError, lang } = useApp();

  /*
   * The browse query lives in the URL, not in state here.
   *
   * It used to be `useState`, which survived navigating to a build and back and
   * nothing else: a reload dropped it, the address bar never said what was on
   * screen, and a filtered list could not be sent to anybody. Reading it from
   * `location.search` gets all three for free, and `useSearch` re-renders on
   * every navigation — including the ones this component causes.
   */
  const browse = useMemo(() => readBrowseParams(search), [search]);

  /*
   * `replace`, not push.
   *
   * Every keystroke in the search box and every map ticked is a change of
   * query, and pushing each one would make Back walk letter by letter out of
   * a search instead of leaving the page. Replacing means the browse entry is
   * rewritten in place — so Back from a build still returns to the list *with*
   * its filters, which is the case that matters.
   */
  const setBrowse = useCallback(
    (next: BrowseQueryState) => {
      /*
       * `browseSearch` writes the whole query string, so anything it does not
       * own would be dropped by a filter change. `?lang=` is carried across
       * deliberately: it is a preference somebody may have put in the link, and
       * losing it the moment they tick a room would be a link that stops
       * meaning what it said.
       *
       * `?auth=` is *not* carried, and that is the same decision read the other
       * way — it is a one-shot from the Steam callback, and a URL that keeps
       * saying "sign-in failed" long after it did is worse than one that
       * forgets.
       */
      const search = new URLSearchParams(browseSearch(next));
      const language = new URLSearchParams(window.location.search).get(LANG_PARAM);
      if (language !== null) search.set(LANG_PARAM, language);

      const encoded = search.toString();
      navigateTo(`${pathOf('browse')}${encoded === '' ? '' : `?${encoded}`}`, { replace: true });
    },
    [],
  );

  const onFilters = useCallback(
    (next: FilterState) => setBrowse({ ...next, q: browse.q }),
    [setBrowse, browse.q],
  );
  const onSearch = useCallback((next: string) => setBrowse({ ...browse, q: next }), [setBrowse, browse]);

  useScrollReset(`${match.id}:${match.slug ?? match.itemId ?? ''}`);

  /*
   * Steam sends people back to `/` with `?auth=failed` or `?auth=banned` when
   * it declined, because the callback is a redirect and has no page of its own
   * to say so on.
   */
  const authProblem = useMemo(() => {
    const value = new URLSearchParams(search).get('auth');
    if (value === 'failed') return strings.auth.failed;
    if (value === 'banned') return strings.auth.banned;
    return null;
  }, [search, strings]);

  /*
   * The title, the description and the social tags, per route.
   *
   * This used to be `document.title = strings.brand`, which made every tab,
   * bookmark and history entry on the site read the same three words. A build's
   * own meta is not set here: it needs the build, which `BuildPage` has and this
   * does not, so that route passes `null` and the page owns its own head. See
   * `lib/meta.ts`.
   */
  const meta = useMemo<MetaTarget | null>(
    // `build` and `item` both need a record this component does not have, so
    // those two pages own their own head. Everything else is a static route.
    () => (match.id === 'build' || match.id === 'item' ? null : { kind: match.id }),
    [match.id],
  );
  useDocumentMeta(meta, lang);

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        {strings.nav.browse}
      </a>

      <TopBar match={match} />

      <main id="main" className={styles.main}>
        {coreError !== null && (
          <Notice tone="error" title={strings.browse.failed}>
            {coreError}
          </Notice>
        )}

        {authProblem !== null && <Notice tone="error" title={authProblem} />}

        {match.id === 'browse' && (
          <BrowsePage filters={browse} query={browse.q} onFilters={onFilters} onSearch={onSearch} />
        )}
        {match.id === 'mine' && <MyCreationsPage />}
        {match.id === 'edit' && <EditorPage />}
        {match.id === 'view' && <ViewPage />}
        {match.id === 'settings' && <SettingsPage />}
        {match.id === 'tracker' && <TrackerPage />}
        {match.id === 'build' && match.slug !== undefined && <BuildPage slug={match.slug} />}
        {match.id === 'items' && <ItemsPage />}
        {match.id === 'item' && match.itemId !== undefined && <ItemPage itemId={match.itemId} />}
      </main>

      <SiteFooter />
    </div>
  );
}
