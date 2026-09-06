/**
 * When the report notice is due again.
 *
 * Not "once and never again": an acknowledgement holds for five minutes and
 * then the notice returns. That is deliberate — it is a reminder, not a
 * one-time consent form, and somebody who spends an evening in the planner
 * should meet it more than once.
 *
 * `localStorage` rather than `sessionStorage`, because the interval has to
 * survive a reload and a second tab; the stored value is
 * `<version>:<timestamp>` so that editing the document and bumping the version
 * brings the notice back for everyone immediately, whatever their timer said.
 */

export const REPORT_NOTICE_STORAGE_KEY = 'aow5.report.ack';

/** Bump to re-show the notice after the statement changes. */
export const REPORT_NOTICE_VERSION = '2';

/** How long an acknowledgement holds before the notice comes back. */
export const REPORT_NOTICE_INTERVAL_MS = 5 * 60 * 1000;

/** How long Continue stays disabled once both boxes are ticked. */
export const REPORT_NOTICE_DELAY_SECONDS = 15;

/** The pure half, so the timing rules can be tested without a browser. */
export function isAcknowledged(stored: string | null, now: number): boolean {
  return msRemaining(stored, now) > 0;
}

/**
 * How long is left on a stored acknowledgement, in milliseconds.
 *
 * Zero means the notice is due. A timestamp in the future means the clock moved
 * backwards since it was written — treat that as due rather than trusting it,
 * or a wrong system clock could suppress the notice indefinitely.
 */
export function msRemaining(stored: string | null, now: number): number {
  if (stored === null) return 0;
  const [version, written] = stored.split(':');
  if (version !== REPORT_NOTICE_VERSION) return 0;

  const at = Number(written);
  if (!Number.isFinite(at) || at > now) return 0;

  return Math.max(0, at + REPORT_NOTICE_INTERVAL_MS - now);
}

/** What to write when somebody acknowledges. */
export function acknowledgement(now: number): string {
  return `${REPORT_NOTICE_VERSION}:${now}`;
}

export function readAcknowledgement(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REPORT_NOTICE_STORAGE_KEY);
  } catch {
    // Storage blocked. Showing the notice is the safe side of this failure.
    return null;
  }
}

export function storeReportAcknowledged(): void {
  try {
    window.localStorage.setItem(REPORT_NOTICE_STORAGE_KEY, acknowledgement(Date.now()));
  } catch {
    // Private mode; the acknowledgement just will not outlive this page.
  }
}
