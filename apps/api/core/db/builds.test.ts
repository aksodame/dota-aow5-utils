import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_BUILDS_PER_USER } from 'aow5-api-contract';
import { createBuild, countBuildsFor, findBuildBySlug, listBuildsForUser, softDeleteBuild, updateBuild } from './builds.ts';
import { openDb, runMigrations, type Db } from './open.ts';
import { upsertUserFromSteam } from './users.ts';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;

function fixture(): { db: Db; userId: number } {
  const { db } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  const user = upsertUserFromSteam(
    db,
    '76561197960287930',
    { steamId: '76561197960287930', persona: 'a', avatarUrl: '', profileUrl: 'p', createdAt: null },
    NOW,
  );
  return { db, userId: user.id };
}

function make(db: Db, userId: number, slug: string, status: 'draft' | 'published' = 'published') {
  return createBuild(
    db,
    {
      userId,
      slug,
      fields: { title: `title ${slug}`, body: '' },
      payload: '6.AAAA',
      facets: { codecVersion: 6, heroId: 'npc_dota_hero_axe', sectionCount: 1, itemCount: 2, spellCount: 0 },
      status,
    },
    NOW,
  );
}

test('builds fill the lowest free slot in order', () => {
  const { db, userId } = fixture();
  for (let i = 0; i < MAX_BUILDS_PER_USER; i += 1) {
    const build = make(db, userId, `slug${i}`);
    assert.notEqual(build, 'limit-reached');
    if (build === 'limit-reached') return;
    assert.equal(build.slot, i);
  }
});

test('the sixth build is refused with a reason, not an exception', () => {
  const { db, userId } = fixture();
  for (let i = 0; i < MAX_BUILDS_PER_USER; i += 1) make(db, userId, `slug${i}`);
  assert.equal(make(db, userId, 'one-too-many'), 'limit-reached');
  assert.equal(countBuildsFor(db, userId), MAX_BUILDS_PER_USER);
});

test('deleting a build frees exactly that slot, and the next one reuses it', () => {
  const { db, userId } = fixture();
  for (let i = 0; i < MAX_BUILDS_PER_USER; i += 1) make(db, userId, `slug${i}`);

  const second = findBuildBySlug(db, 'slug1');
  assert.ok(second);
  softDeleteBuild(db, second.id, NOW + 1);

  const replacement = make(db, userId, 'replacement');
  assert.notEqual(replacement, 'limit-reached');
  if (replacement === 'limit-reached') return;
  assert.equal(replacement.slot, 1, 'the freed slot is reused rather than a new one invented');
});

test('a deleted build is gone from the author list but still findable by slug', () => {
  const { db, userId } = fixture();
  const build = make(db, userId, 'doomed');
  if (build === 'limit-reached') return;
  softDeleteBuild(db, build.id, NOW + 1);

  assert.equal(listBuildsForUser(db, userId).length, 0);
  // Still resolvable, so a link somebody shared can answer "this was deleted"
  // instead of being indistinguishable from a typo.
  assert.ok(findBuildBySlug(db, 'doomed'));
});

test('drafts count against the cap', () => {
  const { db, userId } = fixture();
  for (let i = 0; i < MAX_BUILDS_PER_USER; i += 1) make(db, userId, `d${i}`, 'draft');
  assert.equal(make(db, userId, 'extra'), 'limit-reached');
});

test('the board is stored exactly as given, and re-stored exactly as given', () => {
  const { db, userId } = fixture();
  const original = '6.qwerty-_ABC.xyz';
  const build = createBuild(
    db,
    {
      userId,
      slug: 'verbatim',
      fields: { title: 't', body: '' },
      payload: original,
      facets: { codecVersion: 6, heroId: null, sectionCount: 2, itemCount: 3, spellCount: 1 },
      status: 'published',
    },
    NOW,
  );
  if (build === 'limit-reached') return;
  assert.equal(build.payload, original);

  const replacement = '5.zzzz';
  const updated = updateBuild(
    db,
    build,
    { payload: replacement, facets: { codecVersion: 5, heroId: null, sectionCount: 1, itemCount: 0, spellCount: 0 } },
    NOW + 5,
  );
  assert.equal(updated.payload, replacement);
  assert.equal(updated.codecVersion, 5);
});

test('publishedAt is set once and does not move on a later edit', () => {
  const { db, userId } = fixture();
  const build = make(db, userId, 'dated', 'draft');
  if (build === 'limit-reached') return;
  assert.equal(build.publishedAt, null);

  const published = updateBuild(db, build, { status: 'published' }, NOW + 10);
  assert.equal(published.publishedAt, NOW + 10);

  // Pulled back and re-published: it keeps its original date rather than
  // jumping to the top of "newest" every time somebody fixes a typo.
  const draft = updateBuild(db, published, { status: 'draft' }, NOW + 20);
  const again = updateBuild(db, draft, { status: 'published' }, NOW + 30);
  assert.equal(again.publishedAt, NOW + 10);
});

test("one author's cap does not affect another's", () => {
  const { db, userId } = fixture();
  const other = upsertUserFromSteam(
    db,
    '76561197960287931',
    { steamId: '76561197960287931', persona: 'b', avatarUrl: '', profileUrl: 'p', createdAt: null },
    NOW,
  );
  for (let i = 0; i < MAX_BUILDS_PER_USER; i += 1) make(db, userId, `a${i}`);
  assert.equal(make(db, userId, 'a-extra'), 'limit-reached');
  assert.notEqual(make(db, other.id, 'b0'), 'limit-reached');
});
