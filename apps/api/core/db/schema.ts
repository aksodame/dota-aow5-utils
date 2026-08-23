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
    /**
     * A SteamID64 is 17 digits — past 2^53, so it is not safely a number in
     * JavaScript at any point. Text here, text on the wire, never parsed.
     */
    steamId: text('steam_id').notNull(),
    persona: text('persona').notNull(),
    avatarUrl: text('avatar_url').notNull(),
    profileUrl: text('profile_url').notNull(),
    /** When the profile above was last refetched from Steam. */
    profileSyncedAt: integer('profile_synced_at').notNull(),
    /**
     * Steam's own account creation time, when the profile is public.
     *
     * Stored from the first day and deliberately not enforced. The moment vote
     * brigading appears, "accounts younger than a week cannot vote" is a one
     * line change with the data already behind it; until then it does not
     * punish somebody who just bought the game.
     */
    steamCreatedAt: integer('steam_created_at'),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    /** Set rather than deleted: their content stays for moderation and thread shape. */
    bannedAt: integer('banned_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('users_steam_id').on(table.steamId)],
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
