/**
 * The whole database.
 *
 * Every timestamp is **unix seconds as an integer**, not a Date and not
 * milliseconds. It is what the wire contract says, what SQLite compares
 * cheapest, and it means no column's meaning depends on which layer read it.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { MAX_BUILDS_CEILING, type SeasonKey } from 'aow5-api-contract';

/**
 * A person. **Not** a Steam account, and not a password either.
 *
 * The row is the identity; how somebody proves they own it lives in
 * `identities` beside it, or in the password columns here. That split is the
 * whole point of the shape: this table went from Steam-only to local-only and
 * back inside one project, and each swap was a destructive migration precisely
 * because the proof was welded to the person. Adding a third provider now costs
 * a row, not a rebuild.
 *
 * Local credentials stay *here* rather than in `identities` because a password
 * is not an account somewhere else — there is no external id to key it by, and
 * the lockout counters belong to the person being attacked rather than to a
 * link. Both are nullable: an account created through Steam has no password
 * until its owner sets one, and an account created with a password has no
 * external identity until they link one.
 */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * The name everybody reads. Set at sign-up, or taken from the provider.
     *
     * Not unique on its own — see `nicknameKey`, and note that a provider
     * account may arrive carrying a name somebody else already holds, which is
     * why the *display* name has no uniqueness rule at all.
     */
    nickname: text('nickname').notNull(),
    /**
     * What uniqueness is enforced on for a local account: `nickname` lowercased
     * with `ё` folded to `е`, derived in JavaScript. Null for an account that
     * has no password, so two people who signed in through Steam under the same
     * persona are not a collision.
     *
     * Not `COLLATE NOCASE`, and not SQLite's `lower()`: both fold ASCII only,
     * so under either of them `Вася` and `вася` would be two accounts that look
     * identical on a build card — an impersonation hole pointed straight at the
     * largest part of this audience. See `core/auth/nickname.ts`.
     *
     * The invariant that this equals `nicknameKey(nickname)` cannot be a CHECK
     * for the same reason: SQLite's own `lower()` would agree with the wrong
     * answer. It holds because the writers in `core/db/users.ts` are the only
     * things that set it.
     */
    nicknameKey: text('nickname_key'),
    /** `scrypt$N=…,r=…,p=…$salt$hash` — self-describing. See `core/auth/password.ts`. */
    passwordHash: text('password_hash'),
    /**
     * Consecutive failed sign-ins, and when this account stops accepting them.
     *
     * On the row rather than in a map, because a map is cleared by every
     * restart and this project deploys by hand — a lockout an attacker can
     * reset with a deploy is not a lockout. It also means a spray across a
     * million guessed nicknames allocates nothing at all, since a row only
     * exists for a name that does.
     */
    failedAttempts: integer('failed_attempts').notNull().default(0),
    /** Backoff, never permanent — see `core/auth/lockout.ts` for why that matters. */
    lockedUntil: integer('locked_until'),
    /** Avatar URL from whichever provider supplied one, or '' when none did. */
    avatar: text('avatar').notNull().default(''),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    /** Set rather than deleted: their content stays for moderation and thread shape. */
    bannedAt: integer('banned_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    // Partial, so the many rows with no local credentials do not all collide on
    // a single NULL. SQLite treats NULLs as distinct in a unique index anyway;
    // stating the predicate says why the column is nullable at all.
    uniqueIndex('users_nickname_key')
      .on(table.nicknameKey)
      .where(sql`${table.nicknameKey} is not null`),
    check('users_role', sql`${table.role} in ('user', 'admin')`),
    /*
     * A password without a nickname key, or the reverse, is an account nobody
     * can sign into — or one that occupies a name it did not claim. The two
     * columns are set together by `setPassword` and this is what makes that
     * structural rather than remembered.
     */
    check(
      'users_local_pair',
      sql`(${table.nicknameKey} is null) = (${table.passwordHash} is null)`,
    ),
  ],
);

/**
 * An account somewhere else that vouches for a user here.
 *
 * One row per provider per person, so linking a second one is an INSERT and
 * unlinking is a DELETE — neither touches the user, their builds or their
 * comments. That is the property the previous two schemas did not have.
 *
 * **Nothing links automatically.** Signing in with a provider finds its own
 * row or creates a new user; it never attaches itself to an existing account
 * because the names or the emails happen to match. Matching on a provider's
 * email is how accounts get taken over by anyone who can get that address
 * issued to them, and Steam supplies no email to match on regardless.
 */
