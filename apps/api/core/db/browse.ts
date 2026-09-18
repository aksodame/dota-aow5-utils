/**
 * Listing builds: search, facets, sort, and the offset that windows them.
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
  /** One season, or absent for every season. */
  season?: number;
  /**
   * Rooms to include. Empty or absent means every room.
   *
   * A list rather than one id, because the sidebar's tier chips are shorthand
   * for "every map at this tier" — so the common filter is several rooms at
   * once, and the server should answer that in one query rather than making
   * the client union three.
   */
  maps?: string[];
  /**
   * Tiers to include. Empty or absent means every tier.
   *
   * A list, and `OR`ed with `maps` rather than `AND`ed: the sidebar lets both
   * be chosen and a build satisfies the filter by matching either. A build
   * filed under a tier with no room named can only ever be found by this half,
   * which is why the two cannot be an intersection.
   */
  tiers?: string[];
  sort?: BuildSort;
  /**
   * Where the window starts. Clamped to zero; anything past the end returns
   * nothing, which is the honest answer to asking for row 900 of 52.
   */
  offset?: number;
  limit?: number;
}

export interface BrowseResult {
  rows: Array<{ build: BuildRow; author: UserSummary }>;
  /** Where `rows[0]` sits in the whole list. */
  offset: number;
  /** Rows matching the filters, ignoring the offset and the limit. */
  total: number;
}

/**
 * What each sort orders by, direction included.
 *
 * A fixed table, and the only source of the text spliced into `order by` — so
 * `sort` arriving from a query string can never reach the statement. The
 * direction is part of the value rather than appended by the caller because
 * `cheap` is the one sort that runs the other way, and a shared `desc` after
 * the fact could not express it.
 */
const SORT_ORDER: Record<BuildSort, string> = {
  new: 'g.published_at desc',
  // Likes alone. There is no dislike column to subtract any more.
  top: 'g.like_count desc',
  discussed: 'g.comment_count desc',
  /*
   * Unpriced builds last in *both* directions.
   *
   * `0` means the author did not say, not that the build is free, so ascending
   * price would otherwise open the cheapest list with every build that answers
   * the question least. Descending needs no such clause: zero sorts last on its
   * own.
   */
  cheap: 'case when g.price = 0 then 1 else 0 end asc, g.price asc',
  costly: 'g.price desc',
};

const GUIDE_COLUMNS = `
  g.id, g.slug, g.user_id, g.slot, g.title, g.body, g.payload, g.priority, g.referral,
  g.codec_version, g.hero_id, g.season, g.tier, g.price, g.main_spell, g.video_id, g.video_start,
  g.item_count, g.spell_count,
  g.status, g.like_count, g.comment_count, g.view_count,
  g.published_at, g.created_at, g.updated_at, g.deleted_at,
  a.id as a_id, a.nickname as a_nickname, a.avatar as a_avatar,
  -- Whether a provider vouches for the author, as one existence check per row
  -- rather than a query per card. It is what the browse list's badge reads.
  exists (select 1 from identities i where i.user_id = a.id) as a_verified`;

function toGuide(row: Record<string, unknown>): BuildRow {
  return {
    id: Number(row['id']),
    slug: String(row['slug']),
    userId: Number(row['user_id']),
    slot: Number(row['slot']),
    title: String(row['title']),
    body: String(row['body']),
    payload: String(row['payload']),
    // Selected for the same reason the video columns are: `BuildRow` is the
    // whole row. A list row draws no priority — reading one is a build's own
    // page — so nothing here parses it.
    priority: String(row['priority']),
    referral: String(row['referral']),
    codecVersion: Number(row['codec_version']),
    heroId: (row['hero_id'] as string | null) ?? null,
    season: Number(row['season']) as BuildRow['season'],
    tier: (row['tier'] as BuildRow['tier'] | null) ?? null,
    price: Number(row['price']),
    // The author's headline ability, as a slot key. Null means they left it to
    // the kit order, which is what the row draws in that case.
    mainSpell: (row['main_spell'] as BuildRow['mainSpell'] | null) ?? null,
    // Selected but not shown: a summary has no video, and a list row could not
    // draw one. They are here because `BuildRow` is the whole row, and a
    // partial one would be a second shape to keep in step with the schema.
    videoId: String(row['video_id']),
    videoStart: Number(row['video_start']),
    itemCount: Number(row['item_count']),
    spellCount: Number(row['spell_count']),
    status: row['status'] as BuildRow['status'],
    likeCount: Number(row['like_count']),
    commentCount: Number(row['comment_count']),
    viewCount: Number(row['view_count']),
    publishedAt: row['published_at'] === null ? null : Number(row['published_at']),
    createdAt: Number(row['created_at']),
    updatedAt: Number(row['updated_at']),
    deletedAt: row['deleted_at'] === null ? null : Number(row['deleted_at']),
  };
}

