import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import {
  addComment,
  approveComment,
  editComment,
  findComment,
  lastCommentBy,
  listComments,
  softDeleteComment,
  toCommentDto,
  withinEditWindow,
} from './comments.ts';
import { createBuild, findBuildById } from './builds.ts';
import { openDb, runMigrations, type Db } from './open.ts';
import { builds, likes, users } from './schema.ts';
import { signInWithProvider } from './identities.ts';
import { createLocalUser, type UserRow } from './users.ts';
import { hasLiked, setLike } from './likes.ts';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;

function fixture() {
  const { db } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);

  const author = mkUser(db, '76561197960287930', 'author');
  const reader = mkUser(db, '76561197960287931', 'reader');
  const other = mkUser(db, '76561197960287932', 'other');

  const build = createBuild(
    db,
    {
      userId: author.id,
      slug: 'guideslug1',
      fields: { title: 'a build', body: '' },
      payload: '7.AAAAAAA',
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
  return { db, author, reader, other, buildId: (build as Exclude<typeof build, 'limit-reached'>).id };
}

function mkUser(db: Db, steamId: string, persona: string): UserRow {
  return signInWithProvider(db, { provider: 'steam', providerId: steamId, nickname: persona, avatar: '' }, NOW);
}

const counts = (db: Db, id: number) => {
  const row = findBuildById(db, id);
  return { likes: row?.likeCount, comments: row?.commentCount };
};

test('a like is recorded and counted', () => {
  const { db, reader, buildId } = fixture();
  const count = setLike(db, buildId, reader.id, true, NOW);

  assert.equal(count, 1, 'setLike returns the count it just recomputed');
  assert.equal(hasLiked(db, buildId, reader.id), true);
  assert.deepEqual(counts(db, buildId), { likes: 1, comments: 0 });
});

test('liking again is the same as liking once', () => {
  // The reason the endpoint takes the state rather than a toggle: a
  // double-tapped button must settle on one answer.
  const { db, reader, buildId } = fixture();
  setLike(db, buildId, reader.id, true, NOW);
  setLike(db, buildId, reader.id, true, NOW + 1);
  setLike(db, buildId, reader.id, true, NOW + 2);

  assert.deepEqual(counts(db, buildId), { likes: 1, comments: 0 });
});

test('a repeated like does not rewrite when it happened', () => {
  const { db, reader, buildId } = fixture();
  setLike(db, buildId, reader.id, true, NOW);
  setLike(db, buildId, reader.id, true, NOW + 500);

  const row = db.select().from(likes).where(eq(likes.buildId, buildId)).get();
  assert.equal(row?.createdAt, NOW, 'the second like is not an event');
});

test('unliking deletes the row rather than storing a zero', () => {
  const { db, reader, buildId } = fixture();
  setLike(db, buildId, reader.id, true, NOW);
  const count = setLike(db, buildId, reader.id, false, NOW + 1);

  assert.equal(count, 0);
  assert.equal(hasLiked(db, buildId, reader.id), false);
  assert.equal(db.select().from(likes).all().length, 0);
  assert.deepEqual(counts(db, buildId), { likes: 0, comments: 0 });

  // And the build itself is untouched.
  assert.equal(db.select().from(builds).all().length, 1);
});

test('unliking something never liked is not an error', () => {
  const { db, reader, buildId } = fixture();
  assert.equal(setLike(db, buildId, reader.id, false, NOW), 0);
});

test('likes from different people accumulate', () => {
  const { db, reader, other, buildId } = fixture();
  setLike(db, buildId, reader.id, true, NOW);
  setLike(db, buildId, other.id, true, NOW);

  assert.deepEqual(counts(db, buildId), { likes: 2, comments: 0 });
  assert.equal(hasLiked(db, buildId, reader.id), true);
  assert.equal(hasLiked(db, buildId, other.id), true);
});

test('the counter survives being recomputed from an inconsistent starting point', () => {
  // The reason the counter is recounted rather than incremented: if it ever
  // does drift, the next write repairs it instead of compounding it.
  const { db, reader, buildId } = fixture();
  db.update(builds).set({ likeCount: 99 }).where(eq(builds.id, buildId)).run();

  setLike(db, buildId, reader.id, true, NOW);
  assert.deepEqual(counts(db, buildId), { likes: 1, comments: 0 });
});

test('a comment is stored and counted', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'nice build', NOW, true);

  assert.equal(comment.body, 'nice build');
  assert.deepEqual(counts(db, buildId), { likes: 0, comments: 1 });
});

