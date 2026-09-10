/**
 * A build's social card, as SVG.
 *
 * The picture that appears when somebody pastes a build link into Discord,
 * Telegram, Twitter or Slack. It is 1200×630 because that is the one size every
 * scraper agrees on, and it is a PNG by the time it leaves the server because
 * none of them render SVG — `CardService` does that part.
 *
 * **It is the build page's header, at poster size.** Same order — portrait,
 * title, headline ability, then the tier chip and the facts line — same
 * palette, same 16:9 portrait. That is deliberate: the card is the promise and
 * the page is what is delivered, and the two reading as the same object is the
 * whole job. Anything the page puts below the fold is not on it.
 *
 * **Pure, and takes its images pre-encoded.** Everything here is string
 * concatenation over a model whose image fields are already `data:` URIs. That
 * split is what makes the layout testable without a filesystem, and it is also
 * what keeps the disk reads in one place where they can be cached: a card draws
 * up to nine PNGs, and eight of them are on most other cards too.
 *
 * The text is laid out by hand because SVG has no flow layout — no wrapping, no
 * ellipsis, no "shrink to fit". Every line is its own `<text>`, positioned from
 * a width estimate. See `wrapWidth` in the shared package for what that
 * estimate is and why it cannot be exact.
 */

import { clampWidth, textWidth, wrapWidth, type SeoLang } from 'aow5-shared/seo';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * The font stack, in one place because two things must agree about it: this
 * file, which names it per `<text>`, and `CardService`, which tells resvg which
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
 * and should not parse, and nine hex strings behind one comment is a cheaper
 * way to hold that line than a build step that extracts them.
 */
const INK_900 = '#050a18'; // --ink-900, the page ground
const PANEL = '#0a0d18'; // --panel
const TEXT = '#eef3ff'; // --text
const MUTED = '#9dadd0'; // --text-muted
const BORDER = '#26304d'; // --border
const ACCENT = '#4c8eef'; // --accent, as its own token comment quotes it
const GOLD = '#ffc44d'; // --gold

/** `--radius` and `--radius-lg`, the two the header uses. */
const RADIUS = 8;
const RADIUS_LG = 14;

/**
 * One card's content, with every image already a `data:` URI and every number
 * already formatted.
 *
 * Nulls are "the author did not fill this in", and every one of them is drawn
 * as absence rather than as a placeholder — a card that spends a row saying a
 * field is empty is a card with less room for the fields that are not.
 *
 * There is no author and no like count on here, deliberately. A card is read in
 * the half-second it takes to scroll past a message, and what decides whether
 * somebody opens the link is the build — its hero, its tier, what it costs.
 * Who wrote it and how many people liked it are on the page, one click away,
 * where there is room to show them properly.
 */
export interface CardModel {
  lang: SeoLang;
  /** The site's wordmark, small, in the corner. Null falls back to `brand` as text. */
  logo: string | null;
  /** The site's name. Only drawn when there is no wordmark to draw instead. */
  brand: string;
  /** The author's title. Wrapped to two lines here. */
  title: string;
  /** The headline ability's name, immediately under the title. */
  spell: string | null;
  /** `T6`, or the Event word. Drawn as the chip the build page uses. */
  tier: string | null;
  /** `Axe · Frozen Plain`. The tier and price are drawn in their own places. */
  facts: string;
  /** `12 400 gold`. Null when the author gave no price. */
  price: string | null;
  /** The hero's art. 16:9, as it is on the page and as the file itself is. */
  portrait: string | null;
  /** The room's painted scene, drawn dimmed behind everything. */
  background: string | null;
  /** The worn six, in slot order, with `null` where a slot is empty. */
  items: readonly (string | null)[];
  /** The game's gold coin, beside the price. */
  gold: string | null;
}

/** XML text escaping. Narrower than HTML's — there are no attributes here that take user text unescaped. */
function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * How wide one unit of `textWidth` is, as a fraction of the font size.
 *
 * `textWidth` measures in "one Latin lowercase letter" units, and a budget in
 * pixels divides by this to reach them. Approximate by construction — see
 * `text.ts` — and only ever used to decide where to break or how far left to
 * put a coin, never to position anything that has to line up exactly.
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
function units(pixels: number, fontSize: number): number {
  return pixels / (fontSize * UNIT);
}

/** Roughly how many pixels a string occupies at a font size. The inverse of `units`. */
function pixels(value: string, fontSize: number): number {
  return textWidth(value) * fontSize * UNIT;
}

