/**
 * The shapes that cross the wire.
 *
 * Timestamps are unix **seconds**, matching what the database stores — not ISO
 * strings, and not milliseconds. One representation end to end means never
 * wondering which one a given number is.
 */

/**
 * Somewhere an author can be read about, off this site.
 *
 * A URL rather than the provider's id, deliberately. The capability a reader
 * needs is "open their profile", and that is exactly what a link is; handing
 * out the raw SteamID or Discord snowflake would be handing out an identifier
 * every other integration keys on, for no extra thing anybody could do with it.
 */
export interface ProfileLink {
  provider: 'steam' | 'discord';
  url: string;
}

/**
 * A build's author, as much of them as any reader may see.
 *
 * `id` is the row id, and it is here because two things on the site need to ask
 * "is this me?" — the like button, which must not let an author like their own
 * build, and the my-creations page. A persona would not answer that: Steam
 * personas are not unique and their owners change them.
 */
export interface PublicUser {
  id: number;
  /**
   * Whether a provider vouches for this account.
   *
   * True once Steam or Discord is linked to it. Not a claim about the person —
   * it is a claim about the cost of becoming a *second* person, which is the
   * whole of what the badge and the comment queue are defending against.
   */
  verified: boolean;
  /**
   * The name everybody reads.
   *
   * Called `nickname` rather than `persona` because it is no longer necessarily
   * a Steam persona: it is whatever a local account chose at sign-up, or
   * whatever the provider they arrived through last called them. Unique only
   * for accounts that have a password — see the column's note in the schema.
   */
  nickname: string;
  /** Full-size avatar URL from whichever provider supplied one, or `''`. */
  avatar: string;
  /**
   * The provider profiles linked to the account, Steam first. Empty for an
   * account with none — which is every local-only one.
   *
   * Public because the accounts themselves are: a Steam community profile and a
   * Discord user page are pages anybody can open, and "who wrote this guide"
   * is the first question a reader of one has. It is also the only *portable*
   * answer this site can give — a nickname here is nobody's identity anywhere
   * else.
   */
  profiles: ProfileLink[];
}

/** The viewer, when there is one. */
export interface MeUser extends PublicUser {
  buildCount: number;
  buildLimit: number;
  isAdmin: boolean;
  /**
   * Which doors this account has, so the settings screen can offer the rest.
   *
   * Includes `local` when a password is set. An account created through Steam
   * has none until its owner sets one, which is why this is a list rather than
   * the single provider they happened to sign in with today.
   */
  providers: AuthProvider[];
}

/**
 * How somebody can prove who they are.
 *
 * `local` is a nickname and a password held here; the other two are accounts
 * elsewhere that vouch for a person. One user may have several — the identity
 * is the *account*, and these are the doors into it.
 */
export type AuthProvider = 'local' | 'steam' | 'discord';

