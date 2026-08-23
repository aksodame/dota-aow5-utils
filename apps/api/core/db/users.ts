/**
 * Everything that reads or writes a person.
 *
 * A user is never deleted. Banning sets `bannedAt`, which hides their builds
 * and comments everywhere and makes their sessions resolve to nobody — but the
 * rows stay, because a thread that loses a reply reshuffles around it and a
 * moderator looking at why somebody was banned needs to see what they wrote.
 */
import { eq, sql } from 'drizzle-orm';
import type { PublicUser } from 'aow5-api-contract';
import { lockoutSeconds } from '../auth/lockout.ts';
import { nicknameKey } from '../auth/nickname.ts';
import type { Db } from './open.ts';
import { users } from './schema.ts';

export type UserRow = typeof users.$inferSelect;

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/**
 * Looks a person up by the name they typed.
 *
 * Through the key, never through `nickname` itself — that column holds the
 * casing its owner chose, so matching on it would mean `Вася` could not sign in
 * as `вася`.
 */
export function findUserByNickname(db: Db, nickname: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.nicknameKey, nicknameKey(nickname))).get();
}

export interface NewUser {
  /** As typed, already validated and NFC-normalised by `checkNickname`. */
  nickname: string;
  /** `checkNickname`'s key. Passed in rather than re-derived, so one function owns the rule. */
  key: string;
  passwordHash: string;
}

/**
 * Creates an account, or reports that the name is taken.
 *
 * The race is real and is left to the database: two people submitting the same
 * nickname in the same instant both pass a `findUserByNickname` check and one of
 * them then hits the unique index. Catching the constraint is what makes that
 * outcome correct rather than a 500, and it is why the check before it is a
 * courtesy rather than the guarantee.
 */
export function createUser(db: Db, input: NewUser, now: number): UserRow | 'taken' {
  try {
    return db
      .insert(users)
      .values({
        nickname: input.nickname,
        nicknameKey: input.key,
        passwordHash: input.passwordHash,
        createdAt: now,
      })
      .returning()
      .get();
  } catch (error) {
    if (isUniqueViolation(error)) return 'taken';
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

/**
 * Counts a wrong password and returns how long this account is now shut for.
 */
export function recordFailedSignIn(db: Db, userId: number, now: number): number {
  // The increment is one statement so two attempts arriving together cannot
  // both read the same counter and each add one to it. The *policy* then runs
  // in JavaScript, where it is written once and tested — expressing that
  // doubling-and-capping curve a second time in SQL would be two formulas to
  // keep in agreement for the sake of saving one write.
  const row = db
    .update(users)
    .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
    .where(eq(users.id, userId))
    .returning({ failedAttempts: users.failedAttempts })
    .get();
  if (row === undefined) return 0;

  const seconds = lockoutSeconds(row.failedAttempts);
  db.update(users)
    .set({ lockedUntil: seconds > 0 ? now + seconds : null })
    .where(eq(users.id, userId))
    .run();
  return seconds;
}

/**
 * Wipes the counter after a sign-in that worked.
 *
 * Conditional, so the overwhelming majority of sign-ins — the ones after no
 * failures at all — stay a read plus the session insert, with no write here.
 */
export function clearFailedSignIns(db: Db, user: UserRow): void {
  if (user.failedAttempts === 0 && user.lockedUntil === null) return;
  db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();
}

/**
 * Just enough of a person to render them.
 *
 * Narrower than `UserRow` on purpose: it lets the browse query select two
 * columns instead of nine, and keeps password hashes out of a code path whose
 * whole job is building a list of cards.
 */
export type UserSummary = Pick<UserRow, 'id' | 'nickname'>;

/** The subset of a user that anyone is allowed to see. */
export function toPublicUser(user: UserSummary): PublicUser {
  return {
    id: user.id,
    nickname: user.nickname,
  };
}