function text(
  value: string,
  attrs: {
    x: number;
    y: number;
    size: number;
    fill: string;
    weight?: number;
    anchor?: 'start' | 'middle' | 'end';
    spacing?: number;
  },
): string {
  const anchor = attrs.anchor === undefined ? '' : ` text-anchor="${attrs.anchor}"`;
  const spacing = attrs.spacing === undefined ? '' : ` letter-spacing="${attrs.spacing}"`;
  return (
    `<text x="${attrs.x}" y="${attrs.y}" font-family="${xml(FONT_STACK)}" font-size="${attrs.size}"` +
    ` font-weight="${attrs.weight ?? 400}" fill="${attrs.fill}"${anchor}${spacing}>${xml(value)}</text>`
  );
}

function image(href: string, x: number, y: number, w: number, h: number, clip?: string): string {
  const clipped = clip === undefined ? '' : ` clip-path="url(#${clip})"`;
  // `xMidYMid slice` crops rather than letterboxes, which is `object-fit: cover`
  // — the same rule `.portrait img` uses on the build page.
  return `<image href="${xml(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${clipped} />`;
}

/* The frame. One margin, used by everything. */
const MARGIN = 72;
const RIGHT = CARD_WIDTH - MARGIN;

/* The portrait: 16:9, as the file is and as `.portrait` renders it. */
const PORTRAIT_X = MARGIN;
const PORTRAIT_Y = 168;
const PORTRAIT_W = 384;
const PORTRAIT_H = 216;

/**
 * The gear row: six tiles, holes kept.
 *
 * Holes are drawn as empty tiles rather than closed up, so the row reads as a
 * loadout with a slot free rather than as a shorter loadout. Same reasoning as
 * `BuildPreview.items` in the webapp, and the same six slots.
 */
function gearRow(items: readonly (string | null)[], x: number, y: number): string {
  // Nothing worn at all draws no row. Six empty tiles is how a build with a gap
  // in it should read; it is not how a build with no gear should read, and a
  // shared `#b=` link that is only spells is the case that produces one.
  if (!items.some((item) => item !== null)) return '';

  const SIZE = 84;
  const GAP = 14;
  return items
    .slice(0, 6)
    .map((item, index) => {
      const left = x + index * (SIZE + GAP);
      const tile =
        `<rect x="${left}" y="${y}" width="${SIZE}" height="${SIZE}" rx="${RADIUS}"` +
        ` fill="${PANEL}" fill-opacity="0.9" stroke="${BORDER}" stroke-width="2" />`;
      if (item === null) return tile;
      return `${tile}${image(item, left + 6, y + 6, SIZE - 12, SIZE - 12)}`;
    })
    .join('');
}

/**
 * The tier chip, drawn as `.badgeTier` is: the accent at 18%, its border at
 * 45%, and the label in it uppercase and letter-spaced.
 *
 * Returns its own width so the facts line knows where to start, because SVG
 * will not tell you how wide the thing you just drew turned out to be.
 */
function tierChip(label: string, x: number, baseline: number): { svg: string; width: number } {
  const SIZE = 24;
  // Measured rather than counted: `Событие` is seven characters and `活动` is
  // two, and the second is the wider of them.
  const width = Math.max(72, pixels(label, SIZE) + 40);
  const height = 42;
  const top = baseline - 30;
  return {
    width,
    svg:
      `<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="${RADIUS}"` +
      ` fill="${ACCENT}" fill-opacity="0.18" stroke="${ACCENT}" stroke-opacity="0.45" stroke-width="2" />` +
      text(label.toUpperCase(), {
        x: x + width / 2,
        y: baseline,
        size: SIZE,
        fill: ACCENT,
        weight: 700,
        anchor: 'middle',
        spacing: 0.7,
      }),
  };
}

/**
 * The whole card.
 *
 * Laid out top-down in one pass rather than from a box model, because there is
 * exactly one layout and a box model for one layout is indirection with nothing
 * behind it. The vertical rhythm accumulates in `y` as each block is placed, so
 * a build with no headline ability closes the gap where one would have been
 * instead of leaving a hole in the middle of the card.
 */
