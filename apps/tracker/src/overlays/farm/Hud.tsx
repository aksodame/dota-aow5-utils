import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Coins, DollarSign, Gauge, Gem, Hourglass, Scale, Timer, TimerReset } from 'lucide-react';
import { CARD_IDS, type CardId } from '@core/cards.ts';
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
 * The two states answer different questions. Collapsed is "how is this going",
 * which is six numbers and nothing else, small enough to leave over the game
 * all session — and it is the state the overlay spends the evening in, so
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
function Card({
  icon,
  value,
  label,
  trailing,
  title,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  /**
   * A quieter figure at the far right of the value line.
   *
   * For the one card whose number needs a qualifier to be read correctly: a
   * total means something different depending on how many things it is a total
   * of. It sits on the value's line rather than the label's so the two are read
   * together, and it is small, grey and bracketed so it is plainly a footnote
   * to the number rather than a second number competing with it.
   */
  trailing?: string;
  title?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-black/25 px-2 py-1" title={title}>
      {/* A pixel under the 0.625rem the other small labels use, and the one
          place in the app that is: these are the longest of them — "session
          gold", not "val" — on the narrowest thing that holds any, a card a
          third of the panel wide. The extra pixel is what keeps them off
          `truncate` at the default window size. */}
      <span className="truncate text-[0.5625rem] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
        <span className="min-w-0 truncate font-semibold tabular-nums text-gold">{value}</span>
        {trailing !== undefined && (
          <span className="ms-auto shrink-0 text-[0.5rem] tabular-nums text-muted-foreground">{trailing}</span>
        )}
      </span>
    </div>
  );
}

interface Props {
  rates: Rates;
  /** What the room you are in has dropped. The list is this. */
  items: { id: string; qty: number }[];
  /**
   * Everything the session has dropped.
   *
   * Feeds the two cards that are about the evening rather than the room: the
   * session's gold, and the best item in it. The room below has its own list —
   * see `items`, and `currentMapGold`, which is summed from it.
   */
  sessionItems: { id: string; qty: number }[];
  /** Seconds since the session started, hideout included. */
  elapsed: number;
  /** Prices, the player's own where they set any. */
  pricing: Pricing;
  /** When non-empty, only these ids are listed and counted. */
  tracked: string[];
  /** Collapsed: the cards alone, sized to themselves. */
  cardsOnly: boolean;
  /** Which cards to draw. Never empty — see `core/cards.ts`. */
  cards: CardId[];
}

