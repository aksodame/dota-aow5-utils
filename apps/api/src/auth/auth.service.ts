import { Inject, Injectable } from '@nestjs/common';
import type { AuthProvider, MeUser, PowChallenge, PowSolution } from 'aow5-api-contract';
import { MAX_PASSWORD, MIN_PASSWORD } from 'aow5-api-contract';
import { countBuildsFor } from '../../core/db/builds.ts';
import { checkNickname } from '../../core/auth/nickname.ts';
import { hashPassword } from '../../core/auth/password.ts';
import { PowKeeper } from '../../core/auth/pow.ts';
import type { Db } from '../../core/db/open.ts';
import {
  linkIdentity,
  listIdentities,
  profilesOf,
  signInWithProvider,
  unlinkIdentity,
  type ExternalProvider,
  type ProviderProfile,
} from '../../core/db/identities.ts';
import { createSession, deleteSession, hashToken } from '../../core/db/sessions.ts';
import { buildLimitFor, createLocalUser, nicknameTaken, toPublicUser, type UserRow } from '../../core/db/users.ts';
import { DB } from '../db/tokens.ts';
import { ApiException } from '../http/api-error.ts';
import { loadConfig, type AppConfig } from '../config.ts';

/**
 * Whether a linked provider may be detached again. It may not.
 *
 * **A link is one-way on purpose.** Linking is what makes an account verified,
 * and verified is what lets its comments go up without a moderator reading them
 * first — so an account that could unlink at will could take the badge, spend
 * it, and hand the same Steam account to the next account it opened. `identities`
 * has one row per provider account, and that row is the thing standing between
 * one person and five verified profiles; releasing it releases that guarantee.
 *
 * The machinery below is kept whole rather than deleted: `unlinkIdentity` is
 * tested, it already refuses to remove the last way into an account, and a
 * moderator-facing "detach this" is the obvious next use for it. This flag is
 * the only thing between it and the endpoint, so turning linking back into
 * something reversible is one line here and one button in the site.
 */
const UNLINKING_ENABLED = false;

/** What a completed sign-in comes back with. */
export interface Signed {
  user: UserRow;
  token: string;
  expiresAt: number;
}

/**
 * Sign-in, sign-up, and the session that follows either.
 *
 * **Passport does the authenticating; this does everything after.** The three
 * strategies each answer one question — is this password right, did Steam
 * vouch, did Discord vouch — and hand back either a user or a provider
 * profile. What that means for this site is here: opening an account, refusing
 * a banned one, and minting the cookie.
 *
 * The session is unchanged by the move to Passport. `passport.session()` and
 * `express-session` are both unused: this application stores the SHA-256 of
 * each cookie in a `sessions` table, so a leaked backup is a list of hashes
 * rather than a set of live logins, and there is no reason to give that up for
 * a serialiser pair.
 */
@Injectable()
export class AuthService {
  /**
   * Holds the signing key and the set of salts already spent.
   *
   * In memory, and deliberately: a challenge lives ten minutes, so a restart
   * costs whoever is mid-sign-up one retry — against a table, an index and a
   * sweep job for the alternative.
   */
  private readonly pow = new PowKeeper();
  private readonly config: AppConfig = loadConfig();

  constructor(@Inject(DB) private readonly db: Db) {}

  get secureCookies(): boolean {
    return this.config.siteOrigin.startsWith('https://');
  }

  /**
   * Which doors this deployment has.
   *
   * `local` always; the others only where the deploy has the keys for them.
   * The sign-in screen reads this rather than hard-coding three buttons, so a
   * deployment without a Discord application does not offer a button that can
   * only fail.
   */
  providers(): AuthProvider[] {
    const available: AuthProvider[] = ['local', 'steam'];
    if (this.config.discord !== null) available.push('discord');
    return available;
  }

  /** A challenge for the sign-up form. Signed, not stored — see `pow.ts`. */
  challenge(): PowChallenge {
    return this.pow.issue(nowSeconds());
  }

  /**
   * Opens a local account.
   *
   * The proof of work is checked *first*, before the nickname is even looked
   * at: it is the only thing standing between this endpoint and a script, and
   * checking it last would mean every junk request still cost a database read
   * and a scrypt.
   */
  async signUp(nickname: unknown, password: unknown, pow: PowSolution | undefined): Promise<Signed> {
    const now = nowSeconds();

    /*
     * Every reason collapses to one message. Telling somebody *which* check
     * their proof failed only helps whoever is probing the endpoint; the
     * honest answer for a person is "that expired, here is another one".
     */
    if (pow === undefined || !this.pow.verify(pow, now).ok) {
      throw new ApiException('VALIDATION_FAILED', 'That sign-up could not be verified. Try again.', {
        pow: 'Expired or already used.',
      });
    }

    const name = checkNickname(nickname);
    if (!name.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', { nickname: name.error });

    const secret = checkPassword(password);
    if (!secret.ok) throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', { password: secret.error });

    /*
     * Checked here for a decent message, and enforced by the unique index
     * underneath — the read and the insert are not in one transaction, so two
     * sign-ups racing on the same name are settled by the database rather than
     * by this `if`.
     */
    if (nicknameTaken(this.db, name.nickname)) {
      throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', {
        nickname: 'Somebody already has that name.',
      });
    }

    let user: UserRow;
    try {
      user = createLocalUser(this.db, { nickname: name.nickname, passwordHash: await hashPassword(secret.password) }, now);
    } catch {
      // The index refused it, which at this point means the race above.
      throw new ApiException('VALIDATION_FAILED', 'Some fields need fixing.', {
        nickname: 'Somebody already has that name.',
      });
    }

