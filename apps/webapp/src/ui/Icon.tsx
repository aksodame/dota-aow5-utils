import type { ComponentProps } from 'react';

/**
 * The glyphs the site uses, as inline SVG paths.
 *
 * This replaces lucide-react. The previous site imported a 1,500-icon package
 * to render a dozen of them; these are the dozen, drawn on the same 24-grid
 * with the same 2px stroke so they sit together. The two brand marks at the
 * bottom are filled rather than stroked, because that is how their owners draw
 * them and a stroked approximation reads as a knock-off.
 *
 * `currentColor` throughout, so an icon inherits whatever it is placed inside
 * and never needs a colour prop.
 */
type IconProps = ComponentProps<'svg'> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative by default. A glyph that carries meaning on its own is given
      // a label by its caller, which also removes this.
      aria-hidden={rest['aria-label'] === undefined || undefined}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The reference's like button: a filled thumb, not an outline. */
export function ThumbUp({ filled = false, ...rest }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...rest} fill={filled ? 'currentColor' : 'none'}>
      <path d="M7 22V10l5-8a2.5 2.5 0 0 1 2.4 3.2L13.5 9h5.1a2.5 2.5 0 0 1 2.4 3.1l-1.7 7A2.5 2.5 0 0 1 16.9 22Z" />
      <path d="M7 10H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </Svg>
  );
}

export function Search(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function Close(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 5-7 7 7 7" />
    </Svg>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

/** The mirror of `ChevronDown`, for the pair that reorders a list. */
export function ChevronUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12 5 5L20 7" />
    </Svg>
  );
}

export function Plus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function Trash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </Svg>
  );
}

export function Pencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16Z" />
      <path d="m14 6 4 4" />
    </Svg>
  );
}

export function Download(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </Svg>
  );
}

/* --- the ability card's three numbers ------------------------------------ */

/** Cooldown. */
export function Hourglass(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3h10M7 21h10" />
      <path d="M8 3v3.5L12 11l4-4.5V3" />
      <path d="M8 21v-3.5L12 13l4 4.5V21" />
    </Svg>
  );
}

/** Mana. */
export function Droplet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10Z" />
    </Svg>
  );
}

/** Cast range, or the radius an untargeted ability works over. */
export function Crosshair(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </Svg>
  );
}

/** Leaves the site. On any link that opens somewhere else. */
export function External(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

/** Filled, because a play button that is an outline reads as disabled. */
export function Play(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor" stroke="none">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
    </Svg>
  );
}

/** Two sheets: the clipboard sense of copy, on the share and referral buttons. */
export function Copy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Svg>
  );
}

/**
 * A branch, for cloning a build into the editor.
 *
 * Deliberately not a second copy glyph. "Share build" and "Clone build" sit
 * next to each other and do different things — one puts a link on the
 * clipboard, the other opens somebody else's loadout as the start of your own
 * — so they should not be two drawings of the same idea.
 */
export function Branch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="5" r="2.5" />
      <circle cx="7" cy="19" r="2.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M7 7.5v9" />
      <path d="M17 11.5a5 5 0 0 1-5 5H7" />
    </Svg>
  );
}

/** GitHub's mark, for the footer. Solid rather than stroked, as they draw it. */
export function GithubMark({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden {...rest}>
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Discord's mark. Filled, as they draw it. */
export function DiscordMark({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M19.3 5.36A16.6 16.6 0 0 0 15.2 4.1a11.6 11.6 0 0 0-.53 1.09 15.4 15.4 0 0 0-4.61 0A11.5 11.5 0 0 0 9.52 4.1 16.5 16.5 0 0 0 5.4 5.37C2.79 9.26 2.08 13.05 2.43 16.79a16.7 16.7 0 0 0 5.06 2.57c.41-.56.77-1.15 1.08-1.77-.59-.22-1.16-.5-1.69-.82.14-.1.28-.21.42-.32a11.9 11.9 0 0 0 10.17 0c.14.11.28.22.42.32-.54.32-1.1.6-1.7.82.31.62.67 1.21 1.08 1.77a16.6 16.6 0 0 0 5.07-2.57c.42-4.33-.71-8.09-2.99-11.43ZM9.35 14.51c-1 0-1.82-.92-1.82-2.04 0-1.13.8-2.05 1.82-2.05s1.84.92 1.82 2.05c0 1.12-.8 2.04-1.82 2.04Zm5.3 0c-1 0-1.81-.92-1.81-2.04 0-1.13.79-2.05 1.81-2.05 1.03 0 1.84.92 1.82 2.05 0 1.12-.79 2.04-1.82 2.04Z" />
    </svg>
  );
}

/**
 * Steam's own mark.
 *
 * The real geometry rather than the approximation that was here: a hand-drawn
 * cog-and-pipe at 18px came out as a disc with a dot in it, which is not a logo
 * anybody recognises — and a provider button people cannot recognise at a
 * glance is the one thing this row exists to avoid.
 */
export function SteamMark({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M11.98 0C5.68 0 .51 4.86.02 11.04l6.43 2.66c.55-.37 1.2-.59 1.91-.59h.19l2.86-4.14v-.06a4.52 4.52 0 1 1 4.53 4.53h-.11l-4.07 2.91v.16a3.4 3.4 0 0 1-6.72.67L.44 15.27A12 12 0 1 0 11.98 0ZM7.54 18.21l-1.47-.61c.26.54.71 1 1.31 1.25a2.55 2.55 0 0 0 3.34-1.38 2.55 2.55 0 0 0-1.38-3.33 2.53 2.53 0 0 0-1.87-.03l1.52.63a1.88 1.88 0 1 1-1.45 3.47Zm11.42-9.3a3.02 3.02 0 1 0-6.03 0 3.02 3.02 0 0 0 6.03 0Zm-5.28 0a2.27 2.27 0 1 1 4.53-.01 2.27 2.27 0 0 1-4.53 0Z" />
    </svg>
  );
}
