import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import { BUILDS_PER_PAGE, type BuildSort, type BuildSummary } from 'aow5-api-contract';
import heroesData from 'aow5-shared/public/data/heroes.json';
import { heroIconUrl } from 'aow5-shared/data';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BuildLink } from '@/builds/BuildLink';
import { browseBuilds } from '@/builds/api';
import type { Lang } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { cn } from '@/lib/utils';

/**
 * Finding somebody else's build.
 *
 * Anonymous throughout — browsing and searching never need an account, which is
 * half the design rather than an omission.
 *
 * The filters live in the query string so a search is a link somebody can send.
 * That is safe here for the same reason the planner's board is not: a query
 * string is not the fragment, and `carriesBuildPayload` is tested to be false
 * for every shape this page produces.
 */

/**
 * Top rated first, and listed first.
 *
 * "Newest" on a site this young is whoever published most recently, which is a
 * fact rather than a recommendation — somebody arriving to find a build wants
 * the ones people rated, and the ordering of the tabs should agree with that.
 */
const SORTS: BuildSort[] = ['top', 'new', 'discussed'];
const DEFAULT_SORT: BuildSort = 'top';
const DEBOUNCE_MS = 300;

interface Filters {
  q: string;
  hero: string;
  sort: BuildSort;
}

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    hero: params.get('hero') ?? '',
    sort: SORTS.includes(sort as BuildSort) ? (sort as BuildSort) : DEFAULT_SORT,
  };
}

/**
 * Mirrors the filters into the URL without adding a history entry per keystroke.
 *
 * The page is deliberately not among them. A keyset cursor is an opaque encoding
 * of one row's sort key, so putting it in a shareable URL would hand somebody a
 * link that means nothing once that row moves — and a page *number* cannot be
 * turned back into a cursor without walking to it. A shared search link opens at
 * the first page, which is the page worth sharing anyway.
 */
