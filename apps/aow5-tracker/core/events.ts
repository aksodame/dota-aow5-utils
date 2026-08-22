/**
 * The event contract between Age of Weapons 5 and this tracker.
 *
 * These are the `[AOW5TRK] {json}` lines the addon prints, documented in
 * `docs/EVENT-CONTRACT.md`. **Shipped as of 2026-08-22**, in a form narrowed
 * from the original request, which differs from it in three ways this file has
 * to absorb:
 *
 *   - **No `t`.** The narrowed request omitted it, and the shipped lines
 *     follow. Dota timestamps every console line to the
 *     second anyway, so the clock is read off the line when the payload has
 *     none — see `parseConsoleTimestamp`.
 *   - **No `backpack` event.** That was the periodic snapshot we withdrew.
 * It is still accepted here: the shape costs nothing to keep
 *     and the addon may yet emit it. Nothing may *depend* on it arriving.
 *   - **`drop` carries `player`**, the slot filter that was asked for.
 *
 * The mock source still produces the full original shape, `t` and `backpack`
 * included, so the reducer stays exercised against a feed richer than today's.
 *
 * Parsing is deliberately defensive: this schema is a request, not a promise.
 * An unrecognised event, a wrong `v`, or an outright malformed line must never
 * throw and never kill the tail — it is counted and skipped, so the UI can say
 * "the game is emitting something I do not understand" rather than quietly
 * showing zeros.
 */

export const TRACKER_PREFIX = '[AOW5TRK]';
/** Schema version we understand. Anything else is skipped and counted. */
export const SUPPORTED_VERSION = 1;

/**
 * Entering a room.
 *
 * `t` is seconds — the addon's clock when it sends one, otherwise the console
 * line's own timestamp. Only differences are ever taken, so either origin
 * serves, as long as a single session does not mix the two.
 */
export interface RoomEnterEvent {
  v: 1;
  e: 'room_enter';
  t: number;
  room: string;
  level?: number;
  type?: string;
  mode?: string;
}

/** Leaving a room. `reason` separates a clear from a death or a quit. */
export interface RoomExitEvent {
  v: 1;
  e: 'room_exit';
  t: number;
  room: string;
  reason?: string;
  gold?: number;
}

/** A backpack snapshot. `gold` is the exact total, not the UI's abbreviated form. */
export interface BackpackEvent {
  v: 1;
  e: 'backpack';
  t: number;
  count: number;
  cap?: number;
  value: number;
  gold?: number;
  /** `[itemId, quantity]` pairs. Absent when the addon sends totals only. */
  backpack?: [string, number][];
}

/** One pickup, possibly of several stacks at once. */
export interface DropEvent {
  v: 1;
  e: 'drop';
  t: number;
  src?: string;
  items: [string, number][];
  /**
   * Player slot the pickup belongs to, as the addon reports it.
   *
   * The pickup feed shows every player's drops, so in a party this is the only
   * thing separating your loot from theirs. Recorded but not filtered on:
   * nothing here knows which slot is the local player, and assuming "slot 0"
   * would silently zero the session for anyone who is not it.
   */
  player?: number;
}

export type TrackerEvent = RoomEnterEvent | RoomExitEvent | BackpackEvent | DropEvent;
export type TrackerEventKind = TrackerEvent['e'];

export interface ParseResult {
  events: TrackerEvent[];
  /** Lines that carried the prefix but could not be used, with why. */
  skipped: { line: string; reason: string }[];
}

/**
 * `08/22 14:15:05` — the date and clock Dota puts at the head of every console
 * line, to the second. No year, which is why the value below is relative.
 */
const CONSOLE_TIMESTAMP = /^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\b/;

const SECONDS_PER_DAY = 86_400;
/** Days elapsed before each month, in a non-leap year. */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/**
 * Seconds since the start of the year for a console line, or `undefined` when
 * the line carries no timestamp.
 *
 * An arbitrary origin is fine because every consumer subtracts: durations and
 * rates are differences, never absolute times. February 29 collapses onto March
 * 1 for want of a year in the log — worth a day to a run spanning that
 * midnight, and nothing at all to any other.
 */
export function parseConsoleTimestamp(line: string): number | undefined {
  const m = CONSOLE_TIMESTAMP.exec(line);
  if (!m) return undefined;

  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const days = MONTH_START[month - 1]! + (day - 1);
  return days * SECONDS_PER_DAY + Number(m[3]) * 3600 + Number(m[4]) * 60 + Number(m[5]);
}

/**
 * A `parseConsoleTimestamp` that survives New Year.
 *
 * With no year in the log, January 1 reads as *earlier* than December 31, and a
 * clock that jumps backwards never recovers: `stats` only ever advances its
 * clock, so from that moment every run would measure zero and every rate would
 * decay to nothing — silently, which is the failure this file exists to avoid.
 * A backwards jump of more than a day is therefore read as a year boundary.
 *
 * Stateful, so one instance belongs to one tail.
 */
