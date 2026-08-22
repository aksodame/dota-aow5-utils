import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, DollarSign, Hourglass, Timer } from 'lucide-react';
import { iconUrl, qualityColor } from '@core/items.ts';
import type { Rates } from '@core/stats.ts';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Pricing } from '@/features/items/prices';
import { DEFAULT_DIR, sortRows, type SortDir, type SortKey } from '@/features/items/sort';
import { itemTable } from '@/features/items/table';
import { clock, compact } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The HUD proper: two rows of stat cards, and — expanded — what you picked up.
 *
 * The two states answer different questions. Collapsed is "is this room worth
 * it", which is three numbers and nothing else, small enough to leave over the
 * game all session — and it is the state the overlay spends the evening in, so
 * anything answerable in a number that moves belongs there. Expanded is "what
 * did I actually get", which is the only thing that needs a list, and the only
 * thing worth the height.
 *
 * Where you are is not a number and is not here: it is one line of prose, and
 * it lives on the shell's header row while the chrome is away. See `StateLine`.
 */

/*
 * Column widths live in one place because the header sits outside the scroll
 * area — the two only line up as a table if they share these exact classes.
 *
 * The three numbers are one block pinned to the right edge, tight against each
 * other: they are short, fixed-width and read as a group, so every column of
 * padding between them is one stolen from the item name beside them — the only
 * thing in the row that can actually run out of room.
 */
const COL_NUMBERS = 'flex shrink-0 items-center gap-1';
const COL_QTY = 'w-7 shrink-0 text-right';
// Wider than the quantity beside it: this column's header is a sort button, and
// the arrow that appears when it is the active one has to fit next to the word.
const COL_EACH = 'w-9 shrink-0 text-right';
const COL_TOTAL = 'w-12 shrink-0 text-right';

/** How many rows are worth drawing. Beyond this the list is a scroll, not a readout. */
const MAX_ROWS = 40;

/*
 * Two lines: what it is, then what it says.
 *
 * Stacking them gives the value the card's whole width, so the numbers no
 * longer share a line with their own label and start truncating each other
 * when the window is narrow or the UI scale is large. The label goes on top
 * because it is the half you stop reading once you know the layout.
 *
 * Every card is a number, in gold, in tabular figures. The one card that held
 * prose needed an exception to each of those three, which is what made it the
 * wrong shape for the row rather than merely a tight fit — see `StateLine`.
 */
function Card({ icon, value, label, title }: { icon: React.ReactNode; value: string; label: string; title?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-black/25 px-2 py-1" title={title}>
      <span className="truncate text-[0.625rem] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0 truncate font-semibold tabular-nums text-gold">{value}</span>
      </span>
    </div>
  );
}

interface Props {
  rates: Rates;
  items: { id: string; qty: number; perHour: number }[];
  /** Prices, the player's own where they set any. */
  pricing: Pricing;
  /** When non-empty, only these ids are listed and counted. */
  tracked: string[];
  /** Collapsed: the cards alone, sized to themselves. */
  cardsOnly: boolean;
}

