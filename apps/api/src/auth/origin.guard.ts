/**
 * The second half of the CSRF argument.
 *
 * `SameSite=Lax` already stops a cross-site form or fetch from carrying the
 * session cookie, so this is defence in depth rather than the defence — but it
 * is four lines, it costs nothing, and it closes the gap if a future browser
 * ever loosens Lax.
 *
 * A missing Origin is allowed: it is what a same-origin GET and every curl
 * request look like, and this only ever runs on mutating routes where Lax has
 * already done the work.
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../http/api-error.ts';
import { loadConfig } from '../config.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly siteOrigin = loadConfig().siteOrigin;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined && origin !== this.siteOrigin) {
      throw new ApiException('FORBIDDEN', 'Cross-site request refused.');
    }
    return true;
  }
}
