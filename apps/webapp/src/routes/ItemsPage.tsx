import { useDeferredValue, useMemo, useState } from 'react';
import { iconUrl, type ItemSummary } from 'aow5-shared/data';
import { Input } from '@/ui';
import { useApp } from '@/data/AppData';
import { qualityVar } from '@/components/Tile';
import { itemPath, Link } from '@/router';
import styles from './ItemsPage.module.css';

/**
 * The catalogue: every playable item, as a grid.
 *
 * The picker answers "which of these fits this slot"; this answers "what is in
 * this game". So it is unfiltered by slot kind, it is a page rather than a
 * dialog, and every tile is a real link — which is what makes an item's page
 * reachable by walking rather than only by knowing its id.
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
  /*
   * The filter runs over ~1,900 rows and rebuilds a grid of that many nodes,
   * which is enough to make a fast typist feel each keystroke. Deferring lets
   * the input stay responsive and the grid catch up a frame later.
   */
  const deferred = useDeferredValue(query);

  const items = core?.items ?? [];
  const shown = useMemo(() => matching(items, deferred), [items, deferred]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.heading}>{t.heading}</h1>
        <p className={styles.count}>
          {shown.length === items.length ? t.total(items.length) : t.found(shown.length, items.length)}
        </p>
      </header>

      <div className={styles.searchRow}>
        <Input
          type="search"
          className={styles.search}
          value={query}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

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
    </div>
  );
}

/**
 * Name and id, both.
 *
 * `ItemSummary.search` is already `"<name> <id>"` lowercased — the picker's
 * search field is built on it — so matching an id costs nothing extra and
 * `item_G502` finds the rune somebody read in a changelog. A query with spaces
 * in it has to match every word rather than the whole phrase, so "ancestral
 * bow" finds `Ancestral: Focus Bow`.
 */
function matching(items: ItemSummary[], query: string): ItemSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => words.every((word) => item.search.includes(word)));
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
