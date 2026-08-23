/**
 * The one cookie this API sets, and the rules it is set under.
 */
import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'aow5_session';

/**
 * `SameSite=Lax`, and it is what makes a separate CSRF token unnecessary: it
 * already stops a cross-site POST, PATCH or DELETE from carrying the cookie at
 * all. The Origin check in OriginGuard is the second half of that argument.
 *
 * `Strict` would now also work — the reason it was Lax was the cross-site
 * top-level GET coming back from Steam, and there is no longer any such
 * navigation. Left at Lax deliberately: it costs nothing here, and Strict would
 * mean somebody following a shared `/builds/<slug>` link from Discord arrives
 * apparently signed out, which reads as a bug and is not one.
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

export function clearCookie(response: Response, name: string, options: CookieOptions): void {
  // Cleared with the same attributes it was set with — a cookie cleared on a
  // different path is not cleared at all.
  response.clearCookie(name, { ...options, maxAge: undefined });
}
