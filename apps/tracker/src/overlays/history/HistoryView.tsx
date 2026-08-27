import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { pageOf, sessionTotals, type HistoryRun, type SessionHistory } from '@core/history.ts';
import { iconUrl, qualityColor, type ItemTable } from '@core/items.ts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Pricing } from '@/features/items/prices';
import { useItems } from '@/features/items/table';
import { useRooms } from '@/features/rooms/table';
import { useLocale, useMessages, type Messages } from '@/i18n';
import { clock, compact, stamp } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * What has been farmed, across every session the archive kept.
 *
 * Three depths, because three questions get asked and only the first one gets
 * asked often: was this session any good, which rooms carried it, and what
 * actually dropped. So sessions are always visible, runs open with the newest
 * session, and a run's items — and the session's own item total, which is the
 * longest list in here — open when asked for.
 *
 * Deleting is offered here and nowhere else, for the same reason the archive
 * exists at all: it is the thing that outlives the app, so the place to throw
 * it away is the place you can see what you are throwing. Tick the sessions to
 * go, or tick none and the button clears the lot.
 *
 * Mock sessions are left out, in every build. They are scaffolding for building
 * this view without Dota running, not evenings that happened, and an archive
 * that mixes them in cannot answer the first question honestly. `History` in
 * main no longer writes them at all; this stays as the guard for archives
 * written before it stopped.
 *
 * The archive stores item ids and quantities and nothing else — no names, no
 * prices. Those come from the same table the HUD uses, which means an archive
 * written a year ago reprices itself against today's item data instead of
 * preserving numbers that were only ever a lookup — and against the player's
 * own prices, so last week's evening is valued the way this week's is.
 */

interface Props {
  /** Runs in progress are not in here yet: the archive only takes finished ones. */
  sessions: SessionHistory[] | null;
  pricing: Pricing;
  onRefresh: () => void;
}

