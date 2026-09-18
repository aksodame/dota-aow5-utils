/**
 * Everything that reads or writes a build.
 *
 * The board itself is never interpreted here. It arrives as an already
 * validated string from `core/codec/validatePayload.ts` and is written exactly
 * as it came — the fourth link invariant is a property of this file doing
 * nothing clever.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ProfileLink } from 'aow5-api-contract';
import {
  MAX_BUILDS_CEILING,
  MAX_BUILDS_PER_USER,
  type BuildDetail,
  type BuildPriority,
  type BuildStatus,
  type BuildSummary,
  type MainSpellKey,
} from 'aow5-api-contract';
import type { PayloadFacets } from '../codec/validatePayload.ts';
import { readPriority, serialisePriority } from '../builds/priority.ts';
import type { BuildFields } from '../builds/validate.ts';
import type { VideoRef } from '../builds/video.ts';
import { DEFAULT_SEASON, type SeasonKey, type TierKey } from 'aow5-shared/data';
import type { Db } from './open.ts';
import { buildMaps, builds } from './schema.ts';
import { toPublicUser, type UserRow, type UserSummary } from './users.ts';

export type BuildRow = typeof builds.$inferSelect;

/**
 * How many of an author's five slots are taken.
 *
 * Drafts count: the cap is on how many boards you keep, not how many are
 * visible. Somebody with five drafts has used their five.
 */
export function countBuildsFor(db: Db, userId: number): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(builds)
    .where(and(eq(builds.userId, userId), isNull(builds.deletedAt)))
    .get();
  return row?.count ?? 0;
}

export interface NewBuild {
  userId: number;
  slug: string;
  fields: BuildFields;
  payload: string;
  /** Already normalised by `normaliseReferral`; `''` means none was given. */
  referral: string;
  /** Already validated and clamped; `0` means the author gave no price. */
  price: number;
  /** Authored, not read from the payload. Null only on a draft. */
  tier: TierKey | null;
  /**
   * Already checked against the payload's hero by the service. Optional so a
   * caller that predates seasons — the seed and import scripts — gets the
   * column's default, S1.
   */
  season?: SeasonKey;
  /**
   * The headline ability's slot.
   *
   * Optional, unlike `tier`: "not chosen" is a real and ordinary answer here —
   * it means the row reads the kit in order, which is what every build did
   * before this field existed.
   */
  mainSpell?: MainSpellKey | null;
  /** Already reduced from a pasted link by `parseVideoLink`; null means none. */
  video: VideoRef | null;
  /**
   * Already parsed by `parsePriority`. Optional, like `mainSpell`: "no advice
   * about the individual items" is the ordinary case and every build's starting
   * point, so a caller that has none says nothing rather than passing `[]`.
   */
  priority?: BuildPriority;
  facets: PayloadFacets;
  status: BuildStatus;
}

/**
 * Creates a build in the lowest free slot, or reports that there is none.
 *
 * The read and the insert share one transaction, which better-sqlite3 makes
 * genuinely atomic because it is synchronous — there is no await between them
 * for a second request to slip through. The partial unique index would catch a
 * race anyway; this exists so the *normal* path returns a sentence rather than
 * a constraint error.
 */
/**
 * Replaces a build's rooms with exactly this list.
 *
 * Delete-then-insert rather than a diff: the list is at most a handful of rows,
 * the pair is the primary key, and working out which two of four changed is
 * more code than rewriting all four. Deduplicated on the way in, because the
 * primary key would otherwise refuse the second copy and take the whole
 * transaction with it.
 */
function writeMaps(tx: Db, buildId: number, mapIds: readonly string[]): void {
  tx.delete(buildMaps).where(eq(buildMaps.buildId, buildId)).run();
  const unique = [...new Set(mapIds.filter((id) => id !== ''))];
  if (unique.length === 0) return;
  tx.insert(buildMaps)
    .values(unique.map((mapId) => ({ buildId, mapId })))
    .run();
}

/** The rooms one build names, for rendering it. */
export function mapsOfBuild(db: Db, buildId: number): string[] {
  return db
    .select({ mapId: buildMaps.mapId })
    .from(buildMaps)
    .where(eq(buildMaps.buildId, buildId))
    .all()
    .map((row) => row.mapId);
}

/**
 * The rooms of many builds at once, by build id.
 *
 * One query for a page of rows rather than one per row: the browse list draws
 * ten builds, and ten round trips to name their rooms is the shape of query
 * that makes a list slow for no reason anybody can see.
 */
