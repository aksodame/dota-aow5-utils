/**
 * One item's social card, as SVG.
 *
 * The picture that appears when an `/items/<id>` link is pasted anywhere. Same
 * 1200×630, same palette and the same primitives as a build's card — and
 * deliberately the same *shape*: the art where the portrait goes, the name
 * where the title goes, the chips and the facts line in the same places. A
 * reader who has seen one of this site's cards should recognise the other as
 * the same site rather than read it as a different product.
 *
 * What differs is what a build does not have and an item does: a rarity ring in
 * the item's own grade, drawn around art that is square rather than 16:9.
 *
 * Pure, like `renderCard`, and takes its images pre-encoded — see the note
 * there for why that split exists.
 */

import { clampWidth, wrapWidth, type SeoLang } from 'aow5-shared/seo';
import {
  ACCENT,
  ACCENT_2,
  BORDER,
  CARD_HEIGHT,
  CARD_WIDTH,
  GOLD,
  INK_900,
  MARGIN,
  MUTED,
  PANEL,
  RADIUS,
  RADIUS_LG,
  RIGHT,
  TEXT,
  image,
  pixels,
  text,
  units,
} from './card-svg.ts';

export interface ItemCardModel {
  lang: SeoLang;
  logo: string | null;
  logoAspect?: number | null;
  brand: string;
  /** The item's name, wrapped to two lines here. */
  title: string;
  /** The item's own art, already a `data:` URI. Square. */
  art: string | null;
  /**
   * The rarity's colour, as the page's `--q1`…`--q7` resolve to.
   *
   * Passed in rather than computed, because the grade-to-colour ramp is a
   * stylesheet's and this file draws pictures. Null falls back to the border
   * colour, which is what an unrecognised grade should look like.
   */
  rarity: string | null;
  /** The rarity's name — `Legendary`. Drawn as a chip in that colour. */
  rarityLabel: string | null;
  /** `T6`. The same blue chip a build's tier gets. */
  tier: string | null;
  /** `S2`, only for an item the pak restricts to a season. */
  season?: string | null;
  /** `Equipment · Quality 5` — the tier and price are drawn in their own places. */
  facts: string;
  /** `12.4k gold`. Null for the items that are not bought. */
  price: string | null;
  /** The game's gold coin, beside the price. */
  gold: string | null;
  /**
   * What the item does, for the things whose description *is* the item — a
   * material, a consumable, a chest.
   *
   * Not for equipment: a passive is a paragraph, and a card that carried one
   * would have room for nothing else and would still cut it mid-clause. Those
   * get `stats` instead.
   */
  description: string;
  /**
   * The stat lines, for equipment.
   *
   * The numbers are what tells one sword from another at a glance, which is
   * the job a card has half a second to do.
   */
  stats?: readonly { value: string; label: string }[];
}

/*
 * The art: square, where a build's card puts its 16:9 portrait.
 *
 * Higher than the build card's, because this one has a body. A build's card
 * fills its lower half with a row of gear tiles; this one fills it with stat
 * lines, and at the old `y` there was room for two of them under a title while
 * 180px sat empty above.
 */
const ART_X = MARGIN;
const ART_Y = 136;
const ART_SIZE = 216;

const TEXT_X = ART_X + ART_SIZE + 48;

/** A chip, drawn exactly as `card.ts` draws a build's tier and season. */
function chip(label: string, x: number, baseline: number, colour: string): { svg: string; width: number } {
  const SIZE = 24;
  const width = Math.max(72, pixels(label, SIZE) + 40);
  const height = 42;
  const top = baseline - 30;
  return {
    width,
    svg:
      `<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="${RADIUS}"` +
      ` fill="${colour}" fill-opacity="0.18" stroke="${colour}" stroke-opacity="0.45" stroke-width="2" />` +
      text(label.toUpperCase(), {
        x: x + width / 2,
        y: baseline,
        size: SIZE,
        fill: colour,
        weight: 700,
        anchor: 'middle',
        spacing: 0.7,
      }),
  };
}