export const identities = sqliteTable(
  'identities',
  {
    /** `steam` or `discord`. Local credentials live on `users`, not here. */
    provider: text('provider', { enum: ['steam', 'discord'] }).notNull(),
    /**
     * The id *that provider* uses, as text.
     *
     * Text for every provider, not just Steam: a 64-bit SteamID is past 2^53
     * and would round onto its neighbours as a double, and a Discord snowflake
     * is the same shape. Never do arithmetic on it.
     */
    providerId: text('provider_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** What the provider called them at the last sign-in. For support, not display. */
    label: text('label').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerId] }),
    // One account per provider per user: a person cannot attach two Steam
    // accounts to one profile, which is what makes "unlink" unambiguous.
    uniqueIndex('identities_user_provider').on(table.userId, table.provider),
    check('identities_provider', sql`${table.provider} in ('steam', 'discord')`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /**
     * The SHA-256 of the cookie value, never the cookie value itself — so a
     * leaked database backup is a list of hashes rather than a set of live
     * logins.
     */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    /** Bumped at most hourly, so a read-heavy session is not a write per request. */
    lastSeenAt: integer('last_seen_at').notNull(),
  },
  (table) => [index('sessions_user').on(table.userId), index('sessions_expires').on(table.expiresAt)],
);

export const builds = sqliteTable(
  'builds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Which of the author's five builds this is.
     *
     * The cap is this column plus the partial unique index below, not a count
     * in application code: a sixth build has no free slot and the *database*
     * refuses the insert. A rule that lives in one `if` is a rule the next
     * endpoint forgets.
     */
    slot: integer('slot').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    /**
     * The encoded loadout, exactly as its author submitted it.
     *
     * Not normalised into slot rows, and never rewritten. It is already a
     * compact, versioned representation indexed against append-only tables, and
     * re-deriving it on read would mean re-encoding — which is precisely what
     * the fourth link invariant forbids. A future codec version therefore needs
     * no migration here at all.
     */
    payload: text('payload').notNull(),
    /**
     * What the author wants out of each item, as JSON. `''` when they wrote none.
     *
     * Every equipment stat in this game is rolled, so two copies of one item are
     * not the same item: they differ by their rolls, by which stat is fixed on
     * them, and by how far they have been reforged. The payload names the item
     * and can say none of that, which is what this column is for — the stats
     * worth rerolling for, in order, the level the advice assumes, and a line of
     * prose about the passive, per slot.
     *
     * JSON in one column rather than two tables. Nothing joins to it, filters on
     * it or counts it; it is a *document about* the loadout the way `body` is
     * prose about it, and it is rewritten whole on every save. What keeps it
     * honest is `core/builds/priority.ts`, which parses and re-serialises
     * whatever arrives — the column never stores a client's own bytes.
     */
    priority: text('priority').notNull().default(''),
    /**
     * The author's referral code, normalised, or `''` when they gave none.
     *
     * Here rather than on `users` because it belongs to the build: the code an
     * author wants credited can differ between builds, and hanging it off the
     * account would silently rewrite every build they ever published the first
     * time they changed it.
     */
    referral: text('referral').notNull().default(''),
    /** All derived from the payload once, at write time, so a list query decodes nothing. */
    codecVersion: integer('codec_version').notNull(),
    heroId: text('hero_id'),
    /**
     * Which season of the game the guide is for: `1` or `2`.
     *
     * The author's field. Seasons have separate hero pools, and the service
     * refuses a hero the season does not offer — see `SEASON_HEROES` in
     * `aow5-shared`. Nothing else is split by season: items and rooms are the
     * same list whichever one a guide is for.
     *
     * Not null, defaulting to 1, which is also what the migration gave every
     * build that already existed: they were written for the only game there was.
     */
    season: integer('season').$type<SeasonKey>().notNull().default(1),
    /**
     * What the guide is filed under: `'1'`..`'9'`, or `'event'`.
     *
     * **The author's own field, not the room's tier.** A guide may cover a
     * whole tier without naming a room — most tiers have two — and Event
     * content sits on no tier at all. Deriving it from the map could express
     * neither, which is what this column replaced.
     *
     * Text, because one of its values is not a number. A column that is an
     * integer for nine cases and a sentinel for the tenth is one every reader
     * has to be warned about. Nothing orders by it: the browse page filters on
     * equality and sorts by likes, price or date.
     *
     * Nullable, because a draft may not have chosen one. Publishing requires it
     * — see `BuildsService.requireForPublish`.
     */
    tier: text('tier', { enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'event'] }),
    /**
     * What the build costs to assemble, in gold. Zero means "not given".
     *
     * Authored, not summed from the items. The site knows every item's shop
     * cost, but a real build's price is dominated by what its pieces rolled and
     * what they actually went for — a number derived from base costs would be
     * confidently wrong in the one direction that matters to a reader deciding
     * whether they can afford it.
     *
     * Required to *publish*, which is enforced in the service rather than here:
     * a draft may be saved without one.
     */
    price: integer('price').notNull().default(0),
    /**
     * A YouTube video for the build, as an id and an offset. `''` is none.
     *
     * Not the pasted URL. `core/builds/video.ts` reduces whatever arrives to
     * these two facts, so no part of the render path ever holds user text that
     * is about to become a URL the browser loads — a shape worth not having,
     * whatever the content policy says.
     */
    videoId: text('video_id').notNull().default(''),
    /** Seconds. `0` is the beginning, which is also what "no timestamp" means. */
    videoStart: integer('video_start').notNull().default(0),
    /**
     * Which of the seven abilities the guide is about.
     *
     * A slot key, not an ability id: the payload already says what sits in each
     * slot, so `'q'` keeps naming this build's Q after the author swaps what is
     * in it — where an id would leave the headline pointing at an ability the
     * loadout no longer holds.
     *
     * Null is "not chosen", which is every build written before this column
     * existed. Both the row and the build page fall back to reading the kit in
     * order, which is what they did for all of them until now.
     */
    mainSpell: text('main_spell', { enum: ['passive', 'q', 'w', 'e', 'd', 'f', 'r'] }),
    /** Filled slots. Unknown indices count — they are still choices the author made. */
    itemCount: integer('item_count').notNull(),
    spellCount: integer('spell_count').notNull().default(0),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    /**
     * Maintained in the same transaction as the row that changes them.
     *
     * There is no dislike counter. A guide is a thing someone wrote to be
     * useful, and a downvote button on it collects "I did not read this"
     * indistinguishably from "this is wrong" — so the site keeps the signal it
     * can act on and drops the one it cannot.
     */
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    publishedAt: integer('published_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    /**
     * Soft. A shared `/builds/<slug>` has to be able to say "this was deleted"
     * rather than be indistinguishable from a typo.
     */
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    uniqueIndex('builds_slug').on(table.slug),
    // The five-build cap. Partial, so soft-deleting a build frees its slot the
    // instant it is deleted rather than on some later purge.
    uniqueIndex('builds_user_slot')
      .on(table.userId, table.slot)
      .where(sql`${table.deletedAt} is null`),
    index('builds_browse').on(table.status, table.publishedAt),
    index('builds_user').on(table.userId),
    index('builds_hero').on(table.heroId, table.status),
    // The browse page's two facets. Tier leads because it is the coarser one
    // and the one the sidebar defaults to.
    index('builds_tier').on(table.tier, table.status),
    index('builds_season').on(table.season, table.status),
    index('builds_top').on(table.status, table.likeCount),
    index('builds_price').on(table.status, table.price),
    /*
     * The ceiling, not the limit.
     *
     * An account starts with five slots and gains five per linked provider, so
     * what a *particular* author may use is computed in the service. This is
     * the highest any of them can reach, and it is here because the slot is
     * what makes the cap structural: the partial unique index below refuses a
     * second build in one slot, and this refuses a sixteenth slot.
     */
    check('builds_slot_range', sql`${table.slot} >= 0 and ${table.slot} < ${MAX_BUILDS_CEILING}`),
    // The enum, enforced by the database as well as by TypeScript — a rule that
    // lives in one type is a rule the next migration forgets.
    check(
      'builds_tier',
      sql`${table.tier} is null or ${table.tier} in ('1','2','3','4','5','6','7','8','9','event')`,
    ),
    check('builds_season', sql`${table.season} in (1, 2)`),
    check(
      'builds_main_spell',
      sql`${table.mainSpell} is null or ${table.mainSpell} in ('passive','q','w','e','d','f','r')`,
    ),
  ],
);

