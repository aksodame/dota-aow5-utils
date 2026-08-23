import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openDb, runMigrations, type Db } from './open.ts';
import {
  backdateSession,
  createSession,
  deleteSession,
  deleteSessionsForUser,
  hashToken,
  purgeExpiredSessions,
  resolveSession,
  SESSION_TTL_SECONDS,
} from './sessions.ts';
import { profileIsStale, upsertUserFromSteam } from './users.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;
const STEAM_ID = '76561197960287930';

function fixture(): { db: Db; userId: number } {
  const { db } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  const user = upsertUserFromSteam(
    db,
    STEAM_ID,
    { steamId: STEAM_ID, persona: 'tester', avatarUrl: 'https://a/f.jpg', profileUrl: 'https://p/', createdAt: 1 },
    NOW,
  );
  return { db, userId: user.id };
}

test('a session resolves back to the person who created it', () => {
  const { db, userId } = fixture();
  const { token } = createSession(db, userId, NOW);
  assert.equal(resolveSession(db, token, NOW)?.id, userId);
});

test('the token is never stored, only its hash', () => {
  const { db, userId } = fixture();
  const { token } = createSession(db, userId, NOW);
  const stored = db.all<{ id: string }>('select id from sessions' as never) as unknown as Array<{ id: string }>;
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0]!.id, token, 'the cookie value itself must not be in the row');
  assert.equal(stored[0]!.id, hashToken(token));
});

test('an unknown or empty token is nobody', () => {
  const { db } = fixture();
  assert.equal(resolveSession(db, '', NOW), null);
  assert.equal(resolveSession(db, 'made-up', NOW), null);
});

test('an expired session is nobody, on the second it expires', () => {
  const { db, userId } = fixture();
  const { token, expiresAt } = createSession(db, userId, NOW);
  assert.equal(expiresAt, NOW + SESSION_TTL_SECONDS);
  // Checked on its own session: resolving one a second before it expires would
  // slide the expiry forward, so the two assertions cannot share a token.
  assert.equal(resolveSession(db, token, expiresAt), null);

  const fresh = createSession(db, userId, NOW);
  assert.ok(resolveSession(db, fresh.token, NOW + 60));
});

test('using a session slides its expiry forward', () => {
  const { db, userId } = fixture();
  const { token, expiresAt } = createSession(db, userId, NOW);

  // Well past the touch interval, so this request rewrites the row.
  const later = NOW + SESSION_TTL_SECONDS - 1;
  assert.ok(resolveSession(db, token, later));

  const row = (db.all('select expires_at as e from sessions' as never) as unknown as Array<{ e: number }>)[0]!;
  assert.ok(row.e > expiresAt, 'an active session should not expire out from under someone');
  assert.equal(row.e, later + SESSION_TTL_SECONDS);
});

test('a ban takes effect on the next request, not at token expiry', () => {
  const { db, userId } = fixture();
  const { token } = createSession(db, userId, NOW);
  assert.ok(resolveSession(db, token, NOW));

  db.update(users).set({ bannedAt: NOW }).where(eq(users.id, userId)).run();

  // The session row is untouched and unexpired; it resolves to nobody anyway.
  assert.equal(resolveSession(db, token, NOW), null, 'this is what a JWT could not have done');
});

test('signing out drops that session and leaves the others alone', () => {
  const { db, userId } = fixture();
  const a = createSession(db, userId, NOW);
  const b = createSession(db, userId, NOW);

  deleteSession(db, a.token);
  assert.equal(resolveSession(db, a.token, NOW), null);
  assert.ok(resolveSession(db, b.token, NOW), 'the other device stays signed in');
});

test('signing out everywhere drops all of them', () => {
  const { db, userId } = fixture();
  const a = createSession(db, userId, NOW);
  const b = createSession(db, userId, NOW);

  deleteSessionsForUser(db, userId);
  assert.equal(resolveSession(db, a.token, NOW), null);
  assert.equal(resolveSession(db, b.token, NOW), null);
});

test('a session is not rewritten on every request', () => {
  const { db, userId } = fixture();
  const { token } = createSession(db, userId, NOW);

  const lastSeen = () =>
    (db.all('select last_seen_at as t from sessions' as never) as unknown as Array<{ t: number }>)[0]!.t;

  resolveSession(db, token, NOW + 60);
  assert.equal(lastSeen(), NOW, 'a minute later is not worth a write');

  backdateSession(db, token, NOW - 7200);
  resolveSession(db, token, NOW);
  assert.equal(lastSeen(), NOW, 'two hours later is');
});

test('expired sessions can be swept without touching live ones', () => {
  const { db, userId } = fixture();
  const live = createSession(db, userId, NOW);
  const dead = createSession(db, userId, NOW - SESSION_TTL_SECONDS - 10);

  assert.equal(purgeExpiredSessions(db, NOW), 1);
  assert.equal(resolveSession(db, dead.token, NOW), null);
  assert.ok(resolveSession(db, live.token, NOW));
});

test('signing in again updates the stored profile rather than making a second user', () => {
  const { db, userId } = fixture();
  const again = upsertUserFromSteam(
    db,
    STEAM_ID,
    { steamId: STEAM_ID, persona: 'renamed', avatarUrl: 'https://a/new.jpg', profileUrl: 'https://p/', createdAt: 1 },
    NOW + 100,
  );
  assert.equal(again.id, userId);
  assert.equal(again.persona, 'renamed');
});

test('Steam being unreachable does not wipe a profile, and retries next time', () => {
  const { db } = fixture();
  const kept = upsertUserFromSteam(db, STEAM_ID, null, NOW + 100);
  assert.equal(kept.persona, 'tester', 'the stored profile survives a failed lookup');

  // A brand-new visitor gets a placeholder whose sync time is zero, so the
  // next sign-in treats it as stale immediately instead of waiting a week.
  const fresh = upsertUserFromSteam(db, '76561197960287999', null, NOW);
  assert.equal(fresh.profileSyncedAt, 0);
  assert.equal(profileIsStale(fresh, NOW), true);
});
