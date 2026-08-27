import type { RunOutcome } from './stats.ts';
import type { SourceKind } from './ipc.ts';

/**
 * The farming archive: what happened, kept after the app closes.
 *
 * The live session in `stats.ts` answers "how is this room going right now"
 * and dies with the process. This answers "how did the last twenty sessions
 * go", which is a different question and the only one worth keeping a file
 * for. Nothing here derives numbers — it stores what was observed, as it was
 * observed, and leaves gold-per-hour to the reducer that already knows how to
 * compute it.
 *
 * Written as one JSON object per line. Append-only, because the thing most
 * likely to interrupt a write is the player quitting the game and the app with
 * it: a half-written line costs the run that was being recorded, where a
 * rewritten document would have cost the archive.
 */

/** Opens a session. Written lazily — a launch that farms nothing leaves no trace. */
export interface HistorySession {
  kind: 'session';
  /** Start time in epoch ms, doubling as the id. Unique enough at one launch per millisecond. */
  id: number;
  source: SourceKind;
}

/** One finished run. */
export interface HistoryRun {
  kind: 'run';
  session: number;
  room: string;
  /** Epoch ms at the moment the run closed. The game clock is per-match and cannot date anything. */
  endedAt: number;
  /** Seconds inside the room. */
  duration: number;
  outcome: RunOutcome;
  /** Wallet gold gained, when the game reported gold at all. */
  gold: number;
  /** `[itemId, quantity]`, exactly as the events carried them — names and prices are the renderer's job. */
  items: [string, number][];
}

export type HistoryRecord = HistorySession | HistoryRun;

/** A session with its runs, as the History view wants them. */
export interface SessionHistory {
  id: number;
  source: SourceKind;
  runs: HistoryRun[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `[["item_G002", 3], ...]`, skipping any pair that is not one. */
function readItems(value: unknown): [string, number][] {
  if (!Array.isArray(value)) return [];
  const out: [string, number][] = [];
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [id, qty] = pair as [unknown, unknown];
    if (typeof id === 'string' && isNumber(qty)) out.push([id, qty]);
  }
  return out;
}

/**
 * Reads one archived line.
 *
 * Returns null rather than throwing for anything unrecognisable: the file
 * outlives the build that wrote it, so an older shape, a truncated last line
 * or a hand edit all have to cost one record and not the archive.
 */
export function parseRecord(line: string): HistoryRecord | null {
  let payload: unknown;
  try {
    payload = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(payload)) return null;

  if (payload['kind'] === 'session') {
    if (!isNumber(payload['id'])) return null;
    return { kind: 'session', id: payload['id'], source: payload['source'] === 'console' ? 'console' : 'mock' };
  }

  if (payload['kind'] === 'run') {
    if (!isNumber(payload['session']) || typeof payload['room'] !== 'string') return null;
    return {
      kind: 'run',
      session: payload['session'],
      room: payload['room'],
      endedAt: isNumber(payload['endedAt']) ? payload['endedAt'] : 0,
      duration: isNumber(payload['duration']) ? payload['duration'] : 0,
      outcome: typeof payload['outcome'] === 'string' ? (payload['outcome'] as RunOutcome) : 'other',
      gold: isNumber(payload['gold']) ? payload['gold'] : 0,
      items: readItems(payload['items']),
    };
  }

  return null;
}

/**
 * Groups flat records into sessions, newest first.
 *
 * A run whose session line never made it to disk still gets a home: the
 * archive is append-only and a crash between the two writes is exactly the
 * moment worth not losing data, so an unheralded session id is invented rather
 * than dropped.
 */
export function groupSessions(records: Iterable<HistoryRecord>): SessionHistory[] {
  const sessions = new Map<number, SessionHistory>();

  const ensure = (id: number, source: SourceKind): SessionHistory => {
    const existing = sessions.get(id);
    if (existing) return existing;
    const created: SessionHistory = { id, source, runs: [] };
    sessions.set(id, created);
    return created;
  };

  for (const record of records) {
    if (record.kind === 'session') ensure(record.id, record.source).source = record.source;
    else ensure(record.session, 'mock').runs.push(record);
  }

  const out = [...sessions.values()];
  for (const session of out) session.runs.sort((a, b) => b.endedAt - a.endedAt);
  return out.sort((a, b) => b.id - a.id);
}

/**
 * How many sessions one page of the archive shows.
 *
 * Ten because it is roughly a fortnight of evenings, and because the window it
 * is drawn in has a floor of 240px: a page has to be short enough that the
 * pager under it is reachable without scrolling past the sessions to find out
 * there are more. The archive itself is uncapped — this is what is *drawn*, and
 * nothing here deletes or forgets anything.
 */
export const SESSIONS_PER_PAGE = 10;

/** One page of a list, and where it sits in the whole. */
export interface Page<T> {
  items: T[];
  /** 0-based, and always inside the list — see `pageOf`. */
  index: number;
  /** At least 1, so an empty archive is still page 1 of 1 rather than 1 of 0. */
  count: number;
}

/**
 * One page of sessions, with the page number clamped into range.
 *
 * The clamping is the whole reason this is a function rather than a `slice` in
 * the view. The list under it changes while a page number is being held: a
 * refresh picks up a session that ended, and deleting the ticked ones can take
 * a whole page away. A page index left pointing past the end draws an empty
 * archive — which is indistinguishable from a broken one, and arrives at the
 * exact moment somebody has just deleted something.
 *
 * Clamped rather than reset to the first page: page 4 losing a session should
 * land on the last page there is, not send the reader back to the top of an
 * archive they were partway through.
 */
export function pageOf<T>(all: readonly T[], page: number, size = SESSIONS_PER_PAGE): Page<T> {
  const count = Math.max(1, Math.ceil(all.length / size));
  // `|| 0` for a NaN out of a hand-edited or absent value: an index that is not
  // a number should be the first page, not an empty one.
  const index = Math.min(Math.max(Math.trunc(page) || 0, 0), count - 1);
  const start = index * size;
  return { items: all.slice(start, start + size), index, count };
}

/** Totals for one session, the numbers its header shows. */
export interface SessionTotals {
  runs: number;
  /** Seconds spent inside rooms — the same denominator the live rates use. */
  activeTime: number;
  gold: number;
  items: number;
  /** Item totals across the session, richest quantity first. */
  byItem: { id: string; qty: number }[];
}

export function sessionTotals(session: SessionHistory): SessionTotals {
  const byItem = new Map<string, number>();
  let activeTime = 0;
  let gold = 0;
  let items = 0;

  for (const run of session.runs) {
    activeTime += run.duration;
    gold += run.gold;
    for (const [id, qty] of run.items) {
      byItem.set(id, (byItem.get(id) ?? 0) + qty);
      items += qty;
    }
  }

  return {
    runs: session.runs.length,
    activeTime,
    gold,
    items,
    byItem: [...byItem.entries()].map(([id, qty]) => ({ id, qty })).sort((a, b) => b.qty - a.qty),
  };
}
