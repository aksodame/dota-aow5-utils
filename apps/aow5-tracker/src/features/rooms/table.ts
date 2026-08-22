import { RoomTable, type RoomRow } from '@core/rooms.ts';
import rooms from '../../../data/rooms.json';

/**
 * The room table, resolved once for the life of the app.
 *
 * The same eagerness as `features/items/table.ts`, for the same reason: the
 * JSON is bundled, so there is nothing to await and no failure to handle, and
 * every overlay that shows a room can just import it.
 *
 * The cast is the price of a generated file. TypeScript reads `rooms.json` as
 * an object with one property per room it happens to contain today, which is
 * not something an id from the game can index — and pinning the app's types to
 * the exact contents of an extracted file would break the build every time the
 * game adds a room.
 */
export const roomTable: RoomTable = RoomTable.from(rooms.rooms as Record<string, RoomRow>);
