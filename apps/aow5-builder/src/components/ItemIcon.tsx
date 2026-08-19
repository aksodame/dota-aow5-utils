import { iconUrl } from 'aow5-shared/data';
import { cn } from '@/lib/utils';

/**
 * Rarity tint for the addon's 1-7 quality scale (0 is the one odd item).
 *
 * Resolves to a CSS variable rather than a literal so the colours can differ
 * per theme — the dark palette's pastels are unreadable on a light background.
 * See `--quality-*` in styles.css.
 */
export function qualityColor(quality: number): string {
  const q = Number.isInteger(quality) && quality >= 0 && quality <= 7 ? quality : 0;
  return `var(--quality-${q})`;
}

interface Props {
  icon: string;
  alt: string;
  /** Fixed pixel size. Ignored when `fill` is set. */
  size?: number;
  /**
   * Stretch to the parent instead of a fixed size.
   *
   * A fixed size has to come from an inline style, which beats any `size-full`
   * class a caller passes — that mismatch is what leaves a gap inside a slot
   * whose width comes from the grid. `fill` drops the inline size so the image
   * genuinely fills its container, edge to edge.
   */
  fill?: boolean;
  /**
   * Icons come from two sources with different aspect ratios — ~88x64 from the
   * addon, square from Valve's CDN — so a shared box has to choose:
   *
   *   contain  shows the whole image, but a wide icon renders visibly smaller
   *            than a square one. Right for detail views.
   *   cover    fills the box, trimming the sides of a wide icon. Right for
   *            grids, where every tile must read as the same size.
   */
  fit?: 'contain' | 'cover';
  className?: string;
}

export function ItemIcon({ icon, alt, size = 48, fill = false, fit = 'contain', className }: Props) {
  return (
    <img
      src={iconUrl(icon)}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn(
        'shrink-0',
        fit === 'cover' ? 'object-cover' : 'object-contain',
        fill && 'block size-full',
        className,
      )}
      style={fill ? undefined : { width: size, height: size }}
    />
  );
}
