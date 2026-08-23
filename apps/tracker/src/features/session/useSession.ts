import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrackerEvent } from '@core/events.ts';
import {
  apply,
  createState,
  isLastRunDead,
  itemTotals,
  rates,
  resetState,
  runItems,
  toggleLastRunDead,
  type TrackerState,
  type ValueOf,
} from '@core/stats.ts';
import type { TrackerStatus } from '@core/ipc.ts';
import { TABLE_PRICING } from '@/features/items/prices';

/**
 * How long a silent feed is still believed to be farming, in seconds.
 *
 * The live clock runs on real time between events, which is right while the
 * game is running and wrong the moment it stops: Dota crashing mid-room leaves
 * a run open, and an overlay left up overnight would count eight hours into it
 * and report a gold rate near zero. After this much silence the clock stops and
 * waits for the feed, which is the honest reading of "nothing is arriving".
 *
 * Generous on purpose. Runs are two to four minutes and drops land constantly,
 * so a gap this long is a stopped game rather than a quiet room — and if it is
 * a quiet room, the recorded duration is still taken from the log's own
 * timestamps when the run ends. Only the live readout pauses.
 */
const STALE_AFTER = 300;

/**
 * The live session: the event feed, folded, and the numbers that fall out of it.
 *
 * The per-room table and the unreadable-line list used to come from here too.
 * They belong to the settings window now, which reads them from main instead —
 * a window opened at nine o'clock has not seen the evening, and folding four
 * times a second for a panel that is usually closed was work done for nobody.
 *
 * Deliberately knows nothing about windows, scale or opacity — that is the
 * shell's business. What it owns is the one thing every overlay wants a copy of
 * and none of them should own twice, which is why the recipe panel calls
 * this same hook to count drops rather than subscribing to events itself.
 *
 * The reducer mutates a single state object rather than producing a new one per
 * event — a long session is tens of thousands of events, and re-rendering on
 * each would be wasteful. Instead a version counter ticks and the derived
 * values are recomputed on a fixed cadence, which also keeps the open run's
 * elapsed time moving between events.
 */
/**
 * @param priceOf what a drop is worth — `pricing(config.prices).value`, so the
 * player's own prices reach the rates. Defaults to the table price for a caller
 * that shows no gold at all, which is the recipe panel counting ingredients.
 * @param autoResume start the clock on the first room entered. Off by default,
 * because the caller that does not show a clock has no business starting one —
 * the recipe panel folds the same feed and would otherwise be voting on the
 * farm overlay's question. See `TrackerConfig.autoResume`.
 */
