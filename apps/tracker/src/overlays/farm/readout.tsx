import { useMemo, useState } from 'react';
import { Coins, DollarSign, Gauge, Gem, Hourglass, Scale, Timer, TimerReset } from 'lucide-react';
import type { CardId } from '@core/cards.ts';
import { iconUrl } from '@core/items.ts';
import type { Rates } from '@core/stats.ts';
import type { Pricing } from '@/features/items/prices';
import { DEFAULT_DIR, sortRows, type SortDir, type SortKey } from '@/features/items/sort';
import { useItems } from '@/features/items/table';
import { useMessages } from '@/i18n';
import { clock, compact } from '@/lib/format';

/**
 * Everything the farm readout knows, computed once and drawn by whichever
 * layout is on.
 *
 * This is the half of the old `Hud.tsx` that was never about arrangement: what
 * the session is worth, what the room below is worth, which item carried the
 * evening, and how each card reads. The layouts in `layouts/` take it and
 * disagree only about where it goes.
 *
 * Extracted when the second style arrived, and the reason is the numbers rather
 * than the code. Two layouts computing "the best drop" separately is two
 * chances to compute it differently, and a tracker whose headline figure
 * depends on the skin is a tracker nobody can trust. One derivation, two
 * drawings.
 */

/** One card, resolved: what to draw and what it says on hover. */
export interface CardView {
  icon: React.ReactNode;
  /** Terse, for beside the number. The long form lives in Settings. */
  label: string;
  /** The sentence on hover, which is where a card explains itself. */
  title: string;
  value: string;
  /**
   * A quieter figure at the far right of the value.
   *
   * For the one card whose number needs a qualifier to be read correctly: a
   * total means something different depending on how many things it is a total
   * of.
   */
  trailing?: string;
}

/** One row of the loot list, with prices already resolved onto it. */
export interface LootRow {
  id: string;
  qty: number;
  name: string;
  /** Gold for one, at whatever price is in force. */
  unit: number;
  /** Gold for the quantity held. */
  total: number;
}

/** The single item that carried the session. */
export interface BestDrop {
  id: string;
  qty: number;
  total: number;
  name: string;
}

export interface ReadoutInput {
  rates: Rates;
  /** What the room you are in has dropped. The list is this. */
  items: { id: string; qty: number }[];
  /** Everything the session has dropped, for the two cards about the evening. */
  sessionItems: { id: string; qty: number }[];
  /** Seconds since the session started, hideout included. */
  elapsed: number;
  pricing: Pricing;
  /** When non-empty, only these ids are listed and counted. */
  tracked: string[];
}

