import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_BUILDS_CEILING } from 'aow5-api-contract';
import { openDb, runMigrations, type Sqlite } from './open.ts';
import { readPriority } from '../builds/priority.ts';

/** Absolute, so the suite does not care which directory it was started from. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** A migrated, empty database with one user in it. */
/**
 * Raw SQL on purpose. These tests are about what the *database* refuses, so
 * they must not go through the code whose job is to keep it happy.
 */
function insertUser(sqlite: Sqlite, nickname = 'tester') {
  const now = Math.floor(Date.now() / 1000);
  return sqlite
    .prepare(`insert into users (nickname, created_at, updated_at) values (?, ?, ?)`)
    .run(nickname, now, now);
}

/** An external account, pointed at a user. Raw, for the same reason. */
function insertIdentity(sqlite: Sqlite, provider: string, providerId: string, userId: number) {
  const now = Math.floor(Date.now() / 1000);
  return sqlite
    .prepare(
      `insert into identities (provider, provider_id, user_id, created_at, updated_at) values (?, ?, ?, ?, ?)`,
    )
    .run(provider, providerId, userId, now, now);
}

function fixture(): { sqlite: Sqlite; userId: number } {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);
  const info = insertUser(sqlite);
  return { sqlite, userId: Number(info.lastInsertRowid) };
}

function insertGuide(sqlite: Sqlite, userId: number, slot: number, slug: string) {
  const now = Math.floor(Date.now() / 1000);
  return sqlite
    .prepare(
      `insert into builds (slug, user_id, slot, title, payload, codec_version, item_count, created_at, updated_at)
       values (?, ?, ?, ?, ?, 7, 1, ?, ?)`,
    )
    .run(slug, userId, slot, 'a title', '7.AAAAAAA', now, now);
}

test('the migration applies to an empty database', () => {
  const { sqlite } = fixture();
  const tables = sqlite
    .prepare("select name from sqlite_master where type='table' order by name")
    .all()
    .map((row) => (row as { name: string }).name);
  for (const expected of ['users', 'sessions', 'builds', 'likes', 'comments']) {
    assert.ok(tables.includes(expected), `expected a ${expected} table, got ${tables.join(', ')}`);
  }
  // And the one 0005 replaced. A leftover `votes` table would mean the
  // migration half-ran and a dislike is still representable somewhere.
  assert.equal(tables.includes('votes'), false, 'votes should have been dropped');
  sqlite.close();
});

test('the slot ceiling belongs to the database, not to an if in the service', () => {
  /*
   * The *limit* is per account now — five, plus five for every linked provider
   * — and it is computed in the service. What the schema owns is the ceiling
   * that no account can pass, and the rule that one slot holds one build.
   */
  const { sqlite, userId } = fixture();
  for (let slot = 0; slot < MAX_BUILDS_CEILING; slot += 1) insertGuide(sqlite, userId, slot, `slug${slot}`);

  // There is no slot past the ceiling, and the CHECK constraint says so.
  assert.throws(() => insertGuide(sqlite, userId, MAX_BUILDS_CEILING, 'one-more'), /CHECK constraint failed/i);
  // Reusing an occupied slot is the other way to try, and the partial unique
  // index says no to that.
  assert.throws(() => insertGuide(sqlite, userId, 0, 'one-more'), /UNIQUE constraint failed/i);

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
  const other = Number(insertUser(sqlite, 'other').lastInsertRowid);

  for (let slot = 0; slot < 5; slot += 1) insertGuide(sqlite, userId, slot, `a${slot}`);
  for (let slot = 0; slot < 5; slot += 1) assert.doesNotThrow(() => insertGuide(sqlite, other, slot, `b${slot}`));

  sqlite.close();
});

