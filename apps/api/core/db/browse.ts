/**
 * Listing builds: search, facets, sort, and the cursor that pages them.
 *
 * Written against the driver rather than the query builder. This query joins a
 * virtual table, ranks with `bm25`, and takes a compound keyset predicate —
 * three things Drizzle expresses worse than SQL does, on the one query in this
 * codebase where what actually runs matters. Every value is still bound, never
 * interpolated; the only things spliced into the string are chosen from the
 * fixed tables below.
 */
import { PAGE_SIZE, type BuildSort } from 'aow5-api-contract';
import { buildFtsQuery } from '../search/ftsQuery.ts';
import type { BuildRow } from './builds.ts';
import type { Sqlite } from './open.ts';
import type { UserSummary } from './users.ts';

export interface BrowseFilters {
  q?: string;
  hero?: string;
  sort?: BuildSort;
  cursor?: string;
  limit?: number;
}

export interface BrowseResult {
  rows: Array<{ build: BuildRow; author: UserSummary }>;
  cursor: string | null;
}

/**
 * A cursor is the last row's sort key and id.
 *
 * Keyset rather than OFFSET, because OFFSET renumbers: a build published while
 * somebody is reading page three shifts every later row down one, and the row
 * that moved from page three to page four is never seen. Base64url only so it
 * does not look like something worth editing by hand.
 */
