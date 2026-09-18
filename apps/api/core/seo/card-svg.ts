/**
 * The SVG both social cards are drawn with.
 *
 * Split out of `card.ts` when the tracker page got a card of its own. What is
 * here is everything neither card gets to have an opinion about — the frame
 * size, the font stack, the palette, and the four primitives that put a string
 * or a picture at a coordinate. What is *not* here is any layout: `card.ts`
 * lays out a build and `tracker-card.ts` lays out the overlay, and they share
 * nothing beyond this.
 *
 * The reason to share it at all is the pair of promises a card makes: it is
 * 1200×630 because that is the one size every scraper agrees on, and it is this
 * blue because the page it links to is. Two files each naming their own hex for
 * `--border` is two chances for one of them to stop matching the site.
 *
 * SVG has no flow layout — no wrapping, no ellipsis, no "shrink to fit" — so
 * every line either card draws is its own `<text>` at a position worked out
 * from a width *estimate*. See `wrapWidth` in the shared package for what that
 * estimate is and why it cannot be exact, and `pnpm card-preview` for the only
 * way to actually check a layout.
 */

import { textWidth } from 'aow5-shared/seo';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * The font stack, in one place because two things must agree about it: the
 * cards, which name it per `<text>`, and `CardService`, which tells resvg which
 * family to fall back to.
 *
 * Noto Sans CJK leads even for English text, and that is deliberate rather than
 * backwards: the family carries Latin, Cyrillic *and* Simplified Chinese, so
 * one name covers all three languages the site speaks — and a build title is
 * author-written, which means a Chinese title can turn up on an English card at
 * any time. A Latin-only first choice renders those as a row of empty boxes.
 *
 * It is the only entry the deployed image actually has (see the apt line in
 * infra/api.Dockerfile). The rest are for `pnpm card-preview` on a developer's
 * machine, where none of the Noto packages exist — the two after DejaVu are
 * macOS's, and without them a preview falls through to a monospace default and
 * misrepresents every width on the card.
 */
export const FONT_STACK =
  "'Noto Sans CJK SC', 'Noto Sans', 'DejaVu Sans', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif";

/**
 * The palette, lifted from `apps/webapp/src/styles.css`.
 *
 * Hex rather than the `oklch()` the stylesheet writes `--accent` in, because
 * resvg's CSS colour parsing predates it — the value is the one the token's own
 * comment quotes. Everything else is copied verbatim from the token it is named
 * after, so a card and the page it links to are the same blue.
 *
 * Not imported from anywhere: the tokens live in a stylesheet the API does not
 * and should not parse, and a handful of hex strings behind one comment is a
 * cheaper way to hold that line than a build step that extracts them.
 */
export const INK_900 = '#050a18'; // --ink-900, the page ground
export const PANEL = '#0a0d18'; // --panel
export const TEXT = '#eef3ff'; // --text
export const MUTED = '#9dadd0'; // --text-muted
export const BORDER = '#26304d'; // --border
export const ACCENT = '#4c8eef'; // --accent, as its own token comment quotes it
export const ACCENT_2 = '#3fc0c0'; // --accent-2, oklch(0.74 0.11 195) in sRGB — the season chip
export const GOLD = '#ffc44d'; // --gold

/** `--radius` and `--radius-lg`. */
export const RADIUS = 8;
export const RADIUS_LG = 14;

/** The frame. One margin, used by both cards. */
export const MARGIN = 72;
export const RIGHT = CARD_WIDTH - MARGIN;

/**
 * How wide one unit of `textWidth` is, as a fraction of the font size.
 *
 * `textWidth` measures in "one Latin lowercase letter" units, and a budget in
 * pixels divides by this to reach them. Approximate by construction — see
 * `text.ts` in the shared package — and only ever used to decide where to break
 * or how far left to put a coin, never to position anything that has to line up
 * exactly.
 *
 * **Deliberately generous.** A proportional sans averages nearer 0.5 for mixed
 * case, so this over-estimates and the text stops a little short of the space
 * it had. That is the safe direction: under-estimating does not produce a
 * slightly tight card, it produces a title running off the edge of the image —
 * and the image is a PNG somebody else's chat client has already cached. 0.6 is
 * also just above a monospace advance width, so a deployment whose font stack
 * falls through to a fixed-pitch face still fits inside the frame instead of
 * escaping it.
 */
