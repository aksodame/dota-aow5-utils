/**
 * Likes and dislikes.
 *
 * One row per person per build, enforced by a composite primary key — so
 * double-voting is not something the code prevents, it is something the schema
 * cannot represent. Withdrawing deletes the row rather than storing a zero,
 * which keeps "has not voted" and "voted neutral" from being two states that
 * mean the same thing.
 *
 * The counters on `builds` are denormalised and maintained here, inside the
 * same transaction as the vote. A list of twenty builds must never run twenty
 * counts.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './open.ts';
import { builds, votes } from './schema.ts';

export type VoteValue = 1 | -1 | 0;

export function findVote(db: Db, buildId: number, userId: number): 1 | -1 | 0 {
  const row = db
    .select({ value: votes.value })
    .from(votes)
    .where(and(eq(votes.buildId, buildId), eq(votes.userId, userId)))
    .get();
  return row === undefined ? 0 : (row.value as 1 | -1);
}

/**
 * Sets, changes or withdraws one person's vote.
 *
 * Recounts from the votes table rather than adjusting the stored numbers by a
 * delta. A delta is correct only if it is never applied twice and never missed;
 * recounting is correct by construction, and at this size the count is over a
 * handful of rows behind an index.
 */
export function setVote(db: Db, buildId: number, userId: number, value: VoteValue, now: number): void {
  db.transaction((tx) => {
    if (value === 0) {
      tx.delete(votes).where(and(eq(votes.buildId, buildId), eq(votes.userId, userId))).run();
    } else {
      tx.insert(votes)
        .values({ buildId, userId, value, createdAt: now })
        .onConflictDoUpdate({
          target: [votes.buildId, votes.userId],
          set: { value, createdAt: now },
        })
        .run();
    }

    tx.update(builds)
      .set({
        likeCount: sql`(select count(*) from ${votes} where ${votes.buildId} = ${buildId} and ${votes.value} = 1)`,
        dislikeCount: sql`(select count(*) from ${votes} where ${votes.buildId} = ${buildId} and ${votes.value} = -1)`,
      })
      .where(eq(builds.id, buildId))
      .run();
  });
}
