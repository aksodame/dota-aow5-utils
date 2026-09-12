/**
 * An amount of gold, written the way this site writes it.
 *
 * Here rather than in the webapp — where it lived until the social card needed
 * it — because a price now appears in three places that cannot reach each
 * other: a browse row, a `<meta name="description">` the server renders, and a
 * PNG the server rasterizes. Three copies of "how do we write a number" is
 * three chances for a card to disagree with the page it links to about what a
 * build costs, which is the one number on it a reader acts on.
 *
 * `apps/webapp/src/lib/price.ts` is now a thin wrapper that supplies the cap.
 * Its tests still cover this, and are still the specification.
 */

const UNITS = [
  { limit: 1_000_000_000, suffix: 'b' },
  { limit: 1_000_000, suffix: 'm' },
  { limit: 1_000, suffix: 'k' },
] as const;

/**
 * A gold amount, short enough to sit in a list row.
 *
 * `1k`, `10k`, `100k`, `1m`, `10m`, `100m`, `1b`, `1.5b`, `2b`. One decimal at
 * most, and none at all when the number is a whole unit — `1b` rather than
 * `1.0b`, because the zero is noise that makes every row a character wider for
 * nothing.
 *
 * **Truncated, never rounded.** 1,999,999,999 is `1.9b` and not `2b`: this
 * number is what somebody is deciding whether they can afford, and a display
 * that rounds up is a display that tells them a build is cheaper to reach than
 * it is. Truncation can only ever understate, which is the safe direction — and
 * it means the suffix can never be promoted by rounding (999,999 cannot become
 * `1000k`), so choosing the unit first is correct rather than merely usually
 * correct.
 *
 * Under a thousand the number is shown as it is. `750` is already short, and
 * `0.7k` is both longer and less precise.
 *
 * Not `Intl.NumberFormat` with `notation: 'compact'`, which is the obvious
 * reach: it rounds rather than truncates, it localises the suffixes (a Russian
 * reader would see `1,5 млрд` beside a gold coin from an English-only game),
 * and its "compact" for a billion is `1B` with a capital. The game writes these
 * lowercase, and a build's price is a number people copy between the site and a
 * chat window.
 *
 * `max` is the cap a stored price is already subject to. A parameter rather
 * than a constant here because the number belongs to the API contract, which
 * this package does not depend on and should not start depending on for one
 * integer. Callers that have it pass it; the card and the description do not
 * need to, because a price that reached the database was capped on the way in.
 */
export function formatGold(gold: number, max = Number.MAX_SAFE_INTEGER): string {
  // Zero is "the author did not say", and every caller checks for that before
  // reaching here — but a negative or a fraction arriving from a hand-edited
  // request should still render as something rather than as `NaN.5b`.
  if (!Number.isFinite(gold) || gold <= 0) return '0';
  const value = Math.min(Math.floor(gold), max);

  for (const { limit, suffix } of UNITS) {
    if (value < limit) continue;
    const whole = Math.floor(value / limit);
    // Integer arithmetic rather than `toFixed(1)`, which rounds. The remainder
    // is at most 999,999,999, so `* 10` stays far inside exact range.
    const tenth = Math.floor(((value % limit) * 10) / limit);
    return tenth === 0 ? `${whole}${suffix}` : `${whole}.${tenth}${suffix}`;
  }

  return String(value);
}

/**
 * The same amount written out, for a tooltip or a label.
 *
 * Grouped with a non-breaking space rather than a comma or a dot, because the
 * three languages disagree about which of those is the *decimal* separator and
 * a price is exactly the number where being wrong about that matters. Written
 * as an escape rather than as the character, so it is visible in the source
 * instead of being an invisible byte the next editor deletes by accident.
 */
const GROUP = '\u00a0';

export function formatGoldExact(gold: number): string {
  if (!Number.isFinite(gold) || gold <= 0) return '0';
  return String(Math.floor(gold)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}
