/**
 * The tracker page's social card: the farm overlay, at poster size.
 *
 * The picture that appears when somebody pastes a link to `/tracker`. Until
 * this existed that page shared the default site card, which says "Build guides
 * for Age of Weapons 5" over a room scene — true of the site and wrong about
 * the one page it was standing in for.
 *
 * **It is the overlay, drawn the way the page draws it.** `HudPreview` in the
 * web app depicts the Torchlight skin — one headline figure, two small readings
 * beside it, a band of three, then the loot — and this is the same panel in
 * SVG. The two are separate implementations of one picture, which is a cost
 * paid on purpose: there is no shared renderer that both a browser and resvg
 * can drive, since resvg has no flex layout and the page has no reason to be
 * written without one.
 *
 * What they *do* share is everything that could be wrong in only one of them.
 * The session — which items, how many, how long, how many rooms — comes from
 * `aow5-shared/overlay`, so the card and the page quote the same gold. The item
 * names, prices, art and rarity come from the extracted tables on both sides.
 * The only thing copied rather than shared is the palette, for the same reason
 * `card-svg.ts` copies the site's: the tokens live in a stylesheet the API does
 * not parse.
 *
 * ## What is left off
 *
 * The hotkey hint along the bottom of the real panel. It is 15 pixels of grey
 * at this scale, and a social card is read at about four tenths of its own size
 * in a chat client — so it would be an unreadable smudge under the loot list.
 * The page it links to says the same thing in a step somebody can actually
 * follow. Everything else on the panel is here.
 *
 * Use `pnpm card-preview` to look at it. This file is laid out by hand from
 * width estimates and there is no unit test that can see a collision.
 */

import { clampWidth, wrapWidth, type SeoLang } from 'aow5-shared/seo';
import {
  PREVIEW_ROOM_SECONDS,
  PREVIEW_RUNS,
  PREVIEW_SESSION_SECONDS,
  clock,
  compact,
  type PreviewReadout,
} from 'aow5-shared/overlay';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  MARGIN,
  MUTED,
  TEXT,
  image,
  pixels,
  rect,
  text,
  textRun,
  units,
} from './card-svg.ts';

/**
 * The Torchlight skin's palette, as hex.
 *
 * The tracker writes these as `oklch()` in `apps/tracker/src/styles.css` under
 * `:root[data-style='torchlight']`, and resvg's colour parsing predates that
 * notation — so they are converted here, and the oklch each one came from is in
 * the comment beside it. Pinned rather than themed for the same reason the web
 * app's copy is: the overlay has no light mode. It sits over Dota, not over a
 * page.
 */
const HUD = {
  /** `oklch(0.185 0.015 258)` — barely lit. A ground for the orange, not a colour. */
  card: '#0f1319',
  fg: '#f4f5f7', // oklch(0.97 0.003 260)
  muted: '#848a92', // oklch(0.63 0.014 258)
  /** `oklch(0.33 0.018 258)` — the hairlines *inside* the panel, which stay cool. */
  line: '#30363f',
  /** `oklch(0.72 0.19 47)` — the one saturated colour: headings, the dot. */
  primary: '#ff761c',
  /** `oklch(0.68 0.2 47)` — the outer frame only, which is why it is its own token. */
  frame: '#f66500',
  /** `oklch(0.93 0.045 78)` — warm off-white. Not gold: the orange is the accent here. */
  gold: '#f9e5c7',
} as const;

/**
 * Item rarity, the tracker's own eight values.
 *
 * The one group a skin may not touch over there, and the one group this card
 * may not take from the site's palette: a player learns what a purple name
 * means once and reads it for a thousand hours. Index 0 is unused — the game
 * grades from 1.
 */
