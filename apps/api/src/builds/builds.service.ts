import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateBuildBody,
  BuildDetail,
  BuildSort,
  BuildStatus,
  BuildSummary,
  Page,
  UpdateBuildBody,
} from 'aow5-api-contract';
import { HERO_TABLE, ID_TABLE } from '../../core/codec/tables.ts';
import { validatePayload, type PayloadFacets } from '../../core/codec/validatePayload.ts';
import {
  createBuild,
  findBuildBySlug,
  listBuildsForUser,
  softDeleteBuild,
  toBuildDetail,
  toBuildSummary,
  updateBuild,
  type BuildRow,
} from '../../core/db/builds.ts';
import { browseBuilds, type BrowseFilters } from '../../core/db/browse.ts';
import type { Db, Sqlite } from '../../core/db/open.ts';
import { findUserById, type UserRow } from '../../core/db/users.ts';
import { findVote } from '../../core/db/votes.ts';
import { generateSlug, isSlug } from '../../core/builds/slug.ts';
import { normaliseReferral, validateBuildFields } from '../../core/builds/validate.ts';
import { DB, SQLITE } from '../db/tokens.ts';
import { ApiException } from '../http/api-error.ts';

@Injectable()
export class BuildsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SQLITE) private readonly opened: { sqlite: Sqlite },
  ) {}

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Turns a submitted board into something storable, or refuses it.
   *
   * Decoding only, never re-encoding. See `validatePayload` for why a
   * byte-equality check here would reject perfectly good v1 to v5 links.
   */
  private checkPayload(raw: unknown): { payload: string; facets: PayloadFacets } {
    if (typeof raw !== 'string') {
      throw new ApiException('VALIDATION_FAILED', 'A build needs a build.', { payload: 'Missing.' });
    }
    const check = validatePayload(raw, ID_TABLE, HERO_TABLE);
    if (check.ok) return { payload: check.payload, facets: check.facets };

    switch (check.rejection.reason) {
      case 'too-long':
        throw new ApiException('PAYLOAD_TOO_LARGE', 'That build is too large to store.');
      case 'unsupported-version':
        throw new ApiException('PAYLOAD_INVALID', 'That build was made by a newer version of the planner.');
      default:
        throw new ApiException('PAYLOAD_INVALID', 'That build could not be read.');
    }
  }

  private fields(input: { title?: unknown; summary?: unknown; body?: unknown; lang?: unknown }) {
    const result = validateBuildFields(input);
    if (!result.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', result.errors);
    return result.fields;
  }

  /**
   * The referral code, as it will be stored.
   *
   * Normalised on this side and not trusted from the browser's copy: the field
   * in the planner is a plain text input, and what a person pastes into one is
   * whatever their clipboard held.
   */
  private referral(raw: unknown): string {
    const result = normaliseReferral(raw);
    if (!result.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', result.errors);
    return result.referral;
  }

  /** Loads a build by slug, or throws the right kind of not-found. */
  private load(slug: string): BuildRow {
    // Shape-checked before it reaches a query, so a malformed URL is a 404
    // rather than a database round trip.
    if (!isSlug(slug)) throw new ApiException('NOT_FOUND', 'No such build.');
    const build = findBuildBySlug(this.db, slug);
    if (build === undefined) throw new ApiException('NOT_FOUND', 'No such build.');
    // 410 rather than 404: the link was real once, and saying so is the
    // difference between "you mistyped" and "this is gone".
    if (build.deletedAt !== null) throw new ApiException('GONE', 'That build was deleted.');
    return build;
  }

  private author(build: BuildRow): UserRow {
    const author = findUserById(this.db, build.userId);
    if (author === undefined) throw new ApiException('INTERNAL', 'That build has no author.');
    return author;
  }

  private mayEdit(build: BuildRow, viewer: UserRow | undefined): boolean {
    return viewer !== undefined && (viewer.id === build.userId || viewer.role === 'admin');
  }

  get(slug: string, viewer: UserRow | undefined): BuildDetail {
    const build = this.load(slug);
    const canEdit = this.mayEdit(build, viewer);

    // A draft is visible to its author and nobody else, and answers 404 rather
    // than 403 so its existence is not confirmed to a stranger.
    if (build.status !== 'published' && !canEdit) throw new ApiException('NOT_FOUND', 'No such build.');

    const myVote = viewer === undefined ? 0 : findVote(this.db, build.id, viewer.id);
    return toBuildDetail(build, this.author(build), { myVote, canEdit });
  }

  create(body: CreateBuildBody, user: UserRow): BuildDetail {
    const fields = this.fields(body);
    const { payload, facets } = this.checkPayload(body.payload);
    const status: BuildStatus = body.status === 'draft' ? 'draft' : 'published';

    const created = createBuild(
      this.db,
      {
        userId: user.id,
        slug: generateSlug(),
        fields,
        payload,
        referral: this.referral(body.referral),
        facets,
        status,
      },
      this.now(),
    );

    if (created === 'limit-reached') {
      throw new ApiException('BUILD_LIMIT_REACHED', 'You already have five builds. Delete one to make room.');
    }

    return toBuildDetail(created, user, { myVote: 0, canEdit: true });
  }

  update(slug: string, body: UpdateBuildBody, user: UserRow): BuildDetail {
    const build = this.load(slug);
    if (!this.mayEdit(build, user)) throw new ApiException('FORBIDDEN', 'That is not your build.');

    const patch: Parameters<typeof updateBuild>[2] = {};
    // Only what was sent is touched, so a client that knows about fewer fields
    // than the server does cannot blank the ones it has never heard of.
    if (body.title !== undefined || body.body !== undefined) {
      patch.fields = this.fields({
        title: body.title ?? build.title,
        body: body.body ?? build.body,
      });
    }
    // Sending `''` erases the code; not sending the field at all leaves it be.
    if (body.referral !== undefined) patch.referral = this.referral(body.referral);
    if (body.payload !== undefined) Object.assign(patch, this.checkPayload(body.payload));
    if (body.status !== undefined) patch.status = body.status === 'draft' ? 'draft' : 'published';

    const updated = updateBuild(this.db, build, patch, this.now());
    // The viewer's own vote, not a hard zero. An author cannot vote on their
    // own build, but an admin editing one can have — and answering 0 would make
    // the vote they cast vanish from the page the moment they saved a typo.
    const myVote = findVote(this.db, updated.id, user.id);
    return toBuildDetail(updated, this.author(updated), { myVote, canEdit: true });
  }

  remove(slug: string, user: UserRow): void {
    const build = this.load(slug);
    if (!this.mayEdit(build, user)) throw new ApiException('FORBIDDEN', 'That is not your build.');
    softDeleteBuild(this.db, build.id, this.now());
  }

  /**
   * The public listing.
   *
   * Anonymous: browsing and searching never need an account, and that is a
   * deliberate half of the design rather than an oversight.
   */
  browse(query: Record<string, string | undefined>): Page<BuildSummary> {
    const sort = query['sort'];
    const filters: BrowseFilters = {
      ...(query['q'] !== undefined ? { q: query['q'] } : {}),
      ...(query['hero'] !== undefined ? { hero: query['hero'] } : {}),
      ...(query['lang'] !== undefined ? { lang: query['lang'] } : {}),
      ...(query['cursor'] !== undefined ? { cursor: query['cursor'] } : {}),
      // Clamped inside `browseBuilds`, which is also where a missing or
      // unparseable one falls back to `PAGE_SIZE` — so `NaN` from a hand-typed
      // query string cannot reach the statement as a limit.
      ...(query['limit'] !== undefined ? { limit: Number(query['limit']) } : {}),
      // Anything unrecognised falls back inside browseBuilds rather than here,
      // so there is one place that decides what a sort may be.
      ...(sort !== undefined ? { sort: sort as BuildSort } : {}),
    };

    const result = browseBuilds(this.opened.sqlite, filters);
    return {
      items: result.rows.map(({ build, author }) => toBuildSummary(build, author)),
      cursor: result.cursor,
    };
  }

  mine(user: UserRow): BuildSummary[] {
    return listBuildsForUser(this.db, user.id).map((build) => toBuildSummary(build, user));
  }
}
