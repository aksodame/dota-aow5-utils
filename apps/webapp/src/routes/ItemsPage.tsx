import { useDeferredValue, useMemo, useState } from 'react';
import { iconUrl, type ItemSummary } from 'aow5-shared/data';
import { SLOT_KIND } from 'aow5-shared/types';
import { inConsumables, type ItemsExtraFile } from 'aow5-shared/wiki';
import { useApp } from '@/data/AppData';
import { qualityVar } from '@/components/Tile';
import {
  EMPTY_ITEM_FILTERS,
  ItemFilters,
  isItemFiltered,
  type ItemFilterState,
} from '@/components/ItemFilters';
import { itemPath } from '@/router';
import { rarityLabel } from '@/i18n/strings';
import { WikiEmpty, WikiList, WikiRow, WikiShell, WikiSidebar, collate, useWikiData } from '@/wiki/kit';
import { ItemPage } from './ItemPage';
import styles from './ItemsPage.module.css';

/**
 * The catalogue, at `/wiki/items` and `/wiki/items/<id>`.
 *
 * **The layout the original wiki had**, which is the shape its readers already
 * know: the filters and the item list down the left, the picked item's card in
 * the column beside it. It used to be a wall of tiles here and a page of its
 * own for every item — a good shape for browsing and a bad one for the way the
 * tab is actually used: read one item, then the next.
 *
 * The two addresses are one screen. `/wiki/items` is the list with nothing
 * picked; `/wiki/items/<id>` is the same list with that item's card open — so
 * a link to an item still names the item and still lands on it, and clicking a
 * row is a navigation rather than a state change: Back returns to the item
 * looked at before, and a row can still be opened in a new tab or copied.
 *
 * Where it differs from the original: the list is drawn from the index already
 * in memory (no fetch, no windowing), and the rows are the wiki's own rows —
 * the same ones the monsters section draws.
 */
export function ItemsPage({ itemId }: { itemId?: string }) {
  const { core, strings, lang } = useApp();
  const t = strings.itemsPage;

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ItemFilterState>(EMPTY_ITEM_FILTERS);
  /*
   * The filter runs over ~1,900 rows and rebuilds a list of that many nodes,
   * which is enough to make a fast typist feel each keystroke. Deferring lets
   * the input stay responsive and the list catch up a frame later.
   */
  const deferred = useDeferredValue(query);

  /*
   * What the catalogue holds: the worn things. Potions, elixirs and the chests
   * that open into pools are the Consumables section's list — the same rule
   * decides both, so the two tabs cannot drift — and a recipe is a pointer at
   * what it makes rather than a thing to read. Recipes keep their own address
   * (`/wiki/items/<id>`), the monsters that drop one still link to it, and the
   * card of the item it makes still names it.
   */
  const extra = useWikiData<[ItemsExtraFile]>(['items-extra.json']).data;
  const items = useMemo(() => {
    if (core === null || extra === null) return [];
    const file = extra[0];
    /*
     * The rows already carry the season the wiki describes — the index is
     * emitted with its level, grade and price — so the list, the filters and
     * the card agree without a second overlay here.
     */
    return core.items.filter((i) => i.type !== 'blueprint' && !inConsumables(file, { id: i.id, type: i.type }));
  }, [core, extra]);

  /** The categories this table actually has, in the order the select draws them. */
  const types = useMemo(() => {
    const own = [...new Set(items.map((i) => i.type))].sort();
    /*
     * Life Souls are typed `equip` in the item table, like everything worn, so
     * no category finds them on their own — the original wiki gave them an
     * entry of their own for that reason. One more option, keyed on the slot
     * kind the pipeline already computes.
     */
    return items.some(isSoul) ? [...own, SOUL_TYPE] : own;
  }, [items]);

  /*
   * The original's order, kept: by level, then the better grade first, then by
   * name. The index itself is ordered by id, which is stable and meaningless
   * to a reader.
   */
  const shown = useMemo(() => {
    const list = matching(items, deferred, filters);
    const cmp = collate(lang);
    return [...list].sort(
      (a, b) => a.level - b.level || b.quality - a.quality || cmp(a.name, b.name),
    );
  }, [items, deferred, filters, lang]);

  const narrowed = deferred.trim() !== '' || isItemFiltered(filters);

  const reset = () => {
    setQuery('');
    setFilters(EMPTY_ITEM_FILTERS);
  };

  return (
    <WikiShell columns="detail">
      <WikiSidebar
        className={styles.sidebar}
        title={t.heading}
        filters={<ItemFilters value={filters} onChange={setFilters} types={types} />}
        search={{ value: query, onChange: setQuery, placeholder: t.searchPlaceholder, label: t.searchLabel }}
        searchAt="bottom"
        count={
          core === null
            ? undefined
            : narrowed
              ? t.found(shown.length, items.length)
              : t.total(items.length)
        }
        onReset={reset}
        resetDisabled={!narrowed}
      >
        {core === null ? (
          <p className={styles.empty}>{strings.itemPage.loading}</p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>{t.none}</p>
        ) : (
          <WikiList>
            {shown.map((item) => (
              <ItemRow key={item.id} item={item} active={item.id === itemId} />
            ))}
          </WikiList>
        )}
      </WikiSidebar>

      <div className={styles.detail}>
        {itemId === undefined || core === null ? (
          <WikiEmpty>{t.pickItem}</WikiEmpty>
        ) : (
          <ItemPage itemId={itemId} embedded />
        )}
      </div>
    </WikiShell>
  );
}

/**
 * One row of the list: the art ringed in its grade, the name, and under it the
 * id, the level, the grade and what it costs — the original's line, which is
 * what a reader wants before opening the card.
 */
function ItemRow({ item, active }: { item: ItemSummary; active: boolean }) {
  const { strings } = useApp();
  const t = strings.itemsPage;
  const meta = [
    item.id,
    item.level > 0 ? t.level(item.level) : null,
    rarityLabel(strings, item.quality),
    item.cost > 0 ? t.cost(item.cost) : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  return (
    <WikiRow
      href={itemPath(item.id)}
      active={active}
      icon={
        <span className={styles.art} style={{ borderColor: qualityVar(item.quality) }}>
          <img src={iconUrl(item.icon)} alt="" loading="lazy" decoding="async" />
        </span>
      }
      title={item.name}
      meta={meta}
    />
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
 * The facets are `AND`ed with the query and with each other, and an empty
 * value means "any" rather than "none" — the shape every filter on this site
 * uses, and the shape the original's "Any" button meant.
 */
function matching(items: ItemSummary[], query: string, filters: ItemFilterState): ItemSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length === 0 && !isItemFiltered(filters)) return items;

  const { level, type, quality } = filters;
  return items.filter((item) => {
    if (level !== '' && item.level !== level) return false;
    if (type !== '' && item.type !== type && !(type === SOUL_TYPE && isSoul(item))) return false;
    if (quality !== '' && item.quality !== quality) return false;
    return words.every((word) => item.search.includes(word));
  });
}

/** The category of Life Souls: `strings.itemTypes.soul` is the game's own name for them. */
const SOUL_TYPE = 'soul';

function isSoul(item: ItemSummary): boolean {
  return (item.kinds & SLOT_KIND.SOUL) !== 0;
}
