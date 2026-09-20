/**
 * Reading and writing a build's reforge priority.
 *
 * The column holds JSON, so this file is what stands in for a schema: every
 * value that reaches the database has been through `parsePriority`, and what is
 * stored is *this module's* serialisation rather than the bytes a client sent.
 * That is the whole bargain of a JSON column — one place parses, and it refuses
 * rather than repairs.
 *
 * What it deliberately does **not** check is whether a stat key belongs to the
 * item in that slot. The API does not carry the game's item table — it holds the
 * frozen id tables and nothing about what an item *is* — and inventing a copy of
 * the stat lists here would be a second thing to keep in step with the pak. The
 * browser has that data and only ever offers real keys; a hand-made request that
 * stores a nonsense key gets a panel that quietly ignores it, which is a smaller
 * failure than a validator that goes stale.
 */
import {
  MAX_PRIORITY_ITEMS,
  MAX_PRIORITY_NOTE,
  MAX_PRIORITY_STATS,
  MAX_REFORGE_LEVEL,
  MAX_STAT_RANK,
  type BuildItemPriority,
  type BuildPriority,
  type BuildStatPriority,
} from 'aow5-api-contract';
import { stripControl, textLength, type FieldErrors } from './validate.ts';

/** The loadout is sixteen slots; a plan may only speak about those. */
const MAX_SLOT = MAX_PRIORITY_ITEMS - 1;

/** An item's `values` key, as the extracted data spells them. */
const STAT_KEY = /^[a-z0-9_]{1,64}$/;

