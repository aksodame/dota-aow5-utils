import { memo, useMemo } from 'react';
import { Button, Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { rarityLabel } from '@/i18n/strings';
import { qualityVar } from './Tile';
/*
 * The browse sidebar's own stylesheet, imported rather than copied.
 *
 * These two panels are the same control in two places — the ask was that the
 * catalogue read like the front page — and a second file of the same rules is
 * how the two drift a pixel at a time until only one of them gets a fix.
 */
import styles from './Filters.module.css';

/**
 * The catalogue's left sidebar: type, tier, rarity.
 *
 * Deliberately not `Filters`. That one filters *builds*, over facets the server
 * understands and a query it debounces; this filters an array already in
 * memory, over the three columns of an index row that anybody actually narrows
 * by. Sharing the component would have meant one with two disjoint halves and a
 * mode flag; sharing the stylesheet gets the part that was asked for, which is
 * that they look the same.
 *
 * Memoised for the reason the other one is: it sits beside a grid of 1,885
 * tiles that re-renders whenever the query changes, and none of these chips
 * have anything to do with what was typed.
 */

export interface ItemFilterState {
  /** Item categories to include. Empty means every category. */
  types: string[];
  /** 1-10 progression tiers. Empty means every tier. */
  tiers: number[];
  /** 1-7 rarity grades. Empty means every grade. */
  qualities: number[];
}

export const EMPTY_ITEM_FILTERS: ItemFilterState = { types: [], tiers: [], qualities: [] };

export function isItemFiltered(value: ItemFilterState): boolean {
  return value.types.length > 0 || value.tiers.length > 0 || value.qualities.length > 0;
}

/** Adds or removes one value, keeping the list sorted so two equal states compare equal. */
function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item)
    ? list.filter((x) => x !== item)
    : [...list, item].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

interface ItemFiltersProps {
  value: ItemFilterState;
  onChange: (next: ItemFilterState) => void;
  /**
   * The categories this deployment's table actually has.
   *
   * Taken from the data rather than from a literal list, so a category the
   * addon adds appears here without an edit, and one it drops stops being a
   * chip that matches nothing.
   */
  types: readonly string[];
}

export const ItemFilters = memo(function ItemFilters({ value, onChange, types }: ItemFiltersProps) {
  const { strings } = useApp();
  const t = strings.itemsPage;

  const set = (patch: Partial<ItemFilterState>) => onChange({ ...value, ...patch });

  // 1-10, which is the whole progression. Written out rather than derived from
  // the data: a tier with nothing in it today is still a tier, and a row of
  // chips that changes length between paks is a row that moves under the cursor.
  const tiers = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
  const qualities = useMemo(() => Array.from({ length: 7 }, (_, i) => i + 1), []);

  return (
    <Panel
      fill
      className={styles.panel}
      title={strings.filters.heading}
      action={
        isItemFiltered(value) ? (
          <span className={styles.count}>{value.types.length + value.tiers.length + value.qualities.length}</span>
        ) : undefined
      }
    >
      <div className={styles.scroll}>
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>{t.filterType}</span>
          </div>
          <div className={styles.tiers}>
            {types.map((type) => {
              const on = value.types.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  className={cx(styles.tier, on && styles.tierOn)}
                  onClick={() => set({ types: toggle(value.types, type) })}
                  aria-pressed={on}
                >
                  {strings.itemTypes[type] ?? type}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>{t.filterTier}</span>
          </div>
          {/* The same chips the browse sidebar uses for a build's tier, so `T6`
              means one thing on both pages. */}
          <div className={styles.tiers}>
            {tiers.map((tier) => {
              const on = value.tiers.includes(tier);
              return (
                <button
                  key={tier}
                  type="button"
                  className={cx(styles.tier, on && styles.tierOn)}
                  onClick={() => set({ tiers: toggle(value.tiers, tier) })}
                  aria-pressed={on}
                >
                  T{tier}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>{t.filterRarity}</span>
          </div>
          {/*
            Named, and in the grade's own colour when it is lit. A row of
            `1`…`7` would be the shortest control and the least readable one:
            the grade is a word people use — "mythic" — and the colour is how
            it is recognised on every tile the site draws.
          */}
          <div className={styles.tiers}>
            {qualities.map((quality) => {
              const on = value.qualities.includes(quality);
              return (
                <button
                  key={quality}
                  type="button"
                  className={cx(styles.tier, on && styles.tierOn)}
                  style={on ? { backgroundColor: qualityVar(quality), borderColor: qualityVar(quality) } : undefined}
                  onClick={() => set({ qualities: toggle(value.qualities, quality) })}
                  aria-pressed={on}
                >
                  {rarityLabel(strings, quality)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Always drawn and disabled when there is nothing to clear, as the browse
          sidebar's is: a button that appears changes the panel's height under
          the cursor that was moving towards it. */}
      <div className={styles.footer}>
        <Button
          variant="ghost"
          size="sm"
          block
          disabled={!isItemFiltered(value)}
          onClick={() => onChange(EMPTY_ITEM_FILTERS)}
        >
          {strings.filters.clear}
        </Button>
      </div>
    </Panel>
  );
});
