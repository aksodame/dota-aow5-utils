import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { Injectable, type ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthedRequest } from './auth/session.guard.ts';
import { ApiException } from './http/api-error.ts';

/**
 * Two buckets, because one is always wrong for somebody.
 *
 * Keyed by IP, a household or a campus behind one NAT shares a budget, and a
 * signed-in regular gets throttled by a stranger. Keyed by user, anonymous
 * traffic — which is most of it — has no key at all. So authenticated requests
 * are counted per account and anonymous ones per address.
 *
 * In-memory storage, which is correct for a single instance. A Redis store
 * would be a dependency bought to solve a problem this deployment does not
 * have; if it ever runs on two nodes, that is when it earns its place.
 */
@Injectable()
export class ScopedThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as unknown as AuthedRequest).user;
    if (user !== undefined) return `u:${user.id}`;
    // `req.ip` is only meaningful because main.ts sets `trust proxy` — every
    // request arrives from Caddy, and without it every client shares one bucket.
    return `ip:${String((req as { ip?: string }).ip ?? 'unknown')}`;
  }

  /**
   * The library's own exception is `{statusCode, message}`, which the
   * catch-all filter can only read as a generic 400-shaped body — so a 429
   * reached the site labelled BAD_REQUEST while `RATE_LIMITED` sat unused in
   * the contract. Throwing an ApiException here is what makes the one code the
   * site switches on the one it actually receives.
   *
   * `Retry-After` is set again rather than left to the library: with a second
   * named throttler the library emits `Retry-After-global`, which no client
   * has ever heard of. One canonical header, in seconds, whichever bucket
   * tripped.
   */
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const seconds = Math.max(1, Math.ceil(detail.timeToBlockExpire));
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(seconds));
    throw new ApiException('RATE_LIMITED', `Too many requests. Try again in ${describe(seconds)}.`);
  }
}

/** For a sentence a visitor reads, not a field a script parses. */
function describe(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Nest keys each bucket by handler, so `default` is a floor *per route* — a
 * client that walks ten endpoints gets ten times the budget, and every
 * `@Throttle` on a route only ever raises its own ceiling. `global` is the one
 * that cannot be widened from a controller: its key deliberately drops the
 * handler, so every request a caller makes lands in the same bucket.
 *
 * Ordered floor-then-ceiling for readability only; the guard sorts by ttl and
 * evaluates all of them regardless.
 */
export const THROTTLE_DEFAULTS: ThrottlerModuleOptions = [
  /** The floor. Anything heavier than a read declares its own on the route. */
  { name: 'default', ttl: 60_000, limit: 120 },
  {
    name: 'global',
    ttl: 60_000,
    limit: 300,
    // The tracker is this server's own `u:`/`ip:` string, so it is short and
    // safe to use unhashed — unlike the library's key, which mixes in a
    // handler name and hashes the result.
    generateKey: (_context, tracker) => `global:${tracker}`,
    // Headers describe the per-route budget, which is the one a caller can do
    // anything about. A second X-RateLimit set for a bucket nobody can see is
    // noise.
    setHeaders: false,
  },
];
