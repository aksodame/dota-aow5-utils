import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fades and lifts content in on mount, optionally staggered by index.
 *
 * A CSS animation with a delay rather than an observer or a spring library:
 * everything here is above the fold on load, so there is nothing to observe.
 * `fill-mode: backwards` holds the start state during the delay, which is what
 * stops a staggered grid from flashing fully-drawn for one frame first.
 */
export function Reveal({
  children,
  index = 0,
  step = 45,
  className,
}: {
  children: ReactNode;
  index?: number;
  /** Milliseconds between successive items. */
  step?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('animate-[reveal_420ms_cubic-bezier(0.22,1,0.36,1)_backwards] motion-reduce:animate-none', className)}
      style={{ animationDelay: `${index * step}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