export function renderItemCard(model: ItemCardModel): string {
  const parts: string[] = [];
  const ring = model.rarity ?? BORDER;

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"` +
      ` viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
  );

  parts.push(
    '<defs>',
    `<linearGradient id="base" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${INK_900}" /><stop offset="1" stop-color="#111a33" />`,
    '</linearGradient>',
    /*
     * A wash of the item's own grade, behind the art and fading out across the
     * card. It is the one thing that makes a mythic's card look different from
     * a common's at a glance, which is the fact worth carrying at poster size.
     */
    `<radialGradient id="grade" cx="0.18" cy="0.55" r="0.75">`,
    `<stop offset="0" stop-color="${ring}" stop-opacity="0.22" />`,
    `<stop offset="1" stop-color="${ring}" stop-opacity="0" />`,
    '</radialGradient>',
    `<clipPath id="art">` +
      `<rect x="${ART_X}" y="${ART_Y}" width="${ART_SIZE}" height="${ART_SIZE}" rx="${RADIUS_LG}" />` +
      `</clipPath>`,
    '</defs>',
  );

  parts.push(`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#base)" />`);
  parts.push(`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#grade)" />`);

  // The wordmark, small and in the corner, exactly as a build's card has it.
  if (model.logo !== null) {
    const height = 44;
    const width = height * (model.logoAspect ?? 2092 / 420);
    parts.push(image(model.logo, MARGIN, 56, width, height));
  } else {
    parts.push(text(model.brand, { x: MARGIN, y: 92, size: 40, fill: TEXT, weight: 800 }));
  }

  // The art, in a panel ringed in the item's grade.
  parts.push(
    `<rect x="${ART_X}" y="${ART_Y}" width="${ART_SIZE}" height="${ART_SIZE}" rx="${RADIUS_LG}"` +
      ` fill="${PANEL}" fill-opacity="0.92" stroke="${ring}" stroke-width="4" />`,
  );
  if (model.art !== null) {
    const pad = 22;
    parts.push(image(model.art, ART_X + pad, ART_Y + pad, ART_SIZE - pad * 2, ART_SIZE - pad * 2, 'art'));
  }

  /*
   * The name, then the chips, then the facts, then the description — the same
   * top-down accumulation `renderCard` uses, and for the same reason: an item
   * with no price or no season closes the gap rather than leaving a hole.
   */
  let y = ART_Y + 52;
  const width = RIGHT - TEXT_X;

  const titleSize = 58;
  const lines = wrapWidth(model.title, units(width, titleSize), 2);
  for (const line of lines) {
    parts.push(text(line, { x: TEXT_X, y, size: titleSize, fill: TEXT, weight: 800 }));
    y += titleSize + 8;
  }

  y += 16;
  let x = TEXT_X;
  if (model.season != null && model.season !== '') {
    const c = chip(model.season, x, y, ACCENT_2);
    parts.push(c.svg);
    x += c.width + 12;
  }
  if (model.tier !== null) {
    const c = chip(model.tier, x, y, ACCENT);
    parts.push(c.svg);
    x += c.width + 12;
  }
  if (model.rarityLabel !== null) {
    const c = chip(model.rarityLabel, x, y, ring);
    parts.push(c.svg);
    x += c.width + 12;
  }
  const chipped = x > TEXT_X;
  if (chipped) y += 54;

  if (model.facts !== '') {
    parts.push(
      text(clampWidth(model.facts, units(width, 28)), { x: TEXT_X, y, size: 28, fill: MUTED, weight: 600 }),
    );
    y += 46;
  }

  /*
   * The body: an item's stats, or its description.
   *
   * Never both. Equipment is its numbers and a material is its sentence, and a
   * card that tried to carry each item's every fact would carry none of them
   * legibly. Whichever it is starts where the facts line ended and takes what
   * is left above the bottom band.
   */
  const BOTTOM = CARD_HEIGHT - 116;

  if (model.stats !== undefined && model.stats.length > 0) {
    /*
     * Two columns, because one wasted the right half of the card and still cut
     * the list short. Filled down then across — a reader takes a column at a
     * time — and each cell's label is clamped to its own column's width, so a
     * long one ends in an ellipsis rather than running under its neighbour.
     */
    const size = 28;
    const line = size + 14;
    const rows = Math.max(1, Math.floor((BOTTOM - y) / line));
    const COLUMNS = 2;
    const colWidth = (RIGHT - TEXT_X) / COLUMNS;

    model.stats.slice(0, rows * COLUMNS).forEach((stat, i) => {
      const column = Math.floor(i / rows);
      const left = TEXT_X + column * colWidth;
      const at = left + pixels(stat.value, size) + 12;
      parts.push(
        text(stat.value, { x: left, y: y + (i % rows) * line, size, fill: ACCENT, weight: 700 }),
        // `- 16` keeps a gutter between the columns, so the left one's ellipsis
        // is not flush against the right one's number.
        text(clampWidth(stat.label, units(left + colWidth - at - 16, size)), {
          x: at,
          y: y + (i % rows) * line,
          size,
          fill: TEXT,
        }),
      );
    });
    y += Math.min(rows, model.stats.length) * line;
  } else if (model.description !== '') {
    const size = 26;
    const room = Math.max(0, Math.floor((BOTTOM - y) / (size + 10)));
    /*
     * Clamped by measured width rather than by character count, because `%`
     * placeholders have already been substituted and a stat sentence in Russian
     * is half again as wide as the same one in English.
     */
    for (const line of wrapWidth(model.description, units(width, size), Math.min(3, room))) {
      parts.push(text(line, { x: TEXT_X, y, size, fill: MUTED }));
      y += size + 10;
    }
  }

  /*
   * The price, bottom right — where a build's card puts its own, so the two
   * read as one family and the eye knows where to find the number.
   */
  if (model.price !== null) {
    const PRICE_SIZE = 38;
    parts.push(
      text(model.price, { x: RIGHT, y: CARD_HEIGHT - 96, size: PRICE_SIZE, fill: GOLD, weight: 700, anchor: 'end' }),
    );
    if (model.gold !== null) {
      // Positioned from the same estimate the text was measured with; being a
      // few pixels out costs a slightly wide gap, not a collision.
      parts.push(image(model.gold, RIGHT - pixels(model.price, PRICE_SIZE) - 52, CARD_HEIGHT - 126, 38, 38));
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
