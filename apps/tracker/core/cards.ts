/**
 * Which stat cards the HUD draws, and in what order.
 *
 * The list lives here rather than in the renderer because two processes need
 * it: the renderer draws from it, and `electron/config.ts` has to be able to
 * sanitise a saved copy without importing anything from `src/`. What a card
 * *looks* like — its icon, its label, the number it reads — stays in `Hud.tsx`,
 * which is the only place that has a `Rates` to read it from.
 *
 * `CARD_IDS` is also the draw order. Visibility is the only thing the player
 * sets; a card cannot be moved. That is deliberate — the two rows are two
 * questions, the session and the map, and letting the rows be shuffled into
 * any order would make the grouping meaningless while adding a second kind of
 * state to store, migrate and get wrong.
 */

/**
 * Every card, in the order they are drawn.
 *
 * Ids are persisted, so they are named for what the card *means* rather than
 * for where it sits or what it is currently labelled. Renaming one silently
 * hides that card for everyone who had it on — `readCards` cannot tell an id
 * that was renamed from one that was never valid.
 */
export const CARD_IDS = [
  // The session: how long, how much, and what carried it.
  'session',
  'sessionGold',
  'sessionBest',
  // The room you are standing in — time then gold, the same way round as the
  // row above — and then what a room is worth on average, which is the figure
  // the two beside it are read against.
  'mapTime',
  'mapGold',
  'mapGoldAverage',
  // Off by default. Both are real answers, neither is one of the six the HUD
  // is worth spending its width on before the player says otherwise.
  'mapTimeAverage',
  'goldPerHour',
] as const;

export type CardId = (typeof CARD_IDS)[number];

/**
 * The six that are on for a fresh profile.
 *
 * Two rows of three, because the grid is three wide and a row that is not full
 * reads as something missing rather than as a choice.
 */
export const DEFAULT_CARDS: CardId[] = ['session', 'sessionGold', 'sessionBest', 'mapTime', 'mapGold', 'mapGoldAverage'];

const KNOWN = new Set<string>(CARD_IDS);

export const isCardId = (value: unknown): value is CardId => typeof value === 'string' && KNOWN.has(value);

/**
 * Reads the saved list, and guarantees the HUD has something to draw.
 *
 * The floor of one card is enforced here rather than only in the settings UI,
 * because the UI is not the only thing that can produce an empty list: a
 * hand-edited file, a build where an id was renamed, or a `setConfig` from
 * anywhere at all. A HUD with no cards is a panel showing nothing, with the
 * only control that could fix it in a different window — so an empty result
 * falls back to the defaults rather than being honoured.
 *
 * Unknown ids are dropped instead of rejecting the whole list, so a file
 * written by a newer build still opens on an older one with the cards it
 * understands. Duplicates are collapsed: the list is a set, and drawing a card
 * twice is never what was meant.
 */
export function readCards(raw: unknown): CardId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CARDS];

  const seen = new Set<CardId>();
  for (const value of raw) if (isCardId(value)) seen.add(value);
  if (seen.size === 0) return [...DEFAULT_CARDS];

  // Ordered by CARD_IDS rather than by the saved array: draw order is fixed,
  // and a file that happens to list them in another order must not change it.
  return CARD_IDS.filter((id) => seen.has(id));
}

/*
 * How a card is *described* is not here.
 *
 * It used to be: a `CARD_INFO` table of names and sentences, in English,
 * beside the ids. That was the wrong home for it the moment the overlay
 * learned a second language — a name is a word, and words live in
 * `src/i18n/`, keyed by these same ids. What stays here is what both
 * processes need and neither can translate: which cards exist, in what
 * order, and how to read a saved list of them.
 */
