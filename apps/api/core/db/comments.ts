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
import { and, desc, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { CommentDto } from 'aow5-api-contract';
import type { Db } from './open.ts';
import { comments, builds, identities, users } from './schema.ts';
import type { ProfileLink } from 'aow5-api-contract';
import { toPublicUser, type UserRow } from './users.ts';

export type CommentRow = typeof comments.$inferSelect;

/** How long somebody has to think better of what they just posted. */
export const REPOST_WINDOW_SECONDS = 15;

export function addComment(
  db: Db,
  buildId: number,
  userId: number,
  body: string,
  now: number,
  /**
   * Whether it goes up immediately.
   *
   * True for an account with a provider linked to it — see the column. Decided
   * by the caller rather than looked up here, because "is this account
   * verified" is a question about identities and this module is about comments.
   */
  approved: boolean,
): CommentRow {
  return db.transaction((tx) => {
    const row = tx
      .insert(comments)
      .values({ buildId, userId, body, createdAt: now, approvedAt: approved ? now : null })
      .returning()
      .get();

    // Recounted rather than incremented, for the same reason as the vote
    // counters: a delta is only correct if it is never missed and never applied
    // twice, and a count behind an index costs nothing at this size.
    tx.update(builds)
      .set({
        // Approved only. The number beside a thread is what a reader will
        // find in it, and counting comments nobody but their author can
        // see would promise a conversation that is not there.
        commentCount: sql`(select count(*) from ${comments} where ${comments.buildId} = ${buildId} and ${comments.deletedAt} is null and ${comments.approvedAt} is not null)`,
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
        // Approved only. The number beside a thread is what a reader will
        // find in it, and counting comments nobody but their author can
        // see would promise a conversation that is not there.
        commentCount: sql`(select count(*) from ${comments} where ${comments.buildId} = ${comment.buildId} and ${comments.deletedAt} is null and ${comments.approvedAt} is not null)`,
      })
      .where(eq(builds.id, comment.buildId))
      .run();
  });
}

/**
 * Lets a held comment through.
 *
 * The count is recounted here for the same reason it is on every other write:
 * approving is the moment a comment starts being one a reader will find.
 */
export function approveComment(db: Db, comment: CommentRow, now: number): CommentRow {
  db.transaction((tx) => {
    tx.update(comments).set({ approvedAt: now }).where(eq(comments.id, comment.id)).run();
    tx.update(builds)
      .set({
        commentCount: sql`(select count(*) from ${comments} where ${comments.buildId} = ${comment.buildId} and ${comments.deletedAt} is null and ${comments.approvedAt} is not null)`,
      })
      .where(eq(builds.id, comment.buildId))
      .run();
  });
  return { ...comment, approvedAt: now };
}

/**
 * The queue, oldest first.
 *
 * Across every build rather than per build: moderation is a job somebody sits
 * down to do, not something they go looking for one thread at a time. Deleted
 * rows are left out — a comment its author withdrew needs no verdict.
 */
export function listPendingComments(
  db: Db,
  limit: number,
): Array<{ comment: CommentRow; author: UserRow; buildSlug: string }> {
  return db
    .select({ comment: comments, author: users, buildSlug: builds.slug })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .innerJoin(builds, eq(builds.id, comments.buildId))
    .where(and(isNull(comments.approvedAt), isNull(comments.deletedAt), isNull(users.bannedAt)))
    .orderBy(comments.id)
    .limit(limit)
    .all();
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
  rows: Array<{ comment: CommentRow; author: UserRow; authorVerified: boolean }>;
  cursor: string | null;
}

/**
 * A thread, oldest first, paged by id.
 *
 * Oldest first because a conversation reads in the order it happened, and
 * paging forward by id then never renumbers anything already shown.
 */
export function listComments(
  db: Db,
  buildId: number,
  after: number | null,
  limit: number,
  /**
   * Who is reading, so their own pending comments come back to them.
   *
   * A comment held for moderation is invisible to the thread and visible to its
   * author, the whole time it waits. The alternative — hiding it from everyone
   * — is a form that appears to do nothing, which is how somebody ends up
   * posting the same thing four times. An admin sees the queue too, since
   * approving what you cannot read is not moderation.
   */
  viewer?: { id: number; role: string },
): CommentPage {
  const visible =
    viewer === undefined
      ? isNotNull(comments.approvedAt)
      : viewer.role === 'admin'
        ? undefined
        : or(isNotNull(comments.approvedAt), eq(comments.userId, viewer.id));

  const rows = db
    .select({
      comment: comments,
      author: users,
      // One existence check per row rather than a query per commenter — the
      // same shape the browse list uses for the badge beside a name.
      verified: sql<number>`exists (select 1 from ${identities} where ${identities.userId} = ${users.id})`,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(
      and(
        eq(comments.buildId, buildId),
        isNull(users.bannedAt),
        ...(visible === undefined ? [] : [visible]),
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
    rows: page.map(({ comment, author, verified }) => ({
      comment,
      author,
      authorVerified: Number(verified) === 1,
    })),
    cursor: hasMore && last !== undefined ? String(last.comment.id) : null,
  };
}

export function toCommentDto(
  comment: CommentRow,
  author: UserRow,
  viewer: UserRow | undefined,
  /** Whether a provider vouches for the author — see `PublicUser.verified`. */
  authorVerified = false,
  /** Where that provider says they can be read about — see `PublicUser.profiles`. */
  authorProfiles: ProfileLink[] = [],
): CommentDto {
  const deleted = comment.deletedAt !== null;
  return {
    id: comment.id,
    author: toPublicUser({ ...author, verified: authorVerified, profiles: authorProfiles }),
    // The body is withheld rather than the row, so the thread keeps its shape.
    body: deleted ? null : comment.body,
    deleted,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    canDelete:
      !deleted && viewer !== undefined && (viewer.id === comment.userId || viewer.role === 'admin'),
    /*
     * Still waiting for a moderator.
     *
     * Only ever true on a comment the viewer is allowed to see at all — their
     * own, or an admin's view of the queue — so this is a label for its author
     * rather than a leak about somebody else's.
     */
    pending: comment.approvedAt === null && !deleted,
  };
}
