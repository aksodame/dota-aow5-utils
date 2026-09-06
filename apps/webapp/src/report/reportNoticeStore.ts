/**
 * Whether the report notice is on screen.
 *
 * Same module-scope store shape as `auth/signInStore` — a listener set rather
 * than a context, so the app still has exactly one provider in its tree.
 *
 * Unlike the sign-in dialog, nothing opens this one by hand: it opens itself
 * when the last acknowledgement expires, and a timer here is what brings it
 * back. The timer is armed once at module load and re-armed on every
 * acknowledgement, so the page does not poll.
 *
 * JSX-free so it stays importable from anywhere, including a test.
 */
import { useSyncExternalStore } from 'react';
import { msRemaining, readAcknowledgement, storeReportAcknowledged } from '@/lib/reportNotice';

let open = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  open = next;
  for (const listener of listeners) listener();
}

/**
 * Show the notice now, or arm a timer for when it is next due.
 *
 * `setTimeout` rather than an interval: browsers throttle background tabs, so
 * the delay is a floor rather than a promise — which is fine for a reminder,
 * and much cheaper than waking up to check the clock.
 */
function schedule(): void {
  if (timer !== undefined) clearTimeout(timer);
  const left = msRemaining(readAcknowledgement(), Date.now());
  if (left === 0) {
    set(true);
    return;
  }
  timer = setTimeout(schedule, left);
}

schedule();

/**
 * Record the acknowledgement and close until it expires.
 *
 * The write is attempted first and its failure is ignored, but the close
 * happens either way — deliberately. This dialog has no close button and
 * refuses Escape and outside clicks, so a visitor whose storage is blocked
 * would otherwise be locked out of the whole site by a modal they cannot
 * dismiss. With storage blocked the notice simply returns on the next load.
 */
export function acknowledgeReport(): void {
  storeReportAcknowledged();
  set(false);
  schedule();
}

export function useReportNotice(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => open,
  );
}
