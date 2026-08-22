import type { TrackerEvent } from './events.ts';

/**
 * Turns the event stream into the numbers the overlay shows.
 *
 * Pure — no I/O, no Electron, no React — so `node --test` drives it directly
 * and the same reducer serves the mock and the live tail without knowing which
 * it is fed by.
 *
 * Two judgement calls are encoded here deliberately, because both are easy to
 * get quietly wrong and neither is recoverable once averaged in:
 *
 *   1. Rates are per **time spent inside runs**, not wall clock. Standing in
 *      town between rooms must not dilute gold/hour — that is the number you
 *      would use to decide which room to farm.
 *   2. A `room_enter` arriving while a run is already open ends that run, and
 *      it counts. The addon reports no exit when the player goes straight from
 *      one room into the next, so the only evidence the last room finished is
 *      that a new one started — which is evidence enough. Such a run is marked
 *      `chained` rather than `clear`, because nothing said it was cleared.
 *   3. Gold is what the loot is **worth**, priced from the item ids, unless the
 *      game reports a wallet figure — which today it never does. The addon
 *      sends no gold at all (`docs/EVENT-CONTRACT.md` — it was never asked for,
 *      since prices are already in the extracted tables), so pricing the drops
 *      is the only way this number exists. See `runGold`.
 *
 * Prices come in as a function rather than a table: this file is imported by
 * the Electron main process, and the item tables are a renderer-side bundle.
 *
 * `state.clock` only moves when an event arrives, so every derived number here
 * takes an optional `now` — a clock the caller has carried forward with real
 * time. Without it the open run's timer freezes between drops and lurches when
 * one lands, and every rate lurches with it, because they all divide by it.
 */

/**
 * How a run ended.
 *
 * `abandoned` is no longer produced — a `room_enter` closes the open run as
 * `chained` however long it had been going. It stays in the union because the
 * archive outlives the build that wrote it, and sessions recorded before that
 * rule carry it.
 */
export type RunOutcome = 'open' | 'clear' | 'chained' | 'abandoned' | 'other';

export interface Run {
  room: string;
  level?: number;
  type?: string;
  /** Game clock at entry, in seconds. */
  start: number;
  end?: number;
  outcome: RunOutcome;
  /** Reason string the addon gave on exit, when it gave one. */
  reason?: string;
  /** Items picked up during this run: id -> quantity. */
  items: Map<string, number>;
  /** Gold at the moment the run opened, if known. */
  goldAtStart?: number;
  /** Latest gold seen during (or at the end of) the run. */
  goldLatest?: number;
  /** Backpack value at the moment the run opened, if known. */
  valueAtStart?: number;
  valueLatest?: number;
}

export interface RoomAverages {
  room: string;
  runs: number;
  /** Mean duration of finished runs, seconds. Excludes abandoned ones. */
  averageClear: number;
  totalGold: number;
  totalItems: number;
}

export interface TrackerState {
  runs: Run[];
  /** The run in progress, or null between rooms. */
  current: Run | null;
  /** Latest backpack snapshot, whether or not a run is open. */
  backpack: { t: number; count: number; cap?: number; value: number; gold?: number } | null;
  /** Newest game clock seen from any event; drives the live elapsed readout. */
  clock: number;
  /** Items across the whole session: id -> quantity. */
  items: Map<string, number>;
}

export function createState(): TrackerState {
  return { runs: [], current: null, backpack: null, clock: 0, items: new Map() };
}

/**
 * A zeroed session that keeps tracking the room the player is standing in.
 *
 * Backing this with a plain `createState()` would make "clear session" look
 * broken mid-farm: the panel would drop to "between rooms · 0 runs" and stay
 * there until the next `room_enter`, which is a whole room away. Instead the
 * open run is reopened from the current clock, so the run timer restarts at
 * zero and gold is re-baselined against the wallet as it stands right now.
 */
export function resetState(previous: TrackerState | null): TrackerState {
  const state = createState();
  if (!previous) return state;

  state.clock = previous.clock;
  if (previous.backpack) state.backpack = { ...previous.backpack };

  const open = previous.current;
  if (open) {
    const run: Run = { room: open.room, start: previous.clock, outcome: 'open', items: new Map() };
    if (open.level !== undefined) run.level = open.level;
    if (open.type !== undefined) run.type = open.type;
    if (state.backpack?.gold !== undefined) run.goldAtStart = state.backpack.gold;
    if (state.backpack?.value !== undefined) run.valueAtStart = state.backpack.value;
    state.current = run;
  }
  return state;
}

/**
 * Gold value of a quantity of an item.
 *
 * Supplied by the caller — `ItemTable.value` in the renderer — because a
 * reducer that imported the item tables would drag 1,000-odd rows into the main
 * process for a number only the overlay ever displays.
 */
