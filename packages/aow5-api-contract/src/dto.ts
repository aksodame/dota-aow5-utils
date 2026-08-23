/**
 * The shapes that cross the wire.
 *
 * Timestamps are unix **seconds**, matching what the database stores — not ISO
 * strings, and not milliseconds. One representation end to end means never
 * wondering which one a given number is.
 */

/** A build's author, as much of them as any reader may see. */
export interface PublicUser {
  steamId: string;
  persona: string;
  avatarUrl: string;
  profileUrl: string;
}

/** The viewer, when there is one. */
export interface MeUser extends PublicUser {
  buildCount: number;
  buildLimit: number;
  isAdmin: boolean;
}

/**
 * `GET /api/me`.
 *
 * Answered with 200 and a null user when nobody is signed in, rather than 401:
 * "nobody is logged in" is a normal answer to that question, and a 401 on every
 * anonymous page load teaches people to ignore 401s.
 */
export interface MeResponse {
  user: MeUser | null;
}

export type BuildStatus = 'draft' | 'published';

/** What a card in a list shows. Never carries the board. */
export interface BuildSummary {
  slug: string;
  title: string;
  heroId: string | null;
  status: BuildStatus;
  author: PublicUser;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  publishedAt: number | null;
  updatedAt: number;
}

/** What `/g/<slug>` renders. The board arrives here and nowhere else. */
export interface BuildDetail extends BuildSummary {
  body: string;
  /**
   * The encoded board, byte for byte as its author submitted it.
   *
   * The server validates this by decoding it and never by re-encoding it: an
   * index a newer build understands and this one does not must survive the
   * round trip unchanged, which is only free if nothing rewrites the bytes.
   */
  payload: string;
  codecVersion: number;
  sectionCount: number;
  itemCount: number;
  createdAt: number;
  /** The viewer's own vote: 1, -1, or 0 when they have not voted or are anonymous. */
  myVote: 1 | -1 | 0;
  /** Whether the viewer may edit or delete this build. */
  canEdit: boolean;
}

export interface CommentDto {
  id: number;
  author: PublicUser;
  /** Null when the comment was deleted — the row stays so the thread keeps its shape. */
  body: string | null;
  deleted: boolean;
  createdAt: number;
  editedAt: number | null;
  canDelete: boolean;
}

/**
 * A page of results.
 *
 * Keyset, not offset: `cursor` encodes the last row's sort key and id, so a
 * build published while somebody is on page three does not shift a row from
 * page three onto page four and hide it.
 */
export interface Page<T> {
  items: T[];
  /** Pass back as `?cursor=` for the next page. Null when this was the last one. */
  cursor: string | null;
}

export type BuildSort = 'new' | 'top' | 'discussed';

export interface CreateBuildBody {
  title: string;
  body?: string;
  payload: string;
  status?: BuildStatus;
}

export type UpdateBuildBody = Partial<CreateBuildBody>;

export interface CreateCommentBody {
  body: string;
}

export interface VoteBody {
  /** 0 withdraws. */
  value: 1 | -1 | 0;
}

/**
 * Every failure, in one shape.
 *
 * `code` is stable and is what the UI switches on; `message` is for a developer
 * reading a network tab and is never shown to a user, because the user's copy is
 * translated and lives in the site's own string tables.
 */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Per-field detail for a validation failure. */
    fields?: Record<string, string>;
  };
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'GONE'
  | 'BUILD_LIMIT_REACHED'
  | 'RATE_LIMITED'
  | 'DUPLICATE_COMMENT'
  | 'SELF_VOTE'
  | 'PAYLOAD_INVALID'
  | 'PAYLOAD_TOO_LARGE'
  | 'STEAM_AUTH_FAILED'
  | 'INTERNAL';