/** Every provider the deployment has configured, for the sign-in screen. */
export interface AuthProvidersResponse {
  /** `local` is always in this list. The other two depend on the deploy's keys. */
  available: AuthProvider[];
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

/**
 * What a row in the browse list shows.
 *
 * It **does** carry the payload, which the old summary deliberately did not.
 * That rule was written when a payload was a nine-section board running to
 * three kilobytes; a v7 loadout is about a hundred characters, so a page of
 * fifteen rows costs under two kilobytes for it — and in exchange every row can
 * draw the author's main spell and their gear without a second request per row.
 * If the payload ever grows back, this is the first thing to reconsider.
 *
 * `tier` is a copy of the build's map's tier rather than something its author
 * typed, which is what lets the sidebar filter on it without decoding anything.
 * Both it and `mapId` are null for a build naming a room this deployment cannot
 * resolve — the same way `heroId` is null for an unrecognised hero.
 */
/**
 * Which of a build's seven abilities is its headline.
 *
 * A *slot*, not an ability id, and that is the point: the slot survives the
 * author swapping what is in it, so a build whose Q changes keeps naming its Q
 * rather than pointing at an ability the loadout no longer holds. The keys are
 * the game's own — `ABILITY_SLOTS` in `aow5-shared` is the same list, and the
 * server validates against it.
 */
export type MainSpellKey = 'passive' | 'q' | 'w' | 'e' | 'd' | 'f' | 'r';

export interface BuildSummary {
  slug: string;
  title: string;
  /**
   * The encoded loadout, byte for byte as its author submitted it.
   *
   * Here so a list row can show a preview. Same bytes the detail endpoint
   * returns, and under the same rule: never re-encoded, on the way in or out.
   */
  payload: string;
  heroId: string | null;
  /**
   * What the guide is filed under: a tier, or `event`. Null only on a draft.
   *
   * The author's own field rather than the room's tier — a guide may cover a
   * whole tier without naming a room, and Event content sits on no tier.
   */
  tier: TierKey | null;
  /** The rooms it names, if any. A guide may name none, one, or several. */
  maps: string[];
  /**
   * What the author says it costs to assemble, in gold. `0` means they did not
   * say — see `MAX_PRICE`.
   *
   * On the summary rather than only on the detail, because it is the second
   * thing a browse row shows after the hero: "can I afford this" is the
   * question that decides whether the build is worth opening.
   */
  price: number;
  /**
   * The ability a row leads with, chosen by the author.
   *
   * Null means they did not choose, and the site falls back to reading the
   * kit — `q` first, then the rest in order. That fallback is why this can be
   * added without a migration for the builds that came before it, and why an
   * anonymous `#b=` link still shows a sensible headline: the codec carries no
   * such field, and does not need to.
   */
  mainSpell: MainSpellKey | null;
  status: BuildStatus;
  author: PublicUser;
  likeCount: number;
  commentCount: number;
  publishedAt: number | null;
  updatedAt: number;
}

/**
 * A YouTube video attached to a build.
 *
 * An id and an offset rather than the URL its author pasted: the server reduces
 * the link once, on the way in, so no client is ever handed user text that it
 * would then have to turn into a URL. The embed and the "watch on YouTube"
 * link are both built from these two fields.
 */
export interface BuildVideo {
  /** YouTube's eleven-character id, already checked against its alphabet. */
  id: string;
  /** Where to start, in seconds. `0` for the beginning. */
  start: number;
}

/**
 * One stat, and how much its owner cares about it.
 *
 * The order of the list is the priority — first is what you reroll for — so
 * there is no rank field to keep in step with the array.
 */
export interface BuildStatPriority {
  /** The item's own `values` key: `bonus_attack_damage`, `evasion_pct`. */
  key: string;
  /**
   * Which of the stat's reachable rolls the author is aiming at, `0` being the
   * best one. Null means "any".
   *
   * A *rank* rather than a number, and that is the point: a rolled stat has
   * five or six possible values and which numbers those are depends on the
   * reforge level — so a stored 138 would stop meaning anything the moment the
   * plan's level changed, where "the second best roll" survives it. The site
   * turns the rank back into a figure against the emitted roll tables.
   */
  target: number | null;
}

/**
 * What an author wants out of one item.
 *
 * Everything here is about *which copy* of an item to keep, which is a real
 * question in this game and one the loadout cannot express: two of the same
 * sword differ by their rolls, by which stat is permanently fixed, and by how
 * far they have been reforged. A build page that shows the sword and stops has
 * told a reader a tenth of the advice.
 */
export interface BuildItemPriority {
  /** Which loadout slot this is about. The item itself comes from the payload. */
  slot: number;
  /**
   * The reforge level the build assumes, `0` for an untouched item.
   *
   * What it buys is consistency rather than a higher ceiling — see the roll
   * tables — so this is the author saying how much grinding their advice
   * assumes, not a claim about power.
   */
  reforge: number;
  /**
   * The stat the author wants permanently fixed on their copy, or null.
   *
   * Decided when the item is created and never movable: reforging cannot change
   * which stat wears the bonus, so this is a rule for *discarding* copies, not
   * something to work towards.
   */
  fixed: string | null;
  /**
   * The stat they want the enhancement to land on, or null.
   *
   * Also drawn from the item's initial seed, and also unmovable. Its size and
   * the level it unlocks at are a band rather than a number, which is why
   * neither is stored here — the site reads both out of the roll tables.
   */
  enhanced: string | null;
  /**
   * Whether the build wants a **divine-forged** copy of this item.
   *
   * One roll made when the item is created, on the item as a whole: a fraction
   * of high-quality items carry it, it unlocks at some reforge level, and from
   * then on it multiplies every stat the forge reaches. Reforging can neither
   * grant it nor take it away — so like the fixed stat, this is a rule for which
   * copies to keep rather than something to work towards, and every target
   * below is quoted for a forged copy when it is set.
   */
  divine: boolean;
  /** Ordered, most important first. */
  stats: BuildStatPriority[];
  /** The author's own sentence about this item. Plain text. */
  note: string;
}

/** A build's whole priority, one entry per item that has one. */
export type BuildPriority = BuildItemPriority[];

/** What `/builds/<slug>` renders: the summary, plus everything a row omits. */
export interface BuildDetail extends BuildSummary {
  body: string;
  /**
   * The reforge priority, or an empty list when the author wrote none.
   *
   * Only on the detail, and only ever stored: it is advice about a saved build
   * rather than part of the loadout, so it does not travel in a `#b=` link. The
   * codec carries a board and nothing else, and adding this to it would be a
   * version bump on every link ever shared for the sake of a panel a reader can
   * only see on a build's own page.
   */
  priority: BuildPriority;
  /** The build's video, or null. Not on the summary: a list row cannot show one. */
  video: BuildVideo | null;
  /**
   * The author's referral code, or `''` when they did not give one.
   *
   * On the build rather than on the account: it is the code that belongs with
   * *this* loadout, and an author who plays on a second account — or who
   * changes codes between one build and the next — would otherwise have every
   * build they ever published rewritten by the change.
   */
  referral: string;
  codecVersion: number;
  itemCount: number;
  spellCount: number;
  createdAt: number;
  /** Whether the viewer has liked this build. False when anonymous. */
  liked: boolean;
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
  /**
   * Waiting for a moderator, and therefore visible to nobody but its author.
   *
   * Comments from accounts with no linked provider are held — see the
   * `approved_at` column. Only ever true on a comment the viewer may see, so it
   * is a label for its own author rather than a hint about anyone else's.
   */
  pending: boolean;
}

/**
 * One row of the moderation queue.
 *
 * A comment plus where it was said, because a moderator reading "nice build"
 * out of context has nothing to judge. Admin-only, like the endpoint.
 */
export interface PendingCommentDto extends CommentDto {
  buildSlug: string;
  buildTitle: string;
}

/**
 * A window onto a list, addressed by position.
 *
 * Offset rather than keyset, which is a deliberate reversal. A cursor cannot be
 * jumped to — it only ever answers "what comes after this row" — and the browse
 * list is a virtualised scroller where the visible range is a pair of indices
 * that can land anywhere the scrollbar is dragged. Random access is the whole
 * requirement, and a cursor cannot provide it.
 *
 * The cost is the reason keyset was chosen originally: a build published while
 * somebody is reading shifts every row after it down one, so a row can move
 * between two windows and be missed. That is real, and it is small here — the
 * default sort is by likes, publishing is capped at five builds a person, and
 * the reader is looking at a list rather than working through it exhaustively.
 */
export interface Slice<T> {
  items: T[];
  /** Where `items[0]` sits in the whole list. */
  offset: number;
  /** How many rows match, ignoring `offset` and the limit. */
  total: number;
}

/**
 * A page of results, addressed by cursor.
 *
 * Still what comments use: a thread is read from the top downwards and never
 * jumped into, so keyset's guarantee — a comment posted mid-read cannot hide
 * another — costs nothing there.
 */
export interface Page<T> {
  items: T[];
  /** Pass back as `?cursor=` for the next page. Null when this was the last one. */
  cursor: string | null;
  /**
   * How many rows the query matches in total, ignoring the cursor.
   *
   * For telling somebody how much there is — "52 builds" — and for reserving
   * the height of the rows not yet loaded, so a scrolling list's scrollbar is
   * the right size before it has fetched everything.
   *
   * Counted per request rather than cached: it is one indexed `count(*)` over
   * the same predicate the page itself uses, which at this size is cheaper than
   * any scheme for keeping a stored number honest.
   */
  total: number;
}

/**
 * How the browse list is ordered.
 *
 * `top` is the default the sidebar opens on, because a guides list sorted by
 * recency shows whatever was published this week rather than what is worth
 * reading. `new` is there so a build published today is findable at all.
 *
 * `cheap` and `costly` order by price. Two sorts rather than a min/max range,
 * because "what can I do with what I have" is answered by putting the cheap
 * ones first far better than by anyone guessing a number to type into a box —
 * and a build with no price given is worth nothing to that question either way,
 * so both orders push the unpriced ones to the end.
 */
export type BuildSort = 'top' | 'new' | 'discussed' | 'cheap' | 'costly';

/**
 * What a guide can be filed under.
 *
 * Declared here as well as in `aow5-shared` because this package has no runtime
 * dependencies at all — it is types and numbers, consumed as raw TypeScript.
 * The shared package owns the *table* of which room is which; this is only the
 * shape the wire carries, and `TIER_KEYS` there is the list to iterate.
 */
export type TierKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'event';

/** The sidebar's facets. Every field is optional; omitting one means "any". */
export interface BuildFilter {
  heroId?: string;
  mapId?: string;
  tier?: TierKey;
  /** Full-text over title and body. */
  q?: string;
}

export interface CreateBuildBody {
  title: string;
  body?: string;
  payload: string;
  /**
   * Which tier the guide is for. Required to publish.
   *
   * The build's own field rather than something read out of the payload: a
   * guide may be written for a tier without naming a room, so the map cannot be
   * what says which tier it is. When a map *is* given the two must agree, and
   * the server checks that rather than trusting either alone.
   */
  tier?: TierKey;
  /**
   * Gold. Required to publish — see `MAX_PRICE`.
   *
   * A guide without a price is one a reader cannot act on: the whole question
   * they bring to a build list is whether they can afford it. Still optional in
   * this type because a *draft* may be saved without one.
   */
  price?: number;
  /**
   * A YouTube link, in whatever shape it was copied.
   *
   * Sent as the *text* rather than as an id, because reducing it is the
   * server's job — see `BuildVideo`. `''` clears it. Anything that is not a
   * YouTube video is refused with a message rather than stored.
   */
  video?: string;
  /**
   * Which ability the build is about. Omitted or null leaves it to the kit
   * order — see `MainSpellKey`.
   *
   * Refused when the slot it names is empty: a headline pointing at a spell the
   * build does not have would draw a hole in every row it appears in.
   */
  mainSpell?: MainSpellKey | null;
  /**
   * The reforge priority. Omitted leaves whatever is stored alone; `[]` clears it.
   *
   * Refused rather than repaired when it is malformed: a plan naming a stat the
   * author never chose, or a slot that is not on the board, is a client bug, and
   * silently dropping half of somebody's advice is the worst of the options.
   */
  priority?: BuildPriority;
  /** Omitted means "no code"; the server normalises and caps whatever arrives. */
  referral?: string;
  status?: BuildStatus;
}

/**
 * Deliberately absent: the map and the tier.
 *
 * Both are read out of the payload, because the payload is what the editor
 * actually produced and a second copy on the request would be a second thing
 * that can disagree with it. The server derives them once, at write time.
 */

export type UpdateBuildBody = Partial<CreateBuildBody>;

export interface CreateCommentBody {
  body: string;
}

/**
 * `PUT /api/builds/<slug>/like`.
 *
 * A body rather than two verbs, so the client sends the state it wants rather
 * than the transition it thinks it is making — which is what makes a
 * double-tapped like button idempotent instead of a toggle race.
 */
export interface LikeBody {
  liked: boolean;
}

export interface LikeResponse {
  liked: boolean;
  likeCount: number;
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
  /** An author may not like their own build. */
  | 'SELF_LIKE'
  | 'PAYLOAD_INVALID'
  | 'PAYLOAD_TOO_LARGE'
  /** Steam did not vouch for the sign-in, or never answered. */
  | 'STEAM_AUTH_FAILED'
  | 'INTERNAL';