/**
 * The author, as three columns.
 *
 * A row shows a name and an avatar, so that is all this selects. Widening it
 * back to the whole row would drag the moderation fields through the busiest
 * read path on the site for nothing.
 */
/**
 * The three characters `LIKE` treats as syntax.
 *
 * A name containing `%` would otherwise match everything, and `_` would match
 * any single character. The escape character itself has to go first, or it
 * would escape the escapes this adds.
 */
/**
 * The character that escapes a `LIKE` wildcard, in both the SQL and the pattern.
 *
 * One constant so the two cannot disagree: the `ESCAPE` clause naming a
 * different character from the one `likeEscape` inserts would leave every
 * escape sequence as literal text, and a search for `%` back to matching
 * everything.
 */
const LIKE_ESCAPE = '\\';

function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `${LIKE_ESCAPE}${c}`);
}

function toAuthor(row: Record<string, unknown>): UserSummary {
  return {
    id: Number(row['a_id']),
    nickname: String(row['a_nickname']),
    avatar: String(row['a_avatar']),
    verified: Number(row['a_verified']) === 1,
  };
}

export function browseBuilds(sqlite: Sqlite, filters: BrowseFilters): BrowseResult {
  // `top` by default: a guides list ordered by recency shows what was published
  // this week rather than what is worth reading.
  const sort: BuildSort = filters.sort !== undefined && filters.sort in SORT_ORDER ? filters.sort : 'top';
  // `Number.isFinite` before the clamp, not after: `Math.max(NaN, 1)` is NaN,
  // so a hand-typed `?limit=abc` would otherwise arrive at the statement as a
  // NaN bound. Truncated too — a fractional limit is not a row count.
  const asked = filters.limit;
  const limit =
    asked !== undefined && Number.isFinite(asked)
      ? Math.min(Math.max(Math.trunc(asked), 1), PAGE_SIZE)
      : PAGE_SIZE;
  const key = SORT_ORDER[sort];

  const raw = filters.q === undefined ? '' : filters.q.trim();
  const fts = raw !== '' ? buildFtsQuery(raw) : null;
  const match = fts?.match ?? null;

  // The same guard `limit` gets: a hand-typed `?offset=abc` must not reach the
  // statement as a NaN bound, and a fractional offset is not a row position.
  const askedOffset = filters.offset;
  const offset =
    askedOffset !== undefined && Number.isFinite(askedOffset) ? Math.max(Math.trunc(askedOffset), 0) : 0;

  const params: unknown[] = [];
  /*
   * Bound values that belong to `order by` rather than to `where`.
   *
   * Kept apart because the count query uses the same predicate and no ordering
   * at all — mixing them would send the ranking's parameters to a statement
   * that has no placeholders for them.
   */
  const orderParams: unknown[] = [];
  // A banned author's builds disappear everywhere, which is what makes banning
  // one action rather than a sweep.
  const where = ["g.status = 'published'", 'g.deleted_at is null', 'a.banned_at is null'];

  let from = 'builds g join users a on a.id = g.user_id';
  let order = `${key}, g.id desc`;

  if (raw !== '') {
    /*
     * Three ways to match, not one.
     *
     * The search box is the only one on the site, so it has to answer all the
     * questions somebody brings to it: the words in a guide, the *code* off a
     * shared link, and an author's name. Text is the common case and keeps its
     * relevance ranking; the other two are lookups.
     *
     * The FTS table is a subquery rather than a join, which is what lets the
     * three be `OR`ed at all — joining it restricts the whole query to rows it
     * matched, and a build found by its author's name is not one of those.
     * Every row is indexed and visibility is filtered outside it, rather than
     * indexing only published builds: the alternative needs conditional
     * triggers, and those go stale the first time somebody unpublishes.
     *
     * Keyed on the raw text rather than on the FTS expression, because
     * `buildFtsQuery` strips everything FTS5 reads as syntax and can come back
     * with nothing usable. That used to mean a search for `%` matched no branch
     * at all and fell through to *no search*, listing every build on the site —
     * a query that finds nothing must return nothing, not everything.
     */
    const branches: string[] = [];

    if (match !== null) {
      branches.push('g.id in (select rowid from builds_fts where builds_fts match ?)');
      params.push(match);
    }
    branches.push('g.slug = ?');
    params.push(raw);
    /*
     * Both sides folded by `unicode_lower` rather than left to LIKE, whose
     * case-insensitivity covers ASCII only — see the note where the function is
     * registered. Without it, searching an author as `свет` misses `Свет`,
     * which is most of this site's audience missing most of its authors.
     */
    branches.push(`unicode_lower(a.nickname) like unicode_lower(?) escape '${LIKE_ESCAPE}'`);
    params.push(`%${likeEscape(raw)}%`);

    where.push(`(${branches.join(' or ')})`);

    /*
     * An exact code first, then text relevance, then the author matches.
     *
     * `bm25` is a second, correlated subquery so that it still works: an FTS5
     * auxiliary function needs the MATCH in its own query, and here it has one.
     * It returns a negative score where more relevant is more negative, so
     * ascending is best-first — and the fallback for a row that matched on
     * author rather than text has to be a large positive, or it would sort
     * ahead of every genuine text hit.
     */
    const rank =
      match === null
        ? ''
        : 'coalesce((select bm25(builds_fts, 8.0, 1.0) from builds_fts ' +
          'where builds_fts.rowid = g.id and builds_fts match ?), 1e9) asc, ';
    order = `case when g.slug = ? then 0 else 1 end asc, ${rank}g.like_count desc, g.id desc`;
    orderParams.push(raw);
    if (match !== null) orderParams.push(match);
  }

  if (filters.hero !== undefined && filters.hero !== '') {
    where.push('g.hero_id = ?');
    params.push(filters.hero);
  }
  if (filters.season !== undefined) {
    where.push('g.season = ?');
    params.push(filters.season);
  }
  /*
   * Tiers and rooms, `OR`ed.
   *
   * The sidebar treats them as one control — ticking a tier ticks its rooms,
   * unticking a room leaves the others — so a build satisfies the filter by
   * matching either half. An intersection would be wrong in the case the tier
   * field exists for: a guide filed under tier 8 that names no room matches no
   * room id, and `AND` would hide it from the filter meant to find it.
   *
   * Placeholders are generated from each list's length with the values bound;
   * the only thing spliced into the statement is the number of `?`.
   */
  const maps = (filters.maps ?? []).filter((id) => id !== '');
  const tiers = (filters.tiers ?? []).filter((tier) => tier !== '');
  if (maps.length > 0 || tiers.length > 0) {
    const parts: string[] = [];
    if (tiers.length > 0) {
      parts.push(`g.tier in (${tiers.map(() => '?').join(', ')})`);
      params.push(...tiers);
    }
    if (maps.length > 0) {
      parts.push(
        `exists (select 1 from build_maps bm where bm.build_id = g.id ` +
          `and bm.map_id in (${maps.map(() => '?').join(', ')}))`,
      );
      params.push(...maps);
    }
    where.push(`(${parts.join(' or ')})`);
  }
  /*
   * The total is counted over the same predicate, which by here carries every
   * filter and no window - so it is the size of the list rather than of the
   * slice being returned. The two share `where` and `params` precisely so they
   * cannot come to disagree about what is being counted.
   */
  const total = Number(
    (
      sqlite
        .prepare(`select count(*) as n from ${from} where ${where.join(' and ')}`)
        .get(...(params as never[])) as { n: number } | undefined
    )?.n ?? 0,
  );

  const statement = `select ${GUIDE_COLUMNS} from ${from} where ${where.join(' and ')} order by ${order} limit ? offset ?`;
  const rows = sqlite
    .prepare(statement)
    .all(...([...params, ...orderParams, limit, offset] as never[])) as Record<string, unknown>[];

  return {
    total,
    offset,
    rows: rows.map((row) => ({ build: toGuide(row), author: toAuthor(row) })),
  };
}
