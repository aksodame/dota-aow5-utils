import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PAGE_SIZE } from 'aow5-api-contract';
import { browseBuilds } from './browse.ts';
import { createBuild } from './builds.ts';
import { openDb, runMigrations, type Db } from './open.ts';
import { createUser, type UserRow } from './users.ts';
import { nicknameKey } from '../auth/nickname.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;

function fixture() {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  return { db, sqlite };
}

function seedUser(db: Db, nickname: string): UserRow {
  const created = createUser(db, { nickname, key: nicknameKey(nickname), passwordHash: 'hash' }, NOW);
  if (created === 'taken') throw new Error(`fixture reused the nickname ${nickname}`);
  return created;
}

const author = (db: Db, _legacy: string, nickname: string) => seedUser(db, nickname);

let slugCounter = 0;
function publish(
  db: Db,
  userId: number,
  fields: { title: string; body?: string; hero?: string | null },
  at = NOW,
) {
  slugCounter += 1;
  const build = createBuild(
    db,
    {
      userId,
      slug: `slug${String(slugCounter).padStart(6, '0')}`,
      fields: { title: fields.title, body: fields.body ?? '' },
      payload: '6.AAAA',
      referral: '',
      facets: {
        codecVersion: 6,
        heroId: fields.hero ?? 'npc_dota_hero_axe',
        sectionCount: 1,
        itemCount: 1,
        spellCount: 0,
      },
      status: 'published',
    },
    at,
  );
  assert.notEqual(build, 'limit-reached');
  return build as Exclude<typeof build, 'limit-reached'>;
}

const titles = (result: { rows: Array<{ build: { title: string } }> }) => result.rows.map((r) => r.build.title);

/**
 * Publishes one build per author.
 *
 * Anything past five builds needs more than one author, because the cap is real
 * — which is worth having a test trip over rather than working around silently.
 */
function publishMany(db: Db, count: number, title: (i: number) => string, at: (i: number) => number) {
  for (let i = 0; i < count; i += 1) {
    const owner = author(db, `765611979602800${String(i).padStart(2, '0')}`, `a${i}`);
    publish(db, owner.id, { title: title(i) }, at(i));
  }
}

test('an empty database browses to nothing rather than throwing', () => {
  const { sqlite } = fixture();
  const result = browseBuilds(sqlite, {});
  assert.deepEqual(result.rows, []);
  assert.equal(result.cursor, null);
});

test('newest first, by publication date', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'oldest' }, NOW);
  publish(db, a.id, { title: 'middle' }, NOW + 10);
  publish(db, a.id, { title: 'newest' }, NOW + 20);

  assert.deepEqual(titles(browseBuilds(sqlite, { sort: 'new' })), ['newest', 'middle', 'oldest']);
});

test('the search index is populated by the trigger, not by hand', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'Axe jungle route', body: 'fast clears' });
  publish(db, a.id, { title: 'Lina mid', body: 'burst damage' });

  // Title and notes, which are the two columns the index covers now that the
  // summary between them is gone.
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'jungle' })), ['Axe jungle route']);
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'burst' })), ['Lina mid']);
});

test('search works in Russian, which is the point of the tokenizer', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'Лес за Акса', body: 'быстрые волны' });
  publish(db, a.id, { title: 'Lina mid' });

  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'лес' })), ['Лес за Акса']);
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'ЛЕС' })), ['Лес за Акса'], 'case must not matter');
});

test('a prefix finds a word still being typed', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'Axe jungle route' });
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'axe jun' })), ['Axe jungle route']);
});

test('a title outranks a body mention', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'Something else', body: 'mentions jungle once' });
  publish(db, a.id, { title: 'Jungle route' });

  assert.equal(titles(browseBuilds(sqlite, { q: 'jungle' }))[0], 'Jungle route');
});

test('an edit updates the index, and a delete removes the build from results', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  const build = publish(db, a.id, { title: 'first title' });

  sqlite.prepare('update builds set title = ? where id = ?').run('renamed entirely', build.id);
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'renamed' })), ['renamed entirely']);
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'first' })), [], 'the old terms must be gone');

  sqlite.prepare('update builds set deleted_at = ? where id = ?').run(NOW, build.id);
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'renamed' })), []);
});

test('drafts and deleted builds never appear', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  const draft = publish(db, a.id, { title: 'work in progress' });
  sqlite.prepare("update builds set status = 'draft' where id = ?").run(draft.id);
  publish(db, a.id, { title: 'live one' });

  assert.deepEqual(titles(browseBuilds(sqlite, {})), ['live one']);
});

test("a banned author's builds disappear everywhere at once", () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  const b = author(db, '76561197960287931', 'b');
  publish(db, a.id, { title: 'from a' });
  publish(db, b.id, { title: 'from b' });

  db.update(users).set({ bannedAt: NOW }).where(eq(users.id, b.id)).run();
  assert.deepEqual(titles(browseBuilds(sqlite, {})), ['from a']);
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'from' })), ['from a']);
});

