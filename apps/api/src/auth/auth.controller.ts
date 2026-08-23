import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import type { MeResponse } from 'aow5-api-contract';
import { parseCookies } from '../../core/http/cookies.ts';
import { SESSION_TTL_SECONDS } from '../../core/db/sessions.ts';
import type { UserRow } from '../../core/db/users.ts';
import { AuthService } from './auth.service.ts';
import { clearCookie, OIDC_COOKIE, oidcCookieOptions, SESSION_COOKIE, sessionCookieOptions } from './cookies.ts';
import { CurrentUser } from './current-user.decorator.ts';
import { AuthGuard, type AuthedRequest } from './session.guard.ts';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Answered with 200 and a null user when nobody is signed in, never 401 —
   * "nobody is logged in" is a normal answer, and a 401 on every anonymous page
   * load teaches everyone to ignore 401s.
   */
  @Get('me')
  async me(@CurrentUser() user: UserRow | undefined): Promise<MeResponse> {
    if (user === undefined) return { user: null };

    // Awaited only when the stored name is one this server invented — which is
    // what a first sign-in leaves behind when Steam could not be reached. Every
    // other refresh is a week-old avatar and is not worth delaying a page load
    // for, so it runs unawaited.
    if (this.auth.needsProfileNow(user)) {
      return { user: this.auth.me(await this.auth.refreshIfStale(user)) };
    }

    void this.auth.refreshIfStale(user);
    return { user: this.auth.me(user) };
  }

  /**
   * A person clicks this once and leaves for Steam, so twenty in ten minutes
   * is far past anything a browser does. The budget is here because this is
   * the front door of the only flow that spends anything off this box — see
   * the return leg below.
   */
  @Get('auth/steam/login')
  @Throttle({ default: { ttl: 600_000, limit: 20 } })
  login(@Query('return') returnPath: string | undefined, @Res() response: Response): void {
    const { url, state } = this.auth.beginLogin(returnPath);
    response.cookie(OIDC_COOKIE, state, oidcCookieOptions(this.auth.secureCookies));
    response.redirect(url);
  }

  /**
   * Throttled harder than its cost suggests. A request that clears the state
   * cookie talks to Steam twice — an OpenID verification and a profile read —
   * so an unbounded one of these is this server hammering somebody else's API
   * on a stranger's behalf, and the key it burns is ours.
   */
  @Get('auth/steam/return')
  @Throttle({ default: { ttl: 600_000, limit: 20 } })
  async complete(@Req() request: Request, @Res() response: Response): Promise<void> {
    const secure = this.auth.secureCookies;
    const oidc = oidcCookieOptions(secure);
    const state = AuthService.readState(parseCookies(request.headers.cookie)[OIDC_COOKIE]);
    clearCookie(response, OIDC_COOKIE, oidc);

    if (state === null) {
      // Almost always a stale tab or a ten-minute-old cookie rather than an
      // attack, so it lands the visitor back on the site rather than on an error.
      response.redirect(this.auth.redirectTo('/?signin=expired'));
      return;
    }

    const query = new URLSearchParams(request.url.slice(request.url.indexOf('?') + 1));
    const result = await this.auth.completeLogin(query, state);
    if (result === null) {
      response.redirect(this.auth.redirectTo('/?signin=failed'));
      return;
    }

    response.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(secure, SESSION_TTL_SECONDS));
    response.redirect(this.auth.redirectTo(result.returnPath));
  }

  /**
   * POST, not GET. A link prefetcher, an antivirus proxy or an `<img>` tag will
   * happily fire a GET, and signing people out at random is a hard bug to see.
   */
  @Post('auth/logout')
  @UseGuards(AuthGuard)
  logout(@Req() request: AuthedRequest, @Res() response: Response): void {
    if (request.sessionToken !== undefined) this.auth.logout(request.sessionToken);
    clearCookie(response, SESSION_COOKIE, sessionCookieOptions(this.auth.secureCookies, SESSION_TTL_SECONDS));
    response.status(204).end();
  }
}
