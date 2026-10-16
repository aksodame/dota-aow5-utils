import { memo } from 'react';
import { Select, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { rarityLabel } from '@/i18n/strings';
import { qualityVar } from './Tile';
/*
 * The kit's sidebar styles and its labelled group, imported rather than copied.
 *
 * The filters live inside the wiki's own sidebar now — the one the monsters
 * section draws — so they take its rhythm: the same group heading, the same
 * chips. A second file of the same rules is how the two drift a pixel at a
 * time until only one of them gets a fix.
 */
import { FilterGroup } from '@/wiki/kit';
import styles from './ItemFilters.module.css';

/**
 * The catalogue's left sidebar: level, type, rarity.
 *
 * **The original wiki's three controls, in its order.** Levels are a row of
 * buttons — "All", then 1–10, five to a row — because that is how the wiki
 * that this one replaces drew them and how its readers picked a tier; type and
 * rarity are selects, because a category and a grade are one-of-many choices
 * and a select says so without a wall of chips.
 *
 * The search box is not here: it belongs to the sidebar that holds this, which
 * draws it under the filters so it narrows what they left.
 *
 * Memoised for the reason the browse sidebar's is: it sits beside a list of
 * 1,885 rows that re-renders whenever the query changes, and none of these
 * controls have anything to do with what was typed.
 */

export interface ItemFilterState {
  /** One progression tier (1-10), or '' for every tier. */
  level: number | '';
  /** One item category, or '' for every category. */
  type: string;
  /** One rarity grade (1-7), or '' for every grade. */
  quality: number | '';
}

export const EMPTY_ITEM_FILTERS: ItemFilterState = { level: '', type: '', quality: '' };

export function isItemFiltered(value: ItemFilterState): boolean {
  return value.level !== '' || value.type !== '' || value.quality !== '';
}

interface ItemFiltersProps {
  value: ItemFilterState;
  onChange: (next: ItemFilterState) => void;
  /**
   * The categories this deployment's table actually has.
   *
   * Taken from the data rather than from a literal list, so a category the
   * addon adds appears here without an edit, and one it drops stops being an
   * option that matches nothing.
   */
  types: readonly string[];
}

export const ItemFilters = memo(function ItemFilters({ value, onChange, types }: ItemFiltersProps) {
  const { strings } = useApp();
  const t = strings.itemsPage;

  // 1-10, written out rather than derived from the data: a level with nothing
  // in it today is still a level, and a row of buttons that changes length
  // between paks is a row that moves under the cursor.
  const levels = Array.from({ length: 10 }, (_, i) => i + 1);
  const qualities = Array.from({ length: 7 }, (_, i) => i + 1);

  const levelButton = (level: number | '') => {
    const on = value.level === level;
    return (
      <button
        key={String(level)}
        type="button"
        className={cx(styles.level, on && styles.levelOn)}
        aria-pressed={on}
        title={level === '' ? undefined : t.level(level)}
        onClick={() => onChange({ ...value, level })}
      >
        {level === '' ? strings.filters.any : level}
      </button>
    );
  };

  return (
    <>
      {/*
        No heading: "Any" over a row of numbers says what the block is. "Any"
        takes a row of its own and the levels go five to a row, which is the
        shape the original wiki drew and the shape its readers picked a tier by.
      */}
      <div className={styles.levelGroup}>
        <div className={styles.levelsAll}>{levelButton('')}</div>
        <div className={styles.levels}>{levels.slice(0, 5).map(levelButton)}</div>
        <div className={styles.levels}>{levels.slice(5).map(levelButton)}</div>
      </div>

      <FilterGroup label={t.filterType}>
        <Select
          className={styles.select}
          value={value.type}
          aria-label={t.filterType}
          onChange={(event) => onChange({ ...value, type: event.target.value })}
        >
          <option value="">{strings.filters.any}</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {strings.itemTypes[type] ?? type}
            </option>
          ))}
        </Select>
      </FilterGroup>

      <FilterGroup label={t.filterRarity}>
        {/*
          Named, and in the grade's own colour: the grade is a word people use —
          "mythic" — and the colour is how it is recognised on every tile the
          site draws.
        */}
        <Select
          className={styles.select}
          value={String(value.quality)}
          style={value.quality === '' ? undefined : { color: qualityVar(value.quality) }}
          aria-label={t.filterRarity}
          onChange={(event) => onChange({ ...value, quality: event.target.value === '' ? '' : Number(event.target.value) })}
        >
          <option value="">{strings.filters.any}</option>
          {qualities.map((quality) => (
            <option key={quality} value={quality}>
              {rarityLabel(strings, quality)}
            </option>
          ))}
        </Select>
      </FilterGroup>
    </>
  );
});
