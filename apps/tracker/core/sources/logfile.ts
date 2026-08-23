import fs from 'node:fs';
import { TRACKER_PREFIX } from '../events.ts';

/**
 * Keeps Dota's console log from eating the disk.
 *
 * `-con_logfile` is all or nothing: it writes the whole console, and the whole
 * console is mostly not ours. A measured session — 2h37m of Age of Weapons —
 * came to 12 MB, of which 0.08 MB was `[AOW5TRK]`. The rest was one engine
 * warning repeating five times a second.
 *
 * The game cannot be told to log less, so the tracker tidies up after it: the
 * lines it needs are kept and the rest is dropped, which is a ~99% cut without
 * losing anything the tracker or its author would ever read back.
 *
 * Node-only. This runs in the Electron main process, like the tail beside it.
 */

/**
 * Two guards, because rewriting a file the game is writing to would be a
 * disaster of exactly the kind that looks like nothing at first.
 *
 * `rename` is the real test: Windows refuses it while another process holds the
 * file open without share-delete, which is how Dota holds its log. The idle
 * check is the belt to that pair of braces — a live Dota touches the log
 * constantly, so a file modified in the last minute is a file in use, whatever
 * the filesystem allowed.
 *
 * The belt is for the *automatic* pass only, and a player who presses the
 * button gets `idleMs: 0`. It is the guard that is wrong in the one moment the
 * button is most likely to be pressed: Dota has just been closed, the file is
 * free, and a timestamp from forty seconds ago would refuse anyway. Nothing is
 * risked by dropping it there, because the rename still has to succeed — and
 * if the game does still hold the file, it will not.
 */
const IDLE_MS = 60_000;

/**
 * Below this the automatic pass leaves the file alone: there is nothing worth
 * doing, and doing it would only churn the disk every five minutes.
 *
 * A player who presses the button is asking anyway, and gets it — see
 * `CompactOptions.minBytes`.
 */
const MIN_BYTES = 1_000_000;

export interface CompactOptions {
  /** Now, in epoch ms. Injectable so the idle guard is testable. */
  now?: number;
  /** Size below which nothing is done. Zero for "I asked for this". */
  minBytes?: number;
  /**
   * How recently the file may have been written and still be considered free.
   * Zero for "I asked for this" — see the note on `IDLE_MS`.
   */
  idleMs?: number;
}

export interface CompactResult {
  /** Why nothing was done, or null when the file was rewritten. */
  skipped: 'missing' | 'small' | 'in-use' | null;
  before: number;
  after: number;
  /** Tracker lines carried across. */
  kept: number;
  /**
   * The OS error code behind an `in-use`, when there was one.
   *
   * Three different failures used to arrive as the same word, which made the
   * one question worth asking — *is the game really holding it, or did
   * something else go wrong?* — unanswerable from the panel. `EPERM`/`EBUSY`
   * is the game; anything else is worth reading.
   */
  error?: string;
}

const nothing = (skipped: CompactResult['skipped'], before = 0, error?: string): CompactResult => ({
  skipped,
  before,
  after: before,
  kept: 0,
  ...(error === undefined ? {} : { error }),
});

/** The `code` off a Node fs error, when it has one. */
const codeOf = (err: unknown): string | undefined => {
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};

/**
 * Rewrites the log with only the tracker's own lines, when it is safe to.
 *
 * Safe means the game does not have it open — see `IDLE_MS`. When it does, this
 * does nothing and says so: the log will still be there next time, and a
 * session that is being played is worth more than a tidy disk. That is not a
 * policy this can relax on request; Dota writes at a remembered offset, so a
 * log truncated under it re-inflates to the same size as a hole full of zeros.
 *
 * The caller must resynchronise its tail afterwards. The file that comes out
 * still holds every tracker line, so a tail that re-read it from the start
 * would replay the whole evening as though it had just happened.
 */
export function compactLog(file: string, options: CompactOptions = {}): CompactResult {
  const { now = Date.now(), minBytes = MIN_BYTES, idleMs = IDLE_MS } = options;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return nothing('missing');
  }

  if (stat.size < minBytes) return nothing('small', stat.size);
  /*
   * Waived when asked; the rename below is what actually decides.
   *
   * `idleMs > 0` is not redundant. A file written moments ago can carry an
   * mtime a hair *ahead* of `Date.now()` — the two come from different clocks
   * with different granularity — which makes the difference negative, and a
   * negative age is below any threshold including zero. Asking for no idle
   * requirement has to mean no check, not a check against zero.
   */
  if (idleMs > 0 && now - stat.mtimeMs < idleMs) return nothing('in-use', stat.size);

  // Renaming first does two jobs: it proves nothing else holds the file, and it
  // leaves the original intact until the replacement is safely written.
  const staging = `${file}.compacting`;
  try {
    fs.renameSync(file, staging);
  } catch (err) {
    return nothing('in-use', stat.size, codeOf(err));
  }

  try {
    const lines = fs.readFileSync(staging, 'utf8').split(/\r?\n/);
    const keep = lines.filter((line) => line.includes(TRACKER_PREFIX));
    const text = keep.length > 0 ? `${keep.join('\n')}\n` : '';
    fs.writeFileSync(file, text, 'utf8');
    fs.rmSync(staging, { force: true });
    return { skipped: null, before: stat.size, after: Buffer.byteLength(text), kept: keep.length };
  } catch (err) {
    // Put it back rather than leave the player with a log under a name nothing
    // reads. If even that fails there is nothing useful left to try.
    try {
      fs.renameSync(staging, file);
    } catch {
      /* empty */
    }
    return nothing('in-use', stat.size, codeOf(err));
  }
}
