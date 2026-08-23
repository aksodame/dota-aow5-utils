import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MeUser, PowChallenge, PowSolution } from 'aow5-api-contract';
import { MAX_BUILDS_PER_USER, MAX_PASSWORD, MIN_PASSWORD } from 'aow5-api-contract';
import { countBuildsFor } from '../../core/db/builds.ts';
import { checkNickname } from '../../core/auth/nickname.ts';
import { remainingLockout } from '../../core/auth/lockout.ts';
import { hashPassword, verifyAgainstNobody, verifyPassword } from '../../core/auth/password.ts';
import { PowKeeper } from '../../core/auth/pow.ts';
import type { Db } from '../../core/db/open.ts';
import { createSession, deleteSession } from '../../core/db/sessions.ts';
import {
  clearFailedSignIns,
  createUser,
  findUserByNickname,
  recordFailedSignIn,
  toPublicUser,
  type UserRow,
} from '../../core/db/users.ts';
import { DB } from '../db/tokens.ts';
import { loadConfig, type AppConfig } from '../config.ts';

/** What a sign-up or sign-in comes back with when it worked. */
export interface Signed {
  user: UserRow;
  token: string;
  expiresAt: number;
}

/**
 * Everything that can go wrong, as data rather than as an exception.
 *
 * The controller maps these onto codes. Keeping them a union here is what lets
 * `core`-shaped logic stay in `core` and this file stay the thin thing the
 * guide asks for.
 */
export type AuthFailure =
  | { kind: 'captcha' }
  | { kind: 'invalid-nickname'; reason: string }
  | { kind: 'invalid-password'; reason: string }
  | { kind: 'taken' }
  | { kind: 'credentials' }
  | { kind: 'locked'; retryAfter: number }
  | { kind: 'banned' };

export type AuthResult = { ok: true; signed: Signed } | { ok: false; failure: AuthFailure };

@Injectable()
export class AuthService {
  private readonly logger = new Logger('auth');
  private readonly pow = new PowKeeper();
  private readonly config: AppConfig = loadConfig();

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Whether to mark cookies `Secure`.
   *
   * Derived from the origin rather than configured, so a development server on
   * plain HTTP still sets a cookie the browser will keep.
   */
  get secureCookies(): boolean {
    return this.config.siteOrigin.startsWith('https://');
  }

  challenge(): PowChallenge {
    return this.pow.issue(nowSeconds());
  }

  /**
   * Creates an account.
   *
   * The order is deliberate and is the main structural defence here: the proof
   * of work is checked first because it costs one HMAC and one SHA-256 and the
   * client has already paid for it, then the cheap pure validation, and only
   * then the ~100 ms of scrypt. Nothing reaches the expensive step without
   * having spent something first.
   */
  async register(nickname: unknown, password: unknown, pow: PowSolution): Promise<AuthResult> {
    const now = nowSeconds();

    const solved = this.pow.verify(pow, now);
    if (!solved.ok) {
      this.logger.warn(`sign-up captcha rejected: ${solved.reason}`);
      return fail({ kind: 'captcha' });
    }

    const name = checkNickname(nickname);
    if (!name.ok) return fail({ kind: 'invalid-nickname', reason: name.error });

    const secret = checkPassword(password);
    if (!secret.ok) return fail({ kind: 'invalid-password', reason: secret.error });

    const created = createUser(
      this.db,
      { nickname: name.nickname, key: name.key, passwordHash: await hashPassword(secret.password) },
      now,
    );
    if (created === 'taken') return fail({ kind: 'taken' });

    return { ok: true, signed: { user: created, ...createSession(this.db, created.id, now) } };
  }

  /**
   * Signs somebody in.
   *
   * "No such nickname" and "wrong password" are one answer, and they also take
   * the same time — `verifyAgainstNobody` burns the same scrypt work a real
   * check would, because otherwise the clock would answer the question the
   * error code refuses to.
   */
  async login(nickname: unknown, password: unknown): Promise<AuthResult> {
    const now = nowSeconds();

    if (typeof nickname !== 'string' || typeof password !== 'string') {
      await verifyAgainstNobody('');
      return fail({ kind: 'credentials' });
    }

    const user = findUserByNickname(this.db, nickname);
    if (user === undefined) {
      await verifyAgainstNobody(password);
      return fail({ kind: 'credentials' });
    }

    // Before the hash, so a locked account costs one indexed read and no CPU.
    const wait = remainingLockout(user.lockedUntil, now);
    if (wait > 0) return fail({ kind: 'locked', retryAfter: wait });

    if (!(await verifyPassword(password, user.passwordHash))) {
      const seconds = recordFailedSignIn(this.db, user.id, now);
      if (seconds > 0) return fail({ kind: 'locked', retryAfter: seconds });
      return fail({ kind: 'credentials' });
    }

    // Told rather than hidden. A ban that reads as a wrong password produces a
    // support email and a second account, which is the opposite of the point.
    if (user.bannedAt !== null) return fail({ kind: 'banned' });

    clearFailedSignIns(this.db, user);
    return { ok: true, signed: { user, ...createSession(this.db, user.id, now) } };
  }

  logout(token: string): void {
    deleteSession(this.db, token);
  }

  me(user: UserRow): MeUser {
    return {
      ...toPublicUser(user),
      buildCount: countBuildsFor(this.db, user.id),
      buildLimit: MAX_BUILDS_PER_USER,
      isAdmin: user.role === 'admin',
    };
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function fail(failure: AuthFailure): AuthResult {
  return { ok: false, failure };
}

/**
 * Length, and nothing else.
 *
 * No composition rules: every one ever written has produced `Password1!`, and
 * with no recovery on this site a rule that pushes people towards something
 * they will not remember costs more than it buys.
 */
function checkPassword(password: unknown): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof password !== 'string') return { ok: false, error: 'required' };
  const length = [...password].length;
  if (length < MIN_PASSWORD) return { ok: false, error: 'too-short' };
  if (length > MAX_PASSWORD) return { ok: false, error: 'too-long' };
  return { ok: true, password };
}
