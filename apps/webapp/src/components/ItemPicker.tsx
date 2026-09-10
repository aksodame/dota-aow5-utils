import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { iconUrl, type ItemSummary } from 'aow5-shared/data';
import { itemFitsSlot } from 'aow5-shared/types';
import { Button, Dialog, Icon, Input, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { ItemCard } from './ItemCard';
import { qualityVar } from './Tile';
import styles from './ItemPicker.module.css';

/**
 * The item browser: a filtered list on the left, the full record on the right.
 *
 * A grid of icons briefly replaced this and could not answer the question a
 * picker is opened to settle — what does this actually do — so the two-pane
 * shape is back. A single click inspects; the footer button or a double click
 * commits. That is what stops browsing from overwriting a slot by accident.
 */

/**
 * The most rows drawn at once.
 *
 * An unfiltered equipment slot matches several hundred items, and rendering
 * every one costs more than anybody scrolls through.
 */
const RESULT_LIMIT = 200;

/** Slot type first, then the text query: a potion slot never lists armour. */
function matching(items: ItemSummary[], accepts: number, query: string): ItemSummary[] {
  const eligible = items.filter((i) => itemFitsSlot(i.kinds, accepts));
  const needle = query.trim().toLowerCase();
  return needle === '' ? eligible : eligible.filter((i) => i.search.includes(needle));
}

/**
 * The slice actually drawn.
 *
 * Normally the first `RESULT_LIMIT`. The exception is the item the slot already
 * holds: the picker opens on it, so a window that left it out would preselect a
 * row nobody can see. When it sorts past the cap the window moves to sit around
 * it instead — same length, same order, different start.
 */
function windowed(matches: ItemSummary[], currentId: string | null): ItemSummary[] {
  if (matches.length <= RESULT_LIMIT) return matches;
  const at = currentId === null ? -1 : matches.findIndex((i) => i.id === currentId);
  if (at < RESULT_LIMIT) return matches.slice(0, RESULT_LIMIT);
  const start = Math.min(at - Math.floor(RESULT_LIMIT / 2), matches.length - RESULT_LIMIT);
  return matches.slice(start, start + RESULT_LIMIT);
}

interface ItemPickerProps {
  open: boolean;
  /** Slot-kind mask the target slot accepts; only matching items are listed. */
  accepts: number;
  /** What the slot already holds, preselected so its stats show on opening. */
  currentId: string | null;
  onSelect: (item: ItemSummary) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ItemPicker({ open, accepts, currentId, onSelect, onClear, onClose }: ItemPickerProps) {
  const { core, strings } = useApp();
  const details = useItemDetailsStore();

  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const rowsRef = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  const items = core?.items ?? [];

  const { shown, total } = useMemo(() => {
    const all = matching(items, accepts, query);
    return { shown: windowed(all, currentId), total: all.length };
  }, [items, accepts, query, currentId]);

  // The stats are what this dialog is for, so they are asked for on opening
  // rather than on first hover.
  useEffect(() => {
    if (open) details?.request();
  }, [open, details]);

  /*
   * Opening.
   *
   * The search text is deliberately *not* cleared: filling six slots is usually
   * six variations on one search. It is dropped only when keeping it would be
   * worse than losing it — when it would hide the item this slot already holds,
   * or when it belongs to a slot of another kind and would leave an empty list.
   */
  useLayoutEffect(() => {
    if (!open) return;
    setFocusId(currentId);
    setQuery((previous) => {
      if (previous.trim() === '') return previous;
      const all = matching(items, accepts, previous);
      if (all.length === 0) return '';
      if (currentId !== null && !all.some((i) => i.id === currentId)) return '';
      return previous;
    });
    // Deliberately keyed on `open` alone: everything else is read as it stood
    // at the moment the dialog opened, which is the correct moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /*
   * Bring the preselected row into the middle of the list.
   *
   * **A passive effect, not a layout one, and that is the whole fix.** `Dialog`
   * calls `showModal()` from its own `useEffect`, and React runs every layout
   * effect before any passive one — so a `useLayoutEffect` here measured a
   * dialog that was still `display: none`, where every box is zero and
   * scrolling is a no-op. The list opened at the top with the selected item
   * somewhere below the fold. Passive effects run child-first, so by the time
   * this one runs the dialog is open and has real layout.
   *
   * The container is scrolled directly rather than through `scrollIntoView`,
   * which also scrolls every scrollable ancestor — here that is the dialog body
   * and, on a short window, the page behind it.
   */
  useEffect(() => {
    if (!open || currentId === null) return;
    const row = rowsRef.current.get(currentId);
    const list = listRef.current;
    if (row === undefined || list === null) return;
    const delta = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += delta - (list.clientHeight - row.clientHeight) / 2;
  }, [open, currentId, shown]);

  /*
   * The pane starts at the top of whatever is selected. Without this it keeps
   * the previous item's scroll position, so a short item after a long one opens
   * halfway down — or past its end.
   */
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [focusId]);

  const focused = focusId === null ? undefined : core?.byId.get(focusId);

  return (
    <Dialog
      wide
      open={open}
      onClose={onClose}
      title={strings.editor.pickItem}
      footer={
        <>
          <Button variant={currentId === null ? 'ghost' : 'danger'} disabled={currentId === null} onClick={onClear}>
            {strings.editor.clearSlot}
          </Button>
          <Button variant="primary" disabled={focused === undefined} onClick={() => focused && onSelect(focused)}>
            {strings.editor.choose}
          </Button>
        </>
      }
    >
      <div className={styles.shell}>
        <div className={styles.list}>
          <div className={styles.search}>
            <Icon.Search size={15} className={styles.searchIcon} />
            <Input
              className={styles.searchInput}
              type="search"
              value={query}
              placeholder={strings.editor.search}
              aria-label={strings.editor.search}
              onChange={(event) => {
                setQuery(event.target.value);
                listRef.current?.scrollTo({ top: 0 });
              }}
            />
          </div>

          <p className={styles.count}>
            {total === 0
              ? strings.editor.noResults
              : total > shown.length
                ? `${shown.length} / ${total}`
                : String(total)}
          </p>

          <div className={styles.rows} ref={listRef}>
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                ref={(el) => {
                  // React hands back null on unmount; dropping the entry then
                  // keeps the map to the rows actually on screen.
                  if (el === null) rowsRef.current.delete(item.id);
                  else rowsRef.current.set(item.id, el);
                }}
                className={cx(styles.row, item.id === focusId && styles.rowOn)}
                // A single click inspects, so browsing never overwrites a slot
                // by accident. Focus selects too, so the keyboard behaves the
                // same way — but hover does not, or the stats beside the list
                // would change on the way to the scrollbar.
                onClick={() => setFocusId(item.id)}
                onFocus={() => setFocusId(item.id)}
                onDoubleClick={() => onSelect(item)}
              >
                <img className={styles.rowIcon} src={iconUrl(item.icon)} alt="" loading="lazy" />
                <span className={styles.rowText}>
                  <span className={styles.rowName} style={{ color: qualityVar(item.quality) }}>
                    {item.name}
                  </span>
                  <span className={styles.rowMeta}>
                    {item.type} · L{item.level}
                    {item.cost > 0 && ` · ${item.cost.toLocaleString()}g`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pane} ref={paneRef}>
          {focused === undefined ? (
            <p className={styles.empty}>{strings.editor.pickItem}</p>
          ) : (
            <ItemCard item={focused} />
          )}
        </div>
      </div>
    </Dialog>
  );
}
