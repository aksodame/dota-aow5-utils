import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildSummary } from 'aow5-api-contract';
import { BUILDS_PER_PAGE } from 'aow5-api-contract';
import { Button, Icon, Input, Notice, Panel } from '@/ui';
import { useApp } from '@/data/AppData';
import { browseBuilds, type BrowseQuery } from '@/builds/api';
import { BuildRow } from '@/components/BuildRow';
import { BuildRowSkeleton } from '@/components/BuildRowSkeleton';
import { Filters, type FilterState } from '@/components/Filters';
import { windowsFor } from '@/lib/windows';
import { useDebounced } from '@/lib/useDebounced';
import { useVirtualRows } from './useVirtualRows';
import styles from './BrowsePage.module.css';

/**
 * The front page: filters on the left, builds on the right.
 *
 * ## The list is virtualised
 *
 * The scroller is given the height of the *whole* list — every row is the same
 * height, so that is exact arithmetic rather than an estimate — and only the
 * rows near the viewport are rendered. The scrollbar is therefore the right
 * size and in the right place from the first paint, and dragging it lands on a
 * row index rather than somewhere a loader would have to walk to.
 *
 * That is why the API pages by offset rather than by cursor. A cursor can only
 * answer "what comes after this row", which is enough for a list you read
 * downwards and useless for one you can drag into the middle of. The cost is
 * the guarantee keyset gave: a build published while somebody reads shifts
 * every row after it, so a row can move between two windows and be missed.
 * Small here — publishing is capped at five builds a person, and the default
 * sort is by likes rather than by recency.
 *
 * Windows are fetched on demand and cached by index. A row that has not
 * arrived draws as a skeleton in its own place, so scrolling into unloaded
 * territory shows the shape of what is coming rather than empty space.
 */

/** Rows per request. Windows are aligned to this, so they tile rather than overlap. */
const WINDOW = BUILDS_PER_PAGE;

/**
 * How long the scroll has to settle before a window is asked for.
 *
 * Dragging the scrollbar from top to bottom passes over every window in the
 * list, and without this it would ask for all of them — dozens of requests for
 * rows nobody stopped to look at. Waiting for the drag to end means one request
 * for where it actually landed. Short enough that an ordinary scroll never
 * notices, because the overscan covers the gap.
 */
const SETTLE_MS = 180;

/**
 * How long the *query* has to stop changing before it is asked for.
 *
 * A different wait from `SETTLE_MS` above, and for a different reason: that one
 * is about scrolling past windows nobody stopped at, this one is about
 * assembling a query. Picking four rooms out of a tier is four clicks and one
 * question, and typing a word is six keystrokes and one question.
 *
 * A whole second, which is long for a click. It is what makes a sequence of
 * facet changes cost one request instead of four, and the list says so while it
 * waits: the skeletons appear on the first click rather than after the last, so
 * the delay reads as loading rather than as lag.
 */
const QUERY_DEBOUNCE_MS = 1000;

