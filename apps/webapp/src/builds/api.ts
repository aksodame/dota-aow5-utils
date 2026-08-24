import type {
  CreateBuildBody,
  BuildDetail,
  BuildSort,
  BuildSummary,
  Page,
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
  hero?: string;
  sort?: BuildSort;
  cursor?: string;
  /** Rows per page. A request: the server clamps it to `PAGE_SIZE`. */
  limit?: number;
}

export function browseBuilds(query: BrowseQuery, signal?: AbortSignal): Promise<Page<BuildSummary>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const suffix = params.toString();
  return api<Page<BuildSummary>>(`/builds${suffix === '' ? '' : `?${suffix}`}`, signal ? { signal } : {});
}
