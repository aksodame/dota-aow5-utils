import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import {
  addComment,
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
import { builds, users } from './schema.ts';
import { createUser, type UserRow } from './users.ts';
import { nicknameKey } from '../auth/nickname.ts';
import { findVote, setVote } from './votes.ts';

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
      payload: '6.AAAA',
      referral: '',
      facets: { codecVersion: 6, heroId: null, sectionCount: 1, itemCount: 1, spellCount: 0 },
      status: 'published',
    },
    NOW,
  );
  assert.notEqual(build, 'limit-reached');
  return { db, author, reader, other, buildId: (build as Exclude<typeof build, 'limit-reached'>).id };
}

function mkUser(db: Db, _legacy: string, nickname: string): UserRow {
  const created = createUser(db, { nickname, key: nicknameKey(nickname), passwordHash: 'hash' }, NOW);
  if (created === 'taken') throw new Error(`fixture reused the nickname ${nickname}`);
  return created;
}

const counts = (db: Db, id: number) => {
  const row = findBuildById(db, id);
  return { up: row?.likeCount, down: row?.dislikeCount, comments: row?.commentCount };
};

test('a vote is recorded and counted', () => {
  const { db, reader, buildId } = fixture();
  setVote(db, buildId, reader.id, 1, NOW);

  assert.equal(findVote(db, buildId, reader.id), 1);
  assert.deepEqual(counts(db, buildId), { up: 1, down: 0, comments: 0 });
});

test('voting again replaces rather than adds', () => {
  const { db, reader, buildId } = fixture();
  setVote(db, buildId, reader.id, 1, NOW);
  setVote(db, buildId, reader.id, 1, NOW + 1);
  setVote(db, buildId, reader.id, 1, NOW + 2);

  assert.deepEqual(counts(db, buildId), { up: 1, down: 0, comments: 0 });
});

test('changing a vote moves it between the two counters', () => {
  const { db, reader, buildId } = fixture();
  setVote(db, buildId, reader.id, 1, NOW);
  setVote(db, buildId, reader.id, -1, NOW + 1);

  assert.equal(findVote(db, buildId, reader.id), -1);
  assert.deepEqual(counts(db, buildId), { up: 0, down: 1, comments: 0 });
});

test('withdrawing a vote deletes the row rather than storing a zero', () => {
  const { db, reader, buildId } = fixture();
  setVote(db, buildId, reader.id, 1, NOW);
  setVote(db, buildId, reader.id, 0, NOW + 1);

  assert.equal(findVote(db, buildId, reader.id), 0);
  assert.deepEqual(counts(db, buildId), { up: 0, down: 0, comments: 0 });

  const rows = db.select().from(builds).all();
  assert.equal(rows.length, 1);
});

test('votes from different people accumulate', () => {
  const { db, reader, other, buildId } = fixture();
  setVote(db, buildId, reader.id, 1, NOW);
  setVote(db, buildId, other.id, -1, NOW);

  assert.deepEqual(counts(db, buildId), { up: 1, down: 1, comments: 0 });
});

test('counters survive being recomputed from an inconsistent starting point', () => {
  // The reason the counters are recounted rather than incremented: if one ever
  // does drift, the next write repairs it instead of compounding it.
  const { db, reader, buildId } = fixture();
  db.update(builds).set({ likeCount: 99, dislikeCount: 99 }).where(eq(builds.id, buildId)).run();

  setVote(db, buildId, reader.id, 1, NOW);
  assert.deepEqual(counts(db, buildId), { up: 1, down: 0, comments: 0 });
});

test('a comment is stored and counted', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'nice build', NOW);

  assert.equal(comment.body, 'nice build');
  assert.deepEqual(counts(db, buildId), { up: 0, down: 0, comments: 1 });
});

test('deleting a comment keeps the row, drops the body, and lowers the count', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'oops', NOW);
  softDeleteComment(db, comment, NOW + 1);

  assert.deepEqual(counts(db, buildId), { up: 0, down: 0, comments: 0 });

  const stored = findComment(db, comment.id);
  assert.ok(stored, 'the row stays so the thread keeps its shape');
  const dto = toCommentDto(stored, reader, reader);
  assert.equal(dto.body, null);
  assert.equal(dto.deleted, true);
  assert.equal(dto.canDelete, false, 'an already-deleted comment cannot be deleted again');
});

test('a thread reads oldest first and pages without repeating', () => {
  const { db, reader, buildId } = fixture();
  for (let i = 0; i < 5; i += 1) addComment(db, buildId, reader.id, `comment ${i}`, NOW + i);

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
  addComment(db, buildId, reader.id, 'from reader', NOW);
  addComment(db, buildId, other.id, 'from other', NOW + 1);

  db.update(users).set({ bannedAt: NOW }).where(eq(users.id, other.id)).run();

  assert.deepEqual(
    listComments(db, buildId, null, 10).rows.map((r) => r.comment.body),
    ['from reader'],
  );
});

test('only the author or an admin may delete a comment', () => {
  const { db, author, reader, other, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'mine', NOW);
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
  addComment(db, buildId, reader.id, 'first', NOW);
  addComment(db, buildId, other.id, 'theirs', NOW + 1);
  addComment(db, buildId, reader.id, 'second', NOW + 2);

  assert.equal(lastCommentBy(db, buildId, reader.id)?.body, 'second');
  assert.equal(lastCommentBy(db, buildId, other.id)?.body, 'theirs');
});

test('deleting a build takes its votes and comments with it', () => {
  const { db, reader, buildId } = fixture();
  setVote(db, buildId, reader.id, 1, NOW);
  addComment(db, buildId, reader.id, 'bye', NOW);

  db.delete(builds).where(eq(builds.id, buildId)).run();

  assert.equal(listComments(db, buildId, null, 10).rows.length, 0);
  assert.equal(findVote(db, buildId, reader.id), 0);
});

test('a comment can be corrected inside its window and not after it', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'teh build is good', NOW);

  assert.equal(withinEditWindow(comment, NOW + 60, 900), true);
  assert.equal(withinEditWindow(comment, NOW + 901, 900), false, 'people have replied by now');

  const edited = editComment(db, comment, 'the build is good', NOW + 60);
  assert.equal(edited.body, 'the build is good');
  assert.equal(edited.editedAt, NOW + 60, 'a reader can see that it was changed');
  assert.equal(findComment(db, comment.id)?.body, 'the build is good');
});

test('editing does not disturb the comment count', () => {
  const { db, reader, buildId } = fixture();
  const comment = addComment(db, buildId, reader.id, 'first', NOW);
  editComment(db, comment, 'second', NOW + 1);
  assert.deepEqual(counts(db, buildId), { up: 0, down: 0, comments: 1 });
});
