import { useEffect, useState } from 'react';

/**
 * A value, held back until it stops changing.
 *
 * The browse query is what this exists for. Every facet in the sidebar is a
 * click and the search box is a keystroke, so an undebounced list fires a
 * request per character typed and per map ticked — and picking four rooms out
 * of a tier meant four round trips for three lists nobody read.
 *
 * The *value* is delayed, never the interface: a checkbox ticks and a letter
 * appears immediately, and only the fetch waits. Which also means the caller
 * can tell the two apart — `value !== debounced` is exactly "a request is
 * coming", and is what puts the list into its loading state before the request
 * has been made.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    // Each change clears the previous timer, so the wait is measured from the
    // last change rather than the first.
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