export function Hud({ rates, items, sessionItems, elapsed, pricing, tracked, cardsOnly, cards }: Props) {
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

  // The whole evening, not the room below it — and pinned items only, when any
  // are pinned, so the card and the list agree about what is being counted.
  const sessionGold = useMemo(() => {
    const pinned = new Set(tracked);
    const counted = tracked.length > 0 ? sessionItems.filter((i) => pinned.has(i.id)) : sessionItems;
    return counted.reduce((n, i) => n + pricing.value(i.id, i.qty), 0);
  }, [sessionItems, tracked, pricing]);

  /*
   * What the room below is worth, summed off the rows themselves.
   *
   * Not `rates.currentRunGold`, which is zero the moment you step out of a
   * room — while the list underneath goes on showing that room's loot until
   * the next one starts. A card and a list that disagree about which room they
   * are describing is worse than either number alone, and summing the rows is
   * the only way they cannot.
   */
  const currentMapGold = useMemo(() => rows.reduce((n, row) => n + row.total, 0), [rows]);

  /*
   * The single item that carried the session, by what the pile is worth rather
   * than how big it is: forty branches are not the answer to "what am I here
   * for", and one glyph usually is.
   */
  const best = useMemo(() => {
    const pinned = new Set(tracked);
    const counted = tracked.length > 0 ? sessionItems.filter((i) => pinned.has(i.id)) : sessionItems;
    let top: { id: string; qty: number; total: number } | null = null;
    for (const item of counted) {
      const total = pricing.value(item.id, item.qty);
      if (top === null || total > top.total) top = { id: item.id, qty: item.qty, total };
    }
    return top;
  }, [sessionItems, tracked, pricing]);



  /*
   * Every card, drawn whether or not it is on.
   *
   * A record rather than a list of conditionals: each card is one entry, the
   * order comes from CARD_IDS, and adding one is adding a key here and an id
   * there. Building the ones that are off costs a few unmounted elements and
   * buys not having eight `&&`s inside the grid.
   *
   * Three clocks, so their icons have to carry the difference: the session's
   * hourglass is the sitting, the map's stopwatch is this room, and the
   * average's reset arrow is neither — it is the shape of a room starting
   * over.
   */
  const shown = new Set(cards);
  const rendered: Record<CardId, React.ReactNode> = {
    session: (
      <Card
        icon={<Hourglass className="size-3.5" />}
        value={clock(elapsed)}
        label="session time"
        title="Since this session started — the hideout and the loading screens count"
      />
    ),
    sessionGold: (
      <Card
        icon={<Coins className="size-3.5" />}
        value={compact(sessionGold)}
        label="session gold"
        title="Everything this session has dropped, priced the way the list is"
      />
    ),
    /* A fixed label, and the item said in the icon instead.
       Putting the name here made the card the only one whose heading moved as
       you played — and an item name uppercased and truncated to nine
       characters identifies nothing anyway, where the picture identifies it at
       a glance. The name is on hover, for when the icon is not enough. The
       count rides on the value line: the headline is the value. */
    sessionBest: (
      <Card
        icon={
          best === null ? (
            <Gem className="size-3.5" />
          ) : (
            <img src={iconUrl(itemTable.get(best.id).icon)} alt="" className="size-3.5 rounded-[2px] object-cover" />
          )
        }
        value={best === null ? '—' : compact(best.total)}
        trailing={best === null ? undefined : `(×${best.qty})`}
        label="session best"
        title={
          best === null
            ? 'The item worth most this session'
            : `${itemTable.get(best.id).name} — the session's most valuable pile`
        }
      />
    ),
    mapTime: (
      <Card
        icon={<Timer className="size-3.5" />}
        value={clock(rates.currentRunElapsed)}
        label="current time"
        title="How long you have been in the room you are standing in"
      />
    ),
    mapGold: (
      <Card
        icon={<DollarSign className="size-3.5" />}
        value={compact(currentMapGold)}
        label="current gold"
        title="What the room below has dropped, priced the way the list is"
      />
    ),
    /* A dash rather than a zero until a room has finished: nothing has been
       averaged yet, and 0g is a claim about the farm rather than about the
       data. Same reasoning as the average clear time beside it. */
    mapGoldAverage: (
      <Card
        icon={<Scale className="size-3.5" />}
        value={rates.completedRuns > 0 ? compact(rates.averageRunGold) : '—'}
        label="gold per map"
        title="Mean gold of the rooms you have finished this session — the open one does not count yet"
      />
    ),
    mapTimeAverage: (
      <Card
        icon={<TimerReset className="size-3.5" />}
        value={rates.averageClear > 0 ? clock(rates.averageClear) : '—'}
        label="time per map"
        title="Mean time of the rooms you have finished this session"
      />
    ),
    goldPerHour: (
      <Card
        icon={<Gauge className="size-3.5" />}
        value={compact(rates.goldPerHour)}
        label="hourly gold"
        title="Gold per hour, counting only the time you spent inside rooms"
      />
    ),
  };

  return (
    // `flex-1` only when there is a list to give the leftover height to;
    // collapsed, the cards are the whole panel and it is as tall as they are.
    <div className={cn('flex flex-col gap-2', !cardsOnly && 'min-h-0 flex-1')}>
      {/*
        The chosen cards on a three-column grid, collapsed as well as expanded.

        Two rows of three by default, and the two rows are two questions. The
        top row is the sitting: how long you have been at it, what it has paid,
        and the one item that carried it. The bottom row is a room: how long
        this one has taken, what a room is worth on average, and what this one
        has dropped.

        A grid rather than the flex row it grew out of, so the second row's
        cards line up under the first's instead of sizing themselves to their
        own contents. Turning a card off closes the space rather than leaving a
        hole — the ones after it move up — but every card keeps a third of the
        width, so a short last row is three cards' worth of column with one or
        two in it, not two cards stretched across the panel.

        Drawn from `cards` in `CARD_IDS` order rather than written out here.
        Every card is defined once in `rendered` below, whether it is on or
        not; picking which appear is the player's, in Settings.
      */}
      <div className="grid grid-cols-3 gap-1.5">
        {CARD_IDS.filter((id) => shown.has(id)).map((id) => (
          <Fragment key={id}>{rendered[id]}</Fragment>
        ))}
      </div>

      {!cardsOnly && (
        <>
          {/* Outside the scroll area, so it mirrors the row's padding exactly —
              `pe-2` here matches the list's gutter, `px-1` matches the row's. */}
          <div className="pe-2 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
            <div className="flex items-center gap-2 border-b border-border/70 px-1 pb-1">
              {/* No icon spacer: the heading is meant to start where the icons do.
                  Quantity has no header and no sort — it is what `val` and
                  `total` are computed from, and either of them orders by it
                  more usefully than it could itself. */}
              <SortHeader label="picked up" sortKey="name" sort={sort} onSort={onSort} className="min-w-0 flex-1" />
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
              {/* Emptied by the next `room_enter`: the list is what *this* room
                  gave you, and a fresh room is a fresh answer. */}
              {rows.length === 0 && (
                <li className="px-1 py-3 text-center text-xs text-muted-foreground">
                  {tracked.length > 0 ? 'None of your tracked items in this room yet.' : 'Nothing dropped in here yet.'}
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
