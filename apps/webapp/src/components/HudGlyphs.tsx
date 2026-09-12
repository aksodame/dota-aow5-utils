/**
 * The overlay's own icons, redrawn for the picture of it.
 *
 * `HudPreview` depicts the tracker's farm panel, and half of what makes that
 * panel recognisable is its chrome: the drag dots, the seven buttons along the
 * title bar, the map pin and the trophy on the room line. The tracker draws
 * them with lucide-react; the site dropped that package in the rewrite and
 * should not take it back for one figure.
 *
 * So these are the same glyphs, on the same 24-unit grid with the same 2-unit
 * stroke, traced from the lucide icons the overlay actually imports —
 * `GripVertical`, `ChevronUp`, `ChevronDown`, `Pause`, `RotateCcw`, `Skull`,
 * `History`, `Settings2`, `X`, `Map` and `Trophy`. Kept out of `ui/Icon.tsx`
 * deliberately: the site's kit is the glyphs the site's own controls use, and a
 * skull in it would be an icon nothing on the site can reach.
 *
 * Sized by the caller's class rather than by a prop, because everything in the
 * preview is a multiple of one unit — see `HudPreview.module.css`.
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
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type GlyphProps = { className?: string };

/** The drag region at the left of the title bar. */
export const Grip = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <circle cx="9" cy="5" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="9" cy="19" r="1" />
    <circle cx="15" cy="5" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="15" cy="19" r="1" />
  </Glyph>
);

/** Collapse to the summary. */
export const ChevronUp = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="m18 15-6-6-6 6" />
  </Glyph>
);

/** The sorted column's arrow, pointing the way the list is ordered. */
export const ChevronDown = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="m6 9 6 6 6-6" />
  </Glyph>
);

/** Stop the session clock. Loot still counts. */
export const Pause = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Glyph>
);

/** Start a fresh session. */
export const Restart = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
    <path d="M3 3v5h5" />
  </Glyph>
);

/** Mark the last room as one you died in. */
export const Skull = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M12 2a8 8 0 0 0-5 14.25V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.75A8 8 0 0 0 12 2Z" />
    <circle cx="9.5" cy="10" r="1.25" />
    <circle cx="14.5" cy="10" r="1.25" />
    <path d="M12 14v2" />
  </Glyph>
);

/** Past sessions, in a window of their own. */
export const History = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 8v4l3 2" />
  </Glyph>
);

/** Settings, also a window of its own. */
export const Settings = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M20 7h-9" />
    <path d="M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </Glyph>
);

/** Quit. */
export const Close = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Glyph>
);

/** Where you are, on the room line. */
export const MapPin = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14" />
    <path d="M15 6v14" />
  </Glyph>
);

/** Rooms finished this session, beside the room name. */
export const Trophy = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3" />
    <path d="M17 6h3v1a3 3 0 0 1-3 3" />
    <path d="M10 20h4" />
    <path d="M12 14v6" />
  </Glyph>
);
