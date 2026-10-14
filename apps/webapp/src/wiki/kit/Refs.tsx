import type { ReactNode } from 'react';
import type { ItemSummary } from 'aow5-shared/data';
import { useApp } from '@/data/AppData';
import { ItemTile } from '@/components/Tile';
import { Input, cx } from '@/ui';
import { itemPath, Link } from '@/router';
import { useWikiStrings } from '../i18n';
import { COMMON } from '../i18n/common';
import { setAuctionPrice, useAuctionPrice } from './auction';
import styles from './Refs.module.css';

/**
 * An item, wherever the wiki mentions one.
 *
 * Its art in its rarity ring with the game's own hover card — the same tile the
 * builder draws — and its name, as a link to its page. Every list of drops, every
 * recipe and every vendor shelf is made of these, so an item looks and behaves
 * the same everywhere on the site.
 *
 * An id the item table does not know is drawn as its id, unlinked: the wiki's
 * tables and the item table come from the same pak, so this only happens for
 * the handful of ids the addon references and never defines.
 */
export function ItemRef({
  id,
  count,
  extra,
  size = 'md',
  bare = false,
  href,
}: {
  id: string;
  /** `×3`, drawn after the name. */
  count?: number | string;
  /** Anything after the name: a chance, a price. */
  extra?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** The tile alone, without the name. */
  bare?: boolean;
  /**
   * Where the link goes, when not the item's own page — a consumable's page
   * is in the Consumables section, as the original wiki linked it.
   */
  href?: string;
}) {
  const { core } = useApp();
  const item = core?.byId.get(id);

  if (item === undefined) {
    return <code className={styles.unknown}>{id}</code>;
  }

  return (
    <Link to={{ href: href ?? itemPath(id) }} className={cx(styles.ref, styles[size], bare && styles.bare)} title={item.name}>
      <span className={styles.art}>
        <ItemTile item={item} />
      </span>
      {!bare && (
        <span className={styles.text}>
          <span className={styles.name}>
            {item.name}
            {count !== undefined && <span className={styles.count}> ×{count}</span>}
          </span>
          {extra !== undefined && <span className={styles.extra}>{extra}</span>}
        </span>
      )}
    </Link>
  );
}

/**
 * An item's tile at a list row's size.
 *
 * `ItemTile` is square and as wide as its box, which in a list row is no
 * width at all — so on its own it grew to the row's full width. This pins it
 * to the height of a title and one line of facts, the same size the monster
 * and hero lists draw their art at.
 */
export function RowTile({ item, size = 36 }: { item: ItemSummary; size?: number }) {
  return (
    <span className={styles.rowTile} style={{ width: size, height: size }}>
      <ItemTile item={item} />
    </span>
  );
}

/** A grid of item refs, the drop tables' shape. */
export function ItemGrid({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return <div className={cx(styles.grid, dense && styles.dense)}>{children}</div>;
}

/**
 * The reader's auction price for one item.
 *
 * Text rather than a number input, because a number input will not report the
 * caret position and the crafting tree redraws under the cursor. Clicks are
 * stopped here because the field sits inside rows that are links.
 */
export function AuctionField({ id }: { id: string }) {
  const t = useWikiStrings(COMMON);
  const price = useAuctionPrice(id);
  return (
    <label className={styles.auction} title={t.auction.title} onClick={(event) => event.stopPropagation()}>
      <span className={styles.auctionLabel}>{t.auction.label}</span>
      <Input
        className={styles.auctionInput}
        type="text"
        inputMode="numeric"
        placeholder="—"
        value={price === null ? '' : String(price)}
        onChange={(event) => setAuctionPrice(id, event.target.value)}
        onClick={(event) => event.stopPropagation()}
      />
      <span className={styles.auctionUnit}>{t.auction.unit}</span>
    </label>
  );
}
