import meta from 'aow5-shared/public/data/meta.json';
import { GithubMark } from '@/components/GithubMark';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { LANGUAGES, type Lang } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { REPO_URL } from '@/lib/links';
import type { Theme } from '@/lib/theme';
import { Link, type RouteId } from '@/router';
import { cn } from '@/lib/utils';

interface Props {
  site: SiteStrings;
  route: RouteId;
  lang: Lang;
  theme: Theme;
  onLang: (lang: Lang) => void;
  onTheme: () => void;
}

/**
 * The bar that stays, on all three pages.
 *
 * Language and theme live here rather than on the planner, which is where they
 * used to be: they are preferences for the site, and a visitor who set them on
 * the front page should not find them missing one click later.
 *
 * The offered languages are still the ones the extraction actually produced.
 * The planner used to read that from the data it had fetched; the header has
 * fetched nothing, so it reads the same field out of `meta.json` at build time.
 */
export function SiteHeader({ site, route, lang, theme, onLang, onTheme }: Props) {
  const languages = LANGUAGES.filter((l) => (meta.languages as string[]).includes(l));

  const nav: { to: RouteId; label: string }[] = [
    { to: 'landing', label: site.nav.home },
    { to: 'planner', label: site.nav.planner },
    { to: 'tracker', label: site.nav.tracker },
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        {/* Home is a nav link like the other two rather than a wordmark. A
            logo that is also the way back to the front page is a convention,
            not a signpost — this says where it goes. */}
        <nav aria-label={site.brand} className="flex items-center gap-1">
          {nav.map((entry) => (
            <Button
              key={entry.to}
              variant="ghost"
              size="sm"
              asChild
              // `aria-current` rather than colour alone: which page you are on
              // is information, not decoration.
              className={cn(route === entry.to && 'bg-accent text-accent-foreground')}
            >
              <Link to={entry.to} aria-current={route === entry.to ? 'page' : undefined}>
                {entry.label}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* The mark alone. It is a link nobody needs a word to recognise,
              and the label it used to show is now its accessible name. */}
          <Button variant="ghost" size="icon" asChild>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={site.nav.source}
              title={site.nav.source}
            >
              <GithubMark />
            </a>
          </Button>
          {languages.length > 1 && (
            <LanguageSwitcher languages={languages} active={lang} label={site.language} onSelect={onLang} />
          )}
          <ThemeToggle theme={theme} label={site.theme} onToggle={onTheme} />
        </div>
      </div>
    </header>
  );
}
