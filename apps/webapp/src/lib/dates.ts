/**
 * Dates, in the reader's language.
 *
 * Everything on the wire is unix **seconds**, matching what the database
 * stores — see the API's DTOs. This is the one place that turns one into
 * something a person reads, so "which of these two builds came first" is
 * answered the same way wherever it is asked.
 *
 * `release.ts` has a formatter of its own for GitHub's ISO strings, which is a
 * different input from a different source; the day this file needs to parse one
 * of those is the day the two should merge.
 */

/** A day, spelled out: `3 September 2026`. Null when the number is not one. */
export function formatDay(unixSeconds: number | null | undefined, lang: string): string | null {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Whether an edit is worth reporting next to a publication date.
 *
 * Publishing writes both timestamps, so `updated_at` is always a second or two
 * past `published_at` and a build nobody has touched would otherwise claim to
 * have been revised on the day it appeared. A day's grace, because that is the
 * resolution the dates are shown at: an edit that lands on the same day as the
 * publication has nothing to add to it.
 */
export function wasRevised(publishedAt: number | null, updatedAt: number): boolean {
  if (publishedAt === null) return false;
  return updatedAt - publishedAt >= 24 * 60 * 60;
}