export type ValueOf = (id: string, qty: number) => number;

const bump = (map: Map<string, number>, id: string, qty: number) => map.set(id, (map.get(id) ?? 0) + qty);

/** Closes the open run, recording how it ended. */
function closeRun(state: TrackerState, end: number, outcome: RunOutcome, reason?: string): void {
  const run = state.current;
  if (!run) return;
  run.end = end;
  run.outcome = outcome;
  if (reason !== undefined) run.reason = reason;
  state.runs.push(run);
  state.current = null;
}

/**
 * Folds one event into the state, mutating it.
 *
 * Mutation rather than a fresh object per event is deliberate: a long session
 * is tens of thousands of events, and the renderer re-reads derived values
 * rather than diffing state trees.
 */
export function apply(state: TrackerState, event: TrackerEvent): TrackerState {
  if (event.t > state.clock) state.clock = event.t;

  switch (event.e) {
    case 'room_enter': {
      // An open run here ended when this one began: the addon sends no exit for
      // a player who walks straight on, so a new room is how that run reports
      // itself finished. See the second judgement call at the top of this file.
      if (state.current) closeRun(state, event.t, 'chained');
      const run: Run = { room: event.room, start: event.t, outcome: 'open', items: new Map() };
      if (event.level !== undefined) run.level = event.level;
      if (event.type !== undefined) run.type = event.type;
      if (state.backpack?.gold !== undefined) run.goldAtStart = state.backpack.gold;
      if (state.backpack?.value !== undefined) run.valueAtStart = state.backpack.value;
      state.current = run;
      return state;
    }

    case 'room_exit': {
      if (event.gold !== undefined) {
        if (state.current) state.current.goldLatest = event.gold;
        if (state.backpack) state.backpack.gold = event.gold;
      }
      // An exit with no matching enter is not worth inventing a run for.
      if (!state.current) return state;
      closeRun(state, event.t, event.reason === undefined || event.reason === 'clear' ? 'clear' : 'other', event.reason);
      return state;
    }

    case 'backpack': {
      const snapshot: TrackerState['backpack'] = { t: event.t, count: event.count, value: event.value };
      if (event.cap !== undefined) snapshot.cap = event.cap;
      if (event.gold !== undefined) snapshot.gold = event.gold;
      state.backpack = snapshot;

      const run = state.current;
      if (run) {
        if (event.gold !== undefined) {
          run.goldLatest = event.gold;
          if (run.goldAtStart === undefined) run.goldAtStart = event.gold;
        }
        run.valueLatest = event.value;
        if (run.valueAtStart === undefined) run.valueAtStart = event.value;
      }
      return state;
    }

    case 'drop': {
      for (const [id, qty] of event.items) {
        bump(state.items, id, qty);
        if (state.current) bump(state.current.items, id, qty);
      }
      return state;
    }

    default:
      return state;
  }
}

export function applyAll(state: TrackerState, events: Iterable<TrackerEvent>): TrackerState {
  for (const event of events) apply(state, event);
  return state;
}

// --- derived numbers --------------------------------------------------------

/** Seconds a run has lasted; for the open run, up to the newest clock seen. */
export function runDuration(run: Run, clock: number): number {
  return Math.max(0, (run.end ?? clock) - run.start);
}

/** What the loot picked up in a run is worth, priced from the item ids. */
export function runLootValue(run: Run, valueOf: ValueOf): number {
  let total = 0;
  for (const [id, qty] of run.items) total += valueOf(id, qty);
  return total;
}

/**
 * Gold earned during a run.
 *
 * The wallet delta when the game reported gold on both sides of the run, and
 * the value of what dropped otherwise. Reported gold wins because it is the
 * real economy — it counts what the drops sold for rather than what the tables
 * say they are worth, and it sees gold that never took the form of an item.
 * The shipped addon reports none, so in practice this prices the loot.
 *
 * Without a price function it can only be the wallet delta, which is what the
 * archive wants: `electron/history.ts` records what was observed and leaves the
 * pricing to the view.
 */
export function runGold(run: Run, valueOf?: ValueOf): number {
  if (run.goldAtStart !== undefined && run.goldLatest !== undefined) {
    return Math.max(0, run.goldLatest - run.goldAtStart);
  }
  return valueOf ? runLootValue(run, valueOf) : 0;
}

export function runItemCount(run: Run): number {
  let total = 0;
  for (const qty of run.items.values()) total += qty;
  return total;
}

/**
 * Total time spent inside runs — the denominator for every rate.
 *
 * Includes the open run so the live figure moves while you play, and excludes
 * the gaps between rooms entirely.
 *
 * `now` is the caller's live clock — `useSession` builds it. Anything earlier
 * than the newest event is ignored, so a caller that passes a stale one can
 * only fail to advance time, never rewind it.
 */
