import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-strategy';
import type { Request } from 'express';
import {
  STEAM_OPENID_ENDPOINT,
  buildAuthUrl,
  buildVerificationBody,
  isVerified,
  profileXmlUrl,
  readProfile,
  readProfileXml,
  steamIdFromClaim,
  type PlayerSummary,
  type SteamProfile,
} from '../../../core/auth/steam.ts';
import type { ProviderProfile } from '../../../core/db/identities.ts';
import { loadConfig, type AppConfig } from '../../config.ts';

/**
 * Steam, as a Passport strategy over this project's own OpenID code.
 *
 * **Deliberately not `passport-steam`.** That package delegates to `openid`,
 * which is unmaintained and drags a request-era dependency tree behind it —
 * and this repository already has the whole flow as sixty lines of pure,
 * tested functions in `core/auth/steam.ts`, including the `check_authentication`
 * echo-back that is the only thing standing between a hand-typed callback and
 * somebody else's account. Swapping tested code for an abandoned dependency is
 * not what "use Passport" was asking for. A Passport strategy is a class with
 * an `authenticate` method; this is that class, and the security argument stays
 * where it was.
 *
 * Two passes through one method, which is how OpenID 2.0 works: no assertion in
 * the query means "start", and a `openid.mode=id_res` means "come back". Both
 * end in `redirect` or `success`, never in a thrown error, because the browser
 * arrived here by navigation and there is nothing on the other end to read a
 * body.
 */
@Injectable()
export class SteamStrategy extends PassportStrategy(Strategy, 'steam') {
  private readonly logger = new Logger('auth:steam');
  private readonly config: AppConfig = loadConfig();

  /** Without the verification there is no sign-in; without the profile there is a name. */
  private static readonly VERIFY_TIMEOUT_MS = 10_000;
  private static readonly PROFILE_TIMEOUT_MS = 5_000;

  /**
   * The identity, because there is nothing left to do.
   *
   * `PassportStrategy` requires this hook, and for a username/password or an
   * OAuth2 strategy it is where the provider's answer becomes an application
   * user. Here `authenticate` below already built the profile — it had to, the
   * OpenID round trip is the whole strategy — so this passes it through rather
   * than pretending there is a second step.
   */
  validate(profile: ProviderProfile): ProviderProfile {
    return profile;
  }

  authenticate(request: Request): void {
    const query = request.query as Record<string, string | undefined>;

    if (query['openid.mode'] === undefined) {
      this.redirect(buildAuthUrl(this.returnTo(), `${this.origin()}/`));
      return;
    }

    void this.complete(query);
  }

  private async complete(query: Record<string, string | undefined>): Promise<void> {
    try {
      /*
       * The order is the whole security argument: nothing in `query` is
       * believed until Steam has vouched for the assertion as a whole, and the
       * claimed id is only parsed *after* that — so a callback naming somebody
       * else's SteamID fails at the network step rather than at a string
       * comparison we might have got wrong.
       */
      const body = buildVerificationBody(query);
      if (body === null) {
        this.fail(400);
        return;
      }

      const response = await fetch(STEAM_OPENID_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(SteamStrategy.VERIFY_TIMEOUT_MS),
      });
      if (!response.ok || !isVerified(await response.text())) {
        this.fail(401);
        return;
      }

      const steamId = steamIdFromClaim(query['openid.claimed_id']);
      if (steamId === null) {
        this.fail(401);
        return;
      }

      const profile = await this.profile(steamId);
      this.success({
        provider: 'steam',
        providerId: steamId,
        nickname: profile.persona,
        avatar: profile.avatar,
      } satisfies ProviderProfile);
    } catch (error) {
      this.logger.warn(`steam sign-in failed: ${String(error)}`);
      this.fail(502);
    }
  }

  /**
   * The display name and avatar, by whichever route this deployment has.
   *
   * Not part of establishing who somebody is — OpenID has already done that —
   * so every failure here is a sign-in with a name derived from the SteamID
   * rather than no sign-in at all.
   *
   * **Two routes, and the keyless one matters.** With `STEAM_API_KEY` set this
   * asks the documented Web API. Without one it reads the public community
   * profile, which has carried the same two fields since before that API
   * existed. The old behaviour — skip straight to `Player 801668` and no
   * picture — made an unconfigured deployment look like a broken sign-in, and
   * the setting it was missing was mentioned nowhere the person signing in
   * could see.
   */
  private async profile(steamId: string): Promise<SteamProfile> {
    const summary = await this.summary(steamId);
    if (summary !== undefined) return readProfile(summary, steamId);

    const fromXml = await this.publicProfile(steamId);
    return fromXml ?? readProfile(undefined, steamId);
  }

  /** The community profile, which needs no key. Undefined when it is private. */
  private async publicProfile(steamId: string): Promise<SteamProfile | undefined> {
    try {
      const response = await fetch(profileXmlUrl(steamId), {
        headers: { accept: 'text/xml' },
        signal: AbortSignal.timeout(SteamStrategy.PROFILE_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      return readProfileXml(await response.text(), steamId);
    } catch {
      return undefined;
    }
  }

  /**
   * The keyed route: one call to `GetPlayerSummaries`, made *after* OpenID has
   * already established who somebody is.
   */
  private async summary(steamId: string): Promise<PlayerSummary | undefined> {
    const key = this.config.steamApiKey;
    if (key === null) return undefined;

    try {
      const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
      url.searchParams.set('key', key);
      url.searchParams.set('steamids', steamId);
      const response = await fetch(url, { signal: AbortSignal.timeout(SteamStrategy.PROFILE_TIMEOUT_MS) });
      if (!response.ok) return undefined;
      const payload = (await response.json()) as { response?: { players?: PlayerSummary[] } };
      return payload.response?.players?.[0];
    } catch {
      return undefined;
    }
  }

  private origin(): string {
    return this.config.siteOrigin.replace(/\/+$/, '');
  }

  private returnTo(): string {
    return `${this.origin()}/api/auth/steam/return`;
  }
}
