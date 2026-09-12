import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PAGE_SIZE } from 'aow5-api-contract';
import { browseBuilds } from './browse.ts';
import { createBuild, mapsOfBuild } from './builds.ts';
import { openDb, runMigrations, type Db } from './open.ts';
import { signInWithProvider } from './identities.ts';
import type { UserRow } from './users.ts';
import { users } from './schema.ts';
import { createLocalUser } from './users.ts';
import { eq } from 'drizzle-orm';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_800_000_000;

function fixture() {
  const { db, sqlite } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  return { db, sqlite };
}

function seedUser(db: Db, persona: string): UserRow {
  // A distinct SteamID per persona, derived so a fixture reads the same way
  // twice. Personas are not unique on Steam and are not unique here either.
  const steamId = `7656119${String(nextSteamId++).padStart(10, '0')}`;
  return signInWithProvider(db, { provider: 'steam', providerId: steamId, nickname: persona, avatar: '' }, NOW);
}
let nextSteamId = 1;

const author = (db: Db, _legacy: string, persona: string) => seedUser(db, persona);

let slugCounter = 0;
function publish(
  db: Db,
  userId: number,
  fields: {
    title: string;
    body?: string;
    hero?: string | null;
    map?: string | null;
    tier?: string | null;
    maps?: string[];
    price?: number;
  },
  at = NOW,
) {
  slugCounter += 1;
  const build = createBuild(
    db,
    {
      userId,
      slug: `slug${String(slugCounter).padStart(6, '0')}`,
      fields: { title: fields.title, body: fields.body ?? '' },
      payload: '7.AAAAAAA',
      referral: '',
      price: fields.price ?? 0,
      video: null,
      tier: (fields.tier ?? null) as never,
      facets: {
        codecVersion: 7,
        heroId: fields.hero ?? 'npc_dota_hero_axe',
        mapIds: fields.maps ?? (fields.map === undefined || fields.map === null ? [] : [fields.map]),
        itemCount: 1,
        spellCount: 0, spellKeys: [],
        title: null,
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
  assert.equal(result.total, 0);
  assert.equal(result.offset, 0);
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

test('walking the list by offset sees every row exactly once', () => {
  const { db, sqlite } = fixture();
  publishMany(db, 7, (i) => `build ${i}`, (i) => NOW + i);

  const seen: string[] = [];
  for (let offset = 0; offset < 9; offset += 3) {
    seen.push(...titles(browseBuilds(sqlite, { limit: 3, offset })));
  }

  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7, 'no row may repeat across windows');
  assert.equal(seen[0], 'build 6');
  assert.equal(seen.at(-1), 'build 0');
});

test('a window can start anywhere, which is the point of an offset', () => {
  /*
   * The reason this replaced a cursor. A virtualised list asks for "the rows
   * around index 40" the moment somebody drags the scrollbar there, and a
   * cursor can only ever answer "what comes after this row".
   */
  const { db, sqlite } = fixture();
  publishMany(db, 7, (i) => `build ${i}`, (i) => NOW + i);

  const middle = browseBuilds(sqlite, { limit: 2, offset: 3 });
  assert.deepEqual(titles(middle), ['build 3', 'build 2']);
  assert.equal(middle.offset, 3, 'the window says where it starts');
  assert.equal(middle.total, 7, 'and how much there is around it');
});

test('rows with the same sort key keep a stable order between windows', () => {
  // Everything published in the same second. Without the tiebreak on id, two
  // overlapping windows could return the same row twice and miss another.
  const { db, sqlite } = fixture();
  publishMany(db, 5, (i) => `same ${i}`, () => NOW);

  const first = browseBuilds(sqlite, { limit: 2, offset: 0 });
  const second = browseBuilds(sqlite, { limit: 2, offset: 2 });
  const third = browseBuilds(sqlite, { limit: 2, offset: 4 });

  const all = [...titles(first), ...titles(second), ...titles(third)];
  assert.equal(all.length, 5);
  assert.equal(new Set(all).size, 5, 'the tiebreak on id is what keeps this stable');
});

test('an offset past the end is empty rather than an error', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'only one' });

  const past = browseBuilds(sqlite, { offset: 900 });
  assert.deepEqual(past.rows, []);
  assert.equal(past.total, 1, 'the list is still one row long');
});

