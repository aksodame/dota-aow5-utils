import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { TrackerEvent } from '../core/events.ts';
import {
  groupSessions,
  parseRecord,
  type HistoryRecord,
  type HistoryRun,
  type SessionHistory,
} from '../core/history.ts';
import type { SourceKind } from '../core/ipc.ts';
import { apply, createState, runDuration, runGold, runItemCount, type TrackerState } from '../core/stats.ts';

/**
 * Keeps the archive, by watching the same events every overlay watches.
 *
 * Main folds the stream a second time rather than having the renderer report
 * its finished runs, and the reason is lifetimes: a renderer is reloaded by the
 * dev server, closed from the tray and re-created on demand, and every one of
 * those would either lose runs or double-count them. The process that owns the
 * feed is the one that can promise each run is written exactly once.
 *
 * Only *finished* runs are written. The run you are standing in is the live
 * overlay's business until it ends.
 *
 * And only runs from the game. The mock is scaffolding for building the UI
 * with Dota closed, and its runs are not evenings that happened — archived,
 * they bury the real sessions in invented ones and make the whole view a lie.
 * A mock session is simply never opened, so nothing downstream has to know.
 *
 * The fold itself runs whatever the source, because it is also main's copy of
 * the session — the one thing in the app that has watched the whole evening,
 * whatever windows were open for it. `live` hands it to `tracker:getSession`.
 */

/**
 * How many lines back a read looks.
 *
 * The file is append-only and a busy session is a few dozen lines, so this is
 * many months of farming — but it is bounded, because the History view is a
 * list a person scrolls and not a data warehouse.
 */
const READ_LIMIT = 4000;

export class History {
  private readonly file: string;
  private state: TrackerState = createState();
  /** Runs already written, so a re-read of the reducer's list cannot duplicate them. */
  private written = 0;
  /** Id of the session being recorded, or 0 for "not recording" — see `startSession`. */
  private session = 0;
  private source: SourceKind = 'mock';
  /** The session line is written with the first run, so an idle launch leaves no trace. */
  private announced = false;

  constructor(file?: string) {
    this.file = file ?? path.join(app.getPath('userData'), 'history.jsonl');
  }

  /**
   * Begins a new session.
   *
   * Called whenever the source changes and whenever the player restarts the
   * session from the overlay: both mean the runs after this point are not
   * comparable with the ones before, which is the only thing a session is.
   */
  startSession(source: SourceKind, at = Date.now()): void {
    this.state = createState();
    this.written = 0;
    this.source = source;
    this.announced = false;
    // A mock session leaves the archive closed: `record` writes nothing while
    // there is no session id, so the fake feed costs the file nothing at all.
    this.session = source === 'mock' ? 0 : at;
  }

  /**
   * Folds one event, writing any run it finished.
   *
   * `state.runs` only ever grows, so everything past the high-water mark is a
   * run that closed since the last event — which is both how a completed run is
   * detected and why one can never be written twice.
   */
  record(event: TrackerEvent): void {
    apply(this.state, event);
    // Folded above, written below: a mock session has no id, so it reaches the
    // snapshot and never the file.
    if (this.session === 0) return;

    const finished = this.state.runs.slice(this.written);
    if (finished.length === 0) return;
    this.written = this.state.runs.length;

    const lines: HistoryRecord[] = [];
    if (!this.announced) {
      this.announced = true;
      lines.push({ kind: 'session', id: this.session, source: this.source });
    }
    for (const run of finished) {
      const entry: HistoryRun = {
        kind: 'run',
        session: this.session,
        room: run.room,
        endedAt: Date.now(),
        duration: Math.round(runDuration(run, this.state.clock)),
        outcome: run.outcome,
        gold: Math.round(runGold(run)),
        items: [...run.items.entries()],
      };
      // An empty abandoned run is a crash artefact, not a farming result.
      if (entry.outcome === 'abandoned' && runItemCount(run) === 0 && entry.gold === 0) continue;
      lines.push(entry);
    }
    this.append(lines);
  }

  /**
   * The session as main has folded it, for a window that opened part-way in.
   *
   * Handed out rather than copied: the callers read totals off it and none of
   * them keeps it, and deep-copying a session's worth of runs every time the
   * settings window refreshes would be work done for nobody.
   */
  get live(): TrackerState {
    return this.state;
  }

  /**
   * Deletes the named sessions and everything recorded under them.
   *
   * The file is rewritten rather than appended to — the one operation that
   * breaks the append-only rule, which is why it is also the one that reads
   * every line first. A line this build cannot parse is kept: it belongs to a
   * version that could, and a delete of *these two sessions* has no business
   * discarding it.
   */
  remove(ids: readonly number[]): void {
    const doomed = new Set(ids);
    if (doomed.size === 0) return;

    let text: string;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return;
    }

    const kept = text.split('\n').filter((line) => {
      if (line.trim() === '') return false;
      const record = parseRecord(line);
      if (!record) return true;
      return record.kind === 'session' ? !doomed.has(record.id) : !doomed.has(record.session);
    });

    // Through a temporary file and a rename, for the same reason `saveConfig`
    // is: this is the only point at which the whole archive passes through a
    // single write, so it is the only point at which an interrupted one could
    // truncate months of farming. A rename on the same volume is atomic, so an
    // interruption leaves either the old archive or the new one.
    const staging = `${this.file}.tmp`;
    try {
      fs.writeFileSync(staging, kept.length > 0 ? `${kept.join('\n')}\n` : '', 'utf8');
      fs.renameSync(staging, this.file);
    } catch {
      // Same as `clear`: a locked profile costs the player a stale archive.
      try {
        fs.rmSync(staging, { force: true });
      } catch {
        // Nothing further to try; the archive itself is untouched.
      }
      return;
    }

    // The session being played was in the list, so its line went with it. The
    // next finished run has to declare it again or its runs land orphaned.
    if (doomed.has(this.session)) this.announced = false;
  }

  /**
   * Throws the archive away.
   *
   * The session in progress keeps counting on screen — the overlay's numbers
   * are its own — but the file starts empty, and the runs already written to it
   * are gone. `announced` goes back to false so the next finished run writes a
   * session line again; without that the archive would fill with runs belonging
   * to a session nobody ever declared.
   */
  clear(): void {
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      // A locked or read-only profile costs the player a stale archive, not a
      // crash. The button will simply appear not to have worked.
    }
    this.written = this.state.runs.length;
    this.announced = false;
  }

  /** Everything on disk, grouped into sessions, newest first. */
  read(): SessionHistory[] {
    let text: string;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      // Nothing farmed yet, or a profile we cannot read. An empty archive is a
      // truthful answer to both.
      return [];
    }

    const lines = text.split('\n').filter((line) => line.trim() !== '');
    const records: HistoryRecord[] = [];
    for (const line of lines.slice(-READ_LIMIT)) {
      const record = parseRecord(line);
      if (record) records.push(record);
    }
    return groupSessions(records);
  }

  private append(records: readonly HistoryRecord[]): void {
    if (records.length === 0) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
    } catch {
      // A locked or read-only profile costs the archive, never the session in
      // progress — the overlay keeps counting either way.
    }
  }
}
