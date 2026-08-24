import { RoomTable, type RoomRow } from '@core/rooms.ts';
import type { Locale } from '@core/locale.ts';
import { useLocale } from '@/i18n';
import rooms from '../../../data/rooms.json';

/**
 * The room table, one per language, resolved on first use.
 *
 * The same shape as `features/items/table.ts`, for the same reasons: the JSON
 * is bundled so there is nothing to await and no failure to handle, and a table
 * per language because `rooms.json` carries the names in all three — extracted
 * from the very `name_*` tokens the addon prints the room line with.
 *
 * The cast is the price of a generated file. TypeScript reads `rooms.json` as
 * an object with one property per room it happens to contain today, which is
 * not something an id from the game can index — and pinning the app's types to
 * the exact contents of an extracted file would break the build every time the
 * game adds a room.
 */

const tables = new Map<Locale, RoomTable>();

/** The table for one language. Memoized, so repeated renders share one. */
export function roomTableFor(locale: Locale): RoomTable {
  let table = tables.get(locale);
  if (table === undefined) {
    table = RoomTable.from(rooms.rooms as Record<string, RoomRow>, locale);
    tables.set(locale, table);
  }
  return table;
}

/** The table for the language this window is drawing in. */
export function useRooms(): RoomTable {
  return roomTableFor(useLocale());
}