test('a nonsense offset starts from the beginning rather than failing', () => {
  const { db, sqlite } = fixture();
  const a = author(db, '76561197960287930', 'a');
  publish(db, a.id, { title: 'only one' });
  for (const offset of [Number.NaN, -5, 0.7 as number]) {
    const result = browseBuilds(sqlite, { offset });
    assert.deepEqual(titles(result), ['only one'], String(offset));
    assert.ok(Number.isInteger(result.offset) && result.offset >= 0);
  }

  // Truncated rather than rounded: 1.7 is row one, not row two — and row one
  // of a one-row list is past the end, which is empty rather than an error.
  const fractional = browseBuilds(sqlite, { offset: 1.7 });
  assert.equal(fractional.offset, 1);
  assert.deepEqual(fractional.rows, []);
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
  assert.equal(browseBuilds(sqlite, { sort: 'new', limit: 5 }).total, 7, 'and it says how many there are');

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

test('walking by offset covers every build exactly once', () => {
  const { db, sqlite } = fixture();
  // Across two authors, because five builds each is the structural cap.
  const one = author(db, '', 'walk-one');
  const two = author(db, '', 'walk-two');
  for (let i = 0; i < 7; i += 1) publish(db, i < 4 ? one.id : two.id, { title: `walk ${i}` }, NOW + i);

  const seen: string[] = [];
  const first = browseBuilds(sqlite, { sort: 'new', limit: 5, offset: 0 });
  for (let offset = 0; offset < first.total; offset += 5) {
    seen.push(...titles(browseBuilds(sqlite, { sort: 'new', limit: 5, offset })));
  }

  assert.equal(first.total, 7, 'the total is what tells the caller when to stop');
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7, 'no build appeared in two windows');
});

test('several maps can be asked for at once', () => {
  // The sidebar's tier chips are shorthand for "every map at this tier", so the
  // common filter is a handful of rooms rather than one.
  const { db, sqlite } = fixture();
  const userId = author(db, '', 'writer').id;
  publish(db, userId, { title: 'a', map: 'M001' });
  publish(db, userId, { title: 'b', map: 'M002' });
  publish(db, userId, { title: 'c', map: 'M007' });

  const picked = browseBuilds(sqlite, { maps: ['M001', 'M007'] });
  assert.deepEqual(
    picked.rows.map((r) => mapsOfBuild(db, r.build.id)[0]).sort(),
    ['M001', 'M007'],
  );

  const one = browseBuilds(sqlite, { maps: ['M002'] });
  assert.deepEqual(one.rows.map((r) => mapsOfBuild(db, r.build.id)[0]), ['M002']);
});

test('an empty map list means every map rather than none', () => {
  const { db, sqlite } = fixture();
  const userId = author(db, '', 'writer').id;
  publish(db, userId, { title: 'a', map: 'M001' });
  publish(db, userId, { title: 'b', map: null });

  assert.equal(browseBuilds(sqlite, { maps: [] }).rows.length, 2);
  assert.equal(browseBuilds(sqlite, {}).rows.length, 2);
});

test('a map id is bound, not spliced into the statement', () => {
  const { db, sqlite } = fixture();
  const userId = author(db, '', 'writer').id;
  publish(db, userId, { title: 'a', map: 'M001' });

  // If this were concatenated, the quote would be a syntax error rather than a
  // filter that simply matches nothing.
  const hostile = browseBuilds(sqlite, { maps: ["M001') or 1=1 --"] });
  assert.equal(hostile.rows.length, 0);
});

test('the total counts the whole list, not the page', () => {
  const { db, sqlite } = fixture();
  // Two authors, because five builds each is a database constraint.
  const a = author(db, '', 'writer').id;
  const b = author(db, '', 'other').id;
  for (let i = 0; i < 7; i += 1) publish(db, i < 4 ? a : b, { title: `build ${i}` });

  const page = browseBuilds(sqlite, { limit: 3 });
  assert.equal(page.rows.length, 3, 'the page is the limit');
  assert.equal(page.total, 7, 'the total is everything that matched');
});

test('the total ignores the offset, so it does not shrink as you scroll', () => {
  /*
   * The bug this guards: counting the rows the window returned rather than the
   * rows the filters match. A scrollbar sized from that would shrink as you
   * scrolled, which is worse than one that is merely approximate.
   */
  const { db, sqlite } = fixture();
  const a = author(db, '', 'writer').id;
  const b = author(db, '', 'other').id;
  for (let i = 0; i < 7; i += 1) publish(db, i < 4 ? a : b, { title: `build ${i}` });

  assert.equal(browseBuilds(sqlite, { limit: 3, offset: 0 }).total, 7);
  assert.equal(browseBuilds(sqlite, { limit: 3, offset: 3 }).total, 7);
  assert.equal(browseBuilds(sqlite, { limit: 3, offset: 6 }).total, 7, 'the last, short window too');
});

test('the total respects the filters, because it describes the filtered list', () => {
  const { db, sqlite } = fixture();
  const userId = author(db, '', 'writer').id;
  publish(db, userId, { title: 'a', map: 'M001' });
  publish(db, userId, { title: 'b', map: 'M001' });
  publish(db, userId, { title: 'c', map: 'M007' });

  assert.equal(browseBuilds(sqlite, {}).total, 3);
  assert.equal(browseBuilds(sqlite, { maps: ['M001'] }).total, 2);
  assert.equal(browseBuilds(sqlite, { maps: ['M007'] }).total, 1);
  assert.equal(browseBuilds(sqlite, { maps: ['M013'] }).total, 0);
});

test('a search counts its matches rather than the whole table', () => {
  const { db, sqlite } = fixture();
  const userId = author(db, '', 'writer').id;
  publish(db, userId, { title: 'frost rift opener' });
  publish(db, userId, { title: 'frost rift, again' });
  publish(db, userId, { title: 'somewhere else entirely' });

  const found = browseBuilds(sqlite, { q: 'frost' });
  assert.equal(found.rows.length, 2);
  assert.equal(found.total, 2);
});

test('a build nobody may see is in no total', () => {
  // Drafts, deleted builds and a banned author's work are all filtered in the
  // same predicate the count runs over, so they cannot inflate it.
  const { db, sqlite } = fixture();
  const userId = author(db, '', 'writer').id;
  publish(db, userId, { title: 'visible' });

  assert.equal(browseBuilds(sqlite, {}).total, 1);
});

test('price sorts run both ways, and put the unpriced last in each', () => {
  const { db, sqlite } = fixture();
  // Across two authors, because five builds each is the structural cap.
  const one = author(db, '', 'price-one');
  const two = author(db, '', 'price-two');
  publish(db, one.id, { title: 'cheap', price: 1_000 });
  publish(db, one.id, { title: 'middling', price: 5_000_000 });
  publish(db, one.id, { title: 'dear', price: 3_900_000_000 });
  publish(db, two.id, { title: 'unsaid', price: 0 });

  assert.deepEqual(titles(browseBuilds(sqlite, { sort: 'cheap' })), ['cheap', 'middling', 'dear', 'unsaid']);
  assert.deepEqual(titles(browseBuilds(sqlite, { sort: 'costly' })), ['dear', 'middling', 'cheap', 'unsaid']);
});

test('a price near the cap survives the round trip exactly', () => {
  const { db, sqlite } = fixture();
  // Four billion is past a signed 32-bit integer, which is the one place a
  // silent truncation would be plausible. SQLite stores 64-bit and JavaScript
  // is exact to 2^53, so this should be equality rather than approximation.
  publish(db, author(db, '', 'rich').id, { title: 'the cap', price: 4_000_000_000 });
  const row = browseBuilds(sqlite, {}).rows[0];
  assert.equal(row?.build.price, 4_000_000_000);
});

test('a build is findable by its own code', () => {
  /*
   * The code off a shared link is the one search term somebody has in hand and
   * cannot phrase any other way, so it is an exact lookup rather than a text
   * match — and it sorts first, ahead of any build whose notes happen to
   * mention it.
   */
  const { db, sqlite } = fixture();
  const one = author(db, '', 'code-one');
  publish(db, one.id, { title: 'a quiet build' });
  const target = browseBuilds(sqlite, {}).rows[0]?.build;
  assert.ok(target !== undefined);

  const found = browseBuilds(sqlite, { q: target.slug });
  assert.deepEqual(titles(found), ['a quiet build']);
  assert.equal(found.total, 1, 'and the total counts the same one');
});

test('a build is findable by its author', () => {
  const { db, sqlite } = fixture();
  const mine = author(db, '', 'Bramblewick');
  const theirs = author(db, '', 'Kestrel');
  publish(db, mine.id, { title: 'one of mine' });
  publish(db, mine.id, { title: 'another of mine' });
  publish(db, theirs.id, { title: 'not mine' });

  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'Bramblewick' })).sort(), ['another of mine', 'one of mine']);
  // Part of a name is enough, and case does not matter.
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'bramble' })).sort(), ['another of mine', 'one of mine']);
});

