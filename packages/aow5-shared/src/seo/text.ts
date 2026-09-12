/**
 * Measuring and trimming text for places with a hard budget: a `<title>`, a
 * `<meta name=description>`, and the two lines of a social card.
 *
 * All of it is width-aware rather than length-aware, because this site speaks
 * Chinese. `.slice(0, 160)` on a CJK description cuts it at roughly twice the
 * visual length an English one would reach, and the same call on a card title
 * overflows the image instead of truncating it — the two failures point in
 * opposite directions, which is what makes counting characters the wrong unit
 * for both.
 *
 * No font metrics involved, and none available: the card is rasterized by resvg
 * from an SVG that has no layout engine, and the browser tab is measured by the
 * browser. What is here is the approximation both can live with.
 */

/**
 * Roughly how wide one character is, in units where an English lowercase letter
 * is 1.
 *
 * Three bands, because three is as fine-grained as a table with no font behind
 * it can honestly be:
 *
 *   * **2** — anything drawn on the CJK em square: Han, kana, Hangul, and the
 *     fullwidth punctuation that comes with them. These are square by
 *     definition, so this band is exact rather than estimated.
 *   * **0.5** — the glyphs that are reliably narrow in every sans-serif:
 *     `iljt.,;:'!|` and the space.
 *   * **1** — everything else, which is Latin, Cyrillic and digits. Cyrillic
 *     runs slightly wider than Latin at the same point size; at the resolution
 *     this is used for, that is not worth a fourth band.
 */
function widthOf(code: number): number {
  // CJK Unified Ideographs and the two extension blocks that actually appear in
  // this game's text, plus kana, Hangul, and the CJK symbol/punctuation range
  // that carries fullwidth 。、《》（）.
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, symbols, punctuation
    (code >= 0x3041 && code <= 0x33ff) || // kana, compatibility
    (code >= 0x3400 && code <= 0x4dbf) || // extension A
    (code >= 0x4e00 && code <= 0x9fff) || // unified ideographs
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // compatibility ideographs
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) || // fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6)
  ) {
    return 2;
  }
  if (code >= 0x20000 && code <= 0x3fffd) return 2; // extension B and beyond
  // The narrow set. A literal lookup rather than a regex, so this stays a
  // switch the engine can inline — it runs once per character of every title.
  switch (code) {
    case 0x20: // space
    case 0x21: // !
    case 0x27: // '
    case 0x2c: // ,
    case 0x2e: // .
    case 0x3a: // :
    case 0x3b: // ;
    case 0x69: // i
    case 0x6a: // j
    case 0x6c: // l
    case 0x74: // t
    case 0x7c: // |
      return 0.5;
    default:
      return 1;
  }
}

/** The estimated visual width of a string, in "one Latin lowercase letter" units. */
export function textWidth(text: string): number {
  let total = 0;
  // Iterated by code point rather than by code unit, so an astral character is
  // measured once as one wide glyph instead of twice as two narrow ones.
  for (const char of text) total += widthOf(char.codePointAt(0) ?? 0);
  return total;
}

/**
 * Cuts to a width budget and says so, on a word boundary where one is close.
 *
 * Always ellipsizes — callers that only want a cut *when needed* go through
 * `clampWidth`. Split this way because the card's wrapper needs the "and there
 * was more" mark on a line that already fits, which a fits-check would skip.
 *
 * The ellipsis is a real `…` rather than three dots: one glyph of budget
 * instead of one and a half, and it is what the rest of the site already uses.
 *
 * "Close enough" is within a quarter of the budget. Backing up further than
 * that to avoid cutting a word costs more text than the ragged edge does — and
 * a Chinese string has no spaces to back up to at all, so it always cuts
 * cleanly at the character, which is correct for it.
 */
function truncate(text: string, budget: number): string {
  const room = budget - 1; // the ellipsis
  let width = 0;
  let cut = 0;
  for (const char of text) {
    const next = width + widthOf(char.codePointAt(0) ?? 0);
    if (next > room) break;
    width = next;
    cut += char.length;
  }

  const head = text.slice(0, cut);
  const space = head.lastIndexOf(' ');
  const kept = space > room * 0.75 ? head.slice(0, space) : head;
  return `${kept.replace(/[\s,;:·—-]+$/u, '')}…`;
}

/** `truncate`, but only when the text does not already fit. */
export function clampWidth(text: string, budget: number): string {
  return textWidth(text) <= budget ? text : truncate(text, budget);
}

/**
 * Collapses the whitespace somebody typed into a single-line run.
 *
 * A build's notes are stored with their newlines intact — they are prose, and
 * the page renders them as written. A description meta tag is one line by
 * definition, so the paragraph breaks become spaces here rather than being
 * stripped at write time, where they would be lost for the page too.
 */
export function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * Wraps to at most `lines` lines of `budget` width, truncating the last.
 *
 * Used by the card, which draws each line as its own `<text>` element because
 * SVG has no flow layout. Breaks on spaces where the text has them and between
 * characters where it does not, which is the difference between a wrapped
 * Russian title and a wrapped Chinese one.
 */
export function wrapWidth(text: string, budget: number, lines: number): string[] {
  const out: string[] = [];
  let current = '';

  const push = (): void => {
    if (current !== '') out.push(current);
    current = '';
  };

  for (const word of oneLine(text).split(' ')) {
    if (word === '') continue;
    const candidate = current === '' ? word : `${current} ${word}`;
    if (textWidth(candidate) <= budget) {
      current = candidate;
      continue;
    }
    push();
    if (textWidth(word) > budget) {
      // A single word wider than the whole line — a long Chinese run, or a URL
      // somebody pasted into a title. Broken at the character, filling each
      // line to the budget, rather than allowed to overflow the card.
      let piece = '';
      for (const char of word) {
        if (textWidth(piece + char) > budget) {
          out.push(piece);
          piece = char;
        } else {
          piece += char;
        }
      }
      current = piece;
    } else {
      current = word;
    }
  }
  push();

  if (out.length <= lines) return out;
  /*
   * More than fits. The overflow is dropped rather than squeezed into the last
   * line, and the last line is ellipsized whether or not it was already full —
   * the mark is what tells a reader the title continues, and a card that ends
   * mid-thought without one reads as a bug in the author's title.
   *
   * Every word is walked before reaching here rather than breaking out of the
   * loop early, because "did anything overflow" is not knowable until they are.
   */
  const kept = out.slice(0, lines);
  kept[lines - 1] = truncate(kept[lines - 1] ?? '', budget);
  return kept;
}
