import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { verifyAgainstNobody, verifyPassword } from '../../../core/auth/password.ts';
import { lockoutSeconds } from '../../../core/auth/lockout.ts';
import type { Db } from '../../../core/db/open.ts';
import {
  clearFailedSignIns,
  findUserByNickname,
  recordFailedSignIn,
  type UserRow,
} from '../../../core/db/users.ts';
import { DB } from '../../db/tokens.ts';
import { ApiException } from '../../http/api-error.ts';

/**
 * Nickname and password, which is the default door.
 *
 * `session: false` here and on every strategy in this directory: Passport's
 * session support wants `express-session` and a serialise/deserialise pair,
 * and this application already has something better — a `sessions` table
 * holding the SHA-256 of each cookie, so a leaked backup is a list of hashes
 * rather than a set of live logins. Passport is used for *authentication*, the
 * one job it is good at; issuing the session stays where it was.
 *
 * The policy is unchanged from before Passport: the same scrypt verification,
 * the same per-account lockout curve, the same refusal to say which half was
 * wrong. All of that lives in `core/`, which cannot import Nest — this class is
 * the thin adapter that lets Passport call it.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(@Inject(DB) private readonly db: Db) {
    super({ usernameField: 'nickname', passwordField: 'password', session: false });
  }

  async validate(nickname: string, password: string): Promise<UserRow> {
    const user = findUserByNickname(this.db, nickname);

    /*
     * The same answer for "no such account" and "wrong password", and the same
     * work done either way. Telling the two apart turns the sign-in form into a
     * way to enumerate who has an account here, and answering "no such user"
     * instantly while a real one costs a scrypt makes that measurable even if
     * the words match.
     */
    if (user === undefined) {
      await verifyAgainstNobody(password);
      throw wrong();
    }

    if (user.bannedAt !== null) throw new ApiException('FORBIDDEN', 'That account is banned.');

    const now = Math.floor(Date.now() / 1000);
    if (user.lockedUntil !== null && user.lockedUntil > now) {
      throw new ApiException('RATE_LIMITED', 'Too many wrong passwords. Try again in a few minutes.');
    }

    // Belt and braces: `findUserByNickname` only returns accounts that have a
    // password, so this is unreachable — and an account with no password must
    // never be signed into by supplying an empty one.
    if (user.passwordHash === null) throw wrong();

    if (!(await verifyPassword(password, user.passwordHash))) {
      const attempts = user.failedAttempts + 1;
      const wait = lockoutSeconds(attempts);
      recordFailedSignIn(this.db, user.id, wait === 0 ? null : now + wait);
      throw wrong();
    }

    // Consecutive misses, so a success resets the curve rather than leaving
    // somebody who mistyped once carrying it for the rest of the day.
    if (user.failedAttempts !== 0 || user.lockedUntil !== null) clearFailedSignIns(this.db, user.id);
    return user;
  }
}

function wrong(): ApiException {
  return new ApiException('UNAUTHENTICATED', 'That nickname and password do not match.');
}
