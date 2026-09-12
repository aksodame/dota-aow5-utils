/**
 * The farm overlay's preview session: the evening every picture of it draws.
 *
 * There are two pictures now — `HudPreview` on the web app's `/tracker` page,
 * and the social card the API rasterizes for that page's `og:image` — and
 * neither of them may invent its own numbers. A card that promises a 50k best
 * drop and a page that shows 38k is two claims about one screenshot, and the
 * card is the one people see first.
 *
 * So the session lives here, in the package both already depend on, and both
 * derive everything from it through `previewReadout`. The tracker itself does
 * not use any of this: it has a real session to read. This is the *depiction*,
 * which is a different thing with one job — being the same in both places.
 *
 * What is here is the arithmetic and the facts. The words are not: each surface
 * takes the overlay's labels from its own catalog, copied from
 * `apps/tracker/src/i18n/`, because that is where a translation belongs.
 */

/**
 * The room the session is in.
 *
 * A real id, so both pictures name it out of the same map table the tracker
 * reads — see `apps/tracker/data/rooms.json`, where `G001` carries the same
 * three names. It is also where these materials drop, which is the reason it is
 * this room and not a prettier one.
 */
export const PREVIEW_ROOM = 'G001';

/**
 * The focus chord on a fresh profile — `DEFAULT_SHORTCUTS` in
 * `apps/tracker/core/shortcuts.ts`, spelled the way `shortcutLabel` spells it.
 */
export const PREVIEW_HOTKEY = 'Ctrl+Alt+T';

/** One item's two piles: what the finished rooms gave, and what this one has. */
export interface PreviewPile {
  id: string;
  /** Across the rooms already finished this session. */
  finished: number;
  /** In the room you are standing in. The loot list is these. */
  room: number;
}

/**
 * The loot, as two columns rather than as a session total and a room total.
 *
 * Splitting it this way is what makes the panel's figures consistent by
 * construction instead of by care: the session is the two columns added, the
 * room is the second, and the average is the first divided by the rooms it came
 * from. A single hand-written "session gold" could quietly stop being the sum of
 * anything.
 *
 * The ids and the prices are the game's — names, rarity, art and unit cost all
 * come out of `items.index.json` at the reader's language. Only the quantities
 * are invented, and they are what an evening in Skyfall Realm looks like.
 */
export const PREVIEW_LOOT: readonly PreviewPile[] = [
  { id: 'item_0588', finished: 17, room: 3 }, // Skyfall Crystal, 2,500g
  { id: 'item_0587', finished: 41, room: 11 }, // Skyfall Fragment, 800g
  { id: 'item_G001_2', finished: 7, room: 2 }, // Glyph: Assault II, 600g
  { id: 'item_P001', finished: 32, room: 6 }, // Health Potion, 120g
];

/** Rooms finished: the trophy on the room line, and the average's denominator. */
export const PREVIEW_RUNS = 12;

/** Seconds since the session started, hideout included. */
export const PREVIEW_SESSION_SECONDS = 42 * 60 + 8;

/** Seconds in the room you are standing in. */
export const PREVIEW_ROOM_SECONDS = 72;

/**
 * `1234` → `1.2k`, `123100000` → `123.1M`.
 *
 * The overlay's own `compact`, from `apps/tracker/src/lib/format.ts`, and
 * deliberately **not** `formatGold` from this same package. That one truncates
 * and writes a lowercase `m`, because a build's price is a number somebody is
 * deciding whether they can afford and rounding it up says a build is cheaper
 * to reach than it is. A farm readout is a rate, so the overlay rounds — and a
 * picture of the overlay has to abbreviate the way the overlay does, or the
 * figures on it are figures the app would never print.
 */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const scaled = (by: number, suffix: string): string => `${(n / by).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  if (Math.abs(n) >= 1_000_000) return scaled(1_000_000, 'M');
  if (Math.abs(n) >= 1_000) return scaled(1_000, 'k');
  return n.toFixed(0);
}

/** Seconds as `mm:ss`, growing to `h:mm:ss` only when there are hours to show. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The facts about one item that a picture of the overlay needs.
 *
 * A structural type rather than an import of `ItemSummary`: the web app hands
 * over rows out of `loadCore`, and the API hands over rows it built from the
 * index it imports at module load. Neither should have to match the other's
 * shape for four fields.
 */
export interface PreviewItem {
  id: string;
  /** In the reader's language. */
  name: string;
  /** The filename under `icons/items/`. */
  icon: string;
  /** 1–7. Drives the colour the name is drawn in. */
  quality: number;
  /** Gold for one, as the game prices it. */
  cost: number;
}

/** One row of the loot list, priced. */
export interface PreviewRow {
  item: PreviewItem;
  qty: number;
  /** Gold for one. */
  unit: number;
  /** Gold for the pile. */
  total: number;
}

export interface PreviewReadout {
  /** The room's loot, total descending — the sort the readout opens on. */
  rows: PreviewRow[];
  /** What the room below is worth. The heading's figure, and the `mapGold` card. */
  roomGold: number;
  /** The whole evening, the open room included. */
  sessionGold: number;
  /** Mean gold of the rooms actually finished. The open one does not count yet. */
  averageRunGold: number;
  /**
   * The single item that carried the session, by what the pile is worth rather
   * than how big it is — forty branches are not the answer to "what am I here
   * for", and one glyph usually is. The Torchlight layout's headline.
   *
   * Null only when the lookup knew none of the ids, which is a deployment whose
   * item table has moved out from under this file.
   */
  best: { item: PreviewItem; qty: number; total: number } | null;
}

/**
 * Every figure on the panel, from one item lookup.
 *
 * Takes a lookup rather than a table so the caller keeps its own: the web app
 * has `core.byId` already loaded for the page it is on, and the API has the
 * index it imports. An id the lookup does not know is dropped rather than
 * drawn — the picture is then missing a row, which is a better failure than a
 * row with no name and a price of `NaN`.
 */
export function previewReadout(lookup: (id: string) => PreviewItem | undefined): PreviewReadout {
  const piles = PREVIEW_LOOT.flatMap((pile) => {
    const item = lookup(pile.id);
    return item === undefined ? [] : [{ ...pile, item }];
  });

  const rows: PreviewRow[] = piles
    .filter((pile) => pile.room > 0)
    .map((pile) => ({ item: pile.item, qty: pile.room, unit: pile.item.cost, total: pile.item.cost * pile.room }))
    .sort((a, b) => b.total - a.total);

  const roomGold = rows.reduce((n, row) => n + row.total, 0);
  const finishedGold = piles.reduce((n, pile) => n + pile.item.cost * pile.finished, 0);

  const best = piles
    .map((pile) => {
      const qty = pile.finished + pile.room;
      return { item: pile.item, qty, total: pile.item.cost * qty };
    })
    .reduce<PreviewReadout['best']>((top, pile) => (top === null || pile.total > top.total ? pile : top), null);

  return {
    rows,
    roomGold,
    sessionGold: finishedGold + roomGold,
    // `PREVIEW_RUNS` is a constant above zero, so this cannot divide by it.
    averageRunGold: finishedGold / PREVIEW_RUNS,
    best,
  };
}
