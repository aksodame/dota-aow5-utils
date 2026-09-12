import { Inject, Injectable } from '@nestjs/common';
import {
  COMMENT_EDIT_WINDOW_SECONDS,
  PAGE_SIZE,
  type CommentDto,
  type LikeResponse,
  type Page,
  type PendingCommentDto,
} from 'aow5-api-contract';
import {
  addComment,
  approveComment,
  editComment,
  findComment,
  lastCommentBy,
  listComments,
  listPendingComments,
  REPOST_WINDOW_SECONDS,
  softDeleteComment,
  toCommentDto,
  withinEditWindow,
} from '../../core/db/comments.ts';
import { findBuildById, findBuildBySlug, isVisible, type BuildRow } from '../../core/db/builds.ts';
import type { Db } from '../../core/db/open.ts';
import { profilesOf, profilesOfUsers } from '../../core/db/identities.ts';
import { findUserById, isVerified, type UserRow } from '../../core/db/users.ts';
import { hasLiked, setLike } from '../../core/db/likes.ts';
import { countLinks, MAX_LINKS_PER_COMMENT, validateCommentBody } from '../../core/builds/validate.ts';
import { isSlug } from '../../core/builds/slug.ts';
import { DB } from '../db/tokens.ts';
import { ApiException } from '../http/api-error.ts';