test('deleting a comment keeps the row, drops the body, and lowers the count', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'oops', NOW, true);
  softDeleteComment(db, comment, NOW + 1);

  assert.deepEqual(counts(db, buildId), { likes: 0, comments: 0 });

  const stored = findComment(db, comment.id);
  assert.ok(stored, 'the row stays so the thread keeps its shape');
  const dto = toCommentDto(stored, reader, reader);
  assert.equal(dto.body, null);
  assert.equal(dto.deleted, true);
  assert.equal(dto.canDelete, false, 'an already-deleted comment cannot be deleted again');
});

test('a thread reads oldest first and pages without repeating', () => {
  const { db, reader, buildId } = fixture();
  for (let i = 0; i < 5; i += 1) addComment(db, buildId, reader.id, `comment ${i}`, NOW + i, true);

  const first = listComments(db, buildId, null, 2);
  assert.deepEqual(
    first.rows.map((r) => r.comment.body),
    ['comment 0', 'comment 1'],
  );
  assert.ok(first.cursor);

  const second = listComments(db, buildId, Number(first.cursor), 2);
  assert.deepEqual(
    second.rows.map((r) => r.comment.body),
    ['comment 2', 'comment 3'],
  );

  const third = listComments(db, buildId, Number(second.cursor), 2);
  assert.deepEqual(
    third.rows.map((r) => r.comment.body),
    ['comment 4'],
  );
  assert.equal(third.cursor, null);
});

test("a banned person's comments leave the thread", () => {
  const { db, reader, other, buildId } = fixture();
  addComment(db, buildId, reader.id, 'from reader', NOW, true);
  addComment(db, buildId, other.id, 'from other', NOW + 1, true);

  db.update(users).set({ bannedAt: NOW }).where(eq(users.id, other.id)).run();

  assert.deepEqual(
    listComments(db, buildId, null, 10).rows.map((r) => r.comment.body),
    ['from reader'],
  );
});

test('only the author or an admin may delete a comment', () => {
  const { db, author, reader, other, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'mine', NOW, true);
  const stored = findComment(db, comment.id)!;

  assert.equal(toCommentDto(stored, reader, reader).canDelete, true);
  assert.equal(toCommentDto(stored, reader, other).canDelete, false);
  assert.equal(toCommentDto(stored, reader, undefined).canDelete, false);
  // The build's author has no special power over somebody else's comment.
  assert.equal(toCommentDto(stored, reader, author).canDelete, false);
  assert.equal(toCommentDto(stored, reader, { ...other, role: 'admin' }).canDelete, true);
});

test('the last comment by somebody is findable, which is what the spam rules use', () => {
  const { db, reader, other, buildId } = fixture();
  addComment(db, buildId, reader.id, 'first', NOW, true);
  addComment(db, buildId, other.id, 'theirs', NOW + 1, true);
  addComment(db, buildId, reader.id, 'second', NOW + 2, true);

  assert.equal(lastCommentBy(db, buildId, reader.id)?.body, 'second');
  assert.equal(lastCommentBy(db, buildId, other.id)?.body, 'theirs');
});