export function useSession(priceOf: ValueOf = TABLE_PRICING.value, autoResume = false) {
  const stateRef = useRef<TrackerState>(createState());
  /**
   * The newest event clock, and the wall time it reached us.
   *
   * The game's clock only moves when the game says something, and since the
   * addon stopped sending periodic snapshots that is a handful of lines per
   * room. Anchoring it to real time is what makes the timers tick every second
   * instead of standing still and then jumping five at the next pickup.
   */
  const anchor = useRef<{ clock: number; at: number }>({ clock: 0, at: Date.now() });
  /**
   * When this session started, in wall time.
   *
   * The rates measure time *inside* rooms, because that is the honest
   * denominator for a gold rate. This is the other clock — how long you have
   * been at it — and it keeps running in the hideout, between rooms, and while
   * the game is loading, because all of that is time you spent farming even
   * though none of it was spent in a room.
   */
  const startedAt = useRef(Date.now());
  /**
   * When the session clock was stopped, or null while it runs.
   *
   * Only the clock stops. Drops still count, runs still close, the archive
   * still records — pausing says "this stretch was not farming", which is a
   * statement about the hour, not about the loot. Resuming slides the start
   * forward by however long the break was, so the number never jumps.
   *
   * A session begins paused, seeded at the same instant it started so the clock
   * reads zero rather than a negative. The tracker is launched *before* the
   * farming does — while Dota loads, while you pick a room, while you decide
   * whether tonight is a farming night at all — and a clock that starts the
   * moment the overlay appears counts every minute of that as time at work.
   * Press play when you actually begin, and the g/hr means something.
   */
  const pausedAt = useRef<number | null>(startedAt.current);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<TrackerStatus>({ source: 'mock', detail: 'starting…' });
  /**
   * Which feed the numbers below belong to, or null before the first status.
   *
   * A ref rather than reading `status`, because the handler that needs it is
   * registered once and would otherwise close over the first value forever.
   */
  const source = useRef<TrackerStatus['source'] | null>(null);
  /*
   * A ref for the same reason `source` is one: the event handler below is
   * registered once and would otherwise close over whatever the setting was
   * when the overlay mounted, which is `undefined` — the config arrives over
   * IPC a moment later.
   */
  const autoResumeRef = useRef(autoResume);
  autoResumeRef.current = autoResume;

  useEffect(() => {
    const api = window.tracker;
    const offEvent = api.onEvent((event: TrackerEvent) => {
      apply(stateRef.current, event);
      const { clock } = stateRef.current;
      if (clock > anchor.current.clock) anchor.current = { clock, at: Date.now() };

      /*
       * Walking into a room starts the clock, if it is not already going and
       * the player asked for this.
       *
       * The same arithmetic as `togglePaused`, deliberately: the start slides
       * forward by the length of the break, so the elapsed figure carries on
       * from where it stopped instead of jumping by however long the tracker
       * sat waiting. For a session that has never been started that break is
       * the whole time since launch, and the clock begins at zero — which is
       * the case this exists for.
       */
      if (event.e === 'room_enter' && autoResumeRef.current && pausedAt.current !== null) {
        startedAt.current += Date.now() - pausedAt.current;
        pausedAt.current = null;
      }
    });
    const offStatus = api.onStatus((next) => {
      setStatus(next);

      /*
       * Only a *change* of source starts a new session.
       *
       * This used to zero everything on every status, which is not what the
       * line below it claims and is not what a status is: the feed reports one
       * whenever it has news, including every read error. So anything that made
       * the tail complain repeatedly — two copies of the tracker tailing and
       * trimming the same log, say — pushed `startedAt` forward several times a
       * second, and the session clock sat at zero all evening while the run
       * timer, which is anchored to the game's own clock, kept perfect time.
       * That is exactly the shape of the bug this comment now prevents.
       */
      const previous = source.current;
      source.current = next.source;
      if (previous === null || previous === next.source) return;

      stateRef.current = createState();
      anchor.current = { clock: 0, at: Date.now() };
      startedAt.current = Date.now();
      // Whether the clock is running is the player's answer, not the feed's, so
      // a status leaves it where it was. But the start just moved, and a pause
      // stamped before it would read as a negative elapsed — so a stopped clock
      // is re-stamped to the new start and stays reading zero.
      if (pausedAt.current !== null) pausedAt.current = startedAt.current;
      setVersion((v) => v + 1);
    });
    // 4 Hz: fast enough that the elapsed clock never looks stuck, slow enough
    // to cost nothing.
    const timer = setInterval(() => setVersion((v) => v + 1), 250);
    return () => {
      offEvent();
      offStatus();
      clearInterval(timer);
    };
  }, []);

  /**
   * Zeroes the session, keeping the room you are standing in.
   *
   * The archive is told separately, by whoever called this: a restart means the
   * runs after it are not comparable with the ones before, and the file has to
   * agree with the screen about where that line falls.
   */
  const clearSession = useCallback(() => {
    stateRef.current = resetState(stateRef.current);
    startedAt.current = Date.now();
    // Paused, like a session that has just launched — one rule for what a new
    // session is, rather than two that disagree about whether the clock is
    // already running. Starting a fresh stretch is a thing you do when you are
    // ready to farm it, and that is the play button.
    pausedAt.current = startedAt.current;
    setVersion((v) => v + 1);
  }, []);

  /**
   * Writes the last room off as a death, or takes the mark back.
   *
   * The reducer holds the flag, so this only has to ask for a repaint — every
   * number that cares reads it on the way past. See `toggleLastRunDead`.
   */
  const toggleLastRunDied = useCallback(() => {
    toggleLastRunDead(stateRef.current);
    setVersion((v) => v + 1);
  }, []);

  /** Stops or restarts the session clock. See `pausedAt`. */
  const togglePaused = useCallback(() => {
    if (pausedAt.current === null) pausedAt.current = Date.now();
    else {
      startedAt.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
    setVersion((v) => v + 1);
  }, []);

  const derived = useMemo(() => {
    const state = stateRef.current;
    // The game's clock, carried forward by however long ago the last event
    // arrived — capped, so a feed that has stopped stops the clock with it.
    const idle = (Date.now() - anchor.current.at) / 1000;
    const now = anchor.current.clock + Math.min(idle, STALE_AFTER);
    return {
      state,
      rates: rates(state, priceOf, now),
      // The whole session, for the gold card; and the room you are in, for the
      // list under it.
      items: itemTotals(state, now),
      runItems: runItems(state),
      elapsed: ((pausedAt.current ?? Date.now()) - startedAt.current) / 1000,
      paused: pausedAt.current !== null,
      lastRunDead: isLastRunDead(state),
    };
    // `version` is the intentional trigger — the state object itself is mutated
    // in place, so it can never be a useful dependency. `priceOf` is here
    // because a price the player edits has to reach the numbers without
    // waiting for the next event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, priceOf]);

  return { ...derived, status, clearSession, togglePaused, toggleLastRunDied };
}

export type Session = ReturnType<typeof useSession>;