    return { user, ...createSession(this.db, user.id, now) };
  }

  /**
   * Turns a user Passport has already vouched for into a session.
   *
   * The ban check lives here rather than in the strategies so that it cannot be
   * forgotten by the next one added: every door goes through this.
   */
  issue(user: UserRow): Signed {
    if (user.bannedAt !== null) throw new ApiException('FORBIDDEN', 'That account is banned.');
    return { user, ...createSession(this.db, user.id, nowSeconds()) };
  }

  /**
   * The same, for a provider callback: find or open the account first.
   *
   * A ban is reported rather than hidden. A banned account whose sign-in looks
   * like a failure produces a support email and a second account, which is the
   * opposite of the point.
   */
  issueForProvider(profile: ProviderProfile): Signed {
    const user = signInWithProvider(this.db, profile, nowSeconds());
    return this.issue(user);
  }

  /**
   * Where to land somebody after a sign-in that worked.
   *
   * The site root, not wherever they were. Steam's return URL is a signed field
   * and must be a constant, so there is nowhere to carry an origin path — and
   * inventing one from a query parameter would be an open redirect wearing a
   * helpful hat.
   */
  returnUrl(): string {
    return `${this.config.siteOrigin.replace(/\/+$/, '')}/`;
  }

  /** The same place, carrying why it did not work, so the site can say so. */
  failureUrl(reason: 'failed' | 'banned'): string {
    return `${this.returnUrl()}?auth=${reason}`;
  }

  logout(token: string): void {
    deleteSession(this.db, token);
  }

  /**
   * Marks the next trip to a provider as "link this to the account I am already
   * in", as the value of a short-lived cookie.
   *
   * The session's own hash, so the intent is worth nothing in anybody else's
   * browser: a callback arriving with a link cookie that does not match the
   * session presenting it is treated as an ordinary sign-in.
   */
  linkIntent(sessionToken: string): string {
    return hashToken(sessionToken);
  }

  intentMatches(cookie: string | undefined, sessionToken: string | undefined): boolean {
    return cookie !== undefined && cookie !== '' && sessionToken !== undefined && cookie === hashToken(sessionToken);
  }

  /**
   * Attaches a provider account to the signed-in user.
   *
   * The refusals are named rather than collapsed, because they mean different
   * things to the person: "that Steam account is already somebody's" is a
   * different problem from "you already linked Steam".
   */
  link(user: UserRow, profile: ProviderProfile): { ok: true } | { ok: false; reason: 'taken' | 'already-linked' } {
    return linkIdentity(this.db, user.id, profile, nowSeconds());
  }

  /**
   * Detaches one, unless it is the last way in — and, for now, never.
   *
   * The refusal is checked here rather than by removing the route, so a client
   * that still has the old button gets a sentence instead of a 404, and so the
   * rule lives next to the reason for it. See `UNLINKING_ENABLED`.
   *
   * `last-door` below is not a policy this layer invented — there is no
   * password recovery here, so removing the only credential an account has
   * would end it.
   */
  unlink(user: UserRow, provider: string): MeUser {
    if (provider !== 'steam' && provider !== 'discord') {
      throw new ApiException('NOT_FOUND', 'No such provider.');
    }
    if (!UNLINKING_ENABLED) {
      throw new ApiException('FORBIDDEN', 'A linked account cannot be detached.');
    }
    const result = unlinkIdentity(this.db, user.id, provider as ExternalProvider);
    if (!result.ok) {
      throw result.reason === 'not-linked'
        ? new ApiException('NOT_FOUND', 'That is not linked to your account.')
        : new ApiException('FORBIDDEN', 'That is the only way into your account. Set a password first.');
    }
    return this.me(user);
  }

  /** Where the settings screen lives, for a provider round trip to come back to. */
  settingsUrl(status: string): string {
    return `${this.returnUrl()}settings?link=${encodeURIComponent(status)}`;
  }

  me(user: UserRow): MeUser {
    const linked = listIdentities(this.db, user.id).map((row) => row.provider);
    const providers: AuthProvider[] = [...linked];
    if (user.passwordHash !== null) providers.unshift('local');

    return {
      // A provider is what "verified" means, so a password on its own does not
      // count — see `isVerified`, which asks the same question of the table.
      ...toPublicUser({
        ...user,
        verified: linked.length > 0,
        // The same links a reader of their builds sees, so the settings screen
        // and a build page cannot disagree about where somebody's profile is.
        profiles: profilesOf(this.db, user.id),
      }),
      buildCount: countBuildsFor(this.db, user.id),
      // Five, plus five per linked provider — see `buildLimitFor`. The site
      // draws `4/10` from this, so the number has to be the account's own
      // rather than the constant.
      buildLimit: buildLimitFor(this.db, user.id),
      isAdmin: user.role === 'admin',
      providers,
    };
  }

}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Length, and nothing else.
 *
 * There is no password recovery on this site, so a composition rule that makes
 * people invent something they will not remember costs more than it buys —
 * and every one ever written has produced `Password1!`.
 */
function checkPassword(password: unknown): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof password !== 'string') return { ok: false, error: 'A password is required.' };
  const length = [...password].length;
  if (length < MIN_PASSWORD) return { ok: false, error: `At least ${MIN_PASSWORD} characters.` };
  if (length > MAX_PASSWORD) return { ok: false, error: `At most ${MAX_PASSWORD} characters.` };
  return { ok: true, password };
}
