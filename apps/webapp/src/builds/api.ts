import type {
  AuthProvidersResponse,
  CommentDto,
  CreateBuildBody,
  BuildDetail,
  BuildSort,
  BuildSummary,
  LikeResponse,
  MeResponse,
  Page,
  PendingCommentDto,
  PowChallenge,
  PowSolution,
  Slice,
  UpdateBuildBody,
} from 'aow5-api-contract';
import { api } from '@/lib/api';

/**
 * The builds endpoints, typed.
 *
 * A thin naming layer over `lib/api`, so a component never builds a path by
 * hand and the contract package is the only place a shape is written down.
 */

export function getBuild(slug: string, signal?: AbortSignal): Promise<BuildDetail> {
  return api<BuildDetail>(`/builds/${encodeURIComponent(slug)}`, signal ? { signal } : {});
}

export function createBuild(body: CreateBuildBody): Promise<BuildDetail> {
  return api<BuildDetail>('/builds', { method: 'POST', body });
}

export function updateBuild(slug: string, body: UpdateBuildBody): Promise<BuildDetail> {
  return api<BuildDetail>(`/builds/${encodeURIComponent(slug)}`, { method: 'PATCH', body });
}

export function deleteBuild(slug: string): Promise<void> {
  return api<void>(`/builds/${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

export function myBuilds(signal?: AbortSignal): Promise<BuildSummary[]> {
  return api<BuildSummary[]>('/me/builds', signal ? { signal } : {});
}

export interface BrowseQuery {
  q?: string;
  /** One season, sent as `?season=1`. */
  season?: number;
  hero?: string;
  /** Tiers to include, comma-separated on the wire like `map`. */
  tiers?: string[];
  /**
   * Rooms to include. Sent as one comma-separated `map` parameter.
   *
   * A list because the sidebar's tier chips are shorthand for "every map at
   * this tier" — so the ordinary filter is several rooms at once.
   */
  maps?: string[];
  sort?: BuildSort;
  /** Where the window starts. The list is virtualised, so this is a row index. */
  offset?: number;
  /** Rows per window. A request: the server clamps it to `PAGE_SIZE`. */
  limit?: number;
}

export function browseBuilds(query: BrowseQuery, signal?: AbortSignal): Promise<Slice<BuildSummary>> {
  const { maps, tiers, ...rest } = query;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  // One parameter carrying the list, not one per room: the server splits it,
  // and a repeated key would need a different reader on both sides.
  if (maps !== undefined && maps.length > 0) params.set('map', maps.join(','));
  if (tiers !== undefined && tiers.length > 0) params.set('tier', tiers.join(','));
  const suffix = params.toString();
  return api<Slice<BuildSummary>>(`/builds${suffix === '' ? '' : `?${suffix}`}`, signal ? { signal } : {});
}

/** Likes or unlikes a build, and answers with the count afterwards. */
export function setLike(slug: string, liked: boolean): Promise<LikeResponse> {
  return api<LikeResponse>(`/builds/${encodeURIComponent(slug)}/like`, { method: 'PUT', body: { liked } });
}

/* --- comments -------------------------------------------------------------- */

/**
 * One page of a thread, oldest first.
 *
 * Cursor rather than offset, unlike the browse list. A thread is read from the
 * top downwards and never jumped into, so keyset's guarantee — a comment posted
 * while you read cannot push another one out of sight — costs nothing here and
 * is worth having.
 */
export function listComments(slug: string, cursor: string | null, signal?: AbortSignal): Promise<Page<CommentDto>> {
  const suffix = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return api<Page<CommentDto>>(`/builds/${encodeURIComponent(slug)}/comments${suffix}`, signal ? { signal } : {});
}

export function postComment(slug: string, body: string): Promise<CommentDto> {
  return api<CommentDto>(`/builds/${encodeURIComponent(slug)}/comments`, { method: 'POST', body: { body } });
}

export function editComment(id: number, body: string): Promise<CommentDto> {
  return api<CommentDto>(`/comments/${id}`, { method: 'PATCH', body: { body } });
}

/* --- moderation ------------------------------------------------------------ */

/**
 * Every comment waiting for a verdict, across the site. Admin only.
 *
 * Not paged, like the endpoint: if this ever grows past a screenful the answer
 * is fewer unverified accounts posting, not a second page.
 */
export function pendingComments(signal?: AbortSignal): Promise<PendingCommentDto[]> {
  return api<PendingCommentDto[]>('/comments/pending', signal ? { signal } : {});
}

/** Lets one through. Idempotent, so a double click is not an error. */
export function approveComment(id: number): Promise<CommentDto> {
  return api<CommentDto>(`/comments/${id}/approve`, { method: 'POST' });
}

export function deleteComment(id: number): Promise<void> {
  return api<void>(`/comments/${id}`, { method: 'DELETE' });
}

/* --- accounts --------------------------------------------------------------- */

/**
 * Which sign-in doors this deployment has.
 *
 * Asked rather than assumed, so a deploy without Discord keys does not draw a
 * button that can only fail. `local` is always in the answer.
 */
export function authProviders(signal?: AbortSignal): Promise<AuthProvidersResponse> {
  return api<AuthProvidersResponse>('/auth/providers', signal ? { signal } : {});
}

/** A proof-of-work challenge for the sign-up form. See `lib/pow.ts`. */
export function authChallenge(): Promise<PowChallenge> {
  return api<PowChallenge>('/auth/challenge');
}

export function signUp(nickname: string, password: string, pow: PowSolution): Promise<{ user: MeResponse['user'] }> {
  return api<{ user: MeResponse['user'] }>('/auth/signup', { method: 'POST', body: { nickname, password, pow } });
}

export function signIn(nickname: string, password: string): Promise<{ user: MeResponse['user'] }> {
  return api<{ user: MeResponse['user'] }>('/auth/login', { method: 'POST', body: { nickname, password } });
}

/**
 * The viewer, or null.
 *
 * Answers 200 with a null user when nobody is signed in, so this never throws
 * for the ordinary anonymous case.
 */
export function getMe(signal?: AbortSignal): Promise<MeResponse> {
  return api<MeResponse>('/me', signal ? { signal } : {});
}

/**
 * Ends the session.
 *
 * POST rather than GET, because a prefetcher or an antivirus proxy will happily
 * fire a GET and signing people out at random is a hard bug to see.
 */
export function signOut(): Promise<void> {
  return api<void>('/auth/logout', { method: 'POST' });
}

/**
 * Where to send the browser to attach a provider to the account it is already
 * in.
 *
 * A navigation rather than a fetch, and a plain URL rather than a function that
 * performs one: the whole flow is two redirects through somebody else's site,
 * so there is nothing here for `fetch` to do. The server sets a short-lived
 * intent cookie on this route and reads it back in the callback.
 */
export function linkUrl(provider: 'steam' | 'discord'): string {
  return `/api/auth/${provider}/link`;
}

/**
 * Detaches one.
 *
 * Unreachable from the site today: linking is one-way, so `SettingsPage` draws
 * no button for this — see `UNLINKING_ENABLED` in the API, which refuses the
 * request as well. Kept because the endpoint is real and this is the one place
 * that knows its shape.
 */
export function unlinkProvider(provider: 'steam' | 'discord'): Promise<MeResponse> {
  return api<MeResponse>(`/auth/${provider}/unlink`, { method: 'POST' });
}