test('a person cannot like one build twice, and a stranger cannot like at all', () => {
  const { sqlite, userId } = fixture();
  insertGuide(sqlite, userId, 0, 'liked');
  const buildId = (sqlite.prepare('select id from builds').get() as { id: number }).id;

  const like = (who: number) =>
    sqlite.prepare('insert into likes (build_id, user_id, created_at) values (?, ?, 0)').run(buildId, who);

  like(userId);
  assert.throws(() => like(userId), /UNIQUE constraint failed/i, 'the composite primary key is the guarantee');
  assert.throws(() => like(userId + 999), /FOREIGN KEY/i, 'a like needs a real person behind it');

  sqlite.close();
});

test('there is no way to record a dislike', () => {
  // Not "the code does not write one" -- there is nowhere to put it. The likes
  // table has three columns and none of them carries a sign.
  const { sqlite } = fixture();
  const columnsOf = (table: string) =>
    sqlite
      .prepare('select name from pragma_table_info(?)')
      .all(table)
      .map((row) => (row as { name: string }).name);

  assert.deepEqual(columnsOf('likes').sort(), ['build_id', 'created_at', 'user_id']);

  const buildColumns = columnsOf('builds');
  assert.equal(buildColumns.includes('dislike_count'), false);
  assert.equal(buildColumns.includes('section_count'), false, 'a build is one loadout now');
  assert.equal(buildColumns.includes('map_id'), false, 'the rooms are a table of their own now');
  assert.ok(buildColumns.includes('tier'), 'a build knows which tier it is filed under');
  assert.deepEqual(columnsOf('build_maps').sort(), ['build_id', 'map_id']);
  assert.ok(buildColumns.includes('tier'));

  sqlite.close();
});

test('deleting a build takes its comments and likes with it', () => {
  const { sqlite, userId } = fixture();
  insertGuide(sqlite, userId, 0, 'doomed');
  const buildId = (sqlite.prepare('select id from builds').get() as { id: number }).id;
  sqlite.prepare('insert into likes (build_id, user_id, created_at) values (?, ?, 0)').run(buildId, userId);
  sqlite
    .prepare('insert into comments (build_id, user_id, body, created_at) values (?, ?, ?, 0)')
    .run(buildId, userId, 'nice build');

  sqlite.prepare('delete from builds where id = ?').run(buildId);

  // Only true because open.ts turns foreign_keys on — SQLite has it off.
  assert.equal((sqlite.prepare('select count(*) c from likes').get() as { c: number }).c, 0);
  assert.equal((sqlite.prepare('select count(*) c from comments').get() as { c: number }).c, 0);

  sqlite.close();
});

test('two builds cannot share a slug', () => {
  const { sqlite, userId } = fixture();
  insertGuide(sqlite, userId, 0, 'same');
  assert.throws(() => insertGuide(sqlite, userId, 1, 'same'), /UNIQUE constraint failed/i);
  sqlite.close();
});

test('one provider account is one user, and a display name is nobody’s property', () => {
  /*
   * Uniqueness moved off the user and onto the *identity*. A SteamID is issued
   * by Steam and chosen by nobody, so it can be a key; a display name is chosen
   * by its owner and shared by anyone, so it is not one. That split is what
   * makes two people called `Вася` two people rather than a collision.
   */
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);

  const first = Number(insertUser(sqlite, 'Вася').lastInsertRowid);
  insertIdentity(sqlite, 'steam', '76561197960287930', first);

  const second = Number(insertUser(sqlite, 'ВАСЯ').lastInsertRowid);
  assert.throws(
    () => insertIdentity(sqlite, 'steam', '76561197960287930', second),
    /UNIQUE|PRIMARY KEY/i,
    'one SteamID cannot vouch for two accounts',
  );

  // The same name as many times as anybody likes, as long as none of them has
  // claimed it with a password.
  assert.doesNotThrow(() => insertUser(sqlite, 'Вася'));
  assert.doesNotThrow(() => insertUser(sqlite, 'вася'));
  sqlite.close();
});

