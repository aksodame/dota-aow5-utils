import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import type { AuthResponse, MeResponse, PowChallenge, SignInBody, SignUpBody } from 'aow5-api-contract';
import { SESSION_TTL_SECONDS } from '../../core/db/sessions.ts';
import type { UserRow } from '../../core/db/users.ts';
import { ApiException } from '../http/api-error.ts';
import { AuthService, type AuthFailure, type AuthResult } from './auth.service.ts';
import { clearCookie, SESSION_COOKIE, sessionCookieOptions } from './cookies.ts';
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
  me(@CurrentUser() user: UserRow | undefined): MeResponse {
    return { user: user === undefined ? null : this.auth.me(user) };
  }

  /**
   * Hands out a proof-of-work challenge.
   *
   * Cheap to serve — sixteen random bytes and one HMAC — and one is needed per
   * sign-up attempt, so the budget is generous. It exists at all so that a
   * script cannot mint an unlimited supply to solve offline in parallel.
   */
  @Get('auth/challenge')
  @Throttle({ default: { ttl: 600_000, limit: 30 } })
  challenge(): PowChallenge {
    return this.auth.challenge();
  }

  /**
   * Five accounts an hour from one address.
   *
   * A person signs up once, ever. This is generous enough that a household or a
   * cafe never notices, and tight enough that the proof of work is the second
   * thing standing in the way of a script rather than the only one.
   */
  @Post('auth/register')
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  async register(@Body() body: SignUpBody, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    return this.finish(await this.auth.register(body?.nickname, body?.password, body?.pow), response);
  }

  /**
   * Ten attempts per ten minutes per address — room to mistype twice and still
   * get in. The per-account lockout in `core/auth/lockout.ts` is the other half
   * of this, and it is the half that sees an attacker spread across addresses.
   */
  @Post('auth/login')
  @Throttle({ default: { ttl: 600_000, limit: 10 } })
  async login(@Body() body: SignInBody, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    return this.finish(await this.auth.login(body?.nickname, body?.password), response);
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

  /** Sets the session cookie, or turns a failure into the code the site reads. */
  private finish(result: AuthResult, response: Response): AuthResponse {
    if (!result.ok) throw describe(result.failure, response);
    const { user, token, expiresAt } = result.signed;
    response.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.auth.secureCookies, expiresAt - nowSeconds()));
    return { user: this.auth.me(user) };
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * One failure shape per outcome, and the messages are for a network tab.
 *
 * The site switches on the code and shows its own translated copy, so nothing
 * here needs to read well in two languages — but nothing here may say more than
 * the code does either. In particular every proof-of-work failure collapses to
 * one answer: telling somebody which check they tripped only helps whoever is
 * probing, and an honest client's response is the same in all of them.
 */
function describe(failure: AuthFailure, response: Response): ApiException {
  switch (failure.kind) {
    case 'captcha':
      return new ApiException('CAPTCHA_FAILED', 'The challenge was missing, stale or already used.');
    case 'invalid-nickname':
      return new ApiException('VALIDATION_FAILED', 'That nickname will not do.', { nickname: failure.reason });
    case 'invalid-password':
      return new ApiException('VALIDATION_FAILED', 'That password will not do.', { password: failure.reason });
    case 'taken':
      return new ApiException('NICKNAME_TAKEN', 'That nickname is already in use.');
    case 'banned':
      return new ApiException('FORBIDDEN', 'That account is banned.');
    case 'locked': {
      // Same header the throttler sets, so the site has one thing to read
      // whichever limit it ran into.
      response.setHeader('Retry-After', String(failure.retryAfter));
      return new ApiException('RATE_LIMITED', `Too many attempts. Try again in ${failure.retryAfter} seconds.`);
    }
    case 'credentials':
      return new ApiException('INVALID_CREDENTIALS', 'Wrong nickname or password.');
  }
}
