import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Which rows of a long list are on screen, and how tall the whole thing is.
 *
 * The list is addressed by position rather than walked with a cursor, so the
 * scroller can be given the full height up front — every row is the same
 * height, which makes that arithmetic exact rather than an estimate. The
 * scrollbar is then the right size and in the right place from the first paint,
 * and dragging it lands on a real row index instead of somewhere the loader
 * would have to walk to.
 *
 * Row height is read from the CSS custom property rather than duplicated here,
 * because it changes at a breakpoint and two numbers that must agree should be
 * one number. Re-read on resize for the same reason.
 *
 * **The scroller arrives through a callback ref, not a `useRef`.** The element
 * does not exist until the first window has loaded, and a `useRef` does not
 * tell React when it is finally populated — so an effect that measured on mount
 * found `null`, returned, and never ran again. The viewport stayed zero, which
 * silently reduced the rendered range to a single row plus overscan: about six
 * rows in a box that shows ten. A callback ref makes the node a piece of state,
 * so measuring happens when there is something to measure.
 */

interface VirtualRows {
  /** Attach to the scrolling element. A callback ref, for the reason above. */
  ref: (node: HTMLElement | null) => void;
  /** First and last row index to render, inclusive of overscan. */
  range: { start: number; end: number };
  /**
   * First and last row actually on screen, without overscan.
   *
   * Separate from `range` because the two answer different questions. What to
   * *draw* should run past the edges of the box, so a flick of the wheel does
   * not show empty space. What to *fetch* should not: overscan asking for rows
   * costs a request for four rows nobody has looked at yet, which at the top of
   * a fresh list is a whole second window on mount.
   */
  visible: { start: number; end: number };
  /** The full scrollable height, so the bar is sized against the whole list. */
  totalHeight: number;
  /** Where a row sits, for absolute placement. */
  offsetOf: (index: number) => number;
  /** One row's height, for the placed elements. */
  rowHeight: number;
  /** How many rows fit in the box. What a first load should draw skeletons for. */
  perScreen: number;
  /** Puts the scroller back at the top — a new list starts from its first row. */
  scrollToTop: () => void;
}

/**
 * Rows drawn beyond each edge of the viewport.
 *
 * Enough that a flick of the wheel does not outrun the render, few enough that
 * a fast drag is not laying out hundreds of rows it will never show. It widens
 * `range` alone: see `visible` for why fetching does not follow it.
 */
const OVERSCAN = 4;

/** Until the box has been measured. Ten rows and the gaps between them. */
const FALLBACK = { row: 76, gap: 2 };

export function useVirtualRows(
  total: number,
  { heightVar = '--build-row-h', gapVar = '--build-row-gap' } = {},
): VirtualRows {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [metrics, setMetrics] = useState(FALLBACK);

  useEffect(() => {
    if (scroller === null) return;

    const measure = () => {
      const style = getComputedStyle(scroller);
      const row = Number.parseFloat(style.getPropertyValue(heightVar));
      const gap = Number.parseFloat(style.getPropertyValue(gapVar));
      if (Number.isFinite(row) && row > 0 && Number.isFinite(gap)) {
        setMetrics((prev) => (row === prev.row && gap === prev.gap ? prev : { row, gap }));
      }
      setViewport(scroller.clientHeight);
    };

    measure();

    /*
     * A ResizeObserver rather than a window listener: the scroller's height
     * changes when the panel does, and a window resize is only one cause of
     * that.
     */
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller, heightVar, gapVar]);

  useEffect(() => {
    if (scroller === null) return;

    /*
     * Read in a frame rather than on the event.
     *
     * A scroll handler that calls setState synchronously re-renders on every
     * one of the dozens of events a single wheel gesture fires; coalescing into
     * an animation frame renders once per painted frame instead.
     */
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTop(scroller.scrollTop);
      });
    };

    // The element may already be scrolled when it mounts — a filter change
    // remounts it — so the position is read once rather than waiting for a
    // scroll that may never come.
    setScrollTop(scroller.scrollTop);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller]);

  const stride = metrics.row + metrics.gap;
  const perScreen = Math.max(1, Math.ceil((viewport || stride * 10) / stride));

  const visible = useMemo(() => {
    if (total === 0) return { start: 0, end: -1 };
    const first = Math.min(Math.max(0, Math.floor(scrollTop / stride)), total - 1);
    // Inclusive, so the last on-screen row is `perScreen - 1` past the first.
    // It used to be `perScreen` here, which claimed one row more than the box
    // can hold and pushed the top of a nine-row list into the second window.
    return { start: first, end: Math.min(total - 1, first + perScreen - 1) };
  }, [scrollTop, stride, perScreen, total]);

  const range = useMemo(
    () =>
      total === 0
        ? { start: 0, end: -1 }
        : {
            start: Math.max(0, visible.start - OVERSCAN),
            end: Math.min(total - 1, visible.end + OVERSCAN),
          },
    [visible, total],
  );

  const scrollToTop = useCallback(() => {
    scroller?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [scroller]);

  return {
    ref: setScroller,
    range,
    visible,
    // The last row contributes no trailing gap, which is what keeps the
    // scroller from ending on two pixels of empty space.
    totalHeight: total === 0 ? 0 : total * stride - metrics.gap,
    offsetOf: (index: number) => index * stride,
    rowHeight: metrics.row,
    perScreen,
    scrollToTop,
  };
}
