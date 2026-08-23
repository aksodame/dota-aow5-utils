/**
 * Resolves the room ids the addon reports into the names on the screen.
 *
 * `data/rooms.json` was extracted for the opposite journey: the room line used
 * to print the *localized name*, and `spike/parse-console.ts` mapped it back to
 * an id through this table. Now that the addon emits `{"room":"M009"}` the same
 * table is read the natural way round — and the fragility that motivated the
 * request in `docs/EVENT-CONTRACT.md` is gone, because a missed name now costs a
 * label rather than the identity of the run.
 *
 * Browser-safe: no `node:` imports and no I/O. Constructing the table from the
 * bundled JSON is the renderer's job, exactly as `items.ts` leaves that to
 * `src/features/items/table.ts`.
 */

/** One row of `data/rooms.json`. Every field optional — it is extracted data, not a contract. */
export interface RoomRow {
  en?: string;
  ru?: string;
  type?: string;
  level?: number;
}

export interface RoomInfo {
  id: string;
  /** Display name, or the id itself when the table has never heard of it. */
  name: string;
  type: string;
  level: number;
}

/**
 * The unknown-room row.
 *
 * Falling back to the id rather than to "unknown" matters: rooms are added
 * every patch, and an id the table has not caught up with is still perfectly
 * readable to a player who has been farming it all evening.
 */
function unknown(id: string): RoomInfo {
  return { id, name: id, type: 'unknown', level: 0 };
}

export class RoomTable {
  private readonly byId: Map<string, RoomInfo>;

  private constructor(rooms: RoomInfo[]) {
    this.byId = new Map(rooms.map((r) => [r.id, r]));
  }

  /**
   * English, matching the item table.
   *
   * `rooms.json` carries `ru` as well, but the overlay's own chrome is English
   * and translating the room names alone would produce a half-translated panel.
   */
  static from(rows: Record<string, RoomRow>): RoomTable {
    return new RoomTable(
      Object.entries(rows).map(([id, row]) => ({
        id,
        name: row.en ?? id,
        type: row.type ?? 'unknown',
        level: row.level ?? 0,
      })),
    );
  }

  get(id: string): RoomInfo {
    return this.byId.get(id) ?? unknown(id);
  }

  /** The name to show for a room id. Never empty, and never throws. */
  name(id: string): string {
    return this.get(id).name;
  }
}