export function Hud({ rates, items, pricing, tracked, cardsOnly }: Props) {
  /*
   * Total first, because the list is there to answer "what carried this
   * session" before it is there to find anything. Held in the component rather
   * than in the config: it is how you are looking at the list right now, not a
   * setting, and it costs nothing to be back at the useful default next launch.
   */
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'total', dir: 'desc' });

  const onSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: DEFAULT_DIR[key] }));

  // Prices resolved onto the rows before sorting, so a column sorts by the
  // number the row actually shows — a custom price included.
  const rows = useMemo(() => {
    const pinned = new Set(tracked);
    const listed = tracked.length > 0 ? items.filter((i) => pinned.has(i.id)) : items;
    return sortRows(
      listed.map((i) => ({
        ...i,
        name: itemTable.get(i.id).name,
        unit: pricing.unit(i.id),
        total: pricing.value(i.id, i.qty),
      })),
      sort.key,
      sort.dir,
    );
  }, [items, tracked, pricing, sort]);


  return (
    // `flex-1` only when there is a list to give the leftover height to;
    // collapsed, the cards are the whole panel and it is as tall as they are.
    <div className={cn('flex flex-col gap-2', !cardsOnly && 'min-h-0 flex-1')}>
      {/*
        Three cards, one row, collapsed as well as expanded.

        What is left is what changes while you play and answers a question you
        ask mid-run: how long this room is taking, what the evening is paying
        an hour, and how much of the evening has actually been farming. The run
        count moved to the state line — it is a number, but one that moves a
        few times an hour — and the session total went with it, being the g/hr
        card multiplied by the session card and worth neither's width.

        Two clocks side by side, so their icons carry the difference: the run's
        stopwatch is this room, the session's hourglass is time inside rooms —
        which is also the denominator of the gold rate between them.
      */}
      <div className="flex gap-1.5">
        <Card icon={<Timer className="size-3.5" />} value={clock(rates.currentRunElapsed)} label="run" />
        <Card icon={<DollarSign className="size-3.5" />} value={compact(rates.goldPerHour)} label="g/hr" />
        <Card
          icon={<Hourglass className="size-3.5" />}
          value={clock(rates.activeTime)}
          label="session"
          title="Time spent inside rooms — what the rates are measured against"
        />
      </div>

      {!cardsOnly && (
        <>
          {/* Outside the scroll area, so it mirrors the row's padding exactly —
              `pe-2` here matches the list's gutter, `px-1` matches the row's. */}
          <div className="pe-2 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
            <div className="flex items-center gap-2 border-b border-border/70 px-1 pb-1">
              {/* No icon spacer: "item" is meant to start where the icons start.
                  Quantity has no header and no sort — it is what `val` and
                  `total` are computed from, and either of them orders by it
                  more usefully than it could itself. */}
              <SortHeader label="item" sortKey="name" sort={sort} onSort={onSort} className="min-w-0 flex-1" />
              <span className={COL_NUMBERS}>
                <span className={COL_QTY} />
                <SortHeader label="val" sortKey="unit" sort={sort} onSort={onSort} className={COL_EACH} align="end" />
                <SortHeader
                  label="total"
                  sortKey="total"
                  sort={sort}
                  onSort={onSort}
                  className={COL_TOTAL}
                  align="end"
                />
              </span>
            </div>
          </div>

          {/* `pb-4` matches the fade's height: at the end of the list it is the
              gutter that keeps the last row off the panel's edge, and the fade
              lands on it rather than on the row. */}
          <ScrollArea className="min-h-0 flex-1" viewportClassName="hud-fade-bottom">
            <ul className="pe-2 pb-4">
              {rows.length === 0 && (
                <li className="px-1 py-3 text-center text-xs text-muted-foreground">
                  {tracked.length > 0 ? 'None of your tracked items yet.' : 'Nothing picked up yet.'}
                </li>
              )}
              {rows.slice(0, MAX_ROWS).map((row) => {
                const info = itemTable.get(row.id);
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03] hover:bg-white/8"
                  >
                    <img
                      src={iconUrl(info.icon)}
                      alt=""
                      className="size-6 shrink-0 rounded-sm object-cover"
                      loading="lazy"
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-semibold"
                      style={{ color: qualityColor(info.quality) }}
                    >
                      {row.name}
                    </span>
                    {/* Quantity and unit value are supporting detail, so they sit at
                        ~2/3 the size of the name and the total. */}
                    <span className={COL_NUMBERS}>
                      <span className={cn(COL_QTY, 'text-[0.5rem] font-medium tabular-nums')}>×{row.qty}</span>
                      {/* A price you set reads in the accent colour, so the
                          list says which numbers are yours without a legend. */}
                      <span
                        className={cn(
                          COL_EACH,
                          'text-[0.5rem] tabular-nums',
                          pricing.isCustom(row.id) ? 'text-primary' : 'text-muted-foreground',
                        )}
                        title={
                          pricing.isCustom(row.id)
                            ? `Your price. Without it this would fetch ${pricing.table(row.id)}g.`
                            : undefined
                        }
                      >
                        {compact(row.unit)}
                      </span>
                      <span
                        className={cn(COL_TOTAL, 'text-xs font-semibold tabular-nums', row.total > 0 && 'text-gold')}
                      >
                        {compact(row.total)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

/**
 * A column header that sorts, and says so.
 *
 * The arrow appears on the sorted column only. Marking all three at once would
 * be three arrows to read where the question is "which one is it" — and the
 * unsorted columns have nothing to point anywhere yet.
 */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = 'start',
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  className?: string;
  align?: 'start' | 'end';
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
      className={cn(
        'flex items-center gap-0.5 uppercase hover:text-foreground',
        align === 'end' ? 'justify-end' : 'justify-start',
        active && 'text-foreground',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {active && <Arrow className="size-2.5 shrink-0" />}
    </button>
  );
}
