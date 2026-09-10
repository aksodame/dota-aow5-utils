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
import { signInWithProvider } from './identities.ts';
import type { UserRow } from './users.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;
const PERSONA = 'tester';
const STEAM_ID = '76561197960287930';

function seedUser(db: Db, steamId: string, persona: string): UserRow {
  return signInWithProvider(db, { provider: 'steam', providerId: steamId, nickname: persona, avatar: '' }, NOW);
}

function fixture(): { db: Db; userId: number } {
  const { db } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  const user = seedUser(db, STEAM_ID, PERSONA);
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

test('signing in again is the same account, with a refreshed profile', () => {
  // The identity is the SteamID, not the name: coming back with a new persona
  // updates the row rather than opening a second account. Which also means two
  // people may share a persona here, exactly as they may on Steam.
  const { db } = fixture();
  const again = seedUser(db, STEAM_ID, 'renamed');
  assert.equal(again.nickname, 'renamed');
  assert.equal(db.select().from(users).all().length, 1);

  const stranger = seedUser(db, '76561197960287999', 'renamed');
  assert.notEqual(stranger.id, again.id, 'a shared persona is still two people');
  assert.equal(db.select().from(users).all().length, 2);
});

test('an account keeps the date it was opened, not the date it was last seen', () => {
  const { db } = fixture();
  const first = db.select().from(users).get();
  signInWithProvider(
      db,
      { provider: 'steam', providerId: STEAM_ID, nickname: 'later', avatar: '' },
      NOW + 90_000,
    );

  const after = db.select().from(users).get();
  assert.equal(after?.createdAt, first?.createdAt);
  assert.equal(after?.updatedAt, NOW + 90_000);
});
