import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type StrategyOptions } from 'passport-oauth2';
import type { ProviderProfile } from '../../../core/db/identities.ts';
import { loadConfig } from '../../config.ts';

/**
 * Discord, over the generic OAuth2 strategy.
 *
 * **Deliberately not `passport-discord`.** That package is a thin subclass of
 * this one whose only additions are the two endpoint URLs and a profile fetch —
 * both of which are below — and it has not been released in years. The endpoint
 * URLs are the kind of thing a dependency should not be carrying on your
 * behalf, since they are the part you need to be able to read.
 *
 * `identify` scope and nothing else. The site needs a name, an avatar and a
 * stable id; it has no use for an email address, and asking for one would mean
 * holding a personal detail with no feature behind it. It also sidesteps the
 * temptation to match incoming accounts to existing ones by email, which is how
 * accounts get taken over — see the note on `identities`.
 */
const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const ME_URL = 'https://discord.com/api/v10/users/@me';

/** Discord's own shape for `/users/@me`, narrowed to what is used. */
interface DiscordUser {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  avatar?: unknown;
}

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor() {
    const config = loadConfig();
    const origin = config.siteOrigin.replace(/\/+$/, '');
    /*
     * Only constructed when the deployment has keys — see `AuthModule`, which
     * leaves this provider out entirely otherwise. The empty strings are
     * unreachable and exist because the option type demands strings; a deploy
     * without keys never gets this far.
     */
    super({
      authorizationURL: AUTHORIZE_URL,
      tokenURL: TOKEN_URL,
      clientID: config.discord?.clientId ?? '',
      clientSecret: config.discord?.clientSecret ?? '',
      callbackURL: `${origin}/api/auth/discord/return`,
      scope: ['identify'],
      // No `session` option here: it belongs to `authenticate`, and
      // `PassportModule.register({ session: false })` already sets it for every
      // strategy. Passing it to the constructor is silently ignored by
      // passport-oauth2 and rejected by its types, which is the better of the
      // two outcomes.
    } satisfies StrategyOptions);
  }

  /**
   * The profile, fetched here rather than left to the base strategy.
   *
   * `passport-oauth2` has no idea what a Discord user looks like, so the token
   * is spent on one call to `/users/@me` and reduced to the three fields this
   * site stores. Nothing else about the token is kept: it is not written to the
   * database and there is no refresh flow, because the site never acts on
   * somebody's behalf at Discord — it only wanted to know who they are.
   */
  async userProfile(accessToken: string, done: (error: unknown, profile?: unknown) => void): Promise<void> {
    try {
      const response = await fetch(ME_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        done(new Error(`discord /users/@me answered ${response.status}`));
        return;
      }
      done(null, (await response.json()) as DiscordUser);
    } catch (error) {
      done(error);
    }
  }

  validate(_accessToken: string, _refreshToken: string, profile: DiscordUser): ProviderProfile {
    const id = typeof profile.id === 'string' ? profile.id : '';
    if (id === '') throw new Error('discord profile has no id');

    // `global_name` is the display name Discord moved to; `username` is the
    // older handle and is still what accounts that never migrated have.
    const nickname =
      (typeof profile.global_name === 'string' && profile.global_name.trim() !== ''
        ? profile.global_name
        : typeof profile.username === 'string'
          ? profile.username
          : '') || `discord-${id.slice(-6)}`;

    return {
      provider: 'discord',
      providerId: id,
      nickname,
      // The CDN path is built rather than taken from the payload, which only
      // carries the hash. `.png` at 128, matching the size Steam's `avatarfull`
      // lands at, so one `<img>` rule fits both.
      avatar: typeof profile.avatar === 'string' && profile.avatar !== ''
        ? `https://cdn.discordapp.com/avatars/${id}/${profile.avatar}.png?size=128`
        : '',
    };
  }
}