const QUALITY = ['#6b7280', '#9ca3af', '#4ade80', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#fbbf24'] as const;

const qualityColor = (quality: number): string =>
  QUALITY[Number.isInteger(quality) && quality >= 1 && quality <= 7 ? quality : 1] ?? QUALITY[1];

/**
 * Two columns of equal width, and the panel is that width in both of them.
 *
 * Collapsing the overlay changes its height and never its width, so the two
 * states have to be drawn the same width or they stop reading as one window.
 * That fixes the column, and the column fixes the scale.
 */
const COLUMN_GAP = 20;
const PANEL_W = (CARD_WIDTH - MARGIN * 2 - COLUMN_GAP) / 2;

/** The panel's width in units. 25 is the farm window's 600-pixel default. */
const PANEL_UNITS = 25;

/**
 * The overlay's root font size on this card, in card pixels.
 *
 * The tracker sets `html { font-size: 24px }` and every length in the HUD is a
 * multiple of it, so this one number is the scale of the whole panel.
 * Everything below is written as `U * k`, where `k` is the rem figure the
 * tracker writes, so a value here can be read straight against a value there —
 * and the panel comes out as the default window at whatever fraction of its own
 * size the column allows.
 */
const U = PANEL_W / PANEL_UNITS;

/** The hairline frame. One card pixel, not scaled: a border is a border. */
const HAIR = 1;

export interface TrackerCardModel {
  lang: SeoLang;
  /** The site's wordmark, small, in the corner. Null falls back to `brand` as text. */
  logo: string | null;
  /** The wordmark's own width ÷ height, so the card can size it without knowing the file. */
  logoAspect?: number | null;
  /** The site's name. Only drawn when there is no wordmark to draw instead. */
  brand: string;
  /** The page's title, as its `<title>` and `og:title` say it. */
  title: string;
  /**
   * The overlay's own words, in the reader's language.
   *
   * Copied into `SEO_STRINGS` from `apps/tracker/src/i18n/`, not translated
   * again — a card that labels a figure differently from the app it is a picture
   * of is a card mislabelling the thing it is selling.
   */
  overlay: {
    /** Which window: the title bar reads `AOW5 tracker`. */
    window: string;
    /** The room line's run-in — "At " before a room's name. */
    at: string;
    /** The room, already resolved out of the map table. */
    room: string;
    cards: Readonly<Record<'session' | 'sessionGold' | 'sessionBest' | 'mapTime' | 'mapGold' | 'mapGoldAverage', string>>;
    columns: { name: string; unit: string; total: string };
  };
  /** Every figure on the panel, derived from the shared session. */
  readout: PreviewReadout;
  /** Item art as `data:` URIs, by item id. A missing one draws an empty well. */
  art: Readonly<Record<string, string | null>>;
}

/**
 * A stroked icon from the overlay's chrome, on lucide's 24-unit grid.
 *
 * The same shapes `apps/webapp/src/components/HudGlyphs.tsx` draws, and
 * knowingly a second copy of them: that file renders React children and this one
 * concatenates an SVG string, and the only way to share the geometry would be
 * to rewrite every circle and rect as an arc path so both could take a bare
 * `d`. That trades two readable copies for one unreadable one, for eleven
 * decorative shapes.
 */
const GLYPHS = {
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  restart: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/>',
  skull:
    '<path d="M12 2a8 8 0 0 0-5 14.25V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.75A8 8 0 0 0 12 2Z"/><circle cx="9.5" cy="10" r="1.25"/><circle cx="14.5" cy="10" r="1.25"/><path d="M12 14v2"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  trophy:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3"/><path d="M17 6h3v1a3 3 0 0 1-3 3"/><path d="M10 20h4"/><path d="M12 14v6"/>',
} as const;

/** One glyph, `size` pixels square, its top-left at `x, y`. */
function glyph(name: keyof typeof GLYPHS, x: number, y: number, size: number, color: string): string {
  const scale = size / 24;
  return (
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale, 4)})" fill="none" stroke="${color}"` +
    ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</g>`
  );
}

/** Trims the float noise `U * k` arithmetic produces, which is half the file's bytes otherwise. */
function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Roughly where a baseline sits inside a line box of a given font size.
 *
 * The panel is laid out as boxes, the way the CSS is, but SVG positions text by
 * its baseline — so every label needs the one converted to the other. 0.78 of
 * the size below the box top is where a sans-serif's baseline actually lands for
 * a line box of about 1.25; it is an estimate like every other measurement here,
 * and being a pixel out costs nothing because no two of these have to align.
 */
const baseline = (top: number, size: number): number => top + size * 0.78;

/**
 * Roughly how wide a label comes out once drawn.
 *
 * `pixels` assumes mixed case, and every label on this panel is uppercased and
 * letter-spaced — both of which make it wider than that estimate. Trusting the
 * estimate is what put `SESSION TI…` in the pairs column: the column was sized
 * to the estimate, the text was drawn at its real width, and the clamp cut the
 * difference off. So the estimate is corrected instead: 1.2 is the uppercase
 * allowance, and the second term is the tracking the label carries.
 *
 * Still an estimate, and still generous on purpose — see `UNIT` in
 * `card-svg.ts` for which direction is the safe one to be wrong in.
 */
function labelWidth(value: string, size: number = U * 0.5): number {
  return pixels(value.toUpperCase(), size) * 1.2 + size * 0.09 * value.length;
}

/**
 * A label: the small grey heading over every figure in this layout.
 *
 * Uppercased here rather than in the catalogs, because that is where the
 * overlay does it — `text-transform: uppercase` on `.hud-tl-label` — and a
 * translator should be handed the sentence case a language actually uses. It is
 * a no-op for the Chinese catalog, which has no case to change.
 */
function label(value: string, x: number, top: number, width: number, color: string = HUD.muted): string {
  const size = U * 0.5;
  // The budget is corrected the same way `labelWidth` is, so a label is clamped
  // against the space it will really occupy rather than against the estimate.
  return text(clampWidth(value.toUpperCase(), units(width, size) / 1.2), {
    x,
    y: baseline(top, size),
    size,
    fill: color,
    weight: color === HUD.primary ? 600 : 400,
    spacing: size * 0.09,
  });
}

/**
 * The readout: one frame, and every division inside it a hairline.
 *
 * The single most important thing about this layout, and the thing a row of
 * cards cannot imitate — the cells run edge to edge with a rule between them
 * and no gap at all, so the block reads as one instrument with several dials
 * rather than as five widgets that happen to be adjacent.
 *
 * Returns its own height, because the panel below it has to know where it ends.
 */
function readoutGrid(model: TrackerCardModel, top: number, width: number): { svg: string; height: number } {
  const parts: string[] = [];
  const { readout, overlay } = model;
  const { best } = readout;

  /*
   * The two small readings decide the split. They are a column sized to its own
   * content — label, a gap, then a fixed 3.5-unit figure — and the headline
   * takes whatever is left, which is how the real panel divides the row.
   */
  const pairLabel = Math.max(labelWidth(overlay.cards.session), labelWidth(overlay.cards.sessionGold));
  const pairsW = U * 0.5 + pairLabel + U * 0.5 + U * 3.5 + U * 0.5;
  const headW = width - pairsW - HAIR;

  const pairH = U * 0.125 * 2 + U * 0.6875 * 1.25;
  const headH = U * 0.25 * 2 + U * 0.5 * 1.3 + U * 1.5 * 1.1;
  const topH = Math.max(headH, pairH * 2);

  // --- the headline cell
  const hx = top;
  let hy = hx + U * 0.25;

  // The dot earns its pixel: it marks which of the labels on the panel belongs
  // to the headline, in a skin where every label is the same size.
  const dot = U * 0.25;
  const headingSize = U * 0.5;
  const headingTop = hy;
  parts.push(
    `<circle cx="${round(U * 0.5 + dot / 2)}" cy="${round(baseline(headingTop, headingSize) - headingSize * 0.28)}"` +
      ` r="${round(dot / 2)}" fill="${HUD.primary}" />`,
  );
  const headingX = U * 0.5 + dot + U * 0.25;
  const headingW = labelWidth(overlay.cards.sessionBest);
  parts.push(label(overlay.cards.sessionBest, headingX, headingTop, headingW + 4, HUD.primary));

  /*
   * The item, on the heading's line rather than under the number: a third line
   * would make this cell taller than the band below it, and the point of the
   * arrangement is that it is short.
   *
   * Clamped to what is actually left beside the heading rather than to a
   * fraction of the cell. The fraction was how `ЛУЧШИЙ ДРОП` and
   * `Кристалл небес` ended up touching: two independent budgets over one line
   * add up to more than the line in the language where both are longest.
   */
  if (best !== null) {
    const nameSize = U * 0.5625;
    const room = headW - U * 0.5 - headingX - headingW - U * 0.5;
    parts.push(
      text(clampWidth(best.item.name, units(room, nameSize) / 1.05), {
        x: round(headW - U * 0.5),
        y: round(baseline(headingTop, headingSize)),
        size: nameSize,
        fill: qualityColor(best.item.quality),
        weight: 600,
        anchor: 'end',
      }),
    );
  }

  hy += headingSize * 1.3;

  // Three times a card's icon, and for the best drop it is the item's own art —
  // at this size it is the fastest thing on the panel to read. You know what
  // dropped before the number beside it.
  const artSize = U * 1.35;
  const figureSize = U * 1.5;
  const rowTop = hy;
  const artUri = best === null ? null : (model.art[best.item.id] ?? null);
  if (artUri !== null) {
    parts.push(image(artUri, round(U * 0.5), round(rowTop + (figureSize * 1.1 - artSize) / 2), round(artSize), round(artSize)));
  }
  const figureX = U * 0.5 + artSize + U * 0.375;
  const figure = best === null ? '—' : compact(best.total);
  parts.push(
    text(figure, {
      x: round(figureX),
      y: round(baseline(rowTop, figureSize) + figureSize * 0.06),
      size: figureSize,
      fill: HUD.gold,
      weight: 700,
    }),
  );
  // `(×20)`: a footnote to the number, not a second one.
  if (best !== null) {
    parts.push(
      text(`(×${best.qty})`, {
        x: round(figureX + pixels(figure, figureSize) + U * 0.25),
        y: round(baseline(rowTop, figureSize) + figureSize * 0.06),
        size: U * 0.625,
        fill: HUD.muted,
      }),
    );
  }

  // --- the pairs, label left and figure right on one line. The opposite of
  // every other figure here, which stacks them: this column is narrow enough
  // that stacking would make the block taller than the headline it sits beside.
  const pairsX = headW + HAIR;
  parts.push(`<line x1="${round(pairsX)}" y1="${round(top)}" x2="${round(pairsX)}" y2="${round(top + topH)}" stroke="${HUD.line}" stroke-width="${HAIR}" />`);

  const pairsTop = top + (topH - pairH * 2) / 2;
  const pairs: Array<[string, string]> = [
    [overlay.cards.session, clock(PREVIEW_SESSION_SECONDS)],
    [overlay.cards.sessionGold, compact(readout.sessionGold)],
  ];
  pairs.forEach(([name, value], index) => {
    const boxTop = pairsTop + index * pairH + U * 0.125;
    const size = U * 0.6875;
    parts.push(label(name, pairsX + U * 0.5, boxTop + (size * 1.25 - U * 0.5 * 1.3) / 2, pairLabel + 4));
    parts.push(
      text(value, {
        x: round(pairsX + pairsW - U * 0.5),
        y: round(baseline(boxTop, size)),
        size,
        fill: HUD.fg,
        weight: 600,
        anchor: 'end',
      }),
    );
  });

  // --- the totals band. Equal widths, because none of the three outranks the others.
  const bandTop = top + topH + HAIR;
  const bandH = U * 0.25 * 2 + U * 0.5 * 1.3 + 1 + U * 0.8125 * 1.25;
  parts.push(`<line x1="0" y1="${round(bandTop)}" x2="${round(width)}" y2="${round(bandTop)}" stroke="${HUD.line}" stroke-width="${HAIR}" />`);

  const cells: Array<[string, string]> = [
    [overlay.cards.mapTime, clock(PREVIEW_ROOM_SECONDS)],
    [overlay.cards.mapGold, compact(readout.roomGold)],
    [overlay.cards.mapGoldAverage, compact(readout.averageRunGold)],
  ];
  const cellW = width / cells.length;
  cells.forEach(([name, value], index) => {
    const x = index * cellW;
    if (index > 0) {
      parts.push(`<line x1="${round(x)}" y1="${round(bandTop)}" x2="${round(x)}" y2="${round(bandTop + bandH)}" stroke="${HUD.line}" stroke-width="${HAIR}" />`);
    }
    const labelTop = bandTop + U * 0.25;
    parts.push(label(name, x + U * 0.5, labelTop, cellW - U));
    const size = U * 0.8125;
    parts.push(
      text(clampWidth(value, units(cellW - U, size)), {
        x: round(x + U * 0.5),
        y: round(baseline(labelTop + U * 0.5 * 1.3 + 1, size)),
        size,
        fill: HUD.gold,
        weight: 600,
      }),
    );
  });

  const height = topH + HAIR + bandH;
  return {
    // The frame last, over the cells, so the rounded corner is not covered by
    // the black wash behind them.
    svg:
      rect(0, round(top), round(width), round(height), { rx: U * 0.1875, fill: '#000000', fillOpacity: 0.22 }) +
      parts.join('') +
      rect(0, round(top), round(width), round(height), { rx: U * 0.1875, stroke: HUD.line, strokeWidth: HAIR }),
    height,
  };
}

/**
 * The loot list: what you picked up in the room you are standing in.
 *
 * The room's worth sits against the heading rather than across the row from it —
 * the figure belongs *to* the word, it is what this list adds up to, and parked
 * at the far end it reads as a fourth column of the table instead. The three
 * number columns sort in the app, and the arrow marks the one in force: total,
 * descending, which is where the list opens.
 */
function lootList(model: TrackerCardModel, top: number, width: number): { svg: string; height: number } {
  const parts: string[] = [];
  const { columns } = model.overlay;
  const headSize = U * 0.625;

  // The gutter on the right is the scrollbar's, which the real list keeps
  // whether or not it is scrolling; the header carries it too, which is the
  // only reason the two line up as a table.
  const gutter = U * 0.5;
  const qtyW = U * 1.75;
  const unitW = U * 2.25;
  const totalW = U * 3;
  const numbersW = qtyW + unitW + totalW + U * 0.25 * 2;
  const numbersX = width - gutter - numbersW;

  const headTop = top;
  parts.push(label(columns.name, U * 0.25, headTop, width * 0.3, HUD.primary));
  parts.push(
    text(compact(model.readout.roomGold).toUpperCase(), {
      x: round(U * 0.25 + labelWidth(columns.name, headSize) + U * 0.5),
      y: round(baseline(headTop, headSize)),
      size: headSize,
      fill: HUD.gold,
      weight: 600,
    }),
  );
  /*
   * Each heading is clamped to its own column, which is what stops the two from
   * touching: `truncate` does the same job in the app, and here it is also the
   * only guarantee that `ЦЕНА` and `ВСЕГО` — both a third longer than the
   * English — stay on their own sides of a 5-pixel gap.
   */
  const arrow = headSize * 0.85;
  const totalRight = numbersX + numbersW;
  parts.push(
    text(clampWidth(columns.unit.toUpperCase(), units(unitW, headSize) / 1.2), {
      x: round(numbersX + qtyW + U * 0.25 + unitW),
      y: round(baseline(headTop, headSize)),
      size: headSize,
      fill: HUD.primary,
      weight: 600,
      anchor: 'end',
      spacing: headSize * 0.025,
    }),
    text(clampWidth(columns.total.toUpperCase(), units(totalW - arrow - 2, headSize) / 1.2), {
      x: round(totalRight - arrow - 2),
      y: round(baseline(headTop, headSize)),
      size: headSize,
      fill: HUD.fg,
      weight: 600,
      anchor: 'end',
      spacing: headSize * 0.025,
    }),
  );
  parts.push(glyph('chevronDown', round(totalRight - arrow), round(headTop + headSize * 0.2), round(arrow), HUD.fg));

  const headH = headSize * 1.25 + U * 0.25;
  parts.push(
    `<line x1="0" y1="${round(top + headH)}" x2="${round(width - gutter)}" y2="${round(top + headH)}"` +
      ` stroke="${HUD.line}" stroke-width="${HAIR}" stroke-opacity="0.7" />`,
  );

  // --- the rows
  const artSize = U * 1.5;
  const rowH = artSize + U * 0.125 * 2;
  let y = top + headH + U * 0.5;

  model.readout.rows.forEach((row, index) => {
    // The zebra the list has always had, which is what keeps five short numbers
    // attached to the name they belong to.
    if (index % 2 === 0) {
      parts.push(
        rect(0, round(y), round(width - gutter), round(rowH), {
          rx: U * 0.1875,
          fill: '#ffffff',
          fillOpacity: 0.03,
        }),
      );
    }

    const art = model.art[row.item.id] ?? null;
    const artY = y + (rowH - artSize) / 2;
    if (art === null) {
      parts.push(rect(round(U * 0.25), round(artY), round(artSize), round(artSize), { rx: 2, fill: '#000000', fillOpacity: 0.35 }));
    } else {
      parts.push(image(art, round(U * 0.25), round(artY), round(artSize), round(artSize)));
    }

    const nameSize = U * 0.75;
    const nameX = U * 0.25 + artSize + U * 0.5;
    parts.push(
      text(clampWidth(row.item.name, units(numbersX - nameX - U * 0.25, nameSize)), {
        x: round(nameX),
        y: round(baseline(y + (rowH - nameSize * 1.25) / 2, nameSize)),
        size: nameSize,
        fill: qualityColor(row.item.quality),
        weight: 600,
      }),
    );

    // Quantity and unit value are supporting detail, so they sit at about two
    // thirds the size of the name and the total.
    const small = U * 0.5;
    const mid = y + rowH / 2;
    parts.push(
      text(`×${row.qty}`, { x: round(numbersX + qtyW), y: round(mid + small * 0.35), size: small, fill: HUD.fg, weight: 500, anchor: 'end' }),
      text(compact(row.unit), {
        x: round(numbersX + qtyW + U * 0.25 + unitW),
        y: round(mid + small * 0.35),
        size: small,
        fill: HUD.muted,
        anchor: 'end',
      }),
      text(compact(row.total), {
        x: round(numbersX + numbersW),
        y: round(mid + nameSize * 0.35),
        size: nameSize,
        fill: HUD.gold,
        weight: 600,
        anchor: 'end',
      }),
    );

    y += rowH;
  });

  return { svg: parts.join(''), height: y - top };
}

/**
 * One panel, laid out at the origin so the card can put it anywhere.
 *
 * Top-down in one pass, as the real one is. Which rows exist is the one thing
 * `collapsed` decides, and it decides it the way the overlay does:
 *
 *   * **Expanded and clickable** — the title bar takes the top row, the seven
 *     buttons take a row of their own under it, and the loot list is below the
 *     readout. This is the panel you configure.
 *   * **Collapsed and click-through** — the room line takes the row the title
 *     bar had, because while you are playing the chrome is invisible and its row
 *     is a strip of panel paid for and not spent. No loot list, and the padding
 *     tightens: collapsed is meant to be the smallest thing that answers the
 *     question.
 *
 * Returns its height, because the card stacks these and nothing in SVG will tell
 * you how tall the thing you just drew turned out to be.
 */
function panel(model: TrackerCardModel, collapsed: boolean): { svg: string; width: number; height: number } {
  const parts: string[] = [];
  const inner = PANEL_W - HAIR * 2 - U * 0.5 * 2;
  const pad = collapsed ? U * 0.25 : U * 0.5;
  const gap = collapsed ? 0 : U * 0.5;
  const iconSize = U * 0.875;
  let y = HAIR + pad;

  if (collapsed) {
    y += roomLine(parts, model, y, inner);
  } else {
    // --- the title bar
    const titleSize = U * 0.6875;
    parts.push(glyph('grip', 0, round(y + (iconSize * 1.1 - iconSize) / 2), round(iconSize), HUD.muted));
    parts.push(
      textRun(
        [
          { value: 'AOW5 ', fill: HUD.fg },
          { value: model.overlay.window.toUpperCase(), fill: HUD.muted },
        ],
        {
          x: round(iconSize + U * 0.25),
          y: round(baseline(y, titleSize)),
          size: titleSize,
          weight: 600,
          spacing: titleSize * 0.025,
        },
      ),
    );
    y += iconSize + U * 0.25;

    /*
     * Seven buttons on a row of their own, right-aligned.
     *
     * A row of their own is a real cost — pressing the hotkey moves the readout
     * down by a line — and the shell pays it because seven icons and a window
     * name do not fit a narrow panel side by side. The ones that lost that
     * argument were the buttons, squeezed to where the skull sat against the
     * quit cross and a mis-aimed click cost you the session.
     */
    const buttons: Array<keyof typeof GLYPHS> = [
      'chevronUp',
      'pause',
      'restart',
      'skull',
      'history',
      'settings',
      'close',
    ];
    const hit = U * 1.5;
    const between = U * 0.125;
    const buttonsW = buttons.length * hit + (buttons.length - 1) * between;
    buttons.forEach((name, index) => {
      const bx = inner - buttonsW + index * (hit + between);
      parts.push(glyph(name, round(bx + (hit - iconSize) / 2), round(y + (hit - iconSize) / 2), round(iconSize), HUD.muted));
    });
    y += hit;
  }

  y += gap;

  const grid = readoutGrid(model, y, inner);
  parts.push(grid.svg);
  y += grid.height;

  if (!collapsed) {
    y += gap;
    const loot = lootList(model, y, inner);
    parts.push(loot.svg);
    y += loot.height;
  }

  const height = y + pad + HAIR;

  return {
    width: PANEL_W,
    height,
    svg:
      // The frosted slab, with the frosting left off: there is no game back
      // there to blur, and the 92% alpha is what keeps the wash showing through
      // so the panel still reads as something laid over something else.
      rect(0, 0, round(PANEL_W), round(height), {
        rx: U * 0.1875,
        fill: HUD.card,
        fillOpacity: 0.92,
        stroke: HUD.frame,
        strokeWidth: HAIR * 2,
      }) +
      `<g transform="translate(${round(HAIR + U * 0.5)} 0)">${parts.join('')}</g>`,
  };
}

/**
 * Where you are, on the row the chrome leaves empty while you are playing.
 *
 * It was a card among the others once, which was the wrong shape twice over: a
 * room name is prose where every other figure is five characters, and the two
 * are never wanted at the same moment. The run count rides along at the right —
 * a number, but a slow one, moving a handful of times an hour where the figures
 * below move every second, so a whole card of the readout would be width spent
 * on what is really context for the room beside it.
 *
 * Pushes into the caller's parts and returns the row's height, which is the
 * shape the two branches of `panel` both want.
 */
function roomLine(parts: string[], model: TrackerCardModel, top: number, width: number): number {
  const size = U * 0.6875;
  const icon = U * 0.875;
  const height = U * 0.125 * 2 + icon;
  const mid = top + height / 2;
  const y = mid + size * 0.36;

  parts.push(glyph('map', 0, round(mid - icon / 2), round(icon), HUD.muted));
  parts.push(
    textRun(
      [
        { value: model.overlay.at, fill: HUD.muted, weight: 400 },
        { value: model.overlay.room, fill: HUD.fg, weight: 600 },
      ],
      { x: round(icon + U * 0.375), y: round(y), size },
    ),
  );

  const runs = String(PREVIEW_RUNS);
  const runsW = pixels(runs, size) * 1.2;
  parts.push(
    glyph('trophy', round(width - runsW - U * 0.25 - icon), round(mid - icon / 2), round(icon), HUD.muted),
    text(runs, { x: round(width), y: round(y), size, fill: HUD.fg, weight: 600, anchor: 'end' }),
  );
  return height;
}

/** The whole card. */
export function renderTrackerCard(model: TrackerCardModel): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
    '<defs>',
    /*
     * A stand-in for the game, not a screenshot of it.
     *
     * The same wash `HudPreview` paints behind its copy of the panel, and the
     * same reasoning: what this backdrop has to establish is that the panel is
     * translucent and floats over something. A room's painted scene would do it
     * too — the default site card uses one — but the session names Skyfall
     * Realm and that room ships no art, so any scene here would be a picture of
     * somewhere the panel says it is not.
     */
    '<radialGradient id="stage" cx="0.2" cy="0" r="1.2">',
    '<stop offset="0" stop-color="#1d3451" /><stop offset="0.6" stop-color="#060911" /><stop offset="1" stop-color="#020307" />',
    '</radialGradient>',
    '</defs>',
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#stage)" />`,
  ];

  /*
   * Both states, side by side, because only one of them is what you see while
   * playing.
   *
   * The expanded panel is the panel with the hotkey pressed — the chrome, the
   * readout and the loot. The collapsed one is the evening: the room line where
   * the buttons were, the same six figures, and nothing that needs a click. A
   * picture of either alone answers half the question, which is why the page
   * shows both too.
   *
   * The expanded one takes the right column. It is the taller and busier of the
   * two, and this is the corner a left-to-right reader arrives at last.
   */
  const open = panel(model, false);
  const shut = panel(model, true);

  const rightX = CARD_WIDTH - MARGIN - open.width;
  const rightY = Math.round((CARD_HEIGHT - open.height) / 2);
  parts.push(`<g transform="translate(${rightX} ${round(rightY)})">${open.svg}</g>`);

  /*
   * The wordmark, small and in the corner. It is here so the card is
   * recognisably from this site, not to be the subject of the picture — the
   * overlay is the subject, and a logo sized to compete with it would make the
   * card an advertisement for the site rather than a link to the page.
   */
  if (model.logo !== null) {
    const LOGO_H = 40;
    parts.push(image(model.logo, MARGIN, 48, LOGO_H * (model.logoAspect ?? 2392 / 420), LOGO_H));
  } else {
    parts.push(text(model.brand, { x: MARGIN, y: 78, size: 26, fill: MUTED, weight: 700, spacing: 0.8 }));
  }

  /*
   * The left column: the page's name, and the collapsed panel under it.
   *
   * The name and nothing else. The description that used to sit here is the one
   * `og:description` already carries, and every client that draws this image
   * draws that sentence beside it — so in the picture it was the same words
   * twice, in the smaller of the two type sizes, taking the room the second
   * panel wanted.
   */
  const TITLE_SIZE = 46;
  const titleLines = wrapWidth(model.title, units(shut.width, TITLE_SIZE), 2);
  const titleBlock = titleLines.length * (TITLE_SIZE + 10);
  const gap = 40;

  // Title and panel centred as one block, so a one-line name in English and a
  // two-line one sit opposite the same thing.
  let y = Math.round((CARD_HEIGHT - titleBlock - gap - shut.height) / 2) + TITLE_SIZE;
  for (const line of titleLines) {
    parts.push(text(line, { x: MARGIN, y: round(y), size: TITLE_SIZE, fill: TEXT, weight: 900 }));
    y += TITLE_SIZE + 10;
  }
  y += gap - TITLE_SIZE;
  parts.push(`<g transform="translate(${MARGIN} ${round(y)})">${shut.svg}</g>`);

  parts.push('</svg>');
  return parts.join('');
}