export interface Readout {
  /** Every card, whether or not it is on. The layout picks from `config.cards`. */
  cards: Record<CardId, CardView>;
  rows: LootRow[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  /** What the room below is worth, summed off the rows themselves. */
  currentMapGold: number;
  /** Null until something has dropped. */
  best: BestDrop | null;
}

export function useReadout({ rates, items, sessionItems, elapsed, pricing, tracked }: ReadoutInput): Readout {
  const m = useMessages();
  const itemTable = useItems();

  /*
   * Total first, because the list is there to answer "what carried this
   * session" before it is there to find anything. Held here rather than in the
   * config: it is how you are looking at the list right now, not a setting, and
   * it costs nothing to be back at the useful default next launch.
   */
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'total', dir: 'desc' });

  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: DEFAULT_DIR[key] },
    );

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
    // `itemTable` is memoized per language, so this re-sorts when the language
    // changes — which it must: the name column is sorted by the name shown.
  }, [items, tracked, pricing, sort, itemTable]);

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
   *
   * The Torchlight layout makes this its headline, which is why the name is
   * resolved here rather than looked up again at the point of drawing.
   */
  const best = useMemo<BestDrop | null>(() => {
    const pinned = new Set(tracked);
    const counted = tracked.length > 0 ? sessionItems.filter((i) => pinned.has(i.id)) : sessionItems;
    let top: BestDrop | null = null;
    for (const item of counted) {
      const total = pricing.value(item.id, item.qty);
      if (top === null || total > top.total) {
        top = { id: item.id, qty: item.qty, total, name: itemTable.get(item.id).name };
      }
    }
    return top;
  }, [sessionItems, tracked, pricing, itemTable]);

  /*
   * Every card, resolved whether or not it is on.
   *
   * A record rather than a list of conditionals: each card is one entry, the
   * order comes from `CARD_IDS`, and adding one is adding a key here and an id
   * there. Resolving the ones that are off costs a few strings and buys both
   * layouts a total map they can index without checking.
   *
   * Three clocks, so their icons have to carry the difference: the session's
   * hourglass is the sitting, the map's stopwatch is this room, and the
   * average's reset arrow is neither — it is the shape of a room starting over.
   */
  const cards = useMemo<Record<CardId, CardView>>(
    () => ({
      session: {
        icon: <Hourglass className="size-3.5" />,
        value: clock(elapsed),
        label: m.hud.cardLabel.session,
        title: m.hud.cardTitle.session,
      },
      sessionGold: {
        icon: <Coins className="size-3.5" />,
        value: compact(sessionGold),
        label: m.hud.cardLabel.sessionGold,
        title: m.hud.cardTitle.sessionGold,
      },
      /* A fixed label, and the item said in the icon instead.
         Putting the name here made the card the only one whose heading moved as
         you played — and an item name uppercased and truncated to nine
         characters identifies nothing anyway, where the picture identifies it
         at a glance. The name is on hover, for when the icon is not enough, and
         it is the Torchlight headline's subtitle where there is room for it. */
      sessionBest: {
        icon:
          best === null ? (
            <Gem className="size-3.5" />
          ) : (
            <img src={iconUrl(itemTable.get(best.id).icon)} alt="" className="size-full rounded-[2px] object-cover" />
          ),
        value: best === null ? m.common.none : compact(best.total),
        trailing: best === null ? undefined : `(×${best.qty})`,
        label: m.hud.cardLabel.sessionBest,
        title: best === null ? m.hud.cardTitle.sessionBest : m.hud.bestTitle(best.name),
      },
      /* `mapElapsed`, not `currentRunElapsed`, for exactly the reason the gold
         beside it is summed off the rows: both cards have to be about the room
         the list underneath is showing. The open run's own elapsed goes to zero
         the moment you step out of a room, which put 00:00 next to a gold
         figure and a full loot list — a row claiming a room paid 12k in no
         time. */
      mapTime: {
        icon: <Timer className="size-3.5" />,
        value: clock(rates.mapElapsed),
        label: m.hud.cardLabel.mapTime,
        title: m.hud.cardTitle.mapTime,
      },
      mapGold: {
        icon: <DollarSign className="size-3.5" />,
        value: compact(currentMapGold),
        label: m.hud.cardLabel.mapGold,
        title: m.hud.cardTitle.mapGold,
      },
      /* A dash rather than a zero until a room has finished: nothing has been
         averaged yet, and 0g is a claim about the farm rather than about the
         data. Same reasoning as the average clear time beside it. */
      mapGoldAverage: {
        icon: <Scale className="size-3.5" />,
        value: rates.completedRuns > 0 ? compact(rates.averageRunGold) : m.common.none,
        label: m.hud.cardLabel.mapGoldAverage,
        title: m.hud.cardTitle.mapGoldAverage,
      },
      mapTimeAverage: {
        icon: <TimerReset className="size-3.5" />,
        value: rates.averageClear > 0 ? clock(rates.averageClear) : m.common.none,
        label: m.hud.cardLabel.mapTimeAverage,
        title: m.hud.cardTitle.mapTimeAverage,
      },
      goldPerHour: {
        icon: <Gauge className="size-3.5" />,
        value: compact(rates.goldPerHour),
        label: m.hud.cardLabel.goldPerHour,
        title: m.hud.cardTitle.goldPerHour,
      },
    }),
    [m, elapsed, sessionGold, best, rates, currentMapGold, itemTable],
  );

  return { cards, rows, sort, onSort, currentMapGold, best };
}
