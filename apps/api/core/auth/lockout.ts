/**
 * What happens after a run of wrong passwords.
 *
 * The rate limiter cannot cover this on its own, and the reason is structural:
 * `ScopedThrottlerGuard` keys a request by user id only when there *is* a user,
 * and a sign-in attempt is anonymous by definition — so every login lands in an
 * `ip:` bucket. A botnet with ten thousand addresses gets the full per-address
 * budget ten thousand times over against one account, and no single bucket ever
 * looks unusual. Counting per account is the only control that sees that.
 *
 * Pure policy: no database, no clock, no I/O. `core/db/users.ts` persists the
 * two numbers and this decides what they mean.
 */

/** Wrong answers allowed before the delays start. */
export const FREE_ATTEMPTS = 5;

/** The longest anyone waits, in seconds. */
export const MAX_LOCKOUT_SECONDS = 15 * 60;

/**
 * How long to refuse this account after `failedAttempts` consecutive misses.
 *
 * Doubling, from one second, capped at fifteen minutes: 1, 2, 4, 8 … 900. An
 * attacker is down to about four guesses an hour per account after the first
 * five, while somebody who genuinely cannot remember which of their passwords
 * it was waits a quarter of an hour at the very worst.
 *
 * **Never permanent, and that is not timidity.** There is no password recovery
 * on this site, so a lockout that did not expire would be a one-way button for
 * destroying any account on it — and the nickname needed to press that button
 * is printed on every build card.
 */
export function lockoutSeconds(failedAttempts: number): number {
  if (failedAttempts <= FREE_ATTEMPTS) return 0;
  const doublings = failedAttempts - FREE_ATTEMPTS - 1;
  // Cap the exponent before shifting: 1 << 40 is not what anyone means by "a
  // very long lockout", and a counter can climb for as long as somebody keeps
  // trying.
  if (doublings >= 20) return MAX_LOCKOUT_SECONDS;
  return Math.min(2 ** doublings, MAX_LOCKOUT_SECONDS);
}

/** Seconds still to wait, or 0 when this account may try again now. */
export function remainingLockout(lockedUntil: number | null, now: number): number {
  if (lockedUntil === null || lockedUntil <= now) return 0;
  return lockedUntil - now;
}
