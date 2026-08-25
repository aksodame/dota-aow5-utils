import { useEffect, useMemo, useRef, useState } from 'react';
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

  // The board's shared store, so opening the dialog after a slot has already
  // been hovered costs nothing — and opening it first leaves the stats there
  // for the hover cards.
  const details = useItemDetailsStore();

  useEffect(() => {
    if (!open) return;
    details?.request();
    setQuery('');
    setFocusId(currentId);
  }, [open, currentId, details]);

  const { shown, total } = useMemo(() => {
    // Slot type first, then the text query: a potion slot never lists armour.
    const eligible = items.filter((i) => itemFitsSlot(i.kinds, slotKind));
    const needle = query.trim().toLowerCase();
    const matches = needle === '' ? eligible : eligible.filter((i) => i.search.includes(needle));
    return { shown: matches.slice(0, RESULT_LIMIT), total: matches.length };
  }, [items, query, slotKind]);

  const focused = focusId ? (byId.get(focusId) ?? null) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[86vh] max-h-[720px] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
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
                  autoFocus
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
                      // A single click only inspects, so browsing never
                      // overwrites a slot by accident; the footer button (or a
                      // double click) commits the choice.
                      onClick={() => setFocusId(item.id)}
                      onDoubleClick={() => onSelect(item)}
                      onMouseEnter={() => setFocusId(item.id)}
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
          <ScrollArea className="min-h-0">
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