export function HistoryView({ sessions, pricing, onRefresh }: Props) {
  const m = useMessages();
  const locale = useLocale();
  const items = useItems();

  // The newest session is the one you just played, so it starts open.
  const [openSessions, setOpenSessions] = useState<Set<number> | null>(null);
  const [openRuns, setOpenRuns] = useState<Set<string>>(new Set());
  const [openTotals, setOpenTotals] = useState<Set<number>>(new Set());
  /**
   * Whether the clear button is armed.
   *
   * Two clicks rather than a dialog: the archive is the only record of every
   * evening farmed and there is no undo, but a modal over a window the player
   * opened on purpose is heavier than the risk deserves. The second click has
   * to be a decision, so the button says what it is about to do.
   */
  const [arming, setArming] = useState(false);
  /**
   * Sessions ticked for deletion.
   *
   * Empty means "all of them", which is what the button then says: clearing
   * everything is the common case and should not cost twenty ticks, while
   * throwing away one bad evening should not cost the other nineteen.
   */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /**
   * Which page of sessions is drawn, 0-based.
   *
   * Held loosely: `pageOf` clamps it rather than this being kept in step with a
   * list that changes under it. A refresh adds the session that just ended and a
   * delete can take a whole page away, and neither should have to remember to
   * fix a number stored somewhere else.
   */
  const [page, setPage] = useState(0);

  // A refresh, a scroll, anything at all — the armed state should not survive
  // being forgotten about.
  useEffect(() => {
    if (!arming) return;
    const timer = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(timer);
  }, [arming]);

  const visible = useMemo(() => sessions?.filter((s) => s.source !== 'mock') ?? null, [sessions]);

  /*
   * The page, and the sessions on it.
   *
   * Derived every render rather than stored, so the archive shrinking under a
   * held page number is not a state bug waiting to happen — see `pageOf`. The
   * pager below reads `current.index`, not `page`, for the same reason: what is
   * drawn is what the reader is on, whatever number the click left behind.
   */
  const current = useMemo(() => pageOf(visible ?? [], page), [visible, page]);
  const drawn = visible === null ? null : current.items;

  // The newest session is on the first page by construction, and it is what
  // "the one you just played" means — so this stays about the archive, not the
  // page. Turning to page 3 does not open anything on it.
  const newest = visible?.[0]?.id;
  useEffect(() => {
    if (openSessions === null && newest !== undefined) setOpenSessions(new Set([newest]));
  }, [openSessions, newest]);

  const toggleSession = (id: number) =>
    setOpenSessions((prev) => {
      const next = new Set(prev ?? []);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleRun = (key: string) =>
    setOpenRuns((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleTotals = (id: number) =>
    setOpenTotals((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    // A column: the list takes the height that is going, the controls under it
    // take what they need. See the note above them.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ScrollArea className="min-h-0 flex-1" viewportClassName="hud-fade-bottom">
        <div className="space-y-2 pe-2 pb-4 text-xs">
          {visible === null && <Empty>{m.history.reading}</Empty>}
          {visible?.length === 0 && <Empty>{m.history.empty}</Empty>}

          {drawn?.map((session) => {
            const totals = sessionTotals(session);
            const open = openSessions?.has(session.id) ?? false;
            return (
              <section key={session.id} className="rounded-md bg-black/25">
                {/* The tick is a sibling of the button, not inside it: a checkbox
                    within a button is neither valid nor clickable on its own, and
                    this row has to do both jobs. */}
                <div className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-white/5">
                  <Checkbox
                    checked={selected.has(session.id)}
                    onCheckedChange={() => toggleSelected(session.id)}
                    aria-label={m.history.select(stamp(session.id, locale))}
                    className="size-3.5 shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSession(session.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <Caret open={open} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{stamp(session.id, locale)}</span>
                    {/* The source is only worth saying when it is the fake one. */}
                    {session.source === 'mock' && (
                      <span className="shrink-0 rounded bg-white/10 px-1 text-[0.5rem] text-muted-foreground uppercase">
                        {m.history.mock}
                      </span>
                    )}
                    <span className="shrink-0 tabular-nums text-muted-foreground">{m.history.runCount(totals.runs)}</span>
                  </button>
                </div>

                {/*
                  The numbers you compare sessions by.

                  Wallet gold appears only when the game actually reported some —
                  the shipped addon reports none, and a column of permanent
                  zeroes reads as a broken tracker rather than as an absent
                  figure. `value` is the one that always has an answer, since it
                  is priced from the drops.
                */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 pb-1.5 ps-6 text-[0.625rem] text-muted-foreground">
                  <Stat label={m.history.stats.active} value={clock(totals.activeTime)} />
                  {totals.gold > 0 && <Stat label={m.history.stats.gold} value={compact(totals.gold)} gold />}
                  <Stat label={m.history.stats.value} value={compact(itemsValue(totals.byItem, pricing))} gold />
                  <Stat label={m.history.stats.items} value={String(totals.items)} />
                </div>

                {open && (
                  <div className="space-y-1 px-2 pb-2">
                    {session.runs.length === 0 && (
                      <p className="ps-4 text-[0.625rem] text-muted-foreground">{m.history.noRuns}</p>
                    )}
                    {session.runs.map((run, index) => {
                      const key = `${session.id}:${index}`;
                      return (
                        <Run
                          key={key}
                          run={run}
                          pricing={pricing}
                          items={items}
                          m={m}
                          open={openRuns.has(key)}
                          onToggle={() => toggleRun(key)}
                        />
                      );
                    })}

                    {/*
                      Closed by default, and the only section in here that is.
                      Every other list is a handful of rows; this one is every
                      distinct item of the evening, and left open it buries the
                      runs above it — which are what you opened the session for.
                    */}
                    {totals.byItem.length > 0 && (
                      <div className="space-y-0.5 pt-1">
                        <button
                          type="button"
                          onClick={() => toggleTotals(session.id)}
                          className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left hover:bg-white/5"
                        >
                          <Caret open={openTotals.has(session.id)} />
                          <span className="min-w-0 flex-1 text-[0.5rem] tracking-wide text-muted-foreground uppercase">
                            {m.history.sessionTotal}
                          </span>
                          <span className="shrink-0 text-[0.5rem] tabular-nums text-muted-foreground">
                            {m.history.itemCount(totals.byItem.length)}
                          </span>
                        </button>
                        {openTotals.has(session.id) && (
                          <Items items={totals.byItem} pricing={pricing} table={items} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </ScrollArea>

      {/*
        The controls, pinned to the bottom of the window rather than to the end
        of the archive.

        They used to be the last thing inside the scroll area, which is where
        they read as belonging — until the list is longer than the window. Then
        the pager and the delete button are at the bottom of the *list*: turning
        to page two means scrolling back down to find the control that got you
        there, and the only way to discover there is a page two is to read to
        the end of page one. A pager you have to scroll to find is a pager that
        reads as an absent feature.

        The pager itself appears only once there is a second page. Over a
        nine-session archive it is two dead buttons and a "1 / 1" — chrome
        announcing that the list is paginated in the one case where nothing is
        being held back.
      */}
      {current.count > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            className="h-7 flex-1 text-xs"
            // Against `current.index`, not `page`: a click after a delete
            // should step from the page on screen, not from a number that was
            // clamped away.
            disabled={current.index === 0}
            onClick={() => setPage(current.index - 1)}
          >
            <ChevronLeft className="size-3.5" /> {m.history.newer}
          </Button>
          <span
            className="shrink-0 px-1 text-[0.625rem] tabular-nums text-muted-foreground"
            title={m.history.pageHint(current.index + 1, current.count)}
          >
            {m.history.page(current.index + 1, current.count)}
          </span>
          <Button
            variant="outline"
            className="h-7 flex-1 text-xs"
            disabled={current.index === current.count - 1}
            onClick={() => setPage(current.index + 1)}
          >
            {m.history.older} <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}

      <div className="flex gap-1">
        <Button variant="outline" className="h-7 flex-1 text-xs" onClick={onRefresh}>
          <RefreshCw className="size-3.5" /> {m.common.refresh}
        </Button>
        {/* Only when there is something to clear: a destructive button beside
            an empty list is an offer to break something that is not there.

            One button, two jobs, and the label is which one: tick nothing and
            it clears the archive, tick some and it takes only those. Both go
            through the same arming click, because neither can be undone. */}
        {visible !== null && visible.length > 0 && (
          <Button
            variant={arming ? 'destructive' : 'outline'}
            className="h-7 flex-1 text-xs"
            onClick={() => {
              if (!arming) {
                setArming(true);
                return;
              }
              setArming(false);
              const doomed = [...selected];
              const done = doomed.length > 0 ? window.tracker.deleteSessions(doomed) : window.tracker.clearHistory();
              void done.then(() => {
                setSelected(new Set());
                onRefresh();
              });
            }}
            title={selected.size > 0 ? m.history.deleteSelectedHint : m.history.deleteAllHint}
          >
            <Trash2 className="size-3.5" />{' '}
            {arming
              ? selected.size > 0
                ? m.history.confirmSelected(selected.size)
                : m.history.confirmAll
              : selected.size > 0
                ? m.history.deleteSelected(selected.size)
                : m.history.deleteAll}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * One run: the summary line always, its drops when opened.
 *
 * The catalog and the item table come down as props rather than out of a hook.
 * Both are already in hand one component up, this is drawn once per archived
 * run — a busy archive is hundreds of them — and a leaf that is handed what it
 * renders cannot end up disagreeing with its parent about which language it is
 * in mid-list.
 */
function Run({
  run,
  pricing,
  items: table,
  m,
  open,
  onToggle,
}: {
  run: HistoryRun;
  pricing: Pricing;
  items: ItemTable;
  m: Messages;
  open: boolean;
  onToggle: () => void;
}) {
  const rooms = useRooms();
  const items = run.items.map(([id, qty]) => ({ id, qty }));
  return (
    <div className="rounded bg-black/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-white/5"
      >
        <Caret open={open} />
        <span className="min-w-0 flex-1 truncate font-medium" title={run.room}>
          {rooms.name(run.room)}
        </span>
        {/* Two different things worth saying, in two different colours. A
            `chained` run counted — the player walked into the next room and the
            addon sent no exit — so it is marked, not flagged. An abandoned one
            is not a result at all, and averaging it in would be a lie. */}
        {run.outcome !== 'clear' && (
          <span
            className={cn(
              'shrink-0 rounded px-1 text-[0.5rem] uppercase',
              run.outcome === 'chained' ? 'bg-white/10 text-muted-foreground' : 'bg-destructive/20 text-destructive',
            )}
          >
            {m.history.outcome[run.outcome]}
          </span>
        )}
        <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{clock(run.duration)}</span>
        <span className="w-8 shrink-0 text-right text-[0.625rem] tabular-nums text-muted-foreground">
          ×{items.reduce((n, i) => n + i.qty, 0)}
        </span>
        <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-gold">
          {compact(itemsValue(items, pricing))}
        </span>
      </button>
      {open && (
        <div className="pb-1">
          {items.length === 0 ? (
            <p className="px-1.5 ps-6 text-[0.625rem] text-muted-foreground">{m.history.nothingDropped}</p>
          ) : (
            <Items items={items} pricing={pricing} table={table} />
          )}
        </div>
      )}
    </div>
  );
}

/** The drop list, priced against today's item table and today's presets. */
function Items({
  items,
  pricing,
  table,
}: {
  items: { id: string; qty: number }[];
  pricing: Pricing;
  table: ItemTable;
}) {
  return (
    <ul className="space-y-0.5 ps-4">
      {[...items]
        .sort((a, b) => pricing.value(b.id, b.qty) - pricing.value(a.id, a.qty))
        .map((item) => {
          const info = table.get(item.id);
          return (
            <li key={item.id} className="flex items-center gap-1.5 px-1.5">
              <img src={iconUrl(info.icon)} alt="" className="size-4 shrink-0 rounded-sm object-cover" loading="lazy" />
              <span className="min-w-0 flex-1 truncate" style={{ color: qualityColor(info.quality) }}>
                {info.name}
              </span>
              <span className="w-8 shrink-0 text-right text-[0.5rem] tabular-nums">×{item.qty}</span>
              <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                {compact(pricing.value(item.id, item.qty))}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

const itemsValue = (items: { id: string; qty: number }[], pricing: Pricing): number =>
  items.reduce((n, i) => n + pricing.value(i.id, i.qty), 0);

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <span>
      {label} <span className={cn('font-semibold tabular-nums', gold ? 'text-gold' : 'text-foreground')}>{value}</span>
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  return open ? (
    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
  ) : (
    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-3 text-center text-[0.625rem] text-muted-foreground">{children}</p>;
}
