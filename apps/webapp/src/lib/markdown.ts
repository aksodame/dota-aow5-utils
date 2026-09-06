/**
 * A markdown reader for one document, not for the world.
 *
 * The report is the only markdown this app renders, and it uses a bounded set
 * of constructs: two heading levels, paragraphs, bold, italics, inline code,
 * links, blockquotes, both kinds of list, and horizontal rules. Pulling in a
 * parser to cover the rest of CommonMark would add a dependency, a sanitiser
 * to go with it, and a `dangerouslySetInnerHTML` — for a file that lives in
 * this repository and changes when its author edits it.
 *
 * So this returns a node tree instead of HTML. `MarkdownDoc` turns that into
 * React elements, which means nothing here can inject markup no matter what
 * the document says.
 *
 * JSX-free and in `lib/` for the same reason `routes.ts` is: `node --test`
 * strips types but not JSX, and this is the part worth testing.
 */

export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'mark'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'break' };

export type Block =
  | { kind: 'heading'; level: number; important: boolean; children: Inline[] }
  | { kind: 'paragraph'; urgent: boolean; children: Inline[] }
  | { kind: 'quote'; children: Block[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'video'; source: 'youtube' | 'file'; ref: string }
  | { kind: 'rule' };

/**
 * Ideographic ranges, plus the full-width punctuation that travels with them.
 *
 * The documents are hard-wrapped at about 78 columns, so rendering has to undo
 * the wrapping. Joining with a space is right for Russian and English and
 * wrong for Chinese, where the break carries no space and inserting one leaves
 * a visible gap mid-sentence.
 */
const CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * `## ! Heading` marks a section worth stopping at.
 *
 * A convention of this document rather than of markdown: the report is long,
 * and the list beside it flags the handful of sections a reader should not
 * skip. The marker is stripped here, so it never reaches the page — the only
 * thing that sees it is whatever renders the section list.
 */
const IMPORTANT = /^!\s+/;

/**
 * `!! ` at the start of a paragraph is the one the reader must not skim.
 *
 * Two marks rather than one so it cannot be confused with the heading marker,
 * and so a paragraph that genuinely opens with an exclamation is left alone.
 * Stripped here; the renderer decides what "urgent" looks like.
 */
const URGENT = /^!!\s+/;
const RULE = /^\s*-{3,}\s*$/;

/**
 * `@video <youtube id>` on a line of its own.
 *
 * Markdown has no embed, and the alternative was to render the player outside
 * the document and position it by index — which would silently move to the
 * wrong place the next time a section was added. A directive keeps the video
 * where its author put it, in the same file as the words around it.
 *
 * Two forms, and the file name decides which:
 *
 *   `@video 4ctl4R9-ayc`   a YouTube id, played in an embed
 *   `@video talk.mp4`      a file this site serves, played by the browser
 *
 * Self-hosting exists because YouTube age-gates some uploads, and an account
 * wall in front of the evidence defeats the point of publishing it.
 *
 * Never a URL in either form: the renderer builds the address itself, so
 * nothing in the document can point the player somewhere else.
 */
const VIDEO = /^@video\s+(\S+)\s*$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const MEDIA_FILE = /^[A-Za-z0-9._-]+\.(?:mp4|webm)$/i;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const NUMBER = /^(\s*)\d+\.\s+(.*)$/;

/**
 * Bold before italics, because `**` would otherwise match as two empty `*`.
 *
 * Both may span a newline: the quoted messages are hard-wrapped mid-emphasis
 * and a run that opens on one line closes on the next. An unmatched delimiter
 * simply fails to match and falls through to text — the parser never throws
 * and never drops input, which for this document matters more than being
 * clever.
 */
const INLINE = /`([^`]+)`|==(.+?)==|\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*|\*([^*]+?)\*|\[([^\]]*)\]\(([^)\s]+)\)/;

/**
 * Only real web links become links.
 *
 * Everything in these documents is quoted from Discord, and quoted text is
 * exactly where a `javascript:` URL would arrive one day. Anything else renders
 * as the literal characters the author typed.
 */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/**
 * Put a run of source lines back together.
 *
 * Outside a blockquote a line break is just the author's 78-column wrapping and
 * collapses to a space — except between two ideographic characters, where the
 * space would be a visible defect in the Chinese translation.
 *
 * Inside a blockquote it is preserved, because there the breaks are evidence:
 * three consecutive lines are three separate Discord messages, and the numbered
 * steps and the price list in section 8 are lists of statements. Joining them
 * would put words into someone's mouth in a document whose whole value is that
 * it quotes verbatim. The cost is that a hard-wrapped sentence inside a quote
 * renders with a break at the author's wrap column — ragged, and harmless.
 *
 * Two trailing spaces are markdown's own hard break and always split.
 */
function joinLines(lines: string[], soft: boolean): string {
  let out = '';
  let pendingBreak = false;

  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (i === 0) {
      out = text;
    } else if (soft || pendingBreak) {
      out += `\n${text}`;
    } else {
      const left = out.slice(-1);
      const right = text.slice(0, 1);
      out += CJK.test(left) && CJK.test(right) ? text : ` ${text}`;
    }
    pendingBreak = /\s{2,}$/.test(raw);
  });

  return out;
}

/**
 * Turn the newlines left by `joinLines` into break nodes.
 *
 * Done after inline parsing rather than before it, so that emphasis opened on
 * one line and closed on the next still parses as one run with the break
 * inside it.
 */
function splitBreaks(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];

  for (const node of nodes) {
    if (node.kind === 'text') {
      const parts = node.value.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) out.push({ kind: 'break' });
        if (part !== '') out.push({ kind: 'text', value: part });
      });
      continue;
    }
    if (node.kind === 'strong' || node.kind === 'em' || node.kind === 'mark' || node.kind === 'link') {
      out.push({ ...node, children: splitBreaks(node.children) });
      continue;
    }
    out.push(node);
  }

  return out;
}

function parseText(lines: string[], soft: boolean): Inline[] {
  return splitBreaks(parseInline(joinLines(lines, soft)));
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;

  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (m === null) {
      out.push({ kind: 'text', value: rest });
      break;
    }
    if (m.index > 0) out.push({ kind: 'text', value: rest.slice(0, m.index) });

    const [, code, mark, strong, em, label, href] = m;
    if (code !== undefined) out.push({ kind: 'code', value: code });
    else if (mark !== undefined) out.push({ kind: 'mark', children: parseInline(mark) });
    else if (strong !== undefined) out.push({ kind: 'strong', children: parseInline(strong) });
    else if (em !== undefined) out.push({ kind: 'em', children: parseInline(em) });
    else if (href !== undefined) {
      if (isSafeHref(href)) out.push({ kind: 'link', href, children: parseInline(label ?? '') });
      else out.push({ kind: 'text', value: m[0] });
    }

    rest = rest.slice(m.index + m[0].length);
  }

  return out;
}

/**
 * What a `@video` line refers to, or null if it is not one.
 *
 * A file name carries a dot and a YouTube id cannot, so the two forms never
 * collide. Anything matching neither is not a video line at all and falls
 * through to prose — which is why `startsBlock` has to call this rather than
 * test the pattern itself.
 */
function videoRef(line: string): { source: 'youtube' | 'file'; ref: string } | null {
  const m = VIDEO.exec(line);
  if (m === null) return null;
  const ref = m[1] ?? '';
  if (MEDIA_FILE.test(ref)) return { source: 'file', ref };
  if (YOUTUBE_ID.test(ref)) return { source: 'youtube', ref };
  return null;
}

/**
 * Is this line the start of something that is not the paragraph we are in?
 *
 * Used to end a paragraph without consuming the line, so the outer loop can
 * decide what it actually is.
 */
function startsBlock(line: string): boolean {
  return (
    RULE.test(line) ||
    videoRef(line) !== null ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    NUMBER.test(line)
  );
}

/**
 * @param soft preserve line breaks rather than unwrapping them. True inside a
 *   blockquote, where a break separates one quoted message from the next.
 */
function parseBlocks(lines: string[], soft = false): Block[] {
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      out.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    const video = videoRef(line);
    if (video !== null) {
      out.push({ kind: 'video', ...video });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      const text = heading[2] ?? '';
      out.push({
        kind: 'heading',
        level: (heading[1] ?? '#').length,
        important: IMPORTANT.test(text),
        children: parseInline(text.replace(IMPORTANT, '')),
      });
      i += 1;
      continue;
    }

    // A blockquote runs to the first line that is not quoted. Its contents are
    // blocks in their own right — the report's quotes are a passage followed by
    // an attribution line and a row of numbered permalinks.
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i] ?? '');
        if (q === null) break;
        inner.push(q[1] ?? '');
        i += 1;
      }
      out.push({ kind: 'quote', children: parseBlocks(inner, true) });
      continue;
    }

    const item = BULLET.exec(line) ?? NUMBER.exec(line);
    if (item !== null) {
      const ordered = BULLET.exec(line) === null;
      const items: Inline[][] = [];
      let current: string[] = [];

      while (i < lines.length) {
        const raw = lines[i] ?? '';
        if (raw.trim() === '') break;

        const next = ordered ? NUMBER.exec(raw) : BULLET.exec(raw);
        if (next !== null) {
          if (current.length > 0) items.push(parseText(current, soft));
          current = [next[2] ?? ''];
          i += 1;
          continue;
        }
        // An indented, unmarked line continues the item it sits under. An
        // unindented one is a new paragraph, and the list has ended.
        if (!/^\s+/.test(raw) || startsBlock(raw.trim())) break;
        current.push(raw.trim());
        i += 1;
      }

      if (current.length > 0) items.push(parseText(current, soft));
      out.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const raw = lines[i] ?? '';
      if (raw.trim() === '' || startsBlock(raw)) break;
      paragraph.push(raw);
      i += 1;
    }

    // The marker can only be at the very start, so the first line is the only
    // one that has to be examined — and the only one that needs stripping.
    const first = paragraph[0] ?? '';
    const urgent = URGENT.test(first);
    if (urgent) paragraph[0] = first.replace(URGENT, '');

    out.push({ kind: 'paragraph', urgent, children: parseText(paragraph, soft) });
  }

  return out;
}

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.split(/\r?\n/));
}

/**
 * The text of an inline run, with the markup dropped.
 *
 * For places that need a label rather than rendered content — the section list
 * beside the report is built from the same headings the document renders, so
 * the two cannot drift apart.
 */
export function plainText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.value;
        case 'break':
          return ' ';
        default:
          return plainText(node.children);
      }
    })
    .join('');
}
