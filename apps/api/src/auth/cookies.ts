/**
 * The two cookies this API sets, and the rules they are set under.
 */
import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'aow5_session';
export const OIDC_COOKIE = 'aow5_oidc';

/**
 * `SameSite=Lax`, not `Strict`.
 *
 * The Steam return is a cross-site top-level GET navigation. Under `Strict` the
 * cookie set on that response would not be sent with the *next* navigation
 * either, and the user would land back on the site apparently still signed out.
 *
 * Lax is also what makes a separate CSRF token unnecessary: it already stops a
 * cross-site POST, PATCH or DELETE from carrying the cookie at all. The Origin
 * check in OriginGuard is the second half of that argument.
 */
export function sessionCookieOptions(secure: boolean, maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}

/** Short-lived, and only needs to survive the round trip to Steam. */
export function oidcCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth', maxAge: 10 * 60 * 1000 };
}

export function clearCookie(response: Response, name: string, options: CookieOptions): void {
  // Cleared with the same attributes it was set with — a cookie cleared on a
  // different path is not cleared at all.
  response.clearCookie(name, { ...options, maxAge: undefined });
}