export function BrowsePage({
  filters,
  query,
  onFilters,
  onSearch,
}: {
  filters: FilterState;
  query: string;
  onFilters: (next: FilterState) => void;
  onSearch: (query: string) => void;
}) {
  const { strings, core } = useApp();
  const [draft, setDraft] = useState(query);

  /*
   * Adopts the query when it changes from outside — clearing the filters, or
   * arriving with one already applied. Without this the box keeps showing what
   * was typed after the list has moved on.
   */
  useEffect(() => setDraft(query), [query]);

  /** Rows by absolute index. Sparse: only the windows fetched so far. */
  const [rows, setRows] = useState<Map<number, BuildSummary>>(() => new Map());
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const {
    ref: scrollerRef,
    range,
    visible: onScreen,
    totalHeight,
    offsetOf,
    rowHeight,
    perScreen,
    scrollToTop,
  } = useVirtualRows(total);

  /*
   * Bumped whenever the query changes. Every response checks it before writing,
   * so a window belonging to a filter no longer on screen cannot land in the
   * map — the abort covers most of that, this covers the race.
   */
  const generation = useRef(0);
  /** Windows already fetched or in flight, by their first index. */
  const requested = useRef(new Set<number>());

  const filterKey =
    `${filters.sort}|${filters.hero ?? ''}|${filters.tiers.join(',')}|${filters.maps.join(',')}|${query}`;
  const settledKey = useDebounced(filterKey, QUERY_DEBOUNCE_MS);
  /*
   * A request is coming but has not been made. The list draws skeletons for
   * this exactly as it does for one in flight — from the reader's side they are
   * the same thing, and the alternative is a second of stale results that look
   * like an answer to the filter just changed.
   */
  const pending = filterKey !== settledKey;

  /**
   * Which settled query the rows on screen were fetched for.
   *
   * `null` until the first window lands. Written in the same batch as the reset
   * below, so it is never ahead of the rows it describes.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  /**
   * The rows in hand answer a query that is no longer the one being asked.
   *
   * This is one render wide and it was visible: `pending` goes false the moment
   * the debounce settles, and the effect that throws the old rows away runs
   * *after* that render has painted — so the list flashed the previous filter's
   * builds between the skeletons and the new ones, which read as the list
   * loading twice. Comparing what the rows were fetched for against what is
   * being asked for closes the gap in the render that opens it, rather than in
   * an effect that is by definition too late.
   *
   * Not a `useLayoutEffect` on the reset, which would also close it: that
   * blocks the paint to run a fetch's worth of setup, and the honest statement
   * here is about what the rows *are*, not about when to run.
   */
  const stale = loadedKey !== settledKey;

  const baseQuery = useCallback(
    (): BrowseQuery => ({
      sort: filters.sort,
      limit: WINDOW,
      ...(query !== '' ? { q: query } : {}),
      ...(filters.hero !== undefined ? { hero: filters.hero } : {}),
      ...(filters.tiers.length > 0 ? { tiers: filters.tiers } : {}),
      ...(filters.maps.length > 0 ? { maps: filters.maps } : {}),
    }),
    [filters.sort, filters.hero, filters.tiers, filters.maps, query],
  );

  /** Fetches one window and files its rows at their own indices. */
  const fetchWindow = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      const mine = generation.current;
      requested.current.add(offset);

      try {
        const slice = await browseBuilds({ ...baseQuery(), offset }, signal);
        if (generation.current !== mine) return;
        setTotal(slice.total);
        setRows((prev) => {
          const next = new Map(prev);
          // Filed under the offset the *server* reports rather than the one
          // asked for: they agree today, and trusting the response keeps them
          // agreeing if the server ever clamps one.
          slice.items.forEach((item, i) => next.set(slice.offset + i, item));
          return next;
        });
      } catch (error) {
        // Dropped from the set so scrolling past it again retries, rather than
        // leaving a permanent hole where one request happened to fail.
        if (generation.current === mine) requested.current.delete(offset);
        throw error;
      }
    },
    [baseQuery],
  );

  // A different query is a different list: forget every row and start again.
  useEffect(() => {
    const mine = ++generation.current;
    const controller = new AbortController();
    requested.current = new Set();
    setState('loading');
    setRows(new Map());
    setTotal(0);
    setLoadedKey(settledKey);
    scrollToTop();

    fetchWindow(0, controller.signal)
      .then(() => {
        if (generation.current === mine) setState('ready');
      })
      .catch(() => {
        if (generation.current === mine && !controller.signal.aborted) setState('failed');
      });

    return () => controller.abort();
    // Keyed on the *settled* query: `baseQuery` and `fetchWindow` change
    // identity with `filters.maps` on every render of the sidebar, and the
    // live key would fire this on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledKey]);

  /*
   * Whatever the visible range needs and has not got, once the scroll settles.
   *
   * Windows are aligned to `WINDOW`, so two overlapping ranges ask for the same
   * window rather than two offset ones — which is what makes `requested` a
   * useful guard rather than a set that grows without bound.
   *
   * The timeout is cleared by this effect's own cleanup, so a scroll that keeps
   * moving keeps postponing the request rather than firing one per window it
   * passes over.
   *
   * Keyed on the *visible* range rather than the rendered one. The overscan
   * exists so a fast scroll has rows ready to draw, and a skeleton for four
   * rows past the edge of the box is a fair thing to show; a request for them
   * is not, and on mount it was a second window fetched before the first
   * screen had been read.
   */
  useEffect(() => {
    if (state !== 'ready' || pending || rows.size >= total) return;

    const missing = windowsFor(onScreen.start, onScreen.end, WINDOW, total).filter(
      (offset) => !requested.current.has(offset),
    );
    if (missing.length === 0) return;

    const timer = window.setTimeout(() => {
      for (const offset of missing) {
        void fetchWindow(offset).catch(() => {
          /* Shown by the row staying a skeleton; scrolling past it asks again. */
        });
      }
    }, SETTLE_MS);

    return () => window.clearTimeout(timer);
    // `rows.size` guards the whole effect: once every row is in, there is
    // nothing left to ask for and the list stops watching its own scroll.
  }, [onScreen.start, onScreen.end, state, pending, total, rows.size, fetchWindow]);

  const visible = useMemo(() => {
    const out: Array<{ index: number; build: BuildSummary | undefined }> = [];
    for (let i = range.start; i <= range.end; i += 1) out.push({ index: i, build: rows.get(i) });
    return out;
  }, [range.start, range.end, rows]);

  const retry = useCallback(() => onFilters({ ...filters }), [filters, onFilters]);

  /*
   * The list is showing outlines rather than builds: the first load, a filter
   * whose request has not been made yet, rows belonging to the filter before
   * it, or the game data still arriving.
   *
   * One flag for the list and the line above it, because they answer the same
   * question and reading them from two conditions is how they came apart.
   */
  const loadingList = state === 'loading' || pending || stale || core === null;

  return (
    <div className={styles.page}>
      <Filters value={filters} onChange={onFilters} />

      {/*
        The list column: its own search bar, then the scrolling list. Siblings,
        so the sidebar's first line and the search bar's line up.
      */}
      <div className={styles.column}>
        {/*
          No button. The search runs on what has been typed, a second after
          typing stops — so pressing one would only ever mean "do it now", and a
          control whose whole purpose is to skip a wait is worth less than the
          width it takes. Enter still submits, which is what the form is for:
          it costs nothing and it is what a keyboard expects.
        */}
        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(draft.trim());
          }}
        >
          <Icon.Search size={16} className={styles.searchIcon} />
          <Input
            className={styles.searchInput}
            type="search"
            value={draft}
            placeholder={strings.browse.search}
            aria-label={strings.browse.search}
            onChange={(event) => {
              setDraft(event.target.value);
              onSearch(event.target.value.trim());
            }}
          />
        </form>

        {/*
          How many builds match the filters, and nothing about loading. It read
          `10 / 52` while windows were still arriving, which is a fact about
          this page's fetching rather than about the list — and it changed as
          you scrolled, which made it look like the filter was moving.
        */}
        {loadingList ? (
          /*
            A bone, not nothing. Removing the line while the next answer is on
            its way moved the whole list up a line and back down again on every
            filter change — and an empty space where a number was reads as "no
            builds" rather than as "counting".
          */
          <p className={styles.count} aria-hidden>
            <span className={styles.countBone} />
          </p>
        ) : (
          state === 'ready' &&
          total > 0 && (
            <p className={styles.count}>
              {total} {strings.browse.builds}
            </p>
          )
        )}

        <Panel flush>
          {/*
            A screenful of skeletons rather than a spinner. The list is about to
            be rows of a known height, so showing that shape immediately means
            the panel does not resize when they arrive — and the game data has
            to be in before a row can draw a portrait, which is the same wait.
          */}
          {loadingList ? (
            <div className={styles.scroller} aria-busy>
              {Array.from({ length: perScreen }, (_, i) => (
                <div key={i} className={styles.placeholder}>
                  <BuildRowSkeleton />
                </div>
              ))}
            </div>
          ) : state === 'failed' ? (
            <Notice tone="error" title={strings.browse.failed}>
              <Button variant="solid" size="sm" onClick={retry}>
                {strings.common.retry}
              </Button>
            </Notice>
          ) : total === 0 ? (
            <Notice title={strings.browse.empty}>{strings.browse.emptyHint}</Notice>
          ) : (
            <div className={styles.scroller} ref={scrollerRef} aria-busy={rows.size < total || undefined}>
              {/*
                One element as tall as the whole list, holding only the rows
                near the viewport. Its height is what the scrollbar is measured
                against, which is how the bar is right before most of these rows
                exist.
              */}
              <div className={styles.canvas} style={{ height: totalHeight }}>
                {visible.map(({ index, build }) => (
                  <div
                    key={index}
                    className={styles.slot}
                    style={{ transform: `translateY(${offsetOf(index)}px)`, height: rowHeight }}
                  >
                    {build === undefined ? <BuildRowSkeleton /> : <BuildRow build={build} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