const invalid = (message: string): { ok: false; errors: FieldErrors } => ({
  ok: false,
  errors: { priority: message },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A whole number in range, or `undefined`.
 *
 * Fractions are refused rather than truncated, for the reason a price is: a
 * reforge level of 4.5 is a client bug, and storing 4 would hide it.
 */
function whole(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value >= min && value <= max ? value : undefined;
}

function parseStat(raw: unknown): { ok: true; stat: BuildStatPriority } | { ok: false; errors: FieldErrors } {
  if (!isRecord(raw)) return invalid('Each stat is an object.');

  const key = typeof raw['key'] === 'string' ? raw['key'] : '';
  if (!STAT_KEY.test(key)) return invalid(`"${key}" is not a stat key.`);

  // Null and absent are both "any roll will do", which is the ordinary case:
  // most stats on most items are worth having rather than worth chasing.
  const rawTarget = raw['target'];
  let target: number | null = null;
  if (rawTarget !== null && rawTarget !== undefined) {
    const rank = whole(rawTarget, 0, MAX_STAT_RANK);
    if (rank === undefined) return invalid(`A target is one of the first ${MAX_STAT_RANK + 1} rolls, or nothing.`);
    target = rank;
  }

  return { ok: true, stat: { key, target } };
}

function parseItem(raw: unknown): { ok: true; item: BuildItemPriority } | { ok: false; errors: FieldErrors } {
  if (!isRecord(raw)) return invalid('Each item is an object.');

  const slot = whole(raw['slot'], 0, MAX_SLOT);
  if (slot === undefined) return invalid('A priority names a slot on the board.');

  const reforge = whole(raw['reforge'] ?? 0, 0, MAX_REFORGE_LEVEL);
  if (reforge === undefined) return invalid(`Reforge levels run from 0 to ${MAX_REFORGE_LEVEL}.`);

  const rawStats = raw['stats'];
  if (rawStats !== undefined && !Array.isArray(rawStats)) return invalid('A stat list is a list.');
  const list = Array.isArray(rawStats) ? rawStats : [];
  if (list.length > MAX_PRIORITY_STATS) return invalid(`An item may rank at most ${MAX_PRIORITY_STATS} stats.`);

  const stats: BuildStatPriority[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const parsed = parseStat(entry);
    if (!parsed.ok) return parsed;
    // A stat twice would be a list with two opinions about one number, and the
    // order — which *is* the priority — could not say which one won.
    if (seen.has(parsed.stat.key)) return invalid(`${parsed.stat.key} is ranked twice.`);
    seen.add(parsed.stat.key);
    stats.push(parsed.stat);
  }

  /*
   * The two affixes have to be stats the plan actually ranks.
   *
   * This is the one cross-check available without the item table, and it is
   * worth having: it is exactly the shape of a client that has fallen out of
   * step with itself — a stat removed from the list while a badge pointing at
   * it stayed behind.
   */
  const affix = (field: 'fixed' | 'enhanced'): { ok: true; value: string | null } | { ok: false; errors: FieldErrors } => {
    const value = raw[field];
    if (value === undefined || value === null || value === '') return { ok: true, value: null };
    if (typeof value !== 'string' || !STAT_KEY.test(value)) return invalid(`"${String(value)}" is not a stat key.`);
    if (!seen.has(value)) return invalid(`${value} is marked ${field} but is not in the list.`);
    return { ok: true, value };
  };

  const fixed = affix('fixed');
  if (!fixed.ok) return fixed;
  const enhanced = affix('enhanced');
  if (!enhanced.ok) return enhanced;

  /*
   * Absent is false: a build written before the forge was a field said nothing
   * about one, and "not stated" is exactly what those meant.
   */
  const rawDivine = raw['divine'];
  if (rawDivine !== undefined && rawDivine !== null && typeof rawDivine !== 'boolean') {
    return invalid('A divine-forge mark is true or false.');
  }
  const divine = rawDivine === true;

  const rawNote = raw['note'];
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    return invalid('A note is text.');
  }
  const note = typeof rawNote === 'string' ? stripControl(rawNote).trim() : '';
  if (textLength(note) > MAX_PRIORITY_NOTE) {
    return invalid(`Item notes are at most ${MAX_PRIORITY_NOTE} characters.`);
  }

  return { ok: true, item: { slot, reforge, divine, fixed: fixed.value, enhanced: enhanced.value, stats, note } };
}

/**
 * True for an entry that says nothing.
 *
 * The editor draws a card for every item on the board whether or not its author
 * has an opinion about it, so most saves carry a handful of untouched ones.
 * Storing those would make "has a priority" untrue for every build that has
 * merely been opened in the editor.
 */
function isEmpty(item: BuildItemPriority): boolean {
  return (
    item.reforge === 0 &&
    !item.divine &&
    item.fixed === null &&
    item.enhanced === null &&
    item.note === '' &&
    item.stats.every((stat) => stat.target === null)
  );
}

/**
 * Whatever arrived, as something storable.
 *
 * Ordered by slot on the way in, so the stored document reads in board order
 * however the client happened to send it — a diff between two saves should be
 * about what changed, not about which card somebody touched first.
 */
export function parsePriority(
  input: unknown,
): { ok: true; priority: BuildPriority } | { ok: false; errors: FieldErrors } {
  if (input === undefined || input === null) return { ok: true, priority: [] };
  if (!Array.isArray(input)) return invalid('A priority is a list of items.');
  if (input.length > MAX_PRIORITY_ITEMS) return invalid(`A build has at most ${MAX_PRIORITY_ITEMS} slots.`);

  const items: BuildItemPriority[] = [];
  const slots = new Set<number>();
  for (const entry of input) {
    const parsed = parseItem(entry);
    if (!parsed.ok) return parsed;
    if (slots.has(parsed.item.slot)) return invalid(`Slot ${parsed.item.slot} appears twice.`);
    slots.add(parsed.item.slot);
    if (!isEmpty(parsed.item)) items.push(parsed.item);
  }

  items.sort((a, b) => a.slot - b.slot);
  return { ok: true, priority: items };
}

/** The column's value for a priority. `''` for one that says nothing. */
export function serialisePriority(priority: BuildPriority): string {
  return priority.length === 0 ? '' : JSON.stringify(priority);
}

/**
 * The column's value, back as a priority.
 *
 * Defensive about its own storage: a row written by an older deployment, or by
 * hand, must not be able to break the page that renders it. Anything unreadable
 * comes back as "no priority", which is what the build looked like before the
 * column existed.
 */
export function readPriority(stored: string): BuildPriority {
  if (stored === '') return [];
  try {
    const parsed = parsePriority(JSON.parse(stored));
    return parsed.ok ? parsed.priority : [];
  } catch {
    return [];
  }
}
