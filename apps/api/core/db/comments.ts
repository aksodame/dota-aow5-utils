/**
 * Comments on a build.
 *
 * Plain text, always. Never HTML and never markdown — the item descriptions in
 * this project are already HTML from the game data and go through a rich-text
 * parser, and user-submitted text deliberately does not get that path. That
 * removes the injection surface rather than filtering it.
 *
 * Deleting is soft: the row stays with its body nulled on the way out, so a
 * thread does not reshuffle around a removed reply and a moderator can still
 * see what was said.
 */
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { CommentDto } from 'aow5-api-contract';
import type { Db } from './open.ts';
import { comments, builds, users } from './schema.ts';
import { toPublicUser, type UserRow } from './users.ts';

export type CommentRow = typeof comments.$inferSelect;

/** How long somebody has to think better of what they just posted. */
export const REPOST_WINDOW_SECONDS = 15;

export function addComment(db: Db, buildId: number, userId: number, body: string, now: number): CommentRow {
  return db.transaction((tx) => {
    const row = tx
      .insert(comments)
      .values({ buildId, userId, body, createdAt: now })
      .returning()
      .get();

    // Recounted rather than incremented, for the same reason as the vote
    // counters: a delta is only correct if it is never missed and never applied
    // twice, and a count behind an index costs nothing at this size.
    tx.update(builds)
      .set({
        commentCount: sql`(select count(*) from ${comments} where ${comments.buildId} = ${buildId} and ${comments.deletedAt} is null)`,
      })
      .where(eq(builds.id, buildId))
      .run();

    return row;
  });
}

/**
 * Fixing a typo, within a short window of posting.
 *
 * Bounded rather than open-ended because a comment is part of somebody else's
 * page: rewriting one an hour after three people replied to it changes what
 * they appear to be replying to. `editedAt` is set so a reader can see it
 * happened at all.
 */
export function editComment(db: Db, comment: CommentRow, body: string, now: number): CommentRow {
  db.update(comments).set({ body, editedAt: now }).where(eq(comments.id, comment.id)).run();
  return { ...comment, body, editedAt: now };
}

export function withinEditWindow(comment: CommentRow, now: number, windowSeconds: number): boolean {
  return now - comment.createdAt <= windowSeconds;
}

export function softDeleteComment(db: Db, comment: CommentRow, now: number): void {
  db.transaction((tx) => {
    tx.update(comments).set({ deletedAt: now }).where(eq(comments.id, comment.id)).run();
    tx.update(builds)
      .set({
        commentCount: sql`(select count(*) from ${comments} where ${comments.buildId} = ${comment.buildId} and ${comments.deletedAt} is null)`,
      })
      .where(eq(builds.id, comment.buildId))
      .run();
  });
}

export function findComment(db: Db, id: number): CommentRow | undefined {
  return db.select().from(comments).where(eq(comments.id, id)).get();
}

/**
 * The author's most recent comment on this build.
 *
 * Used for two anti-spam rules that need no state of their own: a minimum gap
 * between comments, and refusing a body identical to the last one. Both are
 * cheap, and both leave a real conversation alone.
 */
export function lastCommentBy(db: Db, buildId: number, userId: number): CommentRow | undefined {
  return db
    .select()
    .from(comments)
    .where(and(eq(comments.buildId, buildId), eq(comments.userId, userId)))
    .orderBy(desc(comments.id))
    .limit(1)
    .get();
}

export interface CommentPage {
  rows: Array<{ comment: CommentRow; author: UserRow }>;
  cursor: string | null;
}

/**
 * A thread, oldest first, paged by id.
 *
 * Oldest first because a conversation reads in the order it happened, and
 * paging forward by id then never renumbers anything already shown.
 */
export function listComments(db: Db, buildId: number, after: number | null, limit: number): CommentPage {
  const rows = db
    .select({ comment: comments, author: users })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(
      and(
        eq(comments.buildId, buildId),
        isNull(users.bannedAt),
        ...(after !== null ? [gt(comments.id, after)] : []),
      ),
    )
    .orderBy(comments.id)
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    rows: page,
    cursor: hasMore && last !== undefined ? String(last.comment.id) : null,
  };
}

export function toCommentDto(comment: CommentRow, author: UserRow, viewer: UserRow | undefined): CommentDto {
  const deleted = comment.deletedAt !== null;
  return {
    id: comment.id,
    author: toPublicUser(author),
    // The body is withheld rather than the row, so the thread keeps its shape.
    body: deleted ? null : comment.body,
    deleted,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    canDelete:
      !deleted && viewer !== undefined && (viewer.id === comment.userId || viewer.role === 'admin'),
  };
}
