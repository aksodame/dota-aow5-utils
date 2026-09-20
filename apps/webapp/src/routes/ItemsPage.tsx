import { useDeferredValue, useMemo, useState } from 'react';
import { iconUrl, type ItemSummary } from 'aow5-shared/data';
import { Icon, Input, Panel } from '@/ui';
import { useApp } from '@/data/AppData';
import { qualityVar } from '@/components/Tile';
import {
  EMPTY_ITEM_FILTERS,
  ItemFilters,
  isItemFiltered,
  type ItemFilterState,
} from '@/components/ItemFilters';
import { itemPath, Link } from '@/router';
import styles from './ItemsPage.module.css';

/**
 * The catalogue: filters on the left, items on the right.
 *
 * **The browse page's layout, deliberately.** Same two columns, same 260px
 * sidebar, same search bar in the same place above the same panel — because it
 * is the same kind of screen and somebody who has used one should not have to
 * learn the other. It shares that page's sidebar stylesheet for the same
 * reason; see `ItemFilters`.
 *
 * Where it differs is that nothing here is fetched. The whole index is already
 * in memory for the picker, so filtering is an array pass rather than a query,
 * which is why there is no debounce, no windowing and no skeleton.
 *
 * ## Everything at once, on purpose
 *
 * The picker caps its list at 200 because it is a scroll box inside a dialog
 * somebody is trying to get out of. A catalogue that stopped at 200 of 1,885
 * would be lying about what the game has, so all of them render and the tiles
 * carry `content-visibility: auto` — the browser then skips layout and paint
 * for the rows nobody has scrolled to, which is the part that actually costs.
 */
export function ItemsPage() {
  const { core, strings } = useApp();
  const t = strings.itemsPage;

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ItemFilterState>(EMPTY_ITEM_FILTERS);
  /*
   * The filter runs over ~1,900 rows and rebuilds a grid of that many nodes,
   * which is enough to make a fast typist feel each keystroke. Deferring lets
   * the input stay responsive and the grid catch up a frame later.
   */
  const deferred = useDeferredValue(query);

  const items = core?.items ?? [];

  /** The categories this table actually has, in the order the chips draw them. */
  const types = useMemo(() => [...new Set(items.map((i) => i.type))].sort(), [items]);

  const shown = useMemo(() => matching(items, deferred, filters), [items, deferred, filters]);
  const narrowed = deferred.trim() !== '' || isItemFiltered(filters);

  return (
    <div className={styles.page}>
      <ItemFilters value={filters} onChange={setFilters} types={types} />

      {/* The list column: its own search bar, then the grid. Siblings, so the
          sidebar's first line and the search bar's line up — as on browse. */}
      <div className={styles.column}>
        {/*
          No button, for the reason the browse search has none: it filters as
          you type, so a control whose only meaning is "now" is worth less than
          its width. Enter still submits, which costs nothing.
        */}
        <form className={styles.search} role="search" onSubmit={(event) => event.preventDefault()}>
          <Icon.Search size={16} className={styles.searchIcon} />
          <Input
            className={styles.searchInput}
            type="search"
            value={query}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchLabel}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>

        <p className={styles.count}>
          {narrowed ? t.found(shown.length, items.length) : t.total(items.length)}
        </p>

        <Panel flush>
          {core === null ? (
            <p className={styles.empty}>{strings.itemPage.loading}</p>
          ) : shown.length === 0 ? (
            <p className={styles.empty}>{t.none}</p>
          ) : (
            <ul className={styles.grid}>
              {shown.map((item) => (
                <ItemCell key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/**
 * Name and id for the text, then the three facets.
 *
 * `ItemSummary.search` is already `"<name> <id>"` lowercased — the picker's
 * search field is built on it — so matching an id costs nothing extra and
 * `item_G502` finds the rune somebody read in a changelog. A query with spaces
 * has to match every word rather than the whole phrase, so "ancestral bow"
 * finds `Ancestral: Focus Bow`.
 *
 * The facets are `AND`ed with the query and with each other, and an empty list
 * means "every one of these" rather than "none" — the shape every filter on
 * this site uses.
 */
function matching(items: ItemSummary[], query: string, filters: ItemFilterState): ItemSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const { types, tiers, qualities } = filters;

  if (words.length === 0 && !isItemFiltered(filters)) return items;

  return items.filter((item) => {
    if (types.length > 0 && !types.includes(item.type)) return false;
    if (tiers.length > 0 && !tiers.includes(item.level)) return false;
    if (qualities.length > 0 && !qualities.includes(item.quality)) return false;
    return words.every((word) => item.search.includes(word));
  });
}

/**
 * One tile: the art, ringed in its rarity, with the name under it.
 *
 * A real `<a>` rather than a click handler — middle-click, ctrl-click and "copy
 * link address" all work, which for a catalogue is most of how it gets used.
 */
function ItemCell({ item }: { item: ItemSummary }) {
  return (
    <li className={styles.cell}>
      <Link to={{ href: itemPath(item.id) }} className={styles.tile} title={`${item.name} · ${item.id}`}>
        <span className={styles.art} style={{ borderColor: qualityVar(item.quality) }}>
          <img src={iconUrl(item.icon)} alt="" loading="lazy" decoding="async" />
        </span>
        <span className={styles.name}>{item.name}</span>
      </Link>
    </li>
  );
}
