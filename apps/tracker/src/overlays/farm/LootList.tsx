import { ChevronDown, ChevronUp } from 'lucide-react';
import { iconUrl, qualityColor } from '@core/items.ts';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Pricing } from '@/features/items/prices';
import type { SortDir, SortKey } from '@/features/items/sort';
import { useItems } from '@/features/items/table';
import { useMessages, type Messages } from '@/i18n';
import { compact } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LootRow } from './readout';

/**
 * What you picked up in the room you are standing in.
 *
 * Shared by every layout, and deliberately not parameterised by which one is
 * on. Both styles want the same five things per row — icon, name in its rarity
 * colour, how many, what one is worth, what the pile is worth — and both want
 * the columns to sort. What the styles disagree about is everything *around*
 * the list, which is why they own their own headings and this owns none of that
 * argument.
 *
 * The one concession is `total`: the Torchlight heading puts the room's worth
 * on the same line as the word, where the minimal one leaves that to a card.
 * It is a figure the list already has, so it is offered rather than recomputed.
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

interface Props {
  rows: LootRow[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  pricing: Pricing;
  /** Non-empty means the list is filtered, which changes what "empty" means. */
  tracked: string[];
  /**
   * The room's worth, beside the heading.
   *
   * Omitted by the layout that already spends a card on it.
   */
  total?: number;
}

export function LootList({ rows, sort, onSort, pricing, tracked, total }: Props) {
  const m = useMessages();
  const itemTable = useItems();

  return (
    <>
      {/* Outside the scroll area, so it mirrors the row's padding exactly —
          `pe-2` here matches the list's gutter, `px-1` matches the row's. */}
      <div className="pe-2 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
        <div className="hud-loot-head flex items-center gap-2 border-b border-border/70 px-1 pb-1">
          {/* No icon spacer: the heading is meant to start where the icons do.
              Quantity has no header and no sort — it is what `val` and `total`
              are computed from, and either of them orders by it more usefully
              than it could itself. */}
          <SortHeader
            label={m.hud.columns.name}
            sortKey="name"
            sort={sort}
            onSort={onSort}
            sortBy={m.hud.sortBy}
            className="min-w-0 shrink"
          />
          {/* The room's worth sits against the heading, not across the row from
              it: the figure belongs *to* the word — it is what this list adds
              up to — and parked at the far end it reads as a fourth column of
              the table instead. The spacer below is what holds the number
              columns to the right edge now that nothing else grows. */}
          {total !== undefined && (
            <span className="hud-loot-total shrink-0 tabular-nums" title={m.hud.cardTitle.mapGold}>
              {compact(total)}
            </span>
          )}
          <span className="min-w-0 flex-1" />
          <span className={COL_NUMBERS}>
            <span className={COL_QTY} />
            <SortHeader
              label={m.hud.columns.unit}
              sortKey="unit"
              sort={sort}
              onSort={onSort}
              sortBy={m.hud.sortBy}
              className={COL_EACH}
              align="end"
            />
            <SortHeader
              label={m.hud.columns.total}
              sortKey="total"
              sort={sort}
              onSort={onSort}
              sortBy={m.hud.sortBy}
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
              {tracked.length > 0 ? m.hud.emptyTracked : m.hud.empty}
            </li>
          )}
          {rows.slice(0, MAX_ROWS).map((row) => {
            const info = itemTable.get(row.id);
            return (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03] hover:bg-white/8"
              >
                <img src={iconUrl(info.icon)} alt="" className="size-6 shrink-0 rounded-sm object-cover" loading="lazy" />
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
                  {/* A price you set reads in the accent colour, so the list
                      says which numbers are yours without a legend. */}
                  <span
                    className={cn(
                      COL_EACH,
                      'text-[0.5rem] tabular-nums',
                      pricing.isCustom(row.id) ? 'text-primary' : 'text-muted-foreground',
                    )}
                    title={pricing.isCustom(row.id) ? m.hud.customPrice(pricing.table(row.id)) : undefined}
                  >
                    {compact(row.unit)}
                  </span>
                  <span className={cn(COL_TOTAL, 'text-xs font-semibold tabular-nums', row.total > 0 && 'text-gold')}>
                    {compact(row.total)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </>
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
  sortBy,
  className,
  align = 'start',
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  /** The catalog's "Sort by X", passed in so this stays a presentational leaf. */
  sortBy: Messages['hud']['sortBy'];
  className?: string;
  align?: 'start' | 'end';
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={sortBy(label)}
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
