import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { addComment } from './comments.ts';
import { createBuild, findBuildById, softDeleteBuild } from './builds.ts';
import { openDb, runMigrations, type Db } from './open.ts';
import { PURGE_AFTER_SECONDS, purge } from './purge.ts';
import { builds } from './schema.ts';
import { createSession } from './sessions.ts';
import { signInWithProvider } from './identities.ts';
import type { UserRow } from './users.ts';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;

function seedUser(db: Db, persona: string): UserRow {
  // A distinct SteamID per persona, derived so a fixture reads the same way
  // twice. Personas are not unique on Steam and are not unique here either.
  const steamId = `7656119${String(nextSteamId++).padStart(10, '0')}`;
  return signInWithProvider(db, { provider: 'steam', providerId: steamId, nickname: persona, avatar: '' }, NOW);
}
let nextSteamId = 1;

function fixture() {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  const user = seedUser(db, 'author');
  return { db, sqlite, userId: user.id };
}

let n = 0;
function make(db: Db, userId: number) {
  n += 1;
  const build = createBuild(
    db,
    {
      userId,
      slug: `purge${String(n).padStart(5, '0')}`,
      fields: { title: `build ${n}`, body: '' },
      payload: '6.AAAA',
      referral: '',
      price: 0,
      video: null,
      tier: null,
      facets: { codecVersion: 7, heroId: null, mapIds: [], itemCount: 1, spellCount: 0, spellKeys: [], title: null },
      status: 'published',
    },
    NOW,
  );
  assert.notEqual(build, 'limit-reached');
  return build as Exclude<typeof build, 'limit-reached'>;
}

test('a build deleted long ago is really removed; a recent one is not', () => {
  const { db, userId } = fixture();
  const old = make(db, userId);
  const recent = make(db, userId);

  softDeleteBuild(db, old.id, NOW - PURGE_AFTER_SECONDS - 1);
  softDeleteBuild(db, recent.id, NOW - 60);

  const result = purge(db, NOW);
  assert.equal(result.builds, 1);
  assert.equal(findBuildById(db, old.id), undefined);
  assert.ok(findBuildById(db, recent.id), 'a recent deletion still has to be explainable');
});

test('a live build is never touched', () => {
  const { db, userId } = fixture();
  const alive = make(db, userId);
  assert.equal(purge(db, NOW).builds, 0);
  assert.ok(findBuildById(db, alive.id));
});

test('purging a build takes its comments and its search terms with it', () => {
  const { db, sqlite, userId } = fixture();
  const build = make(db, userId);
  addComment(db, build.id, userId, 'something searchable', NOW, true);
  softDeleteBuild(db, build.id, NOW - PURGE_AFTER_SECONDS - 1);

  purge(db, NOW);

  const comments = sqlite.prepare('select count(*) c from comments').get() as { c: number };
  assert.equal(comments.c, 0, 'the foreign key cascade is what does this');

  const fts = sqlite
    .prepare("select count(*) c from builds_fts where builds_fts match ?")
    .get('"searchable"') as { c: number };
  assert.equal(fts.c, 0, 'the delete trigger must have dropped the terms too');
});

test('a comment deleted long ago goes, and the stored count is repaired', () => {
  const { db, sqlite, userId } = fixture();
  const build = make(db, userId);
  const stale = addComment(db, build.id, userId, 'old', NOW, true);
  addComment(db, build.id, userId, 'kept', NOW, true);

  sqlite.prepare('update comments set deleted_at = ? where id = ?').run(NOW - PURGE_AFTER_SECONDS - 1, stale.id);
  // Deliberately wrong, to prove the purge recomputes rather than adjusts.
  db.update(builds).set({ commentCount: 42 }).where(eq(builds.id, build.id)).run();

  const result = purge(db, NOW);
  assert.equal(result.comments, 1);
  assert.equal(findBuildById(db, build.id)?.commentCount, 1);
});

test('expired sessions are swept in the same pass', () => {
  const { db, userId } = fixture();
  createSession(db, userId, NOW - 400 * 24 * 60 * 60);
  createSession(db, userId, NOW);

  assert.equal(purge(db, NOW).sessions, 1);
});