export function mapsOfBuilds(db: Db, buildIds: readonly number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (buildIds.length === 0) return out;

  for (const row of db
    .select()
    .from(buildMaps)
    .where(inArray(buildMaps.buildId, [...buildIds]))
    .all()) {
    const list = out.get(row.buildId);
    if (list === undefined) out.set(row.buildId, [row.mapId]);
    else list.push(row.mapId);
  }
  return out;
}

export function createBuild(
  db: Db,
  input: NewBuild,
  now: number,
  /**
   * How many slots this author has.
   *
   * Passed in rather than read from the constant: the base is five and every
   * linked provider adds five, so the number is a fact about the account and
   * this module knows nothing about identities. The database still has the
   * final word — see `builds_slot_range`, which caps the highest any account
   * can reach.
   */
  limit: number = MAX_BUILDS_PER_USER,
): BuildRow | 'limit-reached' {
  return db.transaction((tx) => {
    const taken = new Set(
      tx
        .select({ slot: builds.slot })
        .from(builds)
        .where(and(eq(builds.userId, input.userId), isNull(builds.deletedAt)))
        .all()
        .map((row) => row.slot),
    );

    let slot = -1;
    for (let candidate = 0; candidate < Math.min(limit, MAX_BUILDS_CEILING); candidate += 1) {
      if (!taken.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    if (slot < 0) return 'limit-reached' as const;

    const created = tx
      .insert(builds)
      .values({
        slug: input.slug,
        userId: input.userId,
        slot,
        title: input.fields.title,
        body: input.fields.body,
        payload: input.payload,
        referral: input.referral,
        price: input.price,
        tier: input.tier,
        season: input.season ?? DEFAULT_SEASON,
        mainSpell: input.mainSpell ?? null,
        videoId: input.video?.id ?? '',
        videoStart: input.video?.start ?? 0,
        // Serialised here rather than stored as it arrived: the column never
        // holds a client's own bytes. See `core/builds/priority.ts`.
        priority: serialisePriority(input.priority ?? []),
        codecVersion: input.facets.codecVersion,
        heroId: input.facets.heroId,
        itemCount: input.facets.itemCount,
        spellCount: input.facets.spellCount,
        status: input.status,
        publishedAt: input.status === 'published' ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    writeMaps(tx, created.id, input.facets.mapIds);
    return created;
  });
}

/** Including soft-deleted ones, so a dead link can answer 410 rather than 404. */
export function findBuildBySlug(db: Db, slug: string): BuildRow | undefined {
  return db.select().from(builds).where(eq(builds.slug, slug)).get();
}

export function findBuildById(db: Db, id: number): BuildRow | undefined {
  return db.select().from(builds).where(eq(builds.id, id)).get();
}

/**
 * Every published build, newest change first.
 *
 * For the sitemap and the crawler's copy of the browse list, which are the only
 * two callers that want the whole set rather than a page of it — a sitemap that
 * stops at twenty entries is a sitemap that hides every build after the
 * twentieth.
 *
 * Bounded anyway. Fifty thousand is far past anything this site will hold (five
 * builds per account) and well inside the 50,000-URL limit a single sitemap
 * file is allowed; reaching it is the signal to start splitting the file rather
 * than to raise the number.
 */
export const SITEMAP_LIMIT = 50_000;

export function listPublishedBuilds(db: Db, limit: number = SITEMAP_LIMIT): BuildRow[] {
  return db
    .select()
    .from(builds)
    .where(and(eq(builds.status, 'published'), isNull(builds.deletedAt)))
    .orderBy(sql`${builds.updatedAt} desc`)
    .limit(limit)
    .all();
}

export function listBuildsForUser(db: Db, userId: number): BuildRow[] {
  return db
    .select()
    .from(builds)
    .where(and(eq(builds.userId, userId), isNull(builds.deletedAt)))
    .orderBy(builds.slot)
    .all();
}

export interface BuildPatch {
  fields?: BuildFields;
  payload?: string;
  /**
   * Absent leaves the stored code alone; `''` clears it.
   *
   * The distinction is the whole reason this is `string | undefined` rather
   * than a plain string — a client that never sends the field must not blank
   * a code somebody set, and one that sends an empty one means to erase it.
   */
  referral?: string;
  /** Absent leaves the stored price alone; `0` clears it, as for `referral`. */
  price?: number;
  /** Absent leaves the tier alone; `null` clears it. */
  tier?: TierKey | null;
  /** Absent leaves the season alone. There is no "none" to clear it to. */
  season?: SeasonKey;
  /** Absent leaves the headline alone; `null` puts it back to the kit order. */
  mainSpell?: MainSpellKey | null;
  /** Absent leaves the video alone; `null` clears it. */
  video?: VideoRef | null;
  /** Absent leaves the stored priority alone; an empty list clears it. */
  priority?: BuildPriority;
  facets?: PayloadFacets;
  status?: BuildStatus;
}

export function updateBuild(db: Db, build: BuildRow, patch: BuildPatch, now: number): BuildRow {
  const values: Partial<typeof builds.$inferInsert> = { updatedAt: now };

  if (patch.fields !== undefined) {
    values.title = patch.fields.title;
    values.body = patch.fields.body;
  }
  if (patch.referral !== undefined) values.referral = patch.referral;
  if (patch.price !== undefined) values.price = patch.price;
  if (patch.tier !== undefined) values.tier = patch.tier;
  if (patch.season !== undefined) values.season = patch.season;
  if (patch.mainSpell !== undefined) values.mainSpell = patch.mainSpell;
  if (patch.video !== undefined) {
    values.videoId = patch.video?.id ?? '';
    values.videoStart = patch.video?.start ?? 0;
  }
  if (patch.priority !== undefined) values.priority = serialisePriority(patch.priority);
  if (patch.payload !== undefined && patch.facets !== undefined) {
    values.payload = patch.payload;
    values.codecVersion = patch.facets.codecVersion;
    values.heroId = patch.facets.heroId;
    values.itemCount = patch.facets.itemCount;
    values.spellCount = patch.facets.spellCount;
  }
  if (patch.status !== undefined) {
    values.status = patch.status;
    // Set once, on the first publish. Re-publishing a build that was pulled
    // back to draft keeps its original date rather than jumping to the top of
    // "newest" every time somebody edits a typo.
    if (patch.status === 'published' && build.publishedAt === null) values.publishedAt = now;
  }

  db.update(builds).set(values).where(eq(builds.id, build.id)).run();
  // The rooms travel with the payload, so they are rewritten exactly when it is.
  if (patch.facets !== undefined) writeMaps(db, build.id, patch.facets.mapIds);
  return findBuildById(db, build.id) ?? build;
}

/** Soft, which also frees the author's slot — the unique index is partial. */
export function softDeleteBuild(db: Db, id: number, now: number): void {
  db.update(builds).set({ deletedAt: now, updatedAt: now }).where(eq(builds.id, id)).run();
}

export function isVisible(build: BuildRow): boolean {
  return build.deletedAt === null && build.status === 'published';
}

export function toBuildSummary(build: BuildRow, author: UserSummary, maps: string[] = []): BuildSummary {
  return {
    slug: build.slug,
    title: build.title,
    // Byte for byte, so a list row can draw a preview without a request of its
    // own. Never re-encoded here — see the note on the column.
    payload: build.payload,
    heroId: build.heroId,
    season: build.season,
    tier: build.tier,
    maps,
    price: build.price,
    mainSpell: build.mainSpell,
    status: build.status,
    author: toPublicUser(author),
    likeCount: build.likeCount,
    commentCount: build.commentCount,
    publishedAt: build.publishedAt,
    updatedAt: build.updatedAt,
  };
}

export function toBuildDetail(
  build: BuildRow,
  /** The row plus whether a provider vouches for them — see `UserSummary`. */
  author: UserRow & { verified?: boolean; profiles?: ProfileLink[] },
  viewer: { liked: boolean; canEdit: boolean; maps?: string[] },
): BuildDetail {
  return {
    ...toBuildSummary(build, author, viewer.maps ?? []),
    body: build.body,
    referral: build.referral,
    // Reassembled rather than stored as an object: two columns are what a
    // query can index and a migration can add, and this is the one place that
    // has to know they belong together.
    video: build.videoId === '' ? null : { id: build.videoId, start: build.videoStart },
    // Parsed on the way out as well as on the way in, so a row an older
    // deployment wrote cannot break the page that renders it.
    priority: readPriority(build.priority),
    codecVersion: build.codecVersion,
    itemCount: build.itemCount,
    spellCount: build.spellCount,
    createdAt: build.createdAt,
    liked: viewer.liked,
    canEdit: viewer.canEdit,
  };
}
