/**
 * Everything that reads or writes a person.
 *
 * A user is never deleted. Banning sets `bannedAt`, which hides their builds
 * and comments everywhere and makes their sessions resolve to nobody — but the
 * rows stay, because a thread that loses a reply reshuffles around it and a
 * moderator looking at why somebody was banned needs to see what they wrote.
 *
 * **The account and the ways into it are separate things.** This module owns
 * the person and their local credentials; `identities.ts` owns the external
 * accounts that vouch for them. Splitting the two is what makes adding Discord
 * an INSERT rather than the destructive rebuild that adding — and removing, and
 * re-adding — Steam was.
 */
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { ProfileLink, PublicUser } from 'aow5-api-contract';
import {
  BUILDS_PER_LINKED_PROVIDER,
  MAX_BUILDS_CEILING,
  MAX_BUILDS_PER_USER,
  MAX_PERSONA,
} from 'aow5-api-contract';
import { nicknameKey } from '../auth/nickname.ts';
import type { Db } from './open.ts';
import { identities, users } from './schema.ts';

export type UserRow = typeof users.$inferSelect;

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/**
 * By the folded key, which is the only way a nickname is ever looked up.
 *
 * Never by `nickname` itself: that column is what gets rendered and two rows
 * may legitimately hold `Вася` and `вася` as display names if neither has a
 * password. The key is what uniqueness means here — see the column's note.
 */
export function findUserByNickname(db: Db, nickname: string): UserRow | undefined {
  const key = nicknameKey(nickname);
  if (key === '') return undefined;
  return db
    .select()
    .from(users)
    .where(and(eq(users.nicknameKey, key), isNotNull(users.passwordHash)))
    .get();
}

/** Whether a name is free, for the sign-up form to say so before it is taken. */
export function nicknameTaken(db: Db, nickname: string): boolean {
  return findUserByNickname(db, nickname) !== undefined;
}

/**
 * Opens an account with a password.
 *
 * The two local columns are written together, which is what the
 * `users_local_pair` check enforces — a hash with no key is an account nobody
 * can sign into.
 */
export function createLocalUser(
  db: Db,
  input: { nickname: string; passwordHash: string },
  now: number,
): UserRow {
  return db
    .insert(users)
    .values({
      nickname: input.nickname,
      nicknameKey: nicknameKey(input.nickname),
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

/**
 * Opens an account for somebody arriving from a provider.
 *
 * No password, so no nickname key and no claim on the name: two people who sign
 * in through Steam under the same persona get two accounts, and neither blocks
 * a local sign-up under that name. That is deliberate — a display name is not
 * an identity here, the row is.
 *
 * The name is capped rather than validated. A provider's display name is
 * whatever that provider allows, and refusing somebody's sign-in because their
 * Steam persona contains an emoji would be absurd.
 */
export function createProviderUser(
  db: Db,
  input: { nickname: string; avatar: string },
  now: number,
): UserRow {
  return db
    .insert(users)
    .values({
      nickname: capName(input.nickname),
      avatar: input.avatar,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

/**
 * Refreshes what a provider last said about somebody.
 *
 * Only for an account that has no local credentials. Somebody who set a
 * password chose their own name, and having Discord silently rename them on
 * their next sign-in would be a surprise nobody asked for.
 */
export function refreshProviderProfile(
  db: Db,
  user: UserRow,
  profile: { nickname: string; avatar: string },
  now: number,
): UserRow {
  if (user.passwordHash !== null) return user;
  db.update(users)
    .set({ nickname: capName(profile.nickname), avatar: profile.avatar, updatedAt: now })
    .where(eq(users.id, user.id))
    .run();
  return findUserById(db, user.id) ?? user;
}

/**
 * Adds a password to an account that has none, or changes an existing one.
 *
 * The nickname key is written from the *current* display name, so an account
 * opened through Steam takes a claim on that name at the moment it gains a
 * password — and the unique index refuses if somebody else already holds it,
 * which is the caller's cue to ask for a different one.
 */
export function setPassword(db: Db, userId: number, nickname: string, passwordHash: string, now: number): void {
  db.update(users)
    .set({
      nickname,
      nicknameKey: nicknameKey(nickname),
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .run();
}

/** A wrong password. Counted on the row — see the column's note for why. */
export function recordFailedSignIn(db: Db, userId: number, lockedUntil: number | null): void {
  db.update(users)
    .set({ failedAttempts: sql`${users.failedAttempts} + 1`, lockedUntil })
    .where(eq(users.id, userId))
    .run();
}

/** A right one. Clears the counter, so the backoff is about *consecutive* misses. */
export function clearFailedSignIns(db: Db, userId: number): void {
  db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, userId)).run();
}

/**
 * Just enough of a person to render them.
 *
 * Narrower than `UserRow` on purpose: it lets the browse query select three
 * columns instead of eleven, and keeps the moderation and credential fields out
 * of a code path whose whole job is building a list of cards.
 */
export type UserSummary = Pick<UserRow, 'id' | 'nickname' | 'avatar'> & {
  /**
   * Whether a provider vouches for them.
   *
   * Carried on the summary rather than looked up per render: a browse page
   * draws ten authors and a thread twenty commenters, and a query each is the
   * shape that makes a list slow for no reason anybody can see. The queries
   * that build these join it in.
   */
  verified?: boolean;
  /**
   * Where they can be read about off this site, if anywhere.
   *
   * Carried rather than looked up for the same reason `verified` is: the
   * queries that build a list join it in once. Absent means "this query did not
   * ask", which renders as a name with no link — the same as an account with
   * nothing linked to it.
   */
  profiles?: ProfileLink[];
};

/** The subset of a user that anyone is allowed to see. */
export function toPublicUser(user: UserSummary): PublicUser {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    verified: user.verified ?? false,
    profiles: user.profiles ?? [],
  };
}

/**
 * How many builds this account may keep.
 *
 * Five, plus five for every provider linked to it. Not a reward for being
 * trustworthy: the cap exists because an account costs nothing to open, so
 * "five builds per account" is really "five per *free* account" — and a linked
 * Steam or Discord account is the one thing here that is genuinely scarce. An
 * author who attached one has already paid the price the cap was collecting.
 *
 * One query, and the schema still has the last word: `builds_slot_range` caps
 * the highest slot any account can reach at `MAX_BUILDS_CEILING`.
 */
export function buildLimitFor(db: Db, userId: number): number {
  const linked = db.select({ provider: identities.provider }).from(identities).where(eq(identities.userId, userId)).all();
  return Math.min(MAX_BUILDS_PER_USER + linked.length * BUILDS_PER_LINKED_PROVIDER, MAX_BUILDS_CEILING);
}

/**
 * Whether an account has a provider linked to it.
 *
 * The one question "verified" means. A single indexed existence check, which is
 * cheap enough to ask on the write path where a comment decides whether it
 * waits — the *read* paths join it instead.
 */
export function isVerified(db: Db, userId: number): boolean {
  return (
    db.select({ provider: identities.provider }).from(identities).where(eq(identities.userId, userId)).get() !==
    undefined
  );
}

/** Providers cap nothing; this column does. Code points, like every other cap. */
function capName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  return [...trimmed].slice(0, MAX_PERSONA).join('') || 'player';
}
