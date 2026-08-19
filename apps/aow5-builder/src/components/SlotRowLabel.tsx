import type { ReactNode } from 'react';

/**
 * The small caption above a run of slots.
 *
 * Shared by the item groups and the spell row so the two line up exactly —
 * they sit in the same card and any drift between them is immediately visible.
 */
export function SlotRowLabel({ children }: { children: ReactNode }) {
  return (
    <div className="pb-[3px] text-[13.5px] leading-none font-medium tracking-wide text-muted-foreground/70 uppercase">
      {children}
    </div>
  );
}
