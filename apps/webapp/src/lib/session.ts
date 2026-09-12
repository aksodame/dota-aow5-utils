/**
 * Whether the last visit was signed in.
 *
 * Not authentication, and deliberately not user data: one boolean, so the first
 * paint can decide whether to draw the account-only chrome instead of waiting
 * for `/me` to come back. The session itself is an httpOnly cookie the page
 * cannot read, which is exactly why this exists — without it the top bar has to
 * guess "signed out" for a round trip and then correct itself, and the My
 * Creations tab appears a moment after everything beside it.
 *
 * It is a hint, never a permission. Nothing is unlocked by it, no request is
 * skipped because of it, and `/me` overwrites it the instant it answers. A
 * stale `true` — a session that expired since the last visit — costs one tab
 * that disappears, which is the ordinary case this used to produce on *every*
 * load rather than on the rare one.
 */

const KEY = 'aow5.signedIn';

export function readSignedInHint(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    // Private mode, or storage blocked. The tab appears late, as it did before.
    return false;
  }
}

export function writeSignedInHint(signedIn: boolean): void {
  try {
    if (signedIn) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the next load simply has no hint to go on.
  }
}
