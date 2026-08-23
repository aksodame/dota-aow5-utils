import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { openDb } from './open.ts';

test('the pragmas the schema depends on are actually set', () => {
  const { sqlite } = openDb({ path: ':memory:' });

  // The one that is off by default, and without which every foreign key and
  // every cascade in schema.ts is decoration.
  assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(sqlite.pragma('busy_timeout', { simple: true }), 5000);

  sqlite.close();
});

test('a file database really is in WAL', () => {
  // An in-memory database cannot be in WAL, so the mode is only meaningful on
  // a real file — and WAL is what lets readers not block the single writer.
  const path = join(tmpdir(), `aow5-open-test-${process.pid}.db`);
  try {
    const { sqlite } = openDb({ path });
    assert.equal(String(sqlite.pragma('journal_mode', { simple: true })).toLowerCase(), 'wal');
    sqlite.close();
  } finally {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
  }
});

test('a transaction is atomic, which is what the build-slot cap rests on', () => {
  const { db, sqlite } = openDb({ path: ':memory:' });
  sqlite.exec('create table t (a integer primary key, b integer not null)');

  const insert = sqlite.prepare('insert into t values (?, ?)');
  const both = sqlite.transaction(() => {
    insert.run(1, 1);
    throw new Error('rolled back');
  });

  assert.throws(() => both(), /rolled back/);
  const row = sqlite.prepare('select count(*) c from t').get() as { c: number };
  assert.equal(row.c, 0, 'the insert must not survive the throw');
  assert.ok(db, 'drizzle wraps the same connection');
  sqlite.close();
});

test('foreign keys really cascade, rather than being declared and ignored', () => {
  const { sqlite } = openDb({ path: ':memory:' });
  sqlite.exec(`
    create table parent (id integer primary key);
    create table child (id integer primary key, parent_id integer not null
      references parent(id) on delete cascade);
  `);
  sqlite.prepare('insert into parent values (1)').run();
  sqlite.prepare('insert into child values (1, 1)').run();
  sqlite.prepare('delete from parent where id = 1').run();

  const row = sqlite.prepare('select count(*) c from child').get() as { c: number };
  assert.equal(row.c, 0);
  sqlite.close();
});
