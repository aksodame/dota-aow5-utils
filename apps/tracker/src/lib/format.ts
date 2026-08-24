/**
 * Number formatting shared by every overlay.
 *
 * Lives here rather than beside the HUD because the collapsed bar, the settings
 * panel and — next — the recipe panel all show the same clock and the same
 * abbreviated gold, and they must abbreviate them identically.
 */

/**
 * `1234` -> `1.2k`, `123000` -> `123k`, `123100000` -> `123.1M`.
 *
 * One decimal, but only when it says something: `123.0k` spends a character to
 * tell you the tenths are zero, and in a column of gold figures that is a
 * character the item name wanted. `M` is capital and `k` is not, which is both
 * the SI convention and the way they are told apart at a glance.
 *
 * Deliberately never emits a unit: the caller labels it.
 */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const scaled = (by: number, suffix: string) => `${(n / by).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  if (Math.abs(n) >= 1_000_000) return scaled(1_000_000, 'M');
  if (Math.abs(n) >= 1_000) return scaled(1_000, 'k');
  return n.toFixed(0);
}

/** Seconds as `mm:ss`, growing to `h:mm:ss` only when there are hours to show. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** `0.92` -> `92%`. For the settings sliders, whose values are all fractions. */
export const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/**
 * Epoch milliseconds as `21 Aug 21:44`.
 *
 * The one thing in the app that is formatted rather than translated, so it
 * takes the chosen language rather than the machine's: a player reading the
 * overlay in Russian wants `21 авг.`, whatever Windows is set to, and the two
 * used to be the same only by accident. Month name, day order and the 12- or
 * 24-hour clock all follow from it.
 *
 * The year is left off deliberately: History is read to compare this week's
 * farming with last week's, and a column of identical years would cost width
 * the item names want.
 */
export function stamp(ms: number, locale: string): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
