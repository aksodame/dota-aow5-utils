/**
 * Opening the database, and the four pragmas that make it behave.
 *
 * better-sqlite3 is synchronous, which is the property the rest of this code
 * leans on: a transaction here really is atomic against everything else in the
 * process, so "count the author's builds, then insert" has no window between
 * the two halves. That is what lets the five-build cap be a constraint rather
 * than a hopeful check.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.ts';

/** Named off drizzle's own type rather than `ReturnType<typeof openDb>`, which
 *  would have openDb's signature referring to itself. */
export type Db = BetterSQLite3Database<typeof schema>;
export type Sqlite = Database.Database;

export interface OpenOptions {
  /** A filesystem path, or ':memory:' for a test. */
  path: string;
  /** Logs every statement. Never in production; useful when a query surprises you. */
  verbose?: boolean;
}

export function openDb({ path, verbose = false }: OpenOptions): { db: Db; sqlite: Sqlite } {
  const sqlite = new Database(path, verbose ? { verbose: (message) => console.debug(message) } : {});

  // Readers do not block the writer and the writer does not block readers.
  // Everything else here is a consequence of choosing it.
  sqlite.pragma('journal_mode = WAL');
  // With WAL there is still exactly one writer; this is how long a second one
  // waits before giving up rather than failing instantly with SQLITE_BUSY.
  sqlite.pragma('busy_timeout = 5000');
  // OFF BY DEFAULT IN SQLITE. Every `references()` in schema.ts is decorative
  // without this line, and the cascade deletes simply would not happen.
  sqlite.pragma('foreign_keys = ON');
  // FULL fsyncs on every commit and buys durability across an OS crash, not
  // just a process crash. In WAL mode NORMAL cannot corrupt the database, and
  // the worst case is losing the last commits to a kernel panic — an acceptable
  // trade for a builds site, and the reason there is a nightly backup.
  sqlite.pragma('synchronous = NORMAL');

  return { db: drizzle(sqlite, { schema }), sqlite };
}

/**
 * Raised when the database predates a migration that was rewritten.
 *
 * Drizzle records applied migrations by the hash of their SQL, so editing one
 * that has already run makes it look like a migration that has never run — and
 * it is then applied to a database that already has those tables. In
 * production that would be a serious problem and this rethrows plainly. In
 * development it is almost always a scratch database left over from before a
 * schema change, so the message says which file to move and why.
 */
export class StaleDatabaseError extends Error {
  constructor(path: string, cause: unknown) {
    super(
      `The database at ${path} was made by an older version of this schema, and a migration ` +
        `has been rewritten since.\n\n` +
        `In development the fix is to move it aside and let it be recreated:\n` +
        `  mv ${path} ${path}.bak\n\n` +
        `On a real deployment this must never happen — a committed migration is not edited, ` +
        `a new one is added. If it has, restore last night's backup rather than deleting anything.`,
    );
    this.name = 'StaleDatabaseError';
    this.cause = cause;
  }
}

/**
 * Brings the schema up to date, at boot.
 *
 * Correct because there is exactly one instance: the container that runs the
 * code is the container that migrated the schema, and there is no separate
 * deploy step to forget. If this ever runs on more than one node, it moves.
 */
export function runMigrations(db: Db, migrationsFolder: string, databasePath = ''): void {
  try {
    migrate(db, { migrationsFolder });
  } catch (error) {
    // "already exists" is the specific shape a rewritten migration produces.
    // Anything else is a real migration failure and is rethrown untouched.
    const message = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : '';
    if (/already exists/i.test(message)) throw new StaleDatabaseError(databasePath || 'the database', error);
    throw error;
  }
}

export { schema };