test('a nickname key is unique, but only among accounts that have a password', () => {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);
  const now = Math.floor(Date.now() / 1000);
  const local = (key: string) =>
    sqlite
      .prepare(
        `insert into users (nickname, nickname_key, password_hash, created_at, updated_at) values (?,?,?,?,?)`,
      )
      .run(key, key, 'scrypt$N=1,r=1,p=1$x$y', now, now);

  local('вася');
  assert.throws(() => local('вася'), /UNIQUE/, 'the key is what uniqueness means');

  // The partial index is why the many provider accounts above, all with a NULL
  // key, do not collide with each other.
  assert.doesNotThrow(() => insertUser(sqlite, 'вася'));
  sqlite.close();
});

test('a password without a nickname key is an account nobody could sign into', () => {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);
  const now = Math.floor(Date.now() / 1000);
  assert.throws(
    () =>
      sqlite
        .prepare(`insert into users (nickname, password_hash, created_at, updated_at) values (?,?,?,?)`)
        .run('x', 'scrypt$N=1,r=1,p=1$x$y', now, now),
    /CHECK/,
    'the two local columns are written together or not at all',
  );
  sqlite.close();
});

test('role is constrained by the database, not just by TypeScript', () => {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS_FOLDER);
  const now = Math.floor(Date.now() / 1000);
  assert.throws(
    () =>
      sqlite
        .prepare(`insert into users (nickname, role, created_at, updated_at) values (?,?,?,?)`)
        .run('x', 'moderator', now, now),
    /CHECK/,
  );
  sqlite.close();
});

test('a tier is one of the ten the site files guides under', () => {
  const { sqlite, userId } = fixture();
  const now = Math.floor(Date.now() / 1000);
  // A fresh slot per accepted row, counted rather than randomised: five builds
  // per author is a real constraint, and a random slot collides with itself.
  let slot = 0;
  const withTier = (tier: string | null) =>
    sqlite
      .prepare(
        `insert into builds (slug, user_id, slot, title, payload, codec_version, item_count, tier, created_at, updated_at)
         values (?, ?, ?, 'a title', '8.AAAAAA', 8, 1, ?, ?, ?)`,
      )
      .run(`tier${slot++}`, userId, slot, tier, now, now);

  assert.doesNotThrow(() => withTier('8'));
  assert.doesNotThrow(() => withTier('event'), 'Event is a category, not a tier number');
  assert.doesNotThrow(() => withTier(null), 'a draft may not have picked one');
  // The database refuses the rest, rather than trusting the one `if` above it.
  for (const bad of ['0', '10', 'Event', 'eight', '']) {
    assert.throws(() => withTier(bad), /CHECK/, `tier ${JSON.stringify(bad)}`);
  }
  sqlite.close();
});

test('a build written before the priority column reads as having no priority', () => {
  const { sqlite, userId } = fixture();
  // The insert every other test here uses — no `priority` — which is also the
  // shape of every row the migration found. `''` rather than null is what makes
  // "wrote none" one value instead of two.
  insertGuide(sqlite, userId, 0, 'plain');
  const row = sqlite.prepare(`select priority from builds where slug = 'plain'`).get() as { priority: string };
  assert.equal(row.priority, '');
  assert.deepEqual(readPriority(row.priority), []);
  sqlite.close();
});

test('the rooms of a build go with it, and the pair is the key', () => {
  const { sqlite, userId } = fixture();
  insertGuide(sqlite, userId, 0, 'roomy');
  const buildId = (sqlite.prepare(`select id from builds where slug = 'roomy'`).get() as { id: number }).id;

  const add = (mapId: string) =>
    sqlite.prepare('insert into build_maps (build_id, map_id) values (?, ?)').run(buildId, mapId);

  add('M001');
  add('M002');
  assert.throws(() => add('M001'), /UNIQUE|PRIMARY KEY/i, 'the same room twice is one row, not two');

  sqlite.prepare('delete from builds where id = ?').run(buildId);
  const left = sqlite.prepare('select count(*) as n from build_maps where build_id = ?').get(buildId) as { n: number };
  assert.equal(left.n, 0, 'deleting a build takes its rooms with it');
  sqlite.close();
});

