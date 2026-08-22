import { cn } from '@/lib/utils';

/**
 * The handful of icons the overlay preview needs, drawn here.
 *
 * The site pages do not pull in an icon library — the planner still does, for
 * its controls, but a page whose icons are all decoration should not ship a
 * dependency for them. These are the same glyphs the real HUD uses, at the same
 * 24-unit grid and 2-unit stroke, so the depiction still reads as the overlay.
 *
 * Same reasoning as the flags and the GitHub mark elsewhere in the workspace:
 * a few hundred bytes of path data beats a package.
 */

function Glyph({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-3.5 shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The run clock. */
export const ClockGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Glyph>
);

/** Gold. */
export const CoinGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 2s1.1 1.8 2.5 2 2.5.7 2.5 2-1.1 2-2.5 2a2.5 2.5 0 0 1-2.5-1.5" />
  </Glyph>
);

/** Time spent inside rooms — the denominator of the rate. */
export const HourglassGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M7 3h10M7 21h10M8 3v4l4 5 4-5V3M8 21v-4l4-5 4 5v4" />
  </Glyph>
);

/** Where you are. */
export const MapGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14" />
  </Glyph>
);

/** Runs finished this session. */
export const TrophyGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 20h4M12 14v6" />
  </Glyph>
);

/** The drag region. */
export const GripGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <circle cx="9" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="15" cy="18" r="1" />
  </Glyph>
);

/** Collapse. */
export const ChevronUpGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="m6 15 6-6 6 6" />
  </Glyph>
);

/** Restart the session. */
export const RestartGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M4 12a8 8 0 1 1 2.3 5.7M4 17v-5h5" />
  </Glyph>
);

/** Past sessions. */
export const HistoryGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7M4 7v5h5M12 8v4l3 2" />
  </Glyph>
);

/** Settings. */
export const SettingsGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
  </Glyph>
);

/** Quit. */
export const CloseGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Glyph>
);