export function createConsoleClock(): (line: string) => number | undefined {
  let carried = 0;
  let previous: number | null = null;

  return (line) => {
    const seconds = parseConsoleTimestamp(line);
    if (seconds === undefined) return undefined;
    if (previous !== null && seconds < previous - SECONDS_PER_DAY) carried += 365 * SECONDS_PER_DAY;
    previous = seconds;
    return carried + seconds;
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `[["item_G002", 3], ...]`, tolerating the odd malformed pair rather than rejecting the event. */
function readPairs(value: unknown): [string, number][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: [string, number][] = [];
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [id, qty] = pair as [unknown, unknown];
    if (typeof id !== 'string' || !isNumber(qty)) continue;
    out.push([id, qty]);
  }
  return out;
}

/**
 * Outcome of validating one payload.
 *
 * A tagged union rather than `Event | { reason }` — `RoomExitEvent` has its own
 * `reason` field, so testing for that property would classify every successful
 * room exit as a failure. An explicit `ok` flag cannot collide with payload data.
 */
export type ValidationResult = { ok: true; event: TrackerEvent } | { ok: false; reason: string };

const bad = (reason: string): ValidationResult => ({ ok: false, reason });
const good = (event: TrackerEvent): ValidationResult => ({ ok: true, event });

/**
 * Validates one already-parsed JSON payload into a `TrackerEvent`.
 *
 * Reports *why* a payload is unusable rather than silently dropping it.
 *
 * `fallbackT` is the clock read off the console line the payload arrived on.
 * The shipped addon sends no `t`, so for a live line this is the only clock
 * there is; a payload carrying its own still wins, since the addon's game clock
 * beats a second-resolution wall clock.
 */
export function validateEvent(payload: unknown, fallbackT?: number): ValidationResult {
  if (!isRecord(payload)) return bad('not an object');
  if (payload['v'] !== SUPPORTED_VERSION) return bad(`unsupported schema version ${String(payload['v'])}`);

  const t = isNumber(payload['t']) ? payload['t'] : fallbackT;
  if (t === undefined) return bad('no clock: neither a numeric t nor a console timestamp on the line');

  const kind = payload['e'];

  switch (kind) {
    case 'room_enter': {
      if (typeof payload['room'] !== 'string') return bad('room_enter without a room id');
      const out: RoomEnterEvent = { v: 1, e: 'room_enter', t, room: payload['room'] };
      if (isNumber(payload['level'])) out.level = payload['level'];
      if (typeof payload['type'] === 'string') out.type = payload['type'];
      if (typeof payload['mode'] === 'string') out.mode = payload['mode'];
      return good(out);
    }
    case 'room_exit': {
      if (typeof payload['room'] !== 'string') return bad('room_exit without a room id');
      const out: RoomExitEvent = { v: 1, e: 'room_exit', t, room: payload['room'] };
      if (typeof payload['reason'] === 'string') out.reason = payload['reason'];
      if (isNumber(payload['gold'])) out.gold = payload['gold'];
      return good(out);
    }
    case 'backpack': {
      if (!isNumber(payload['count'])) return bad('backpack without a count');
      if (!isNumber(payload['value'])) return bad('backpack without a value');
      const out: BackpackEvent = { v: 1, e: 'backpack', t, count: payload['count'], value: payload['value'] };
      if (isNumber(payload['cap'])) out.cap = payload['cap'];
      if (isNumber(payload['gold'])) out.gold = payload['gold'];
      const contents = readPairs(payload['backpack']);
      if (contents) out.backpack = contents;
      return good(out);
    }
    case 'drop': {
      const items = readPairs(payload['items']);
      if (!items) return bad('drop without an items array');
      const out: DropEvent = { v: 1, e: 'drop', t, items };
      if (typeof payload['src'] === 'string') out.src = payload['src'];
      if (isNumber(payload['player'])) out.player = payload['player'];
      return good(out);
    }
    default:
      return bad(`unknown event kind ${JSON.stringify(kind)}`);
  }
}

export interface ParseOptions {
  /**
   * Reads the clock off a raw line, for payloads carrying no `t` of their own —
   * which today is all of them.
   *
   * Defaults to the stateless `parseConsoleTimestamp`. A long-lived tail passes
   * `createConsoleClock()` instead, so the clock keeps going across New Year; a
   * one-shot parse of a few lines has no reason to care.
   */
  clock?: (line: string) => number | undefined;
}

/**
 * Pulls tracker events out of raw console lines.
 *
 * Lines without the prefix are ignored silently — the console log is mostly
 * Dota's own chatter and it is not our business. Only a line that *claims* to
 * be ours and then fails is worth reporting.
 */
export function parseLines(lines: Iterable<string>, options: ParseOptions = {}): ParseResult {
  const { clock = parseConsoleTimestamp } = options;
  const events: TrackerEvent[] = [];
  const skipped: { line: string; reason: string }[] = [];

  for (const line of lines) {
    const at = line.indexOf(TRACKER_PREFIX);
    if (at < 0) continue;

    const json = line.slice(at + TRACKER_PREFIX.length).trim();
    // A line that merely *mentions* the prefix is not a broken tracker line.
    // Dota echoes the launch options into `[CommandLine]`, so a player who put
    // `+con_filter_text [AOW5TRK]` there has one of these every session — and
    // reporting it as unreadable teaches them to ignore the one diagnostic
    // that is supposed to mean something.
    if (!json.startsWith('{')) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      skipped.push({ line, reason: 'payload is not valid JSON' });
      continue;
    }

    const result = validateEvent(payload, clock(line));
    if (result.ok) events.push(result.event);
    else skipped.push({ line, reason: result.reason });
  }

  return { events, skipped };
}

/** Serialises an event the way the addon is asked to emit it. Used by the mock and by tests. */
export function formatLine(event: TrackerEvent): string {
  return `${TRACKER_PREFIX} ${JSON.stringify(event)}`;
}
