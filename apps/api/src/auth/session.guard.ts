/**
 * Turns a cookie into a user, on every request.
 *
 * Attaches the result to the request rather than throwing, because most routes
 * are readable anonymously and only some require somebody. `AuthGuard` below is
 * the one that insists.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { parseCookies } from '../../core/http/cookies.ts';
import { resolveSession } from '../../core/db/sessions.ts';
import type { UserRow } from '../../core/db/users.ts';
import type { Db } from '../../core/db/open.ts';
import { DB } from '../db/tokens.ts';
import { ApiException } from '../http/api-error.ts';
import { SESSION_COOKIE } from './cookies.ts';

export interface AuthedRequest extends Request {
  user?: UserRow;
  sessionToken?: string;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE] ?? '';
    const user = resolveSession(this.db, token, Math.floor(Date.now() / 1000));
    if (user !== null) {
      request.user = user;
      request.sessionToken = token;
    }
    return true;
  }
}

/** For the routes where being nobody is not an option. */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (request.user === undefined) {
      throw new ApiException('UNAUTHENTICATED', 'Sign in to do that.');
    }
    return true;
  }
}
