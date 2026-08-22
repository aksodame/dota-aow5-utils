import { useCallback, useEffect, useState } from 'react';
import { AuroraBackground } from '@/components/fx/AuroraBackground';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { STRINGS, detectLang, storeLang, type Lang } from '@/i18n/strings';
import { SITE } from '@/i18n/site';
import { applyTheme, getInitialTheme, storeTheme, type Theme } from '@/lib/theme';
import { useRoute, useScrollReset } from '@/router';
import { LandingPage } from '@/routes/LandingPage';
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
  const route = useRoute();
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  const strings = STRINGS[lang];
  const site = SITE[lang];

  useScrollReset(route);

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

      <SiteHeader
        site={site}
        route={route}
        lang={lang}
        theme={theme}
        onLang={chooseLang}
        onTheme={toggleTheme}
      />

      <main id="main">
        {route === 'planner' && <PlannerPage lang={lang} strings={strings} />}
        {route === 'tracker' && <TrackerPage site={site} lang={lang} />}
        {route === 'landing' && <LandingPage site={site} lang={lang} />}
      </main>

      <SiteFooter site={site} />

      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
