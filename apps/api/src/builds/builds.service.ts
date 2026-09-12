import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateBuildBody,
  BuildDetail,
  BuildPriority,
  BuildSort,
  BuildStatus,
  BuildSummary,
  MainSpellKey,
  Slice,
  UpdateBuildBody,
} from 'aow5-api-contract';
import { HERO_TABLE, ID_TABLE, MAP_BY_ID } from '../../core/codec/tables.ts';
import { categoryOfMap, isTierKey, type TierKey } from 'aow5-shared/data';
import { ABILITY_SLOTS } from 'aow5-shared/types';
import { validatePayload, type PayloadFacets } from '../../core/codec/validatePayload.ts';
import {
  createBuild,
  findBuildBySlug,
  listBuildsForUser,
  mapsOfBuild,
  mapsOfBuilds,
  softDeleteBuild,
  toBuildDetail,
  toBuildSummary,
  type BuildRow,
  updateBuild,
} from '../../core/db/builds.ts';
import { browseBuilds, type BrowseFilters } from '../../core/db/browse.ts';
import type { Db, Sqlite } from '../../core/db/open.ts';
import { buildLimitFor, findUserById, isVerified, type UserRow } from '../../core/db/users.ts';
import { hasLiked } from '../../core/db/likes.ts';
import { profilesOf, profilesOfUsers } from '../../core/db/identities.ts';
import { generateSlug, isSlug } from '../../core/builds/slug.ts';
import {
  normalisePrice,
  normaliseReferral,
  normaliseTier,
  validateBuildFields,
} from '../../core/builds/validate.ts';
import { parsePriority } from '../../core/builds/priority.ts';
import { parseVideoLink, type VideoRef } from '../../core/builds/video.ts';
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

  /**
   * The price, as it will be stored.
   *
   * Checked here rather than trusted from the field's own `max`: a number
   * arrives as JSON and nothing about the request proves it came from the
   * editor.
   */
  private price(raw: unknown): number {
    const result = normalisePrice(raw);
    if (!result.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', result.errors);
    return result.price;
  }

  /**
   * The video, reduced from whatever link was pasted.
   *
   * The refusal is a field error rather than a silent drop: somebody who
   * pasted a Twitch link should be told this is a YouTube box, not left
   * wondering why their video vanished on save.
   */
  private video(raw: unknown): VideoRef | null {
    const result = parseVideoLink(raw);
    if (!result.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', result.errors);
    return result.video;
  }

  /**
   * The reforge priority, parsed rather than trusted.
   *
   * A JSON column with no schema behind it is only as good as the one place
   * that reads what goes into it — so this refuses a malformed plan the way the
   * video field refuses a Twitch link, with a sentence under the panel rather
   * than a silent drop of somebody's advice.
   */
  private priority(raw: unknown): BuildPriority {
    const result = parsePriority(raw);
    if (!result.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', result.errors);
    return result.priority;
  }

  /**
   * The tier, and the rule that keeps it honest against the map.
   *
   * Authored rather than derived, because a guide may be written for a tier
   * without naming a room. But when a room *is* named the two are claims about
   * the same thing, and a build filed under tier 3 whose map is a tier 8 room
   * would be wrong in the browse list whichever of them the filter believed.
   * Checked here rather than silently overwritten: the author picked both, and
   * quietly changing one of them is worse than saying they disagree.
   */
  private tier(raw: unknown, mapIds: readonly string[]): TierKey | null {
    const result = normaliseTier(raw);
    if (!result.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', result.errors);
    if (result.tier === null) return null;

    /*
     * Every room named has to belong to the chosen tier.
     *
     * Checked rather than silently corrected: the author picked both, and
     * quietly moving one of them is worse than saying they disagree. The
     * *first* offender is named, because listing four is a sentence nobody
     * reads and fixing one usually fixes the rest.
     */
    for (const mapId of mapIds) {
      const map = MAP_BY_ID.get(mapId);
      if (map === undefined) continue;
      const category = categoryOfMap(map);
      if (category !== result.tier) {
        throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', {
          tier: `${mapId} is filed under ${category === 'event' ? 'Event' : `tier ${category}`}.`,
        });
      }
    }
    return result.tier;
  }

  /**
   * Which ability the build is about, checked against the build's own spells.
   *
   * Refused rather than dropped when it names an empty slot: a headline
   * pointing at a spell the loadout does not hold would draw a hole in every
   * row the build appears in, and silently ignoring the choice would leave the
   * author looking at an editor that says one thing and a list that shows
   * another.
   *
   * `null` and `undefined` are both "leave it to the kit order", which is what
   * every build written before this field did and still does.
   */
  private mainSpell(raw: unknown, spellKeys: readonly string[]): MainSpellKey | null {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'string' || !(ABILITY_SLOTS as readonly string[]).includes(raw)) {
      throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', {
        mainSpell: 'That is not one of the ability keys.',
      });
    }
    if (!spellKeys.includes(raw)) {
      throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', {
        mainSpell: 'That slot has no spell in it.',
      });
    }
    return raw as MainSpellKey;
  }

  /**
   * What a build needs before anybody else can read it.
   *
   * A draft is somebody's working copy and may be as incomplete as they like. A
   * *published* guide is a claim made to strangers, and two of its fields are
   * the ones a reader brings a question to: which tier is this for, and what
   * does it cost. A list full of builds answering neither is a list nobody can
   * filter.
   */
  private requireForPublish(tier: TierKey | null, price: number): void {
    const errors: Record<string, string> = {};
    if (tier === null) errors['tier'] = 'Pick the tier this build is for.';
    if (price <= 0) errors['price'] = 'Say what it costs to put together.';
    if (Object.keys(errors).length > 0) {
      throw new ApiException('VALIDATION_FAILED', 'A published build needs a tier and a price.', errors);
    }
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

    const liked = viewer === undefined ? false : hasLiked(this.db, build.id, viewer.id);
    return toBuildDetail(
      build,
      {
        ...this.author(build),
        verified: isVerified(this.db, build.userId),
        // Where a reader can go to find out who wrote this. One query, on the
        // one page that shows a single author rather than a list of them.
        profiles: profilesOf(this.db, build.userId),
      },
      { liked, canEdit, maps: mapsOfBuild(this.db, build.id) },
    );
  }

  create(body: CreateBuildBody, user: UserRow): BuildDetail {
    const fields = this.fields(body);
    const { payload, facets } = this.checkPayload(body.payload);
    const status: BuildStatus = body.status === 'draft' ? 'draft' : 'published';
    const tier = this.tier(body.tier, facets.mapIds);
    const price = this.price(body.price);
    if (status === 'published') this.requireForPublish(tier, price);

    const limit = buildLimitFor(this.db, user.id);
    const created = createBuild(
      this.db,
      {
        userId: user.id,
        slug: generateSlug(),
        fields,
        payload,
        referral: this.referral(body.referral),
        price,
        tier,
        mainSpell: this.mainSpell(body.mainSpell, facets.spellKeys),
        video: this.video(body.video),
        priority: this.priority(body.priority),
        facets,
        status,
      },
      this.now(),
      // The author's own ceiling: five, and five more per linked provider.
      limit,
    );

    if (created === 'limit-reached') {
      // The number, because it is not the same for everybody any more — and a
      // message that says five to somebody holding ten is a message that reads
      // as a bug in the counter they are looking at.
      throw new ApiException(
        'BUILD_LIMIT_REACHED',
        `You already have ${limit} builds. Delete one to make room, or link an account for more.`,
      );
    }

    return toBuildDetail(
      created,
      { ...user, verified: isVerified(this.db, user.id), profiles: profilesOf(this.db, user.id) },
      { liked: false, canEdit: true, maps: facets.mapIds },
    );
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
    // `0` erases the price, matching how `''` erases the code.
    if (body.price !== undefined) patch.price = this.price(body.price);
    /*
     * `''` erases the video, for the same reason.
     *
     * A start time survives an edit that leaves the video alone. The editor's
     * field is the id and nothing else now, so it cannot express `t=` — and
     * without this, saving a typo in the title would quietly reset an offset
     * somebody set deliberately. A *different* video takes whatever offset came
     * with it, which is usually none.
     */
    if (body.video !== undefined) {
      const next = this.video(body.video);
      patch.video =
        next !== null && next.id === build.videoId && next.start === 0
          ? { id: next.id, start: build.videoStart }
          : next;
    }
    /*
     * An empty list clears the priority; not sending the field leaves it be.
     *
     * Deliberately *not* reconciled against the payload here. Whether a stat
     * belongs to the item in a slot is a question about the game's data, which
     * this server does not carry — and an author who swaps an item and swaps it
     * back should find their advice where they left it. The panel renders each
     * card against the item that is actually in the slot, so advice about a
     * piece that is no longer there is invisible rather than wrong.
     */
    if (body.priority !== undefined) patch.priority = this.priority(body.priority);
    if (body.payload !== undefined) Object.assign(patch, this.checkPayload(body.payload));
    /*
     * After the payload, and against the rooms this edit leaves behind.
     *
     * `patch.facets` is where the new board's rooms appear, and it is the line
     * above that puts them there — so this ran before them and judged the new
     * tier against the rooms the build *had*. Changing a build's tier is
     * exactly the edit that drops the old room in the same request: the editor
     * clears a room that no longer belongs to the chosen tier and sends a board
     * without it, and the save was refused anyway, naming a room the request
     * had already let go of. Tier and rooms move together, so they have to be
     * judged together, which means after the payload has been decoded.
     */
    if (body.tier !== undefined) {
      patch.tier = this.tier(body.tier, patch.facets?.mapIds ?? mapsOfBuild(this.db, build.id));
    }
    /*
     * After the payload too, and against the spells this edit leaves behind: an
     * author who moves their headline and their loadout in one save is making
     * one change, and judging the new key against the old spells would refuse
     * a pair that is perfectly consistent.
     */
    if (body.mainSpell !== undefined) {
      const keys = patch.facets?.spellKeys ?? this.checkPayload(build.payload).facets.spellKeys;
      patch.mainSpell = this.mainSpell(body.mainSpell, keys);
    }
    if (body.status !== undefined) patch.status = body.status === 'draft' ? 'draft' : 'published';

    /*
     * Checked against what the row will hold, not against what this request
     * sent: a build already published cannot have its tier cleared by an edit
     * that only changes the title, and one being published now must satisfy the
     * rule using whatever it already had.
     */
    const nextStatus = patch.status ?? build.status;
    if (nextStatus === 'published') {
      this.requireForPublish(patch.tier === undefined ? build.tier : patch.tier, patch.price ?? build.price);
    }

    const updated = updateBuild(this.db, build, patch, this.now());
    // The viewer's own like, not a hard false. An author cannot like their
    // own build, but an admin editing one can have — and answering 0 would make
    // the like they gave vanish from the page the moment they saved a typo.
    const liked = hasLiked(this.db, updated.id, user.id);
    return toBuildDetail(updated, {
      ...this.author(updated),
      verified: isVerified(this.db, updated.userId),
      profiles: profilesOf(this.db, updated.userId),
    }, {
      liked,
      canEdit: true,
      maps: mapsOfBuild(this.db, updated.id),
    });
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
  browse(query: Record<string, string | undefined>): Slice<BuildSummary> {
    const sort = query['sort'];
    const maps = (query['map'] ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');
    const rawOffset = Number(query['offset'] ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
    // Comma-separated, exactly as `map` is: the sidebar treats tiers and rooms
    // as one control, so they arrive the same way.
    const tiers = (query['tier'] ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key !== '');
    const filters: BrowseFilters = {
      ...(query['q'] !== undefined ? { q: query['q'] } : {}),
      ...(query['hero'] !== undefined ? { hero: query['hero'] } : {}),
      // Comma-separated, because a tier chip in the sidebar means "every map at
      // this tier" and that is several ids in one request.
      ...(maps.length > 0 ? { maps } : {}),
      // Unrecognised keys are dropped rather than coerced: `?tier=abc` asked
      // for something that does not exist, and answering with every build
      // would be a worse lie than answering with none.
      ...(tiers.length > 0 ? { tiers: tiers.filter(isTierKey) } : {}),
      // Parsed here rather than in the query builder, which takes a number and
      // clamps it. A missing or unparseable one is the start of the list.
      ...(offset > 0 ? { offset } : {}),
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
      // One query for the whole page's rooms rather than one per row: ten
      // builds and ten round trips is the shape that makes a list slow for no
      // reason anybody can see.
      items: (() => {
        const byBuild = mapsOfBuilds(this.db, result.rows.map(({ build }) => build.id));
        // One query for the page's authors, like the rooms above it.
        const byAuthor = profilesOfUsers(this.db, result.rows.map(({ author }) => author.id));
        return result.rows.map(({ build, author }) =>
          toBuildSummary(build, { ...author, profiles: byAuthor.get(author.id) ?? [] }, byBuild.get(build.id) ?? []),
        );
      })(),
      offset: result.offset,
      total: result.total,
    };
  }

  mine(user: UserRow): BuildSummary[] {
    const mine = listBuildsForUser(this.db, user.id);
    const byBuild = mapsOfBuilds(this.db, mine.map((build) => build.id));
    // Their own list, so one lookup answers for every row.
    const author = { ...user, verified: isVerified(this.db, user.id), profiles: profilesOf(this.db, user.id) };
    return mine.map((build) => toBuildSummary(build, author, byBuild.get(build.id) ?? []));
  }
}