const UNIT = 0.6;

/** A pixel budget expressed in the units `wrapWidth` and `clampWidth` want. */
export function units(pixels: number, fontSize: number): number {
  return pixels / (fontSize * UNIT);
}

/** Roughly how many pixels a string occupies at a font size. The inverse of `units`. */
export function pixels(value: string, fontSize: number): number {
  return textWidth(value) * fontSize * UNIT;
}

/** XML text escaping. Narrower than HTML's — no attribute here takes user text unescaped. */
export function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TextAttrs {
  x: number;
  y: number;
  size: number;
  fill: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  spacing?: number;
  /** For the one line that is drawn over artwork rather than over a slab. */
  opacity?: number;
}

export function text(value: string, attrs: TextAttrs): string {
  const anchor = attrs.anchor === undefined ? '' : ` text-anchor="${attrs.anchor}"`;
  const spacing = attrs.spacing === undefined ? '' : ` letter-spacing="${attrs.spacing}"`;
  const opacity = attrs.opacity === undefined ? '' : ` fill-opacity="${attrs.opacity}"`;
  return (
    `<text x="${attrs.x}" y="${attrs.y}" font-family="${xml(FONT_STACK)}" font-size="${attrs.size}"` +
    ` font-weight="${attrs.weight ?? 400}" fill="${attrs.fill}"${anchor}${spacing}${opacity}>${xml(value)}</text>`
  );
}

/**
 * Two or more runs of differently-coloured text on one baseline.
 *
 * `<tspan>` rather than a second `<text>` at a measured offset, because the
 * offset is the one thing here that cannot be estimated: a width estimate is
 * fine for deciding where to break a line and useless for butting two words
 * together. Estimating it put `AOW5TRACKER` in the overlay's title bar and a
 * double space in its room line. SVG advances a `tspan` from the real glyph
 * widths, which is exactly the measurement this side of the renderer does not
 * have.
 */
export function textRun(
  runs: ReadonlyArray<{ value: string; fill: string; weight?: number }>,
  attrs: Omit<TextAttrs, 'fill'> & { fill?: string },
): string {
  const anchor = attrs.anchor === undefined ? '' : ` text-anchor="${attrs.anchor}"`;
  const spacing = attrs.spacing === undefined ? '' : ` letter-spacing="${attrs.spacing}"`;
  const spans = runs
    .map(
      (run) =>
        `<tspan fill="${run.fill}"${run.weight === undefined ? '' : ` font-weight="${run.weight}"`}>` +
        `${xml(run.value)}</tspan>`,
    )
    .join('');
  return (
    `<text x="${attrs.x}" y="${attrs.y}" font-family="${xml(FONT_STACK)}" font-size="${attrs.size}"` +
    ` font-weight="${attrs.weight ?? 400}" fill="${attrs.fill ?? 'none'}"${anchor}${spacing}>${spans}</text>`
  );
}

export function image(href: string, x: number, y: number, w: number, h: number, clip?: string): string {
  const clipped = clip === undefined ? '' : ` clip-path="url(#${clip})"`;
  // `xMidYMid slice` crops rather than letterboxes, which is `object-fit: cover`
  // — the same rule the pages use on the same pictures.
  return `<image href="${xml(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${clipped} />`;
}

/** A rounded box: the shape both cards build their slabs and tiles out of. */
export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  attrs: { rx?: number; fill?: string; fillOpacity?: number; stroke?: string; strokeOpacity?: number; strokeWidth?: number },
): string {
  const parts = [`x="${x}"`, `y="${y}"`, `width="${w}"`, `height="${h}"`];
  if (attrs.rx !== undefined) parts.push(`rx="${attrs.rx}"`);
  parts.push(`fill="${attrs.fill ?? 'none'}"`);
  if (attrs.fillOpacity !== undefined) parts.push(`fill-opacity="${attrs.fillOpacity}"`);
  if (attrs.stroke !== undefined) parts.push(`stroke="${attrs.stroke}"`);
  if (attrs.strokeOpacity !== undefined) parts.push(`stroke-opacity="${attrs.strokeOpacity}"`);
  if (attrs.strokeWidth !== undefined) parts.push(`stroke-width="${attrs.strokeWidth}"`);
  return `<rect ${parts.join(' ')} />`;
}
