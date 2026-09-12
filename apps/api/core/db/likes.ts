/**
 * Likes. There is no other kind.
 *
 * One row per person per build, enforced by a composite primary key — so
 * double-liking is not something the code prevents, it is something the schema
 * cannot represent. Unliking deletes the row rather than storing a zero, which
 * keeps "has not liked" and "liked neutrally" from being two states that mean
 * the same thing.
 *
 * The counter on `builds` is denormalised and maintained here, inside the same
 * transaction as the like. A list of twenty builds must never run twenty counts.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './open.ts';
import { builds, likes } from './schema.ts';

export function hasLiked(db: Db, buildId: number, userId: number): boolean {
  const row = db
    .select({ buildId: likes.buildId })
    .from(likes)
    .where(and(eq(likes.buildId, buildId), eq(likes.userId, userId)))
    .get();
  return row !== undefined;
}

/**
 * Likes or unlikes a build, and returns the count afterwards.
 *
 * Recounts from the likes table rather than adjusting the stored number by a
 * delta. A delta is correct only if it is never applied twice and never missed;
 * recounting is correct by construction, and at this size the count is over a
 * handful of rows behind the primary key.
 */
export function setLike(db: Db, buildId: number, userId: number, liked: boolean, now: number): number {
  return db.transaction((tx) => {
    if (liked) {
      // Doing nothing on conflict rather than updating: a second like is not an
      // event, and rewriting createdAt would misreport when it happened.
      tx.insert(likes).values({ buildId, userId, createdAt: now }).onConflictDoNothing().run();
    } else {
      tx.delete(likes).where(and(eq(likes.buildId, buildId), eq(likes.userId, userId))).run();
    }

    const row = tx
      .update(builds)
      .set({
        likeCount: sql`(select count(*) from ${likes} where ${likes.buildId} = ${buildId})`,
      })
      .where(eq(builds.id, buildId))
      .returning({ likeCount: builds.likeCount })
      .get();

    return row?.likeCount ?? 0;
  });
}
