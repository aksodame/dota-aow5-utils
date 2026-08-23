import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openDb, runMigrations, type Sqlite } from './open.ts';

/** Absolute, so the suite does not care which directory it was started from. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** A migrated, empty database with one user in it. */
/**
 * Raw SQL on purpose. These tests are about what the *database* refuses, so
 * they must not go through the code whose job is to keep it happy.
 */
function insertUser(sqlite: Sqlite, nickname: string, now: number) {
  return sqlite
    .prepare(`insert into users (nickname, nickname_key, password_hash, created_at) values (?, ?, ?, ?)`)
    .run(nickname, nickname.toLowerCase(), 'hash', now);
}

function fixture(): { sqlite: Sqlite; userId: number } {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);
  const now = Math.floor(Date.now() / 1000);
  const info = insertUser(sqlite, 'tester', now);
  return { sqlite, userId: Number(info.lastInsertRowid) };
}

function insertGuide(sqlite: Sqlite, userId: number, slot: number, slug: string) {
  const now = Math.floor(Date.now() / 1000);
  return sqlite
    .prepare(
      `insert into builds (slug, user_id, slot, title, payload, codec_version, section_count, item_count, created_at, updated_at)
       values (?, ?, ?, ?, ?, 6, 1, 1, ?, ?)`,
    )
    .run(slug, userId, slot, 'a title', '6.AAAA', now, now);
}

test('the migration applies to an empty database', () => {
  const { sqlite } = fixture();
  const tables = sqlite
    .prepare("select name from sqlite_master where type='table' order by name")
    .all()
    .map((row) => (row as { name: string }).name);
  for (const expected of ['users', 'sessions', 'builds', 'votes', 'comments']) {
    assert.ok(tables.includes(expected), `expected a ${expected} table, got ${tables.join(', ')}`);
  }
  sqlite.close();
});

test('five builds fit and the sixth is refused by the database, not by an if', () => {
  const { sqlite, userId } = fixture();
  for (let slot = 0; slot < 5; slot += 1) insertGuide(sqlite, userId, slot, `slug${slot}`);

  // There is no sixth slot to take, and the CHECK constraint says so.
  assert.throws(() => insertGuide(sqlite, userId, 5, 'slug5'), /CHECK constraint failed/i);
  // Reusing an occupied slot is the other way to try, and the partial unique
  // index says no to that.
  assert.throws(() => insertGuide(sqlite, userId, 0, 'slug5'), /UNIQUE constraint failed/i);

  sqlite.close();
});

test('soft-deleting a build frees its slot immediately', () => {
  const { sqlite, userId } = fixture();
  for (let slot = 0; slot < 5; slot += 1) insertGuide(sqlite, userId, slot, `slug${slot}`);
  assert.throws(() => insertGuide(sqlite, userId, 2, 'replacement'));

  sqlite.prepare('update builds set deleted_at = ? where slot = 2 and user_id = ?').run(1, userId);
  // The unique index is partial on `deleted_at is null`, so the freed slot is
  // available without waiting for any purge to run.
  assert.doesNotThrow(() => insertGuide(sqlite, userId, 2, 'replacement'));

  sqlite.close();
});

test('the cap is per author, not global', () => {
  const { sqlite, userId } = fixture();
  const now = Math.floor(Date.now() / 1000);
  const other = Number(insertUser(sqlite, 'other', now).lastInsertRowid);

  for (let slot = 0; slot < 5; slot += 1) insertGuide(sqlite, userId, slot, `a${slot}`);
  for (let slot = 0; slot < 5; slot += 1) assert.doesNotThrow(() => insertGuide(sqlite, other, slot, `b${slot}`));

  sqlite.close();
});

test('a person cannot vote twice on one build, and cannot vote nonsense', () => {
  const { sqlite, userId } = fixture();
  insertGuide(sqlite, userId, 0, 'voted');
  const buildId = (sqlite.prepare('select id from builds').get() as { id: number }).id;

  const vote = (value: number) =>
    sqlite.prepare('insert into votes (build_id, user_id, value, created_at) values (?, ?, ?, 0)').run(buildId, userId, value);

  vote(1);
  assert.throws(() => vote(-1), /UNIQUE constraint failed/i, 'the composite primary key is the guarantee');
  assert.throws(
    () =>
      sqlite
        .prepare('insert into votes (build_id, user_id, value, created_at) values (?, ?, ?, 0)')
        .run(buildId, userId + 999, 7),
    /CHECK|FOREIGN KEY/i,
  );

  sqlite.close();
});

test('deleting a build takes its comments and votes with it', () => {
  const { sqlite, userId } = fixture();
  insertGuide(sqlite, userId, 0, 'doomed');
  const buildId = (sqlite.prepare('select id from builds').get() as { id: number }).id;
  sqlite.prepare('insert into votes (build_id, user_id, value, created_at) values (?, ?, 1, 0)').run(buildId, userId);
  sqlite
    .prepare('insert into comments (build_id, user_id, body, created_at) values (?, ?, ?, 0)')
    .run(buildId, userId, 'nice build');

  sqlite.prepare('delete from builds where id = ?').run(buildId);

  // Only true because open.ts turns foreign_keys on — SQLite has it off.
  assert.equal((sqlite.prepare('select count(*) c from votes').get() as { c: number }).c, 0);
  assert.equal((sqlite.prepare('select count(*) c from comments').get() as { c: number }).c, 0);

  sqlite.close();
});

test('two builds cannot share a slug', () => {
  const { sqlite, userId } = fixture();
  insertGuide(sqlite, userId, 0, 'same');
  assert.throws(() => insertGuide(sqlite, userId, 1, 'same'), /UNIQUE constraint failed/i);
  sqlite.close();
});

test('a nickname is unique regardless of case, in Cyrillic as well as Latin', () => {
  // The test that would fail under `COLLATE NOCASE`, which folds ASCII only.
  // `Вася` and `вася` rendering as two different accounts is an impersonation
  // hole aimed at the largest part of this audience, so it gets its own test.
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);
  const now = Math.floor(Date.now() / 1000);

  insertUser(sqlite, 'Вася', now);
  assert.throws(
    () => insertUser(sqlite, 'ВАСЯ', now),
    /UNIQUE/,
    'a Cyrillic case variant must not be a second account',
  );
  assert.doesNotThrow(() => insertUser(sqlite, 'Петя', now));
  sqlite.close();
});

test('role is constrained by the database, not just by TypeScript', () => {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);
  const now = Math.floor(Date.now() / 1000);
  assert.throws(
    () =>
      sqlite
        .prepare(`insert into users (nickname, nickname_key, password_hash, role, created_at) values (?,?,?,?,?)`)
        .run('x', 'x', 'h', 'moderator', now),
    /CHECK/,
  );
  sqlite.close();
});
