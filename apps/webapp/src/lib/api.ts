import type { ApiError, ApiErrorCode } from 'aow5-api-contract';

/**
 * Talking to the API.
 *
 * Same origin — Caddy serves this bundle and proxies `/api` to the server, and
 * `vite.config.ts` does the same in development — so there is no base URL to
 * configure, no CORS preflight, and the session cookie is an ordinary
 * first-party cookie that the browser attaches on its own.
 *
 * No data-fetching library. The router on this site is fifteen lines because
 * the bundle being small is the argument; a cache layer would have to earn the
 * same way, and three screens of builds do not need one.
 */

/**
 * A failure the API described, as opposed to the network falling over.
 *
 * Fields are declared and assigned rather than written as constructor
 * parameter properties: this package keeps `erasableSyntaxOnly`, because
 * anything Node cannot strip cannot be run by `node --test`.
 */
export class ApiFailure extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;

  constructor(code: ApiErrorCode, message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiFailure';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const response = await fetch(`/api${path}`, {
    method,
    // The cookie is httpOnly and same-origin; this is what tells fetch to send
    // it at all.
    credentials: 'same-origin',
    ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const described = (payload as ApiError | null)?.error;
    throw new ApiFailure(
      described?.code ?? 'INTERNAL',
      described?.message ?? `Request failed (${response.status})`,
      response.status,
      described?.fields,
    );
  }

  return payload as T;
}
