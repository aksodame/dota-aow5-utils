import { Body, Controller, Get, Logger, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard as PassportGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { parseCookies } from '../../core/http/cookies.ts';
import type { AuthProvidersResponse, MeResponse, PowChallenge, SignUpBody } from 'aow5-api-contract';
import type { ProviderProfile } from '../../core/db/identities.ts';
import { SESSION_TTL_SECONDS } from '../../core/db/sessions.ts';
import type { UserRow } from '../../core/db/users.ts';
import { AuthService, type Signed } from './auth.service.ts';
import {
  clearCookie,
  LINK_COOKIE,
  linkCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './cookies.ts';
import { CurrentUser } from './current-user.decorator.ts';
import { DiscordEnabledGuard } from './provider-enabled.guard.ts';
import { AuthGuard, type AuthedRequest } from './session.guard.ts';

/**
 * Three doors, one session.
 *
 * Local is the default and the only one that takes a request body; Steam and
 * Discord are two redirects each. Whichever door somebody comes through, they
 * leave here with the same cookie against the same `sessions` table — Passport
 * authenticates and then gets out of the way, which is why `session: false` is
 * on every strategy and `passport.session()` is installed nowhere.
 *
 * The provider routes are guarded by Passport's own `AuthGuard`, which calls
 * the strategy twice: once with no assertion in the query, where the strategy
 * redirects to the provider, and once on the way back. That is why `start` and
 * `complete` look asymmetric — only the second one ever runs a body.
 */
@Controller()
export class AuthController {
  /** For the failures that end in a redirect, which say nothing to the browser. */
  private readonly logger = new Logger('auth');

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

  /** Which doors this deployment actually has, so the form can draw them. */
  @Get('auth/providers')
  providers(): AuthProvidersResponse {
    return { available: this.auth.providers() };
  }

  /**
   * A proof-of-work challenge for the sign-up form.
   *
   * Cheap to issue and signed rather than stored, so handing them out costs
   * nothing — which is what lets this be unauthenticated without becoming a way
   * to fill a table.
   */
  @Get('auth/challenge')
  @Throttle({ default: { ttl: 600_000, limit: 60 } })
  challenge(): PowChallenge {
    return this.auth.challenge();
  }

  /**
   * Opens a local account.
   *
   * Rate limited hard on top of the proof of work: the two defend different
   * things, since the proof makes each attempt cost CPU and the limit stops one
   * address spending it in a burst.
   */
  @Post('auth/signup')
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  async signUp(@Body() body: SignUpBody, @Res() response: Response): Promise<void> {
    const signed = await this.auth.signUp(body?.nickname, body?.password, body?.pow);
    this.setCookie(response, signed);
    response.status(201).json({ user: this.auth.me(signed.user) });
  }

  /**
   * Signs in with a nickname and a password.
   *
   * The lockout curve lives in the strategy, on the account being attacked,
   * because a rate limiter can only see addresses — and a botnet with ten
   * thousand of them gets the per-address budget ten thousand times over
   * against one account. This limit is the other half of the pair.
   */
  @Post('auth/login')
  @UseGuards(PassportGuard('local'))
  @Throttle({ default: { ttl: 600_000, limit: 20 } })
  login(@Req() request: Request, @Res() response: Response): void {
    const signed = this.auth.issue(request.user as UserRow);
    this.setCookie(response, signed);
    response.status(200).json({ user: this.auth.me(signed.user) });
  }

  /**
   * Starts a sign-in by bouncing the visitor to Steam.
   *
   * A 302 rather than JSON with a URL in it, so the site's button can be a
   * plain link: no fetch, no CORS, and it survives being middle-clicked. The
   * redirect itself comes from the strategy, which is why this body is empty.
   */
  @Get('auth/steam')
  @UseGuards(PassportGuard('steam'))
  @Throttle({ default: { ttl: 600_000, limit: 30 } })
  steam(): void {
    /* The guard redirects; nothing here ever runs. */
  }

  /**
   * Where Steam sends people back.
   *
   * Ends in a redirect rather than a JSON response, because the browser arrived
   * by navigation and there is nothing on the other end to read a body. A
   * failure goes to the same place carrying `?auth=failed`.
   */
  @Get('auth/steam/return')
  @UseGuards(PassportGuard('steam'))
  @Throttle({ default: { ttl: 600_000, limit: 30 } })
  steamReturn(@Req() request: Request, @Res() response: Response): void {
    this.finishProvider(request, response);
  }

  /*
   * The enabled guard first, so a deployment with no Discord application
   * answers 404 rather than the 500 that asking Passport for an unregistered
   * strategy produces. Guards run in declaration order.
   */
  @Get('auth/discord')
  @UseGuards(DiscordEnabledGuard, PassportGuard('discord'))
  @Throttle({ default: { ttl: 600_000, limit: 30 } })
  discord(): void {
    /* The guard redirects; nothing here ever runs. */
  }

  @Get('auth/discord/return')
  @UseGuards(DiscordEnabledGuard, PassportGuard('discord'))
  @Throttle({ default: { ttl: 600_000, limit: 30 } })
  discordReturn(@Req() request: Request, @Res() response: Response): void {
    this.finishProvider(request, response);
  }

  /**
   * Starts a *link* rather than a sign-in.
   *
   * A route of its own rather than a query parameter on the two above, because
   * Passport's guard redirects from inside `canActivate` — a handler behind it
   * never runs, so there is nowhere left to set the cookie. This sets the
   * intent and bounces to the ordinary start route: one extra 302, and no
   * branch inside either strategy.
   */
  @Get('auth/:provider/link')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 600_000, limit: 30 } })
  startLink(@Param('provider') provider: string, @Req() request: AuthedRequest, @Res() response: Response): void {
    if (provider !== 'steam' && provider !== 'discord') {
      response.redirect(302, this.auth.settingsUrl('failed'));
      return;
    }
    if (provider === 'discord' && !this.auth.providers().includes('discord')) {
      response.redirect(302, this.auth.settingsUrl('unavailable'));
      return;
    }

    response.cookie(
      LINK_COOKIE,
      this.auth.linkIntent(request.sessionToken ?? ''),
      linkCookieOptions(this.auth.secureCookies),
    );
    response.redirect(302, `/api/auth/${provider}`);
  }

  /** Removes a link. POST for the same reason logout is — see below. */
  @Post('auth/:provider/unlink')
  @UseGuards(AuthGuard)
  unlink(@Param('provider') provider: string, @Req() request: AuthedRequest): MeResponse {
    return { user: this.auth.unlink(request.user as UserRow, provider) };
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

  /**
   * The shared tail of both provider callbacks.
   *
   * A ban is the one failure worth naming in the URL: an account whose sign-in
   * merely "did not work" produces a support email and a second account, which
   * is the opposite of what banning was for.
   */
  private finishProvider(request: Request, response: Response): void {
    const authed = request as AuthedRequest;
    const intent = parseCookies(request.headers.cookie)[LINK_COOKIE];

    // Spent either way: an intent left behind would turn the next ordinary
    // sign-in through that provider into a link nobody asked for.
    if (intent !== undefined) {
      clearCookie(response, LINK_COOKIE, linkCookieOptions(this.auth.secureCookies));
    }

    /*
     * A link, when the cookie belongs to the session presenting it. Everything
     * else — no cookie, a stale one, a signed-out browser — is the sign-in this
     * route has always been.
     *
     * **`sessionUser`, not `user`.** Passport has already assigned the provider
     * profile to `request.user` by the time this runs, so reading `user` here
     * handed `link` a profile in place of the account it was meant to attach it
     * to — an object with no `id`, which meant a fresh link died on a NOT NULL
     * constraint (a 500, and no redirect to say so) and a re-link of an account
     * you already owned came back as "taken".
     */
    const session = authed.sessionUser;
    if (this.auth.intentMatches(intent, authed.sessionToken) && session !== undefined) {
      /*
       * Every outcome is a redirect, including the ones nobody planned for.
       *
       * The browser arrived here by navigation, so an exception escaping this
       * handler is a framework error page where the settings screen should be —
       * which is exactly how the `user`/`sessionUser` mix-up above stayed
       * invisible: it threw on a constraint, and all anybody saw was a link
       * that did not happen.
       */
      try {
        const result = this.auth.link(session, request.user as ProviderProfile);
        response.redirect(302, this.auth.settingsUrl(result.ok ? 'linked' : result.reason));
      } catch (error) {
        this.logger.error(`link failed for user ${session.id}: ${String(error)}`);
        response.redirect(302, this.auth.settingsUrl('failed'));
      }
      return;
    }

    try {
      const signed = this.auth.issueForProvider(request.user as ProviderProfile);
      this.setCookie(response, signed);
      response.redirect(302, this.auth.returnUrl());
    } catch (error) {
      const banned = error instanceof Error && error.message.includes('banned');
      response.redirect(302, this.auth.failureUrl(banned ? 'banned' : 'failed'));
    }
  }

  private setCookie(response: Response, signed: Signed): void {
    const ttl = signed.expiresAt - Math.floor(Date.now() / 1000);
    response.cookie(SESSION_COOKIE, signed.token, sessionCookieOptions(this.auth.secureCookies, ttl));
  }
}