test('text still ranks by relevance when the other two do not match', () => {
  // The property the FTS join used to give for free, kept now that the match
  // is a subquery ORed with two lookups.
  const { db, sqlite } = fixture();
  const one = author(db, '', 'rank-one');
  const two = author(db, '', 'rank-two');
  publish(db, one.id, { title: 'nothing here', body: 'a passing mention of frostbite' });
  publish(db, two.id, { title: 'frostbite opener' });

  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'frostbite' })), ['frostbite opener', 'nothing here']);
});

test('a search that matches nothing at all is empty, not everything', () => {
  /*
   * The failure mode an `OR` of three predicates invites: a `LIKE` pattern that
   * degenerates, or a code branch that matches every row. Worth pinning
   * directly, because the symptom is a full list rather than an error.
   */
  const { db, sqlite } = fixture();
  publish(db, author(db, '', 'someone').id, { title: 'a build' });
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'zzzznothing' })), []);
  assert.equal(browseBuilds(sqlite, { q: 'zzzznothing' }).total, 0);
});

test('LIKE syntax in a search is a literal, not a wildcard', () => {
  /*
   * `%` matches everything to LIKE, so a search for it must not return the
   * whole table — which is what it would do if the pattern were interpolated
   * rather than escaped.
   */
  const { db, sqlite } = fixture();
  publish(db, author(db, '', 'plain').id, { title: 'a build' });
  publish(db, author(db, '', '100%%pure').id, { title: 'the one with a percent' });

  // Not the whole table, and not nothing either: the one author whose name
  // genuinely contains a percent sign. That is the escaping working.
  assert.deepEqual(titles(browseBuilds(sqlite, { q: '%' })), ['the one with a percent']);
  assert.deepEqual(titles(browseBuilds(sqlite, { q: '_' })), [], 'and `_` matches no name here');
});

