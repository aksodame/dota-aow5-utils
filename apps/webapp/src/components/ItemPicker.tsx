import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { ItemSummary } from 'aow5-shared/data';
import { itemFitsSlot } from 'aow5-shared/types';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import type { Strings } from '@/i18n/strings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ItemDetails } from './ItemDetails';
import { ItemIcon, qualityColor } from './ItemIcon';

/**
 * Item browser and detail view.
 *
 * The list is still a plain substring filter over the index — faceted browsing
 * comes later — but every entry opens a full stat panel beside it, so this
 * dialog doubles as the way to inspect what is already on the board.
 */

const RESULT_LIMIT = 200;

/** Slot type first, then the text query: a potion slot never lists armour. */
function filterItems(items: ItemSummary[], slotKind: number, query: string): ItemSummary[] {
  const eligible = items.filter((i) => itemFitsSlot(i.kinds, slotKind));
  const needle = query.trim().toLowerCase();
  return needle === '' ? eligible : eligible.filter((i) => i.search.includes(needle));
}

/**
 * The slice of the matches the list actually draws.
 *
 * Normally the first `RESULT_LIMIT`, which is what keeps an unfiltered
 * equipment slot from rendering six hundred rows. The exception is the item the
 * slot already holds: the dialog opens on it, so a window that leaves it out
 * would preselect a row nobody can see. When it sorts past the cap the window
 * moves to sit around it instead — same length, same order, different start.
 */
function resultWindow(matches: ItemSummary[], currentId: string | null): ItemSummary[] {
  if (matches.length <= RESULT_LIMIT) return matches;
  const at = currentId ? matches.findIndex((i) => i.id === currentId) : -1;
  if (at < RESULT_LIMIT) return matches.slice(0, RESULT_LIMIT);
  const start = Math.min(at - Math.floor(RESULT_LIMIT / 2), matches.length - RESULT_LIMIT);
  return matches.slice(start, start + RESULT_LIMIT);
}

/**
 * The element the list actually scrolls in, found upwards from a row.
 *
 * Deliberately not the viewport ref: which wrapper owns the overflow is a
 * detail of the scroll-area component, and asking the row itself is true
 * whatever that turns out to be.
 */