export function timeInRuns(state: TrackerState, now = state.clock): number {
  const clock = Math.max(now, state.clock);
  let total = 0;
  for (const run of state.runs) total += runDuration(run, clock);
  if (state.current) total += runDuration(state.current, clock);
  return total;
}

const perHour = (amount: number, seconds: number) => (seconds <= 0 ? 0 : (amount * 3600) / seconds);

export interface Rates {
  /** Gold earned in the run currently open, whole. 0 when between rooms. */
  currentRunGold: number;
  /** Seconds the open run has been going. 0 when between rooms. */
  currentRunElapsed: number;
  goldPerHour: number;
  itemsPerHour: number;
  valuePerHour: number;
  /** Mean clear time over finished, non-abandoned runs. 0 when there are none. */
  averageClear: number;
  /** Runs that finished, whether by an exit or by the next room starting. */
  completedRuns: number;
  abandonedRuns: number;
  /** Seconds counted toward the rates. */
  activeTime: number;
}

export function rates(state: TrackerState, valueOf: ValueOf, now = state.clock): Rates {
  const clock = Math.max(now, state.clock);
  const active = timeInRuns(state, clock);

  let gold = 0;
  let items = 0;
  let value = 0;
  let clearTotal = 0;
  let completed = 0;
  let abandoned = 0;

  const all = state.current ? [...state.runs, state.current] : state.runs;
  for (const run of all) {
    gold += runGold(run, valueOf);
    items += runItemCount(run);
    if (run.valueAtStart !== undefined && run.valueLatest !== undefined) {
      value += Math.max(0, run.valueLatest - run.valueAtStart);
    }
    if (run.outcome === 'abandoned') abandoned++;
    else if (run.end !== undefined) {
      completed++;
      clearTotal += runDuration(run, clock);
    }
  }

  return {
    // Whole gold: a rate quoted to the decimal implies a precision that a
    // second-resolution clock and a price table do not have.
    currentRunGold: Math.floor(state.current ? runGold(state.current, valueOf) : 0),
    currentRunElapsed: state.current ? runDuration(state.current, clock) : 0,
    goldPerHour: Math.floor(perHour(gold, active)),
    itemsPerHour: perHour(items, active),
    valuePerHour: perHour(value, active),
    averageClear: completed > 0 ? clearTotal / completed : 0,
    completedRuns: completed,
    abandonedRuns: abandoned,
    activeTime: active,
  };
}

/** Per-room breakdown, for "which room actually farms best". */
export function byRoom(state: TrackerState, valueOf: ValueOf, now = state.clock): RoomAverages[] {
  const clock = Math.max(now, state.clock);
  const groups = new Map<string, { runs: Run[] }>();
  const all = state.current ? [...state.runs, state.current] : state.runs;
  for (const run of all) {
    const group = groups.get(run.room) ?? { runs: [] };
    group.runs.push(run);
    groups.set(run.room, group);
  }

  const out: RoomAverages[] = [];
  for (const [room, { runs }] of groups) {
    let clearTotal = 0;
    let completed = 0;
    let totalGold = 0;
    let totalItems = 0;
    for (const run of runs) {
      totalGold += runGold(run, valueOf);
      totalItems += runItemCount(run);
      if (run.outcome !== 'abandoned' && run.end !== undefined) {
        completed++;
        clearTotal += runDuration(run, clock);
      }
    }
    out.push({
      room,
      runs: runs.length,
      averageClear: completed > 0 ? clearTotal / completed : 0,
      totalGold: Math.floor(totalGold),
      totalItems,
    });
  }
  return out.sort((a, b) => b.runs - a.runs);
}

/**
 * What the room you are in has dropped — or the last one, between rooms.
 *
 * The session totals are the headline number; this is the readout you watch
 * while playing, and it answers a different question: not "how has tonight
 * gone" but "was *this* room worth it". Entering a room empties it, because a
 * fresh run is a fresh answer; leaving one does not, because the list is the
 * only record of what the room gave you until the next one starts.
 */
export function runItems(state: TrackerState): { id: string; qty: number }[] {
  const run = state.current ?? state.runs[state.runs.length - 1];
  if (!run) return [];
  return [...run.items.entries()].map(([id, qty]) => ({ id, qty })).sort((a, b) => b.qty - a.qty);
}

/** Session item totals as a sorted list, richest first. `perHour` uses run time. */
export function itemTotals(state: TrackerState, now = state.clock): { id: string; qty: number; perHour: number }[] {
  const active = timeInRuns(state, now);
  return [...state.items.entries()]
    .map(([id, qty]) => ({ id, qty, perHour: perHour(qty, active) }))
    .sort((a, b) => b.qty - a.qty);
}
