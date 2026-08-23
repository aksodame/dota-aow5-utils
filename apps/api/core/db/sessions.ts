/**
 * Sessions: a random token in a cookie, and its hash in a row.
 *
 * Not a JWT. The argument for one is avoiding a database read per request, and
 * that argument does not survive contact with an in-process SQLite file — the
 * lookup below is a single indexed read of a page that is already cached. What
 * a server-side session buys instead is revocation that is actually immediate:
 * signing out everywhere, and a ban that takes effect on the next request
 * rather than whenever a token happens to expire.
 *
 * The row stores the SHA-256 of the token, never the token, so a leaked
 * database backup is a list of hashes rather than a set of live logins.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { Db } from './open.ts';
import { sessions, users } from './schema.ts';
import type { UserRow } from './users.ts';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How long a session may go without its `lastSeenAt` being written.
 *
 * Without this a read-heavy session is a database write on every request, for
 * no benefit — the expiry is thirty days and nobody needs it accurate to the
 * second.
 */
const TOUCH_INTERVAL_SECONDS = 60 * 60;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: Db, userId: number, now: number): { token: string; expiresAt: number } {
  // 32 bytes: far past guessing, and short enough to be a tidy cookie.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + SESSION_TTL_SECONDS;
  db.insert(sessions)
    .values({ id: hashToken(token), userId, createdAt: now, expiresAt, lastSeenAt: now })
    .run();
  return { token, expiresAt };
}

/**
 * The user a cookie names, or null.
 *
 * Null for every reason a session can fail — unknown, expired, or belonging to
 * somebody who has since been banned — because the caller treats all of them
 * identically: the request is anonymous.
 */
export function resolveSession(db: Db, token: string, now: number): UserRow | null {
  if (token === '') return null;

  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, hashToken(token)))
    .get();

  if (row === undefined) return null;
  if (row.session.expiresAt <= now) return null;
  // A ban takes effect here, on the next request, rather than at token expiry.
  if (row.user.bannedAt !== null) return null;

  if (now - row.session.lastSeenAt > TOUCH_INTERVAL_SECONDS) {
    db.update(sessions)
      .set({ lastSeenAt: now, expiresAt: now + SESSION_TTL_SECONDS })
      .where(eq(sessions.id, row.session.id))
      .run();
  }

  return row.user;
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

/** Signing out everywhere — the thing a JWT could not have offered. */
export function deleteSessionsForUser(db: Db, userId: number): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function purgeExpiredSessions(db: Db, now: number): number {
  return db.delete(sessions).where(lt(sessions.expiresAt, now)).run().changes;
}

/** Only used by the tests, to make a session look older than it is. */
export function backdateSession(db: Db, token: string, lastSeenAt: number): void {
  db.update(sessions).set({ lastSeenAt }).where(and(eq(sessions.id, hashToken(token)))).run();
}