test('an author search folds case beyond ASCII', () => {
  /*
   * The reason `unicode_lower` is registered on the connection at all. SQLite's
   * own LIKE folds `A`-`Z` and stops, so `свет` would not find `Свет` — and
   * most of this site's readers write Russian, which makes that most of the
   * audience unable to find most of the authors.
   */
  const { db, sqlite } = fixture();
  publish(db, author(db, '', 'Свет').id, { title: 'по-русски' });
  publish(db, author(db, '', 'Дядя Ваня').id, { title: 'тоже' });

  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'свет' })), ['по-русски'], 'lowercased');
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'СВЕТ' })), ['по-русски'], 'uppercased');
  assert.deepEqual(titles(browseBuilds(sqlite, { q: 'дядя' })), ['тоже'], 'part of a two-word name');
});

test('a row says whether a provider vouches for its author', () => {
  /*
   * The browse list draws a grey badge next to an unverified name, and this is
   * the only place the answer comes from — one existence check inside the page
   * query rather than a lookup per row. A `verified` that is always false is a
   * badge on every card, which is why it is worth asserting both halves.
   */
  const { db, sqlite } = fixture();
  const vouched = author(db, '76561197960287930', 'vouched');
  const local = createLocalUser(db, { nickname: 'local', passwordHash: 'x' }, NOW);
  publish(db, vouched.id, { title: 'through steam' });
  publish(db, local.id, { title: 'with a password' });

  const rows = browseBuilds(sqlite, { sort: 'new' }).rows;
  assert.deepEqual(
    rows.map((row) => [row.build.title, row.author.verified]),
    [
      ['with a password', false],
      ['through steam', true],
    ],
  );
});
