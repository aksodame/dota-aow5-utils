import type { ItemSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import { cn } from '@/lib/utils';
import { ItemIcon, qualityColor } from './ItemIcon';

interface Props {
  items: ItemSummary[];
  /** The row drawn as selected, if any. */
  focusId: string | null;
  /** Click and keyboard focus both land here: browsing selects, it does not commit. */
  onFocus: (item: ItemSummary) => void;
  /** Double click. Omitted where there is nothing to commit to. */
  onCommit?: (item: ItemSummary) => void;
  /**
   * Called for every row element as it mounts and unmounts, so a caller that
   * needs to scroll a particular row into view can hold on to it. Optional:
   * a list nobody has to scroll for does not need the bookkeeping.
   */
  rowRef?: (item: ItemSummary, el: HTMLButtonElement | null) => void;
  strings: Strings;
  className?: string;
}

/**
 * The item list itself: icon, name in its rarity colour, and the line of
 * numbers under it.
 *
 * Split out of ItemPicker because the picker dialog is only one place this
 * list appears — everything around it (the search box, the details pane, the
 * footer) belongs to the dialog, but the rows are what makes an item list look
 * like this app's item list, and that is worth having in one place.
 */
export function ItemResultList({ items, focusId, onFocus, onCommit, rowRef, strings, className }: Props) {
  return (
    <ul className={cn('space-y-0.5 px-2 pb-3', className)}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            data-item-id={item.id}
            ref={rowRef ? (el) => rowRef(item, el) : undefined}
            // A single click only inspects, so browsing never overwrites a
            // slot by accident; a double click commits the choice.
            //
            // Click and keyboard focus move the selection; passing the cursor
            // over a row does not. Hover used to, and it meant the stats
            // beside the list changed under you on the way to the scrollbar.
            onClick={() => onFocus(item)}
            onDoubleClick={onCommit ? () => onCommit(item) : undefined}
            onFocus={() => onFocus(item)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors',
              item.id === focusId ? 'border-primary bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <ItemIcon icon={item.icon} alt="" size={34} fit="cover" className="rounded-sm" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm leading-tight" style={{ color: qualityColor(item.quality) }}>
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
  );
}
