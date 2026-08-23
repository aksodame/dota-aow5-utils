import { useEffect, type RefObject } from 'react';

/**
 * Makes the window exactly as big as what is drawn in it.
 *
 * Measured rather than computed: every row is sized in rem and the root font
 * size is a setting, so any constant in main would drift the moment the UI
 * scale moved.
 *
 * Two rules this has to keep, and both are easy to break by accident:
 *
 *   1. **The measured element must size to its content**, never to the window
 *      — `h-fit`, and `w-fit` too when the width is being measured. An element
 *      stretched to the viewport can only ever measure the viewport back,
 *      which reports whatever size the window opened at, forever.
 *   2. **The window's size must not feed back into the element's.** It does
 *      not, for the same reason — which is why one pass settles instead of
 *      oscillating.
 */
export type ContentFit =
  /** The user owns the size; the window keeps what it was dragged to. */
  | 'none'
  /** The window is as tall as its content, as wide as the user made it. */
  | 'height'
  /** Both, for a panel that is a line of things rather than a page of them. */
  | 'both';

export function useContentSize(ref: RefObject<HTMLElement | null>, fit: ContentFit): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (fit === 'none') {
      window.tracker.setContentSize(null);
      return;
    }
    const report = () => {
      const box = element.getBoundingClientRect();
      // Ceil, not round: half a pixel short clips the bottom border, and on
      // the width it wraps the last tile onto a line of its own.
      window.tracker.setContentSize({
        height: Math.ceil(box.height),
        ...(fit === 'both' ? { width: Math.ceil(box.width) } : {}),
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, fit]);
}
