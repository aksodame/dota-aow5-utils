/**
 * Letting go of what was soft-deleted.
 *
 * Deletes here are soft so a shared link can say "this was deleted" rather than
 * be indistinguishable from a typo, and so a moderator can still read what a
 * banned account wrote. Neither reason survives a month, and keeping the rows
 * forever means the FTS index carries text nobody can reach.
 *
 * Purging a build takes its comments and votes with it through the foreign
 * keys, and the FTS triggers drop its terms — which is only true because
 * `foreign_keys` is on. See `open.ts`.
 */
import { and, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from './open.ts';
import { comments, builds } from './schema.ts';
import { purgeExpiredSessions } from './sessions.ts';

/** Long enough that nobody deletes something and immediately wants it back. */
export const PURGE_AFTER_SECONDS = 30 * 24 * 60 * 60;

export interface PurgeResult {
  builds: number;
  comments: number;
  sessions: number;
}

export function purge(db: Db, now: number, after: number = PURGE_AFTER_SECONDS): PurgeResult {
  const cutoff = now - after;

  return db.transaction((tx) => {
    const removedBuilds = tx
      .delete(builds)
      .where(and(isNotNull(builds.deletedAt), lt(builds.deletedAt, cutoff)))
      .run().changes;

    // Comments on a build that is still alive. The ones on a purged build have
    // already gone with it.
    const removedComments = tx
      .delete(comments)
      .where(and(isNotNull(comments.deletedAt), lt(comments.deletedAt, cutoff)))
      .run().changes;

    // Comment counts are stored, and rows have just left underneath them.
    // Through the builder rather than a raw statement, because SQLite refuses a
    // table-qualified column on the left of SET and an interpolated column
    // reference produces exactly that.
    tx.update(builds)
      .set({
        commentCount: sql`(select count(*) from ${comments} where ${comments.buildId} = ${builds.id} and ${comments.deletedAt} is null)`,
      })
      .run();

    const removedSessions = purgeExpiredSessions(tx as unknown as Db, now);

    return { builds: removedBuilds, comments: removedComments, sessions: removedSessions };
  });
}
