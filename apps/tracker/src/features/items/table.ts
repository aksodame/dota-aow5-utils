import index from 'aow5-shared/public/data/items.index.json';
import namesEn from 'aow5-shared/public/data/locale.en.names.json';
import namesRu from 'aow5-shared/public/data/locale.ru.names.json';
import namesZh from 'aow5-shared/public/data/locale.zh.names.json';
import { INDEX_COST, INDEX_ID } from 'aow5-shared/types';
import { ItemTable } from '@core/items.ts';
import type { Locale } from '@core/locale.ts';
import { useLocale } from '@/i18n';

/**
 * The item table, one per language, resolved on first use.
 *
 * Built at module load rather than behind a hook for the same reason it always
 * was: the data is bundled, so there is nothing to await and no failure to
 * handle, and a table that is never null keeps a `| null` out of every
 * component that shows an item.
 *
 * What changed in 0.1.6 is that there are three of them. `aow5-shared` emits a
 * name table per extracted language — the same tokens the game itself draws
 * from — so an item reads in the overlay exactly as it reads in the inventory.
 * Only the *names* differ between them; cost, quality, level and icon are the
 * same row of `items.index.json` whichever language is asked for, which is why
 * `itemCost` below does not take a locale at all.
 *
 * Built lazily per language rather than all three at load. The JSON is bundled
 * either way, but constructing a table is 1,800 objects and a session only ever
 * looks at one language — usually the same one for its whole life.
 */

/**
 * Names by language, imported statically.
 *
 * A dynamic `import()` per locale would defer roughly 150 KB of parse, and buy
 * a frame of an item list with ids in it every time the app starts. Static, and
 * the switch is instant.
 */
const NAMES: Record<Locale, Record<string, string>> = {
  en: namesEn.names,
  ru: namesRu.names,
  zh: namesZh.names,
};

const tables = new Map<Locale, ItemTable>();

/** The table for one language. Memoized, so repeated renders share one. */
export function itemTableFor(locale: Locale): ItemTable {
  let table = tables.get(locale);
  if (table === undefined) {
    table = ItemTable.from(index.rows, NAMES[locale]);
    tables.set(locale, table);
  }
  return table;
}

/** The table for the language this window is drawing in. */
export function useItems(): ItemTable {
  return itemTableFor(useLocale());
}

/**
 * What the game says an item sells for, with no language attached.
 *
 * Pricing has no opinion about names, and threading a locale into it would tie
 * every gold figure in the app to a setting that cannot change any of them. Off
 * the index rows directly, so asking for a cost does not build a name table.
 */
const COSTS: ReadonlyMap<string, number> = new Map(
  index.rows.map((row) => [row[INDEX_ID], row[INDEX_COST]] as const),
);

/** Table cost for an id, or 0 for an id the tables have never heard of. */
export const itemCost = (id: string): number => COSTS.get(id) ?? 0;
