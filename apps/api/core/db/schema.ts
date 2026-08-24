/**
 * The whole database.
 *
 * Five tables, defined together even though the phases that use them ship
 * separately: this is a greenfield database, and one initial migration reads
 * better than four that each add a table nothing queries yet.
 *
 * Every timestamp is **unix seconds as an integer**, not a Date and not
 * milliseconds. It is what the wire contract says, what SQLite compares
 * cheapest, and it means no column's meaning depends on which layer read it.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** As typed, NFC. The only name there is, and the one that gets rendered. */
    nickname: text('nickname').notNull(),
    /**
     * What uniqueness is actually enforced on: `nickname` lowercased with `ё`
     * folded to `е`, derived in JavaScript.
     *
     * Not `COLLATE NOCASE`, and not SQLite's `lower()`: both fold ASCII only,
     * so under either of them `Вася` and `вася` would be two accounts that look
     * identical on a build card — an impersonation hole pointed straight at the
     * largest part of this audience. See `core/auth/nickname.ts`.
     *
     * The invariant that this always equals `nicknameKey(nickname)` cannot be a
     * CHECK for the same reason: SQLite's own `lower()` would agree with the
     * wrong answer. It holds because `createUser` is the only thing that writes
     * a row, and `core/db/schema.test.ts` proves the database refuses a Cyrillic
     * case-variant duplicate.
     */
    nicknameKey: text('nickname_key').notNull(),
    /** `scrypt$N=…,r=…,p=…$salt$hash` — self-describing. See `core/auth/password.ts`. */
    passwordHash: text('password_hash').notNull(),
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
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    /** Set rather than deleted: their content stays for moderation and thread shape. */
    bannedAt: integer('banned_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('users_nickname_key').on(table.nicknameKey),
    // The role was a TypeScript-only enum before, which is to say enforced
    // nowhere. Free to fix while the table is being written from scratch, and
    // this file already argues that a rule living in one `if` is a rule the
    // next endpoint forgets.
    check('users_role', sql`${table.role} in ('user', 'admin')`),
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
     * The encoded board, exactly as its author submitted it.
     *
     * Not normalised into slot rows, and never rewritten. It is already a
     * compact, versioned representation indexed against append-only tables, and
     * re-deriving it on read would mean re-encoding — which is precisely what
     * the fourth link invariant forbids. A future codec version therefore needs
     * no migration here at all.
     */
    payload: text('payload').notNull(),
    /**
     * The author's referral code, normalised, or `''` when they gave none.
     *
     * Here rather than on `users` because it belongs to the board: the code an
     * author wants credited can differ between builds, and hanging it off the
     * account would silently rewrite every build they ever published the first
     * time they changed it.
     *
     * Not part of the payload, deliberately. The payload is the shared link's
     * codec and is never rewritten; a code that lived inside it could not be
     * changed without minting a new one, and every anonymous link ever shared
     * would have to carry a field only saved builds use.
     */
    referral: text('referral').notNull().default(''),
    /** All derived from the payload once, at write time, so a list query decodes nothing. */
    codecVersion: integer('codec_version').notNull(),
    heroId: text('hero_id'),
    sectionCount: integer('section_count').notNull(),
    itemCount: integer('item_count').notNull(),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    /** Maintained in the same transaction as the row that changes them. */
    likeCount: integer('like_count').notNull().default(0),
    dislikeCount: integer('dislike_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    publishedAt: integer('published_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    /**
     * Soft. A shared `/g/<slug>` has to be able to say "this was deleted"
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
    check('builds_slot_range', sql`${table.slot} >= 0 and ${table.slot} < 5`),
  ],
);

export const votes = sqliteTable(
  'votes',
  {
    buildId: integer('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** +1 or -1. Withdrawing a vote deletes the row rather than storing a zero. */
    value: integer('value').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    // One row per person per build makes double-voting unrepresentable, which
    // is a stronger guarantee than any amount of checking before the insert.
    primaryKey({ columns: [table.buildId, table.userId] }),
    check('votes_value', sql`${table.value} in (-1, 1)`),
  ],
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
    /** Soft, so removing a reply does not reshuffle the thread around it. */
    deletedAt: integer('deleted_at'),
  },
  (table) => [index('comments_thread').on(table.buildId, table.createdAt)],
);
