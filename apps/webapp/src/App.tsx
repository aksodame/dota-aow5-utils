import { useCallback, useEffect, useState } from 'react';
import { AuroraBackground } from '@/components/fx/AuroraBackground';
import { SignInDialog } from '@/auth/SignInDialog';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { STRINGS, detectLang, storeLang, type Lang } from '@/i18n/strings';
import { SITE } from '@/i18n/site';
import { applyTheme, getInitialTheme, storeTheme, type Theme } from '@/lib/theme';
import { useMatch, useScrollReset } from '@/router';
import { BuildPage } from '@/routes/BuildPage';
import { BuildsPage } from '@/routes/BuildsPage';
import { LandingPage } from '@/routes/LandingPage';
import { MyBuildsPage } from '@/routes/MyBuildsPage';
import { PlannerPage } from '@/routes/PlannerPage';
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
    document.title = route === 'planner' ? strings.title : `${site.brand} — ${site.landing.title}`;
  }, [route, strings.title, site]);

  const chooseLang = useCallback((next: Lang) => {
    setLang(next);
    storeLang(next);
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
      </div>

      {/* Mounted once here, opened only by the header. */}
      <SignInDialog site={site} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