@Injectable()
export class SocialService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * A build you may comment on or like.
   *
   * Stricter than reading one: a draft accepts neither, even from its author.
   * There is nobody to have a conversation with yet.
   */
  private loadPublic(slug: string): BuildRow {
    if (!isSlug(slug)) throw new ApiException('NOT_FOUND', 'No such build.');
    const build = findBuildBySlug(this.db, slug);
    if (build === undefined) throw new ApiException('NOT_FOUND', 'No such build.');
    if (build.deletedAt !== null) throw new ApiException('GONE', 'That build was deleted.');
    if (!isVisible(build)) throw new ApiException('NOT_FOUND', 'No such build.');
    return build;
  }

  liked(buildId: number, viewer: UserRow | undefined): boolean {
    return viewer === undefined ? false : hasLiked(this.db, buildId, viewer.id);
  }

  /**
   * Likes or unlikes a build.
   *
   * Takes the state the client wants rather than a toggle, so a double-tapped
   * button settles on the same answer whichever request lands last. The count
   * comes back from `setLike`, which recounted it inside the same transaction —
   * re-reading the row here would be a second read that could disagree.
   */
  like(slug: string, raw: unknown, user: UserRow): LikeResponse {
    const build = this.loadPublic(slug);

    if (build.userId === user.id) {
      throw new ApiException('SELF_LIKE', 'You cannot like your own build.');
    }
    if (typeof raw !== 'boolean') {
      throw new ApiException('BAD_REQUEST', 'A like is true or false.');
    }

    return { liked: raw, likeCount: setLike(this.db, build.id, user.id, raw, this.now()) };
  }

  comments(slug: string, cursor: string | undefined, viewer: UserRow | undefined): Page<CommentDto> {
    const build = this.loadPublic(slug);
    const after = cursor !== undefined && /^\d+$/.test(cursor) ? Number(cursor) : null;
    const page = listComments(this.db, build.id, after, PAGE_SIZE, viewer);
    // One query for the whole page's commenters, the way the browse list does
    // it for authors: twenty names is twenty round trips otherwise.
    const byAuthor = profilesOfUsers(this.db, page.rows.map(({ author }) => author.id));
    return {
      items: page.rows.map(({ comment, author, authorVerified }) =>
        toCommentDto(comment, author, viewer, authorVerified, byAuthor.get(author.id) ?? []),
      ),
      cursor: page.cursor,
      // The build keeps a maintained count, so this needs no query of its own.
      total: build.commentCount,
    };
  }

  addComment(slug: string, raw: unknown, user: UserRow): CommentDto {
    const build = this.loadPublic(slug);

    const checked = validateCommentBody(raw);
    if (!checked.ok) throw new ApiException('VALIDATION_FAILED', 'That comment needs fixing.', checked.errors);

    if (countLinks(checked.body) > MAX_LINKS_PER_COMMENT) {
      throw new ApiException('VALIDATION_FAILED', 'That is too many links for one comment.', {
        body: `At most ${MAX_LINKS_PER_COMMENT} links.`,
      });
    }

    const now = this.now();
    const previous = lastCommentBy(this.db, build.id, user.id);
    if (previous !== undefined) {
      // Two rules that need no state of their own and leave a real conversation
      // alone: a short gap between posts, and no posting the same thing twice.
      if (now - previous.createdAt < REPOST_WINDOW_SECONDS) {
        throw new ApiException('RATE_LIMITED', 'Give it a moment before posting again.');
      }
      if (previous.body === checked.body && previous.deletedAt === null) {
        throw new ApiException('DUPLICATE_COMMENT', 'You already said exactly that.');
      }
    }

    /*
     * Held unless a provider vouches for the author.
     *
     * The author sees it either way — `listComments` returns their own pending
     * comments to them — so this is a delay rather than a disappearance, and
     * the DTO says which it is.
     */
    const verified = isVerified(this.db, user.id);
    const comment = addComment(this.db, build.id, user.id, checked.body, now, verified);
    return toCommentDto(comment, user, user, verified, profilesOf(this.db, user.id));
  }

  editComment(id: number, raw: unknown, user: UserRow): CommentDto {
    const comment = Number.isInteger(id) ? findComment(this.db, id) : undefined;
    if (comment === undefined || comment.deletedAt !== null) {
      throw new ApiException('NOT_FOUND', 'No such comment.');
    }
    // No admin exception. Editing somebody's words in their own name is not
    // moderation — deleting is.
    if (comment.userId !== user.id) throw new ApiException('FORBIDDEN', 'That is not your comment.');

    const now = this.now();
    if (!withinEditWindow(comment, now, COMMENT_EDIT_WINDOW_SECONDS)) {
      throw new ApiException('FORBIDDEN', 'That comment is too old to edit. You can still delete it.');
    }

    const checked = validateCommentBody(raw);
    if (!checked.ok) throw new ApiException('VALIDATION_FAILED', 'That comment needs fixing.', checked.errors);
    if (countLinks(checked.body) > MAX_LINKS_PER_COMMENT) {
      throw new ApiException('VALIDATION_FAILED', 'That is too many links for one comment.', {
        body: `At most ${MAX_LINKS_PER_COMMENT} links.`,
      });
    }

    return toCommentDto(
      editComment(this.db, comment, checked.body, now),
      user,
      user,
      isVerified(this.db, user.id),
      profilesOf(this.db, user.id),
    );
  }

  removeComment(id: number, user: UserRow): void {
    const comment = Number.isInteger(id) ? findComment(this.db, id) : undefined;
    if (comment === undefined || comment.deletedAt !== null) {
      throw new ApiException('NOT_FOUND', 'No such comment.');
    }
    if (comment.userId !== user.id && user.role !== 'admin') {
      throw new ApiException('FORBIDDEN', 'That is not your comment.');
    }
    softDeleteComment(this.db, comment, this.now());
  }

  /** Only used to render an author beside a comment the poster just made. */
  author(userId: number): UserRow | undefined {
    return findUserById(this.db, userId);
  }

  /**
   * The queue, for a moderator.
   *
   * Every held comment across the site, oldest first. Not paged: if this ever
   * grows past one screenful the answer is fewer unverified accounts posting,
   * not a second page.
   */
  pending(user: UserRow): PendingCommentDto[] {
    this.requireAdmin(user);
    return listPendingComments(this.db, 100).map(({ comment, author, buildSlug }) => ({
      ...toCommentDto(comment, author, user, false),
      buildSlug,
      buildTitle: findBuildById(this.db, comment.buildId)?.title ?? '',
    }));
  }

  /** Lets one through. Idempotent: approving an approved comment is a no-op. */
  approve(id: number, user: UserRow): CommentDto {
    this.requireAdmin(user);
    const comment = Number.isInteger(id) ? findComment(this.db, id) : undefined;
    if (comment === undefined || comment.deletedAt !== null) {
      throw new ApiException('NOT_FOUND', 'No such comment.');
    }
    const author = findUserById(this.db, comment.userId);
    if (author === undefined) throw new ApiException('INTERNAL', 'That comment has no author.');

    const approved = comment.approvedAt !== null ? comment : approveComment(this.db, comment, this.now());
    return toCommentDto(approved, author, user, isVerified(this.db, author.id), profilesOf(this.db, author.id));
  }

  private requireAdmin(user: UserRow): void {
    if (user.role !== 'admin') throw new ApiException('FORBIDDEN', 'Moderators only.');
  }
}