test('the hero facet filters without disturbing the sort', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'axe one', hero: 'npc_dota_hero_axe' }, NOW + 1);
  publish(db, a.id, { title: 'lina one', hero: 'npc_dota_hero_lina' }, NOW + 2);
  publish(db, a.id, { title: 'axe two', hero: 'npc_dota_hero_axe' }, NOW + 3);

  // Hero is the only facet. A language one existed and was removed: it was
  // inferred from the reader's UI language rather than what anyone wrote in,
  // and split an already-small pool of builds by that guess.
  assert.deepEqual(titles(browseBuilds(sqlite, { hero: 'npc_dota_hero_axe' })), ['axe two', 'axe one']);
  assert.deepEqual(titles(browseBuilds(sqlite, { hero: 'npc_dota_hero_lina' })), ['lina one']);
  assert.deepEqual(titles(browseBuilds(sqlite, {})), ['axe two', 'lina one', 'axe one']);
});

test('paging by cursor sees every row exactly once', () => {
  const { db, sqlite } = fixture();
  publishMany(db, 7, (i) => `build ${i}`, (i) => NOW + i);

  const seen: string[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < 5; page += 1) {
    const result = browseBuilds(sqlite, { limit: 3, ...(cursor != null ? { cursor } : {}) });
    seen.push(...titles(result));
    cursor = result.cursor;
    if (cursor === null) break;
  }

  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7, 'no row may repeat across pages');
  assert.deepEqual(seen[0], 'build 6');
  assert.deepEqual(seen.at(-1), 'build 0');
});

test('a cursor that shares a sort key still advances', () => {
  // Every build published in the same second — the case a naive `< key` cursor
  // loops on forever.
  const { db, sqlite } = fixture();
  publishMany(db, 5, (i) => `same ${i}`, () => NOW);

  const first = browseBuilds(sqlite, { limit: 2 });
  assert.equal(first.rows.length, 2);
  assert.ok(first.cursor);
  const second = browseBuilds(sqlite, { limit: 2, cursor: first.cursor! });
  assert.equal(second.rows.length, 2);
  assert.equal(
    new Set([...titles(first), ...titles(second)]).size,
    4,
    'the tiebreak on id is what stops this repeating',
  );
});

test('a nonsense cursor starts from the beginning rather than failing', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'only one' });
  for (const cursor of ['', 'not-base64!!', Buffer.from('a:b').toString('base64url')]) {
    assert.deepEqual(titles(browseBuilds(sqlite, { cursor })), ['only one']);
  }
});

test('a hostile sort value cannot reach the statement', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'safe' });
  // `sort` is looked up in a fixed table, so anything unrecognised falls back
  // to 'new' rather than being spliced into `order by`.
  const result = browseBuilds(sqlite, { sort: 'g.id; drop table builds' as never });
  assert.deepEqual(titles(result), ['safe']);
});

test('the limit is clamped, so one request cannot ask for the whole table', () => {
  const { db, sqlite } = fixture();
  publishMany(db, 25, (i) => `g${i}`, (i) => NOW + i);
  assert.equal(browseBuilds(sqlite, { limit: 10_000 }).rows.length, 20);
  assert.equal(browseBuilds(sqlite, { limit: -5 }).rows.length, 1);
});

test('the page size is a request, clamped, and never reaches SQL as nonsense', () => {
  const { db, sqlite } = fixture();
  // Across two authors, because five builds each is the structural cap.
  const one = author(db, '', 'pager-one');
  const two = author(db, '', 'pager-two');
  for (let i = 0; i < 7; i += 1) publish(db, i < 4 ? one.id : two.id, { title: `build ${i}` }, NOW + i);

  assert.equal(browseBuilds(sqlite, { sort: 'new', limit: 5 }).rows.length, 5);
  assert.notEqual(browseBuilds(sqlite, { sort: 'new', limit: 5 }).cursor, null, 'more to come');

  // Asking for more than the ceiling gets the ceiling, and asking for none or
  // for a fraction of a row gets one whole row.
  assert.equal(browseBuilds(sqlite, { sort: 'new', limit: PAGE_SIZE + 50 }).rows.length, 7);
  assert.equal(browseBuilds(sqlite, { sort: 'new', limit: 0 }).rows.length, 1);
  assert.equal(browseBuilds(sqlite, { sort: 'new', limit: 2.7 }).rows.length, 2);

  // `?limit=abc` becomes NaN on the way in. Before the guard this reached the
  // statement as a NaN bound rather than falling back to the default.
  assert.equal(browseBuilds(sqlite, { sort: 'new', limit: Number.NaN }).rows.length, 7);
  assert.equal(browseBuilds(sqlite, { sort: 'new', limit: Number.POSITIVE_INFINITY }).rows.length, 7);
});

test('paging by cursor walks every build exactly once', () => {
  const { db, sqlite } = fixture();
  const one = author(db, '', 'walker-one');
  const two = author(db, '', 'walker-two');
  for (let i = 0; i < 7; i += 1) publish(db, i < 4 ? one.id : two.id, { title: `build ${i}` }, NOW + i);

  const seen: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 10; guard += 1) {
    const page: ReturnType<typeof browseBuilds> = browseBuilds(sqlite, {
      sort: 'new',
      limit: 5,
      ...(cursor !== null ? { cursor } : {}),
    });
    seen.push(...titles(page));
    cursor = page.cursor;
    if (cursor === null) break;
  }

  assert.equal(cursor, null, 'the walk ended rather than running out of guard');
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7, 'no build appeared on two pages');
});