function encodeCursor(sortKey: number, id: number): string {
  return Buffer.from(`${sortKey}:${id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): { sortKey: number; id: number } | null {
  if (raw === undefined || raw === '') return null;
  try {
    const [sortKey, id] = Buffer.from(raw, 'base64url').toString('utf8').split(':');
    const parsed = { sortKey: Number(sortKey), id: Number(id) };
    if (!Number.isFinite(parsed.sortKey) || !Number.isInteger(parsed.id)) return null;
    return parsed;
  } catch {
    // A cursor somebody edited is not an error worth reporting — it just means
    // starting from the beginning.
    return null;
  }
}

/**
 * The expression each sort orders by.
 *
 * A fixed table, and the only source of the text spliced into `order by` — so
 * `sort` arriving from a query string can never reach the statement.
 */
const SORT_KEY: Record<BuildSort, string> = {
  new: 'g.published_at',
  top: '(g.like_count - g.dislike_count)',
  discussed: 'g.comment_count',
};

/** Reads back the value the next cursor has to resume from. */
function sortValueOf(row: Record<string, unknown>, sort: BuildSort): number {
  if (sort === 'top') return Number(row['like_count']) - Number(row['dislike_count']);
  if (sort === 'discussed') return Number(row['comment_count']);
  return Number(row['published_at'] ?? 0);
}

const GUIDE_COLUMNS = `
  g.id, g.slug, g.user_id, g.slot, g.title, g.body, g.payload, g.referral,
  g.codec_version, g.hero_id, g.section_count, g.item_count, g.status,
  g.like_count, g.dislike_count, g.comment_count, g.view_count,
  g.published_at, g.created_at, g.updated_at, g.deleted_at,
  a.id as a_id, a.nickname as a_nickname`;

function toGuide(row: Record<string, unknown>): BuildRow {
  return {
    id: Number(row['id']),
    slug: String(row['slug']),
    userId: Number(row['user_id']),
    slot: Number(row['slot']),
    title: String(row['title']),
    body: String(row['body']),
    payload: String(row['payload']),
    referral: String(row['referral']),
    codecVersion: Number(row['codec_version']),
    heroId: (row['hero_id'] as string | null) ?? null,
    sectionCount: Number(row['section_count']),
    itemCount: Number(row['item_count']),
    status: row['status'] as BuildRow['status'],
    likeCount: Number(row['like_count']),
    dislikeCount: Number(row['dislike_count']),
    commentCount: Number(row['comment_count']),
    viewCount: Number(row['view_count']),
    publishedAt: row['published_at'] === null ? null : Number(row['published_at']),
    createdAt: Number(row['created_at']),
    updatedAt: Number(row['updated_at']),
    deletedAt: row['deleted_at'] === null ? null : Number(row['deleted_at']),
  };
}

/**
 * The author, as two columns.
 *
 * A card shows a name, so that is all this selects. Widening it back to the
 * whole row would drag `password_hash` through the busiest read path on the
 * site for nothing.
 */
function toAuthor(row: Record<string, unknown>): UserSummary {
  return { id: Number(row['a_id']), nickname: String(row['a_nickname']) };
}

export function browseBuilds(sqlite: Sqlite, filters: BrowseFilters): BrowseResult {
  const sort: BuildSort = filters.sort !== undefined && filters.sort in SORT_KEY ? filters.sort : 'new';
  // `Number.isFinite` before the clamp, not after: `Math.max(NaN, 1)` is NaN,
  // so a hand-typed `?limit=abc` would otherwise arrive at the statement as a
  // NaN bound. Truncated too — a fractional limit is not a row count.
  const asked = filters.limit;
  const limit =
    asked !== undefined && Number.isFinite(asked)
      ? Math.min(Math.max(Math.trunc(asked), 1), PAGE_SIZE)
      : PAGE_SIZE;
  const key = SORT_KEY[sort];

  const fts = filters.q !== undefined && filters.q.trim() !== '' ? buildFtsQuery(filters.q) : null;
  const match = fts?.match ?? null;
  const cursor = decodeCursor(filters.cursor);

  const params: unknown[] = [];
  // A banned author's builds disappear everywhere, which is what makes banning
  // one action rather than a sweep.
  const where = ["g.status = 'published'", 'g.deleted_at is null', 'a.banned_at is null'];

  let from = 'builds g join users a on a.id = g.user_id';
  let order = `${key} desc, g.id desc`;

  if (match !== null) {
    // Every row is indexed and visibility is filtered in the join, rather than
    // indexing only published builds: the alternative needs conditional
    // triggers, and those go stale the first time somebody unpublishes.
    from = 'builds_fts join builds g on g.id = builds_fts.rowid join users a on a.id = g.user_id';
    // Not aliased, deliberately. SQLite resolves the left operand of MATCH and
    // the argument to bm25 against the FTS table's real name; give it an alias
    // and both fail with "no such column".
    where.push('builds_fts match ?');
    params.push(match);
    // Title weighted eight times the notes. bm25 returns a negative score
    // where more relevant is more negative, so ascending is best-first.
    order = 'bm25(builds_fts, 8.0, 1.0) asc, g.like_count desc, g.id desc';
  }

  if (filters.hero !== undefined && filters.hero !== '') {
    where.push('g.hero_id = ?');
    params.push(filters.hero);
  }
  // A cursor means nothing once relevance is the order: bm25 is computed, not
  // stored, so there is no stable value to resume from. Search results page by
  // asking for a larger limit instead.
  if (cursor !== null && match === null) {
    where.push(`(${key} < ? or (${key} = ? and g.id < ?))`);
    params.push(cursor.sortKey, cursor.sortKey, cursor.id);
  }

  // One row more than asked for, purely to learn whether a next page exists
  // without running a second count.
  const statement = `select ${GUIDE_COLUMNS} from ${from} where ${where.join(' and ')} order by ${order} limit ?`;
  params.push(limit + 1);

  const raw = sqlite.prepare(statement).all(...(params as never[])) as Record<string, unknown>[];

  const hasMore = raw.length > limit;
  const page = hasMore ? raw.slice(0, limit) : raw;
  const last = page.at(-1);

  return {
    rows: page.map((row) => ({ build: toGuide(row), author: toAuthor(row) })),
    // No cursor for a search, for the reason above, and none on the last page.
    cursor:
      hasMore && last !== undefined && match === null
        ? encodeCursor(sortValueOf(last, sort), Number(last['id']))
        : null,
  };
}
