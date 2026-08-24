import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_BUILDS_PER_USER } from 'aow5-api-contract';
import { createBuild, countBuildsFor, findBuildBySlug, listBuildsForUser, softDeleteBuild, updateBuild } from './builds.ts';
import { openDb, runMigrations, type Db } from './open.ts';
import { createUser, type UserRow } from './users.ts';
import { nicknameKey } from '../auth/nickname.ts';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;

function seedUser(db: Db, nickname: string): UserRow {
  const created = createUser(db, { nickname, key: nicknameKey(nickname), passwordHash: 'hash' }, NOW);
  if (created === 'taken') throw new Error(`fixture reused the nickname ${nickname}`);
  return created;
}

function fixture(): { db: Db; userId: number } {
  const { db } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  const user = seedUser(db, 'author');
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
      referral: '',
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
      referral: '',
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
  const other = seedUser(db, 'other');
  for (let i = 0; i < MAX_BUILDS_PER_USER; i += 1) make(db, userId, `a${i}`);
  assert.equal(make(db, userId, 'a-extra'), 'limit-reached');
  assert.notEqual(make(db, other.id, 'b0'), 'limit-reached');
});

test('a referral code survives a round trip, and only a sent one changes it', () => {
  const { db, userId } = fixture();
  const build = createBuild(
    db,
    {
      userId,
      slug: 'referred',
      fields: { title: 't', body: '' },
      payload: '6.AAAA',
      referral: '00EJT3T3',
      facets: { codecVersion: 6, heroId: null, sectionCount: 1, itemCount: 0, spellCount: 0 },
      status: 'published',
    },
    NOW,
  );
  if (build === 'limit-reached') return;
  assert.equal(build.referral, '00EJT3T3');

  // A patch that says nothing about the code leaves it alone — which is what
  // keeps a client that predates the field from blanking one somebody set.
  const retitled = updateBuild(db, build, { fields: { title: 'other', body: '' } }, NOW + 1);
  assert.equal(retitled.referral, '00EJT3T3');

  const changed = updateBuild(db, retitled, { referral: 'ABCD1234' }, NOW + 2);
  assert.equal(changed.referral, 'ABCD1234');

  // An empty string is an erase, and is the one way to get back to no code.
  const erased = updateBuild(db, changed, { referral: '' }, NOW + 3);
  assert.equal(erased.referral, '');
});

test('a build stored before referral codes existed reads as having none', () => {
  const { db, userId } = fixture();
  const build = make(db, userId, 'legacy');
  if (build === 'limit-reached') return;
  // The column is NOT NULL with a default, so the migration over an existing
  // database leaves every old row saying "no code" rather than null.
  assert.equal(findBuildBySlug(db, 'legacy')?.referral, '');
});
