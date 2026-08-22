import { useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * The corner handle that resizes the window.
 *
 * The only way to resize the window on Windows. `resizable: true` is quietly
 * ignored for a transparent window, so the OS offers no drag borders at all —
 * there is nothing here to merely supplement.
 *
 * Sizing goes through main, which owns the clamp. The renderer sends whatever
 * the drag produced without bounds-checking it, so there is exactly one place
 * that decides how small an overlay may get.
 */
interface Props {
  /** `x` while the window sizes its own height and only the width is the user's. */
  axis: 'both' | 'x';
}

export function ResizeGrip({ axis }: Props) {
  /** Where the pointer and the window were when the drag started. */
  const anchor = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  /** The most recent size the drag has asked for, waiting for a frame to send it. */
  const pending = useRef<{ width: number; height: number } | null>(null);
  const frame = useRef<number | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Screen coordinates, not client ones: the window moves under the pointer
    // as it resizes, so anything relative to the viewport would feed back.
    anchor.current = {
      x: event.screenX,
      y: event.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = anchor.current;
    if (!start) return;
    // One resize per frame: a pointermove can fire far more often than the
    // compositor can repaint, and each one is an IPC round trip. The moves in
    // between are folded into the pending size rather than dropped — dropping
    // them lets the window trail the pointer, and a window that trails the
    // pointer while shrinking pulls its own edge out from under the grip.
    pending.current = {
      width: start.width + (event.screenX - start.x),
      height: axis === 'x' ? start.height : start.height + (event.screenY - start.y),
    };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const next = pending.current;
      if (next) void window.tracker.setSize(next);
    });
  }, [axis]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    anchor.current = null;
    pending.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      role="separator"
      aria-label="Resize overlay"
      // `no-drag` matters: without it the header's drag region would win and
      // the gesture would move the window instead of resizing it.
      className={cn(
        'hud-no-drag absolute right-0 bottom-0 z-10 size-4',
        axis === 'x' ? 'cursor-ew-resize' : 'cursor-nwse-resize',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Two ticks, the usual grip shorthand, kept faint so it reads as chrome. */}
      <svg viewBox="0 0 16 16" className="size-full text-muted-foreground/70" aria-hidden="true">
        {axis === 'x' ? (
          <path d="M11 5 L11 15 M15 5 L15 15" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M15 7 L7 15 M15 12 L12 15" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}
