/**
 * The shapes that cross the wire.
 *
 * Timestamps are unix **seconds**, matching what the database stores — not ISO
 * strings, and not milliseconds. One representation end to end means never
 * wondering which one a given number is.
 */

/**
 * A build's author, as much of them as any reader may see.
 *
 * `id` is the row id, and it is here because two things on the site need to ask
 * "is this me?" — the vote buttons, which must not let an author vote on their
 * own build, and the my-builds page. A nickname would answer that too, but the
 * id keeps answering it if renaming ever becomes a thing.
 */
export interface PublicUser {
  id: number;
  nickname: string;
}

/** The viewer, when there is one. */
export interface MeUser extends PublicUser {
  buildCount: number;
  buildLimit: number;
  isAdmin: boolean;
}

/**
 * A proof-of-work challenge, handed out by `GET /api/auth/challenge`.
 *
 * The server keeps none of this: `signature` is an HMAC over the other three
 * fields, so the whole challenge travels to the client and back and is verified
 * by re-deriving rather than by looking anything up.
 */
export interface PowChallenge {
  /** Random, and the replay key once a solution has been accepted. */
  salt: string;
  /** Leading zero bits required of `sha256(salt + nonce)`. */
  difficulty: number;
  /** Unix seconds, like every other timestamp here. */
  expiresAt: number;
  signature: string;
}

/** A solved challenge: the challenge exactly as issued, plus the answer. */
export interface PowSolution extends PowChallenge {
  nonce: number;
}

export interface SignUpBody {
  nickname: string;
  password: string;
  pow: PowSolution;
}

/**
 * Signing in carries no proof of work.
 *
 * Sign-up is the endpoint worth making expensive — it creates rows. Sign-in is
 * defended by rate limiting instead, because a challenge here would tax the
 * person who mistyped their password far more than anyone attacking it.
 */
export interface SignInBody {
  nickname: string;
  password: string;
}

/** Both sign-up and sign-in answer with the viewer they just became. */
export interface AuthResponse {
  user: MeUser;
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
  /**
   * The author's referral code, or `''` when they did not give one.
   *
   * On the build rather than on the account: it is the code that belongs with
   * *this* board, and an author who plays on a second account — or who changes
   * codes between one build and the next — would otherwise have every build
   * they ever published rewritten by the change.
   *
   * Stored and served for everyone, because a build is read by strangers and
   * the code being visible to them is the entire point of it.
   */
  referral: string;
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
  /** Omitted means "no code"; the server normalises and caps whatever arrives. */
  referral?: string;
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
  /** One answer for both "no such nickname" and "wrong password". */
  | 'INVALID_CREDENTIALS'
  | 'NICKNAME_TAKEN'
  /** The proof of work was missing, forged, expired, replayed or short. */
  | 'CAPTCHA_FAILED'
  | 'INTERNAL';
