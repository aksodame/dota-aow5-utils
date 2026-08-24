/**
 * Everything that reads or writes a build.
 *
 * The board itself is never interpreted here. It arrives as an already
 * validated string from `core/codec/validatePayload.ts` and is written exactly
 * as it came — the fourth link invariant is a property of this file doing
 * nothing clever.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { MAX_BUILDS_PER_USER, type BuildDetail, type BuildStatus, type BuildSummary } from 'aow5-api-contract';
import type { PayloadFacets } from '../codec/validatePayload.ts';
import type { BuildFields } from '../builds/validate.ts';
import type { Db } from './open.ts';
import { builds } from './schema.ts';
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
export function createBuild(db: Db, input: NewBuild, now: number): BuildRow | 'limit-reached' {
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
    for (let candidate = 0; candidate < MAX_BUILDS_PER_USER; candidate += 1) {
      if (!taken.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    if (slot < 0) return 'limit-reached' as const;

    return tx
      .insert(builds)
      .values({
        slug: input.slug,
        userId: input.userId,
        slot,
        title: input.fields.title,
        body: input.fields.body,
        payload: input.payload,
        referral: input.referral,
        codecVersion: input.facets.codecVersion,
        heroId: input.facets.heroId,
        sectionCount: input.facets.sectionCount,
        itemCount: input.facets.itemCount,
        status: input.status,
        publishedAt: input.status === 'published' ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  });
}

/** Including soft-deleted ones, so a dead link can answer 410 rather than 404. */
export function findBuildBySlug(db: Db, slug: string): BuildRow | undefined {
  return db.select().from(builds).where(eq(builds.slug, slug)).get();
}

export function findBuildById(db: Db, id: number): BuildRow | undefined {
  return db.select().from(builds).where(eq(builds.id, id)).get();
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
  if (patch.payload !== undefined && patch.facets !== undefined) {
    values.payload = patch.payload;
    values.codecVersion = patch.facets.codecVersion;
    values.heroId = patch.facets.heroId;
    values.sectionCount = patch.facets.sectionCount;
    values.itemCount = patch.facets.itemCount;
  }
  if (patch.status !== undefined) {
    values.status = patch.status;
    // Set once, on the first publish. Re-publishing a build that was pulled
    // back to draft keeps its original date rather than jumping to the top of
    // "newest" every time somebody edits a typo.
    if (patch.status === 'published' && build.publishedAt === null) values.publishedAt = now;
  }

  db.update(builds).set(values).where(eq(builds.id, build.id)).run();
  return findBuildById(db, build.id) ?? build;
}

/** Soft, which also frees the author's slot — the unique index is partial. */
export function softDeleteBuild(db: Db, id: number, now: number): void {
  db.update(builds).set({ deletedAt: now, updatedAt: now }).where(eq(builds.id, id)).run();
}

export function isVisible(build: BuildRow): boolean {
  return build.deletedAt === null && build.status === 'published';
}

export function toBuildSummary(build: BuildRow, author: UserSummary): BuildSummary {
  return {
    slug: build.slug,
    title: build.title,
    heroId: build.heroId,
    status: build.status,
    author: toPublicUser(author),
    likeCount: build.likeCount,
    dislikeCount: build.dislikeCount,
    commentCount: build.commentCount,
    publishedAt: build.publishedAt,
    updatedAt: build.updatedAt,
  };
}

export function toBuildDetail(
  build: BuildRow,
  author: UserRow,
  viewer: { myVote: 1 | -1 | 0; canEdit: boolean },
): BuildDetail {
  return {
    ...toBuildSummary(build, author),
    body: build.body,
    payload: build.payload,
    referral: build.referral,
    codecVersion: build.codecVersion,
    sectionCount: build.sectionCount,
    itemCount: build.itemCount,
    createdAt: build.createdAt,
    myVote: viewer.myVote,
    canEdit: viewer.canEdit,
  };
}