test('deleting a build takes its likes and comments with it', () => {
  const { db, reader, buildId } = fixture();
  setLike(db, buildId, reader.id, true, NOW);
  addComment(db, buildId, reader.id, 'bye', NOW, true);

  db.delete(builds).where(eq(builds.id, buildId)).run();

  assert.equal(listComments(db, buildId, null, 10).rows.length, 0);
  assert.equal(hasLiked(db, buildId, reader.id), false);
});

test('a comment can be corrected inside its window and not after it', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'teh build is good', NOW, true);

  assert.equal(withinEditWindow(comment, NOW + 60, 900), true);
  assert.equal(withinEditWindow(comment, NOW + 901, 900), false, 'people have replied by now');

  const edited = editComment(db, comment, 'the build is good', NOW + 60);
  assert.equal(edited.body, 'the build is good');
  assert.equal(edited.editedAt, NOW + 60, 'a reader can see that it was changed');
  assert.equal(findComment(db, comment.id)?.body, 'the build is good');
});

test('editing does not disturb the comment count', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'first', NOW, true);
  editComment(db, comment, 'second', NOW + 1);
  assert.deepEqual(counts(db, buildId), { likes: 0, comments: 1 });
});

test('a comment awaiting moderation is invisible to the thread and visible to its author', () => {
  /*
   * The whole moderation contract in one test. Hiding a held comment from its
   * author too is what makes somebody post the same thing four times, and
   * showing it to everybody makes the queue pointless.
   */
  const { db, author, reader, other, buildId } = fixture();
  const held = addComment(db, buildId, reader.id, 'waiting', NOW, false);
  addComment(db, buildId, other.id, 'up', NOW + 1, true);

  const bodies = (viewer?: { id: number; role: string }) =>
    listComments(db, buildId, null, 10, viewer).rows.map((row) => row.comment.body);

  assert.deepEqual(bodies(), ['up'], 'a stranger sees the thread as it stands');
  assert.deepEqual(bodies({ id: other.id, role: 'user' }), ['up'], 'and so does another commenter');
  assert.deepEqual(bodies({ id: reader.id, role: 'user' }), ['waiting', 'up'], 'its author sees their own');
  assert.deepEqual(bodies({ id: author.id, role: 'admin' }), ['waiting', 'up'], 'approving what you cannot read is not moderation');

  assert.deepEqual(counts(db, buildId), { likes: 0, comments: 1 }, 'the count promises only what a reader will find');
  assert.equal(toCommentDto(held, reader, reader).pending, true);
});

test('approving a held comment puts it in the thread and in the count', () => {
  const { db, reader, buildId } = fixture();
  const held = addComment(db, buildId, reader.id, 'waiting', NOW, false);
  assert.deepEqual(counts(db, buildId), { likes: 0, comments: 0 });

  approveComment(db, held, NOW + 5);

  assert.deepEqual(
    listComments(db, buildId, null, 10).rows.map((row) => row.comment.body),
    ['waiting'],
  );
  assert.deepEqual(counts(db, buildId), { likes: 0, comments: 1 });
  assert.equal(toCommentDto(findComment(db, held.id)!, reader, reader).pending, false);
});

test('a thread says which of its commenters a provider vouches for', () => {
  const { db, reader, buildId } = fixture();
  // Everybody in the fixture arrived through Steam; this one did not.
  const local = createLocalUser(db, { nickname: 'stranger', passwordHash: 'x' }, NOW);
  addComment(db, buildId, reader.id, 'vouched', NOW, true);
  addComment(db, buildId, local.id, 'not vouched', NOW + 1, true);

  const rows = listComments(db, buildId, null, 10).rows;
  assert.deepEqual(
    rows.map((row) => [row.author.nickname, row.authorVerified]),
    [['reader', true], ['stranger', false]],
  );
  assert.equal(toCommentDto(rows[1]!.comment, rows[1]!.author, undefined, rows[1]!.authorVerified).author.verified, false);
  assert.equal(toCommentDto(rows[0]!.comment, rows[0]!.author, undefined, rows[0]!.authorVerified).author.verified, true);
});
