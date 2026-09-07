import { useCallback, useEffect, useState } from 'react';
import meta from 'aow5-shared/public/data/meta.json';
import { AuroraBackground } from '@/components/fx/AuroraBackground';
import { SignInDialog } from '@/auth/SignInDialog';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LANGUAGES, STRINGS, detectLang, storeLang, writeLang, type Lang } from '@/i18n/strings';
import { SITE } from '@/i18n/site';
import { ReportNoticeDialog } from '@/report/ReportNoticeDialog';
import { SupportMailBar } from '@/report/SupportMailBar';
import { isReportEnabled } from '@/lib/report';
import { applyTheme, getInitialTheme, storeTheme, type Theme } from '@/lib/theme';
import { useMatch, useScrollReset } from '@/router';
import { BuildPage } from '@/routes/BuildPage';
import { BuildsPage } from '@/routes/BuildsPage';
import { LandingPage } from '@/routes/LandingPage';
import { MyBuildsPage } from '@/routes/MyBuildsPage';
import { PlannerPage } from '@/routes/PlannerPage';
import { ReportPage } from '@/routes/ReportPage';
import { TrackerPage } from '@/routes/TrackerPage';

/**
 * The shell the three pages draw inside.
 *
 * It owns exactly what is true of every page and belongs to none of them: the
 * colour wash, the header and footer, the tooltip and toast layers, and the
 * two preferences — language and theme — that a visitor sets once for the
 * site rather than per page.
 *
 * The planner is imported directly rather than lazily. It is the page most
 * visitors are here for, its own data arrives over the network anyway, and a
 * split would trade a fast first click for a smaller bundle on a site that is
 * already one small bundle.
 */
export default function App() {
  const match = useMatch();
  const route = match.id;

  /*
   * Whose build is on screen, so the header can light the list it came from.
   *
   * Owned here rather than read from a store, because App already renders both
   * halves and the answer arrives with the fetch. Cleared on every navigation
   * so the previous build's answer never colours the next page.
   */
  const [viewingOwnBuild, setViewingOwnBuild] = useState<boolean | null>(null);
  useEffect(() => {
    if (route !== 'build') setViewingOwnBuild(null);
  }, [route, match.slug]);
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  const strings = STRINGS[lang];
  const site = SITE[lang];

  // The languages the extraction actually produced, the same filter the header
  // applies — the notice offers a switcher too, and the two must agree.
  const languages = LANGUAGES.filter((l) => (meta.languages as string[]).includes(l));

  // Keyed on the slug too, so moving between two builds scrolls to the top.
  useScrollReset(`${route}:${match.slug ?? ''}` as never);

  // `lang` on the document as well as in React, so the browser hyphenates and
  // a screen reader pronounces the Russian copy as Russian.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // index.html already applied the stored theme before first paint; this keeps
  // the class in step with the toggle afterwards.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (route === 'planner') document.title = strings.title;
    else if (isReportEnabled && route === 'report') document.title = `${site.brand} — ${site.report.title}`;
    else document.title = `${site.brand} — ${site.landing.title}`;
  }, [route, strings.title, site]);

  const chooseLang = useCallback((next: Lang) => {
    setLang(next);
    storeLang(next);
    // Also into the URL, so the page can be shared in the language it is being
    // read in. `Link` and `navigate` carry it from there.
    writeLang(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      storeTheme(next);
      return next;
    });
  }, []);

  return (
    // 300ms, the planner's delay: its board is a grid of tiles that all have
    // tooltips, and a zero delay there fires one on every pass of the cursor.
    <TooltipProvider delayDuration={300}>
      <AuroraBackground />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {site.skipToContent}
      </a>

      {/*
        A column at least as tall as the viewport, with the main region taking
        up the slack.

        Without it the footer simply follows the content, so anything that
        changes how much content there is — switching a sort, a search that
        matches three builds instead of twenty — drags the footer up into the
        middle of the screen and back down again. Pinning it to the bottom of a
        full-height column means it either sits at the bottom edge or below the
        fold, and never anywhere in between.

        `svh` rather than `dvh` or `vh`: the small viewport height is the one
        that does not change as a mobile browser hides and shows its own chrome,
        so the layout does not reflow while somebody is scrolling.
      */}
      <div className="flex min-h-svh flex-col">
        <SiteHeader
          site={site}
          route={route}
          lang={lang}
          theme={theme}
          onLang={chooseLang}
          onTheme={toggleTheme}
          viewingOwnBuild={viewingOwnBuild}
        />

        <main id="main" className="flex-1">
          {route === 'planner' && <PlannerPage lang={lang} strings={strings} site={site} />}
          {route === 'tracker' && <TrackerPage site={site} lang={lang} />}
          {/* `routeAt` never yields `report` while the flag is off, so this is
              already unreachable — the guard is here so the page's absence is
              stated where the pages are listed, rather than only in the route
              table. */}
          {isReportEnabled && route === 'report' && <ReportPage site={site} lang={lang} />}
          {route === 'landing' && <LandingPage site={site} lang={lang} />}
          {route === 'builds' && <BuildsPage site={site} lang={lang} />}
          {route === 'mine' && <MyBuildsPage site={site} />}
          {route === 'build' && match.slug !== undefined && (
            <BuildPage
              slug={match.slug}
              site={site}
              strings={strings}
              lang={lang}
              onOwnershipKnown={setViewingOwnBuild}
            />
          )}
        </main>

        <SiteFooter site={site} />

        {/* Inside the column rather than floating over it, so the spacer it
            renders keeps the fixed bar off the end of whatever page is on
            screen — the footer's attribution, or the planner's bottom row.

            Down with the report. The bar's whole content is a letter that links
            to `/report` and asks the reader to press the developer about it; the
            developer is now working through exactly that material by agreement,
            and the green strip in the header says so. Keeping the bar up would
            be both a dead link and the opposite message. */}
        {isReportEnabled && <SupportMailBar site={site} lang={lang} />}
      </div>

      {/* Mounted once here, opened only by the header. */}
      <SignInDialog site={site} />

      {/* Mounted once here too, and open for anybody whose last acknowledgement
          has expired — except on the report itself, where a notice whose whole
          purpose is to point at the report would be standing between the reader
          and the thing they came for. It reappears on the next page they open,
          because the store keeps its own timer either way.

          And not at all while the report is down: a blocking modal that asks a
          visitor to tick two boxes about a document they cannot open would be a
          toll gate on nothing. */}
      {isReportEnabled && route !== 'report' && (
        <ReportNoticeDialog site={site} lang={lang} languages={languages} onLang={chooseLang} />
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