export function renderCard(model: CardModel): string {
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"` +
      ` viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
  );

  parts.push(
    '<defs>',
    // The base wash, under the room scene as well as instead of it: a dark room
    // and a bright one have to end up equally readable behind white text.
    `<linearGradient id="base" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${INK_900}" /><stop offset="1" stop-color="#111a33" />`,
    '</linearGradient>',
    // Drawn over the room scene. Near-opaque at the left, where the portrait and
    // the title are, and thinner at the right, where the scene is allowed to
    // show through.
    `<linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">`,
    `<stop offset="0" stop-color="${INK_900}" stop-opacity="0.95" />`,
    `<stop offset="0.6" stop-color="${INK_900}" stop-opacity="0.86" />`,
    `<stop offset="1" stop-color="${INK_900}" stop-opacity="0.7" />`,
    '</linearGradient>',
    `<clipPath id="portrait">` +
      `<rect x="${PORTRAIT_X}" y="${PORTRAIT_Y}" width="${PORTRAIT_W}" height="${PORTRAIT_H}" rx="${RADIUS_LG}" />` +
      `</clipPath>`,
    '</defs>',
  );

  parts.push(`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#base)" />`);
  if (model.background !== null) parts.push(image(model.background, 0, 0, CARD_WIDTH, CARD_HEIGHT));
  parts.push(`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#scrim)" />`);

  /*
   * The wordmark, small and in the corner.
   *
   * Small on purpose. It is here so a card is recognisably from this site, not
   * to be the subject of the picture — the build is the subject, and a logo
   * sized to compete with the title makes every card look like an
   * advertisement for the site rather than a link to a guide.
   */
  if (model.logo !== null) {
    const LOGO_H = 40;
    // The wordmark file is 2392×420. Kept as a ratio rather than a second
    // constant so re-exporting it at a different size cannot distort it.
    parts.push(image(model.logo, MARGIN, 48, LOGO_H * (2392 / 420), LOGO_H));
  } else {
    parts.push(text(model.brand, { x: MARGIN, y: 78, size: 26, fill: MUTED, weight: 700, spacing: 0.8 }));
  }

  if (model.portrait !== null) {
    parts.push(
      `<rect x="${PORTRAIT_X}" y="${PORTRAIT_Y}" width="${PORTRAIT_W}" height="${PORTRAIT_H}" rx="${RADIUS_LG}" fill="${PANEL}" />`,
      image(model.portrait, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, 'portrait'),
      `<rect x="${PORTRAIT_X}" y="${PORTRAIT_Y}" width="${PORTRAIT_W}" height="${PORTRAIT_H}" rx="${RADIUS_LG}"` +
        ` fill="none" stroke="${BORDER}" stroke-width="2" />`,
    );
  }

  /*
   * The text column starts after the portrait when there is one, and at the
   * margin when there is not — a card for a build that names no hero should not
   * have a column of empty space where the portrait would have been.
   */
  const left = model.portrait === null ? MARGIN : PORTRAIT_X + PORTRAIT_W + 44;
  const column = RIGHT - left;

  const TITLE_SIZE = 52;
  const lines = wrapWidth(model.title, units(column, TITLE_SIZE), 2);
  // A one-line title sits lower, so the block stays optically centred against
  // the portrait instead of riding high with a gap under it.
  let y = lines.length > 1 ? PORTRAIT_Y + 46 : PORTRAIT_Y + 78;
  for (const line of lines) {
    parts.push(text(line, { x: left, y, size: TITLE_SIZE, fill: TEXT, weight: 900 }));
    y += TITLE_SIZE + 12;
  }
  y -= TITLE_SIZE + 12; // back to the last baseline

  /*
   * The headline ability, immediately under the title and in the accent.
   *
   * Directly under it because it is part of what the build *is* — "Frost-lock
   * Axe" names itself, and the ability is what it is named after. In the accent
   * rather than in the muted grey the facts get, because of the same
   * distinction: the facts are how a build is filed, this is what it does.
   */
  const SPELL_SIZE = 30;
  if (model.spell !== null && model.spell !== '') {
    y += 52;
    parts.push(
      text(clampWidth(model.spell, units(column, SPELL_SIZE)), {
        x: left,
        y,
        size: SPELL_SIZE,
        fill: ACCENT,
        weight: 700,
      }),
    );
  }

  // The tier chip and the facts, on one line under the title — the build page's
  // subtitle row, in the same order.
  y += 54;
  let factsAt = left;
  if (model.tier !== null) {
    const chip = tierChip(model.tier, left, y);
    parts.push(chip.svg);
    factsAt = left + chip.width + 20;
  }
  const FACT_SIZE = 28;
  if (model.facts !== '') {
    parts.push(
      text(clampWidth(model.facts, units(RIGHT - factsAt, FACT_SIZE)), {
        x: factsAt,
        y,
        size: FACT_SIZE,
        fill: MUTED,
      }),
    );
  }

  // The gear row and the price share the bottom band.
  parts.push(gearRow(model.items, MARGIN, CARD_HEIGHT - 154));

  if (model.price !== null) {
    const PRICE_SIZE = 38;
    parts.push(
      text(model.price, { x: RIGHT, y: CARD_HEIGHT - 96, size: PRICE_SIZE, fill: GOLD, weight: 700, anchor: 'end' }),
    );
    if (model.gold !== null) {
      // Positioned from the same estimate the text was measured with. Being a
      // few pixels out here costs a slightly wide gap, not a collision.
      parts.push(image(model.gold, RIGHT - pixels(model.price, PRICE_SIZE) - 52, CARD_HEIGHT - 126, 38, 38));
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
