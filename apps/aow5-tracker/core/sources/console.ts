import fs from 'node:fs';
import { createConsoleClock, parseLines, type TrackerEvent } from '../events.ts';

/**
 * Tails Dota's console log for `[AOW5TRK]` lines.
 *
 * Requires `-con_logfile <path>` in Dota's launch options — verified working:
 * both `[VScript]` (client Lua `print`) and `[PanoramaScript]` (`$.Msg`) reach
 * the file, timestamped to the second.
 *
 * Polls the size and reads the delta rather than using `fs.watch`, because the
 * file is append-only and watch events on Windows are unreliable for a file
 * another process holds open.
 *
 * The line timestamps Dota writes are also the session clock: the shipped addon
 * lines carry no `t`, so `parseLines` is given a clock that reads it off the
 * line. One clock per tail, since it carries state across the year boundary.
 *
 * Node-only: this runs in the Electron main process. The renderer receives
 * events over IPC and never touches the filesystem.
 */

/** Enough of the file head to tell one session's log from the next. */
const HEAD_BYTES = 256;

export interface ConsoleSourceOptions {
  /** Poll interval in ms. One second is plenty for a feed this sparse. */
  interval?: number;
  /**
   * Start from the beginning rather than the end. Off by default: on launch we
   * care about the session about to be played, not yesterday's log.
   */
  fromStart?: boolean;
  onSkipped?: (skipped: { line: string; reason: string }[]) => void;
  onError?: (error: Error) => void;
}

export interface ConsoleSourceHandle {
  stop: () => void;
  /** Bytes consumed so far, for diagnostics. */
  position: () => number;
  /**
   * Treat whatever is in the file now as already seen.
   *
   * For when something other than Dota rewrote the log — `compactLog` does, and
   * what it leaves behind is every tracker line of the evening. Without this the
   * next poll would see a replaced file, start again from the top and replay the
   * whole session as though it had just been played.
   */
  skipToEnd: () => void;
}

export function startConsoleSource(
  file: string,
  onEvent: (event: TrackerEvent) => void,
  options: ConsoleSourceOptions = {},
): ConsoleSourceHandle {
  const { interval = 1000, fromStart = false, onSkipped, onError } = options;

  let offset = 0;
  let carry = '';
  const clock = createConsoleClock();
  let started = false;
  let stopped = false;
  /**
   * First bytes of the file currently being followed.
   *
   * Size alone cannot detect a restart. Dota truncates and rewrites the log,
   * and if the new content happens to reach the same length, a size check sees
   * "no change" and the tail sits there forever. Comparing the head catches a
   * replaced file whatever its size.
   */
  let head: string | null = null;

  const poll = (): void => {
    if (stopped) return;

    let size: number;
    try {
      size = fs.statSync(file).size;
    } catch {
      // The log does not exist yet — Dota has not been launched with the flag.
      // Not a failure, and not worth reporting on every tick.
      return;
    }

    let fd: number;
    try {
      fd = fs.openSync(file, 'r');
    } catch (err) {
      onError?.(err as Error);
      return;
    }

    try {
      const currentHead = readHead(fd, size);

      if (!started) {
        started = true;
        head = currentHead;
        offset = fromStart ? 0 : size;
        if (!fromStart) return;
      } else if (size < offset || (head !== null && currentHead !== head)) {
        // Truncated or replaced: a new session, so start over.
        offset = 0;
        carry = '';
        head = currentHead;
      } else {
        head = currentHead;
      }

      if (size <= offset) return;

      const chunk = Buffer.alloc(size - offset);
      fs.readSync(fd, chunk, 0, chunk.length, offset);
      offset = size;

      // A read can land mid-line; hold the tail until the rest arrives.
      const text = carry + chunk.toString('utf8');
      const lines = text.split(/\r?\n/);
      carry = lines.pop() ?? '';

      const { events, skipped } = parseLines(lines, { clock });
      for (const event of events) onEvent(event);
      if (skipped.length > 0) onSkipped?.(skipped);
    } catch (err) {
      onError?.(err as Error);
    } finally {
      fs.closeSync(fd);
    }
  };

  poll();
  const timer = setInterval(poll, interval);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    position: () => offset,
    skipToEnd: () => {
      carry = '';
      try {
        const fd = fs.openSync(file, 'r');
        try {
          const size = fs.statSync(file).size;
          offset = size;
          head = readHead(fd, size);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        // Gone, for the moment. The next poll starts the file over, which is
        // the right answer for a file that is not there.
        offset = 0;
        head = null;
      }
    },
  };
}

function readHead(fd: number, size: number): string {
  const want = Math.min(HEAD_BYTES, size);
  if (want <= 0) return '';
  const buf = Buffer.alloc(want);
  fs.readSync(fd, buf, 0, want, 0);
  // latin1 so arbitrary bytes compare safely; this is a fingerprint, not text.
  return buf.toString('latin1');
}