function scrollerOf(row: HTMLElement): HTMLElement | null {
  for (let node = row.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

/**
 * Puts a row in the middle of the list. True once it is fully in view.
 *
 * Relative — it adjusts by the distance it measures rather than computing an
 * absolute offset — so a measurement taken through the dialog's opening zoom
 * is not wrong, only short, and the next pass finishes the job. The caller
 * repeats until this reports success, which is also what makes it survive
 * anything that scrolls the list back while the dialog is still settling.
 */
function centreRow(row: HTMLElement): boolean {
  // Nothing to scroll — a short list, every row already on screen.
  const viewport = scrollerOf(row);
  if (!viewport) return true;

  const box = viewport.getBoundingClientRect();
  const before = row.getBoundingClientRect();
  viewport.scrollTop += before.top + before.height / 2 - (box.top + box.height / 2);

  const after = row.getBoundingClientRect();
  return after.top >= box.top - 1 && after.bottom <= box.bottom + 1;
}

interface Props {
  open: boolean;
  items: ItemSummary[];
  byId: Map<string, ItemSummary>;
  /** Item currently in the slot being edited, preselected so its stats show. */
  currentId: string | null;
  /** Slot-kind mask the target slot accepts; only matching items are listed. */
  slotKind: number;
  slotLabel: string;
  strings: Strings;
  onSelect: (item: ItemSummary) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ItemPicker({
  open,
  items,
  byId,
  currentId,
  slotKind,
  slotLabel,
  strings,
  onSelect,
  onClear,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef(new Map<string, HTMLButtonElement | null>());
  /** Set when the dialog opens, cleared once the right control has been given focus. */
  const [claimFocus, setClaimFocus] = useState(false);
  /**
   * The row still owed a scroll, by item id.
   *
   * A ref and not state because what consumes it is a ref callback: the
   * dialog's content mounts a commit later than `open` becomes true — Radix
   * flips it in a layout effect — so the moment the row enters the DOM is the
   * only moment that is reliably after it exists, and effects cannot see it.
   */
  const owedReveal = useRef<string | null>(null);

  const reveal = useCallback((row: HTMLElement) => {
    // `preventScroll`, because the browser's own idea of bringing a focused
    // element into view is the top or bottom edge; the middle is what makes
    // the neighbours — the reason you opened the list at all — visible too.
    row.focus({ preventScroll: true });

    /*
     * Keep trying until the row is actually in view.
     *
     * One pass is not enough and no fixed delay is either: the dialog is still
     * zooming in, the scroll area sets its own overflow up as it mounts, and
     * focus moves around while all of that happens. Rather than guess at when
     * it has settled, this checks whether the row ended up on screen and tries
     * again next frame if not — for at most two thirds of a second, after
     * which something is wrong that another frame will not fix.
     */
    let framesLeft = 40;
    const settle = () => {
      if (!row.isConnected) return;
      if (centreRow(row) || framesLeft-- <= 0) {
        if (import.meta.env.DEV) {
          const viewport = scrollerOf(row);
          // Temporary, and only in dev: three attempts at this have missed, so
          // the next report should come with numbers rather than a symptom.
          console.debug('[picker] reveal', {
            item: row.getAttribute('data-item-id'),
            framesUsed: 40 - framesLeft,
            viewport: viewport?.getAttribute('data-slot') ?? viewport?.tagName ?? null,
            scrollTop: viewport?.scrollTop,
            clientHeight: viewport?.clientHeight,
            scrollHeight: viewport?.scrollHeight,
            rowTop: Math.round(row.getBoundingClientRect().top),
            viewportTop: viewport ? Math.round(viewport.getBoundingClientRect().top) : null,
          });
        }
        return;
      }
      requestAnimationFrame(settle);
    };
    settle();
  }, []);

  // The board's shared store, so opening the dialog after a slot has already
  // been hovered costs nothing — and opening it first leaves the stats there
  // for the hover cards.
  const details = useItemDetailsStore();

  useEffect(() => {
    if (open) details?.request();
  }, [open, details]);

  /*
   * Opening the dialog.
   *
   * The search text is deliberately *not* cleared: filling six slots usually
   * means six variations on one search, and retyping it each time was the
   * whole complaint. It is dropped only when keeping it would be worse than
   * losing it — when it hides the item this slot already holds, or when it
   * belongs to a slot of another kind and would leave an empty list.
   *
   * Depends on `open` alone on purpose. Everything else is read as it stood
   * when the dialog opened, which is the correct moment; re-running this when
   * the stats finish loading would yank focus back out of wherever the person
   * had moved it.
   */
  useLayoutEffect(() => {
    if (!open) {
      owedReveal.current = null;
      return;
    }
    setFocusId(currentId);
    owedReveal.current = currentId;
    setQuery((previous) => {
      if (previous.trim() === '') return previous;
      const matches = filterItems(items, slotKind, previous);
      if (matches.length === 0) return '';
      if (currentId !== null && !matches.some((i) => i.id === currentId)) return '';
      return previous;
    });
    setClaimFocus(true);
  }, [open]);

  const { shown, total } = useMemo(() => {
    const matches = filterItems(items, slotKind, query);
    return { shown: resultWindow(matches, currentId), total: matches.length };
  }, [items, query, slotKind, currentId]);

  /*
   * Where the caret lands. The slot's own item if it has one — it is what you
   * came to look at, and it may be a long way down the list — otherwise the
   * search box, which is what an empty slot wants.
   *
   * Runs after the list has rendered with whatever the effect above decided
   * about the query, which is why it is a second pass rather than the same one.
   */
  useLayoutEffect(() => {
    if (!open || !claimFocus) return;
    setClaimFocus(false);

    // Nothing in the slot: the search box is what an empty one wants.
    if (currentId === null) {
      inputRef.current?.focus();
      return;
    }
    // Already handled by the row's own ref callback, which is the usual case.
    if (owedReveal.current !== currentId) return;

    // The row is only findable here when it was mounted before this pass —
    // reopening on the same slot, say. The map is the fast path; the query is
    // there because what matters is a row on screen, not whether a callback ran.
    const row =
      rowsRef.current.get(currentId) ??
      listRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(currentId)}"]`);
    // Not mounted yet — leave it owed, and the ref callback will pick it up.
    if (!row) return;
    owedReveal.current = null;

    reveal(row);
  }, [open, claimFocus, currentId, shown, reveal]);

  const focused = focusId ? (byId.get(focusId) ?? null) : null;

  /*
   * The stats pane starts at the top of whatever is selected.
   *
   * Without this it keeps the scroll position of the item before it, so
   * picking a short item after a long one opens it halfway down — or past its
   * end, on an item with nothing but a name and a price.
   */
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [focusId]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* The dialog's own opening focus is declined: this one knows better
          where the caret belongs — see the effect above. */}
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex h-[86vh] max-h-[720px] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="space-y-1 px-5 pt-5 pb-3">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {strings.pickItem}
            <Badge variant="secondary">{slotLabel}</Badge>
            <Badge variant="outline" className="font-normal">
              {strings.provisional}
            </Badge>
          </DialogTitle>
          <DialogDescription>{strings.pickerHint}</DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* results */}
          <div className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
            <div className="px-4 pt-3">
              {/* The relative box wraps the input only, so the icon centres on
                  the field rather than on the padded container around it. */}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="search"
                  value={query}
                  placeholder={strings.searchPlaceholder}
                  aria-label={strings.searchPlaceholder}
                  className="pl-8"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    listRef.current?.scrollTo({ top: 0 });
                  }}
                />
              </div>
            </div>

            <p className="px-4 py-2 text-xs text-muted-foreground">
              {total === 0
                ? strings.noResults
                : total > RESULT_LIMIT
                  ? strings.resultsCapped(shown.length, total)
                  : strings.itemCount(total)}
            </p>

            <ScrollArea className="min-h-0 flex-1" viewportRef={listRef}>
              <ul className="space-y-0.5 px-2 pb-3">
                {shown.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-item-id={item.id}
                      ref={(el) => {
                        // React hands back null on unmount; dropping the entry
                        // then keeps the map to the rows actually on screen.
                        if (!el) {
                          rowsRef.current.delete(item.id);
                          return;
                        }
                        rowsRef.current.set(item.id, el);
                        // The row the dialog opened for, the instant it exists.
                        if (owedReveal.current === item.id) {
                          owedReveal.current = null;
                          reveal(el);
                        }
                      }}
                      // A single click only inspects, so browsing never
                      // overwrites a slot by accident; the footer button (or a
                      // double click) commits the choice.
                      //
                      // Click and keyboard focus move the selection; passing
                      // the cursor over a row does not. Hover used to, and it
                      // meant the stats beside the list changed under you on
                      // the way to the scrollbar.
                      onClick={() => setFocusId(item.id)}
                      onDoubleClick={() => onSelect(item)}
                      onFocus={() => setFocusId(item.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors',
                        item.id === focusId ? 'border-primary bg-accent' : 'hover:bg-accent/60',
                      )}
                    >
                      <ItemIcon icon={item.icon} alt="" size={34} fit="cover" className="rounded-sm" />
                      <span className="flex min-w-0 flex-col">
                        <span
                          className="truncate text-sm leading-tight"
                          style={{ color: qualityColor(item.quality) }}
                        >
                          {item.name}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {item.type} · {strings.level} {item.level} · {strings.cost} {item.cost}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          {/* details */}
          <ScrollArea className="min-h-0" viewportRef={paneRef}>
            <ItemDetails
              summary={focused}
              full={focused ? details?.full?.[focused.id] : undefined}
              detail={focused ? details?.detail?.[focused.id] : undefined}
              names={byId}
              strings={strings}
              loading={!!details?.loading && !!focused}
            />
            {details?.error && <p className="px-4 pb-4 text-sm text-destructive">{details.error}</p>}
          </ScrollArea>
        </div>

        <Separator />

        <DialogFooter className="flex-row justify-end gap-2 px-5 py-3">
          {/* Destructive only while it would actually do something. */}
          <Button
            variant={currentId === null ? 'ghost' : 'destructive'}
            onClick={onClear}
            disabled={currentId === null}
          >
            {strings.clearSlot}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {strings.close}
          </Button>
          <Button disabled={!focused} onClick={() => focused && onSelect(focused)}>
            {strings.placeInSlot}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
