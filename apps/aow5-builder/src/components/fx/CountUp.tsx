import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts from zero to `value` once on mount, and animates between values after
 * that. Eased so it decelerates rather than ticking linearly.
 *
 * Jumps straight to the final number when the user prefers reduced motion, or
 * during server rendering, so the real figure is never withheld.
 */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(() => {
    // Without a window there is no animation to run, so render the real figure
    // rather than a zero that only a client-side effect would ever correct.
    if (typeof window === 'undefined') return value;
    return prefersReducedMotion() ? value : 0;
  });
  const from = useRef(display);
  const frame = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(origin + delta * eased);
      setDisplay(next);
      from.current = next;
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return <span className="tabular-nums">{display.toLocaleString()}</span>;
}