function writeFilters(filters: Filters): void {
  const params = new URLSearchParams();
  if (filters.q !== '') params.set('q', filters.q);
  if (filters.hero !== '') params.set('hero', filters.hero);
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query === '' ? '' : `?${query}`}`);
}

export function BuildsPage({ site, lang }: { site: SiteStrings; lang: Lang }) {
  const t = site.builds;
  const [filters, setFilters] = useState<Filters>(() => readFilters());
  const [items, setItems] = useState<BuildSummary[]>([]);
  /** Where the *next* page starts, or null when this is the last one. */
  const [cursor, setCursor] = useState<string | null>(null);
  /**
   * The cursor that opened each page visited so far; `[null]` is page one.
   *
   * A stack rather than an offset, because the API pages by keyset: a response
   * says where the next page begins and nothing else. That is deliberate — an
   * OFFSET renumbers, so a build published while somebody reads page three
   * shifts a row from page three onto page four and it is never seen. The cost
   * is that there is no page count and no jumping to page seven: you can only
   * walk to a page, so walking back means remembering how you got here.
   */
  const [trail, setTrail] = useState<Array<string | null>>([null]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const requestId = useRef(0);

  const heroNames = useMemo(() => {
    const entries = heroesData.heroes.map((hero) => {
      const names = hero.names as Record<string, string> | undefined;
      return [hero.id, names?.[lang] ?? hero.short ?? hero.id] as const;
    });
    return new Map(entries);
  }, [lang]);

  const load = useCallback((next: Filters, from: string | null) => {
    const id = (requestId.current += 1);
    setStatus('loading');
    browseBuilds({
      q: next.q,
      hero: next.hero,
      sort: next.sort,
      limit: BUILDS_PER_PAGE,
      ...(from !== null ? { cursor: from } : {}),
    })
      .then((page) => {
        // Only the newest request may write: a slow first search must not land
        // on top of the results for what is now in the box.
        if (id !== requestId.current) return;
        setItems(page.items);
        setCursor(page.cursor);
        setStatus('ready');
      })
      .catch(() => {
        if (id === requestId.current) setStatus('error');
      });
  }, []);

  // Debounced, because this fires per keystroke and the answer for three
  // letters is never worth a round trip.
  useEffect(() => {
    writeFilters(filters);
    const timer = setTimeout(() => {
      // Any change to what is being asked for starts the walk again. Keeping
      // the trail would page a new result set with another one's cursors.
      setTrail([null]);
      load(filters, null);
    }, filters.q === '' ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters, load]);

  const goTo = (direction: 1 | -1) => {
    if (direction === 1) {
      if (cursor === null) return;
      setTrail((previous) => [...previous, cursor]);
      load(filters, cursor);
    } else {
      if (trail.length < 2) return;
      const back = trail[trail.length - 2] ?? null;
      setTrail((previous) => previous.slice(0, -1));
      load(filters, back);
    }
  };

  const set = (patch: Partial<Filters>) => setFilters((previous) => ({ ...previous, ...patch }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight">{t.title}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t.lead}</p>

      {/* Portraits rather than a dropdown, and directly under the lead.
          Hero is the filter people reach for first, and it was the one control
          on the page hidden behind a click — a select shows one name at a time
          and gives no sense of the roster. It is also how the planner has
          always asked the same question, so choosing a hero looks the same
          wherever the site asks it. */}
      <HeroFilter selected={filters.hero} anyLabel={t.anyHero} nameOf={heroNames} onSelect={(hero) => set({ hero })} />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.q}
          onChange={(event) => set({ q: event.target.value })}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {SORTS.map((sort) => (
          <Button
            key={sort}
            variant="ghost"
            size="sm"
            aria-pressed={filters.sort === sort}
            className={cn(filters.sort === sort && 'bg-accent text-accent-foreground')}
            onClick={() => set({ sort })}
          >
            {t.sort[sort]}
          </Button>
        ))}
      </div>

      {status === 'error' && (
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">{t.failed}</p>
          {/* Retries the page you were on, not the first one. */}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => load(filters, trail[trail.length - 1] ?? null)}>
            {t.retry}
          </Button>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className="mt-8 text-muted-foreground">{filters.q === '' ? t.empty : t.emptySearch}</p>
      )}

      {/*
        The list is never emptied to load.

        Switching sort used to blank it, append a "loading" line, then paint the
        new rows — three layout changes for one click. Now the rows that are
        already there stay put and only dim, so the page keeps its height and
        the eye keeps its place.
      */}
      <ul
        aria-busy={status === 'loading'}
        className={cn(
          'mt-6 space-y-3 transition-opacity',
          status === 'loading' && items.length > 0 && 'opacity-60',
        )}
      >
        {items.map((build) => (
          <li key={build.slug} className="rounded-xl border bg-card p-4 text-card-foreground">
            <BuildLink slug={build.slug} className="font-medium break-words hover:underline">
              {build.title}
            </BuildLink>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {t.by} {build.author.nickname}
              </span>
              {build.heroId !== null && <span>{heroNames.get(build.heroId) ?? build.heroId}</span>}
              <span className="flex items-center gap-1 tabular-nums">
                <ThumbsUp className="size-3.5" aria-hidden /> {build.likeCount}
              </span>
              <span className="flex items-center gap-1 tabular-nums">
                <ThumbsDown className="size-3.5" aria-hidden /> {build.dislikeCount}
              </span>
              <span className="flex items-center gap-1 tabular-nums">
                <MessageSquare className="size-3.5" aria-hidden /> {build.commentCount}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* One row, always here, whatever it holds. A footer that appears and
          disappears is the other half of the shift the dimming above removes. */}
      <div className="mt-6 flex h-9 items-center justify-center gap-2">
        {status === 'loading' && items.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t.loading}</span>
        ) : (
          /*
            Both controls stay mounted on a single page of results, disabled
            rather than hidden. A pair of buttons that vanish once there is
            nothing left to page through moves everything under them.
          */
          (trail.length > 1 || cursor !== null) && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={status === 'loading' || trail.length < 2}
                onClick={() => goTo(-1)}
              >
                <ChevronLeft /> {t.previousPage}
              </Button>

              <span className="min-w-24 text-center text-sm text-muted-foreground tabular-nums">
                {t.pageNumber(trail.length)}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={status === 'loading' || cursor === null}
                onClick={() => goTo(1)}
              >
                {t.nextPage} <ChevronRight />
              </Button>
            </>
          )
        )}
      </div>
    </div>
  );
}

/**
 * The roster, as a filter.
 *
 * The planner's `HeroPicker` in miniature, and deliberately the same gesture:
 * click a portrait to narrow to that hero, click it again to clear. It is not
 * that component because the two answer different questions — that one is "who
 * is this build *for*", is never empty by accident, and carries an unresolved
 * roster position from a shared link. This one is a filter that is empty most
 * of the time, so "any" is a state worth showing rather than an absence.
 */
function HeroFilter({
  selected,
  anyLabel,
  nameOf,
  onSelect,
}: {
  /** The chosen hero id, or '' for any. */
  selected: string;
  anyLabel: string;
  nameOf: Map<string, string>;
  onSelect: (hero: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={selected === ''}
        onClick={() => onSelect('')}
        className={cn('h-9', selected === '' && 'bg-accent text-accent-foreground')}
      >
        {anyLabel}
      </Button>

      {heroesData.heroes.map((hero) => {
        const active = hero.id === selected;
        const name = nameOf.get(hero.id) ?? hero.id;
        return (
          <Tooltip key={hero.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={active}
                aria-label={name}
                // Toggling off rather than a second control for "any": the
                // button above says it too, and a click that undoes itself is
                // the shortest way back from a filter you did not mean.
                onClick={() => onSelect(active ? '' : hero.id)}
                className={cn(
                  'relative overflow-hidden rounded-md border-2 transition-all',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  active
                    ? 'border-primary shadow-sm'
                    : 'border-transparent opacity-70 grayscale hover:opacity-100 hover:grayscale-0',
                )}
              >
                <img
                  src={heroIconUrl(hero.icon)}
                  alt=""
                  width={64}
                  height={36}
                  loading="lazy"
                  decoding="async"
                  className="block h-9 w-16 object-cover"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
