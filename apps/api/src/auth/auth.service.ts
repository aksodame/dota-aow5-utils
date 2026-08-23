import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { MeUser, PublicUser } from 'aow5-api-contract';
import { MAX_BUILDS_PER_USER } from 'aow5-api-contract';
import { countBuildsFor } from '../../core/db/builds.ts';
import type { Db } from '../../core/db/open.ts';
import { createSession, deleteSession } from '../../core/db/sessions.ts';
import {
  hasPlaceholderProfile,
  profileIsStale,
  toPublicUser,
  upsertUserFromSteam,
  type UserRow,
} from '../../core/db/users.ts';
import { buildLoginUrl, isSafeReturnPath, parseReturn, STEAM_LOGIN_ENDPOINT } from '../../core/steam/openid.ts';
import { checkAuthentication, fetchProfile, lookupProfile } from '../../core/steam/profile.ts';
import { DB } from '../db/tokens.ts';
import { loadConfig, type AppConfig } from '../config.ts';

/** What the login cookie carries across the round trip to Steam. */
export interface OidcState {
  n: string;
  r: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('auth');
  private readonly config: AppConfig = loadConfig();

  constructor(@Inject(DB) private readonly db: Db) {}

  get secureCookies(): boolean {
    return this.config.siteOrigin.startsWith('https://');
  }

  /**
   * Starts a sign-in.
   *
   * The return path is validated here and stored in a cookie rather than sent
   * through Steam, so the only thing that crosses the network is a nonce. An
   * open redirect is the one real vulnerability in this flow.
   */
  beginLogin(returnPath: string | undefined): { url: string; state: string } {
    const safe = returnPath !== undefined && isSafeReturnPath(returnPath) ? returnPath : '/';
    const nonce = randomBytes(16).toString('base64url');
    const state: OidcState = { n: nonce, r: safe };
    return {
      url: buildLoginUrl(this.config.siteOrigin, nonce),
      state: Buffer.from(JSON.stringify(state), 'utf8').toString('base64url'),
    };
  }

  static readState(raw: string | undefined): OidcState | null {
    if (raw === undefined || raw === '') return null;
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return null;
      const { n, r } = parsed as Partial<OidcState>;
      if (typeof n !== 'string' || typeof r !== 'string') return null;
      // Re-validated on the way back in as well as on the way out: the cookie
      // is attacker-writable in a way the signed return_to is not.
      return isSafeReturnPath(r) ? { n, r } : { n, r: '/' };
    } catch {
      return null;
    }
  }

  /**
   * Finishes a sign-in.
   *
   * Returns null for every failure, because the redirect target is the same in
   * all of them and telling a browser which check it failed helps nobody but
   * whoever is probing.
   */
  async completeLogin(
    query: URLSearchParams,
    state: OidcState,
  ): Promise<{ token: string; expiresAt: number; returnPath: string } | null> {
    const parsed = parseReturn(query, { siteOrigin: this.config.siteOrigin, expectedNonce: state.n });
    if (!parsed.ok) {
      this.logger.warn(`sign-in rejected: ${parsed.reason}`);
      return null;
    }

    // The step that makes everything above it mean anything.
    if (!(await checkAuthentication(STEAM_LOGIN_ENDPOINT, parsed.verification))) {
      this.logger.warn('sign-in rejected: Steam did not verify its own signature');
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const { profile, source } = await lookupProfile(parsed.steamId, this.config.steamApiKey);
    if (profile === null) {
      // Signing in anyway is deliberate; Steam having a bad day is not a reason
      // to turn somebody away. The warning is here so the placeholder name they
      // are about to see is explainable rather than a mystery.
      this.logger.warn(`no profile for ${parsed.steamId} from either source; signing in with a placeholder name`);
    } else if (source === 'community') {
      this.logger.log(
        this.config.steamApiKey === ''
          ? 'STEAM_API_KEY is not set; read the name and avatar from the public community profile instead'
          : 'the Steam Web API did not answer; fell back to the public community profile',
      );
    }

    const user = upsertUserFromSteam(this.db, parsed.steamId, profile, now);
    const session = createSession(this.db, user.id, now);
    return { ...session, returnPath: state.r };
  }

/**
   * Brings a stale profile up to date, returning the user as it now stands.
   *
   * Callers await this only when the stored name is one we invented — a wrong
   * name in the header is worth a round trip to fix now, whereas a week-old
   * avatar is not.
   */
  async refreshIfStale(user: UserRow): Promise<UserRow> {
    const now = Math.floor(Date.now() / 1000);
    if (!profileIsStale(user, now)) return user;
    const profile = await fetchProfile(user.steamId, this.config.steamApiKey);
    if (profile === null) return user;
    return upsertUserFromSteam(this.db, user.steamId, profile, now);
  }

  /** Whether the viewer is still showing a name this server made up. */
  needsProfileNow(user: UserRow): boolean {
    return hasPlaceholderProfile(user);
  }

  logout(token: string): void {
    deleteSession(this.db, token);
  }

  me(user: UserRow): MeUser {
    const base: PublicUser = toPublicUser(user);
    return {
      ...base,
      buildCount: countBuildsFor(this.db, user.id),
      buildLimit: MAX_BUILDS_PER_USER,
      isAdmin: user.role === 'admin',
    };
  }

  redirectTo(path: string): string {
    return `${this.config.siteOrigin}${path}`;
  }
}
