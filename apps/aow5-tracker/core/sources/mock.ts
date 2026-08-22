import type { TrackerEvent } from '../events.ts';

/**
 * A scripted session, deliberately richer than the feed the game ships.
 *
 * Written when nothing was emitted at all, and still earning its place now that
 * the addon does: it drives the UI with no Dota running, and it is the only
 * thing exercising the parts of the contract the shipped lines leave out — a
 * payload-supplied `t`, `backpack` snapshots, and gold. So it aims to be
 * *awkward* rather than tidy: an abandoned run, a room entered twice, drops
 * arriving in bursts, gold that only moves on backpack snapshots — shapes the
 * reducer must survive whether or not today's addon produces them.
 *
 * Deterministic by construction: a fixed script and a seeded PRNG, never
 * `Math.random()`, so a UI bug found once can be reproduced exactly.
 */

/** Item ids taken from the real drop pools, so names and gold values resolve. */
const LOOT: Record<string, string[]> = {
  M001: ['item_M001', 'item_M006', 'item_G002', 'item_M102'],
  M003: ['item_M003', 'item_G026', 'item_M229', 'item_P049'],
  M012: ['item_M300', 'item_G100', 'item_M507', 'item_M318'],
};

interface ScriptedRun {
  room: string;
  level: number;
  type: string;
  /** Seconds from entering to exiting. */
  duration: number;
  /** How the run ends. `undefined` means it never does — an abandoned run. */
  reason?: string;
  drops: number;
  goldGain: number;
}

/*
 * Runs last about a minute and a half, so at real time (`speed: 1`) the overlay
 * cycles through enter → loot → clear inside a couple of minutes of watching.
 * Gold gains are sized against the durations, not copied from longer runs, so
 * gold/hour stays in a plausible range.
 */
const SCRIPT: ScriptedRun[] = [
  { room: 'M001', level: 1, type: 'forest', duration: 92, reason: 'clear', drops: 9, goldGain: 1500 },
  { room: 'M003', level: 2, type: 'forest', duration: 88, reason: 'clear', drops: 14, goldGain: 1875 },
  // Never exits: the next room_enter has to close it as abandoned.
  { room: 'M012', level: 4, type: 'mine', duration: 40, drops: 3, goldGain: 375 },
  { room: 'M003', level: 2, type: 'forest', duration: 96, reason: 'clear', drops: 12, goldGain: 2125 },
  { room: 'M001', level: 1, type: 'forest', duration: 84, reason: 'death', drops: 4, goldGain: 500 },
];

/** Deterministic PRNG, so a failing UI case is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MockOptions {
  seed?: number;
  /** Game clock the session starts at, matching the addon's own clock. */
  startClock?: number;
  /** Seconds of idle time between leaving a room and entering the next. */
  gap?: number;
  /** Backpack snapshot interval, seconds. */
  snapshot?: number;
  startGold?: number;
}

/**
 * Builds the whole session up front as `[offsetSeconds, event]` pairs.
 *
 * Generating the timeline rather than streaming it means tests can assert on it
 * directly, and the player can replay it at any speed without the shape of the
 * data depending on the clock.
 */
export function buildMockTimeline(options: MockOptions = {}): { at: number; event: TrackerEvent }[] {
  // A one-second snapshot is what makes the run clock tick a second at a time:
  // the reducer's clock only advances on events, so nothing else moves it.
  const { seed = 0xa0f5c001, startClock = 600, gap = 8, snapshot = 1, startGold = 1_800_000 } = options;
  const rand = mulberry32(seed);

  const out: { at: number; event: TrackerEvent }[] = [];
  let clock = startClock;
  let gold = startGold;
  let value = 0;
  let count = 0;

  const emitBackpack = (t: number) => {
    out.push({
      at: t - startClock,
      event: { v: 1, e: 'backpack', t, count, cap: 51, value: Math.round(value), gold: Math.round(gold) },
    });
  };

  emitBackpack(clock);

  for (const run of SCRIPT) {
    out.push({
      at: clock - startClock,
      event: { v: 1, e: 'room_enter', t: clock, room: run.room, level: run.level, type: run.type },
    });

    const pool = LOOT[run.room] ?? ['item_M001'];
    // Drops land at random points inside the run rather than on a tidy cadence.
    const dropTimes = Array.from({ length: run.drops }, () => clock + rand() * run.duration).sort((a, b) => a - b);
    let nextSnapshot = clock + snapshot;
    let dropped = 0;

    for (const at of dropTimes) {
      while (nextSnapshot < at) {
        gold += (run.goldGain * snapshot) / run.duration;
        emitBackpack(Math.round(nextSnapshot));
        nextSnapshot += snapshot;
      }
      // Occasionally two stacks in one pickup, which the feed really does do.
      const items: [string, number][] = [[pool[Math.floor(rand() * pool.length)]!, 1 + Math.floor(rand() * 3)]];
      if (rand() < 0.25) items.push([pool[Math.floor(rand() * pool.length)]!, 1 + Math.floor(rand() * 2)]);

      for (const [, qty] of items) {
        count += qty;
        value += qty * (40 + Math.floor(rand() * 260));
      }
      dropped++;
      out.push({ at: at - startClock, event: { v: 1, e: 'drop', t: Math.round(at), src: `monster_1${run.level}00${dropped}`, items } });
    }

    clock += run.duration;
    gold += run.goldGain * 0.2; // the tail of the run's income
    emitBackpack(clock);

    if (run.reason !== undefined) {
      out.push({
        at: clock - startClock,
        event: { v: 1, e: 'room_exit', t: clock, room: run.room, reason: run.reason, gold: Math.round(gold) },
      });
    }
    clock += gap;
  }

  return out.sort((a, b) => a.at - b.at);
}

export interface MockHandle {
  stop: () => void;
}

/**
 * Replays the timeline through `onEvent`, compressed by `speed`.
 *
 * The default is real time: one simulated second per second, which is how the
 * live feed will behave and the only way the run clock reads like a clock.
 * `--speed=60` still compresses the whole session into a few seconds when the
 * UI loop needs it. Loops by default so the overlay keeps moving.
 */
export function startMockSource(
  onEvent: (event: TrackerEvent) => void,
  options: MockOptions & { speed?: number; loop?: boolean } = {},
): MockHandle {
  const { speed = 1, loop = true, ...rest } = options;
  const timeline = buildMockTimeline(rest);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;

  const runOnce = (cycle: number) => {
    if (stopped) return;
    const span = timeline.length > 0 ? timeline[timeline.length - 1]!.at : 0;
    for (const { at, event } of timeline) {
      timers.push(
        setTimeout(
          () => {
            if (stopped) return;
            // Later cycles continue the clock rather than jumping backwards,
            // which would look like a new session to the reducer.
            onEvent(cycle === 0 ? event : shiftClock(event, cycle * (span + 30)));
          },
          ((at + cycle * (span + 30)) * 1000) / speed,
        ),
      );
    }
    if (loop) {
      timers.push(setTimeout(() => runOnce(cycle + 1), ((span + 30) * 1000 * (cycle + 1)) / speed));
    }
  };

  runOnce(0);
  return {
    stop: () => {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    },
  };
}

function shiftClock(event: TrackerEvent, by: number): TrackerEvent {
  return { ...event, t: event.t + by };
}
