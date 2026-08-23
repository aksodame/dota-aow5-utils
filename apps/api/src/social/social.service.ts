import { Inject, Injectable } from '@nestjs/common';
import { COMMENT_EDIT_WINDOW_SECONDS, PAGE_SIZE, type CommentDto, type Page } from 'aow5-api-contract';
import {
  addComment,
  editComment,
  findComment,
  lastCommentBy,
  listComments,
  REPOST_WINDOW_SECONDS,
  softDeleteComment,
  toCommentDto,
  withinEditWindow,
} from '../../core/db/comments.ts';
import { findBuildBySlug, isVisible, type BuildRow } from '../../core/db/builds.ts';
import type { Db } from '../../core/db/open.ts';
import { findUserById, type UserRow } from '../../core/db/users.ts';
import { findVote, setVote, type VoteValue } from '../../core/db/votes.ts';
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
   * A build you may comment on or vote for.
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

  myVote(buildId: number, viewer: UserRow | undefined): 1 | -1 | 0 {
    return viewer === undefined ? 0 : findVote(this.db, buildId, viewer.id);
  }

  vote(slug: string, raw: unknown, user: UserRow): { value: VoteValue; likeCount: number; dislikeCount: number } {
    const build = this.loadPublic(slug);

    if (build.userId === user.id) {
      throw new ApiException('SELF_VOTE', 'You cannot vote on your own build.');
    }
    if (raw !== 1 && raw !== -1 && raw !== 0) {
      throw new ApiException('BAD_REQUEST', 'A vote is 1, -1 or 0.');
    }

    setVote(this.db, build.id, user.id, raw, this.now());
    const updated = findBuildBySlug(this.db, slug);
    return {
      value: raw,
      likeCount: updated?.likeCount ?? 0,
      dislikeCount: updated?.dislikeCount ?? 0,
    };
  }

  comments(slug: string, cursor: string | undefined, viewer: UserRow | undefined): Page<CommentDto> {
    const build = this.loadPublic(slug);
    const after = cursor !== undefined && /^\d+$/.test(cursor) ? Number(cursor) : null;
    const page = listComments(this.db, build.id, after, PAGE_SIZE);
    return {
      items: page.rows.map(({ comment, author }) => toCommentDto(comment, author, viewer)),
      cursor: page.cursor,
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

    const comment = addComment(this.db, build.id, user.id, checked.body, now);
    return toCommentDto(comment, user, user);
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

    return toCommentDto(editComment(this.db, comment, checked.body, now), user, user);
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
}