/**
 * The rooms a build names. Zero, one, or several.
 *
 * A table rather than a column because the browse filter's whole job is "every
 * build that names this room", which wants an index — and because a
 * comma-separated column would be a list nothing could join to.
 *
 * No timestamps and no id of its own: a row here is a fact about a build, it is
 * rewritten wholesale whenever the build's rooms change, and the pair *is* the
 * key.
 */
export const buildMaps = sqliteTable(
  'build_maps',
  {
    buildId: integer('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'cascade' }),
    mapId: text('map_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildId, table.mapId] }),
    index('build_maps_map').on(table.mapId),
  ],
);

/**
 * Likes. There is no other kind.
 *
 * One row per person per build, enforced by a composite primary key — so
 * double-liking is not something the code prevents, it is something the schema
 * cannot represent. Unliking deletes the row rather than storing a zero, which
 * keeps "has not voted" and "voted neutral" from being two states meaning the
 * same thing.
 */
export const likes = sqliteTable(
  'likes',
  {
    buildId: integer('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.userId] })],
);

export const comments = sqliteTable(
  'comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    buildId: integer('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Plain text. Never HTML, never markdown — see the API's README. */
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    editedAt: integer('edited_at'),
    /**
     * When a moderator let it through, or null while it waits.
     *
     * Only comments from *unverified* accounts ever wait — an account with a
     * Steam or Discord identity linked to it posts straight through. That is
     * not a judgement about the person; it is a statement about the cost of
     * becoming a second one, which is what moderation at this size is for.
     *
     * A timestamp rather than a boolean, because "when" is the question a
     * moderator asks of a queue and a boolean cannot answer it.
     */
    approvedAt: integer('approved_at'),
    /** Soft, so removing a reply does not reshuffle the thread around it. */
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    index('comments_thread').on(table.buildId, table.createdAt),
    // The queue's own query: everything still waiting, oldest first.
    index('comments_pending').on(table.approvedAt, table.createdAt),
  ],
);
