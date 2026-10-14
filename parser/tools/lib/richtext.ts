import type { RichNode } from '../../../packages/aow5-shared/src/types/items.ts';

/**
 * Converts the inline HTML in game description strings into a small node tree.
 *
 * The app renders these as React elements, so no HTML string ever reaches the
 * browser and no runtime sanitizer is needed. Anything outside the allowlist
 * throws, which fails the build loudly rather than silently shipping markup we
 * have not looked at.
 *
 * A survey of every en/ru token found exactly four tags in use — h1, font, br,
 * b — one attribute (font color), and no HTML entities. `i` and `span` are
 * allowed defensively so a future addon update degrades to a build warning
 * rather than a hard stop on something obviously benign.
 */

const VOID_TAGS = new Set(['br']);
const ALLOWED_TAGS = new Set(['h1', 'b', 'i', 'font', 'span', 'br']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  font: new Set(['color']),
  span: new Set(['color']),
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const NAMED_COLORS = new Set(['red', 'green', 'blue', 'white', 'black', 'yellow', 'orange', 'grey', 'gray']);

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

export interface RichParseIssue {
  kind: 'unknown-tag' | 'unknown-attr' | 'bad-color' | 'unbalanced';
  detail: string;
}

export interface RichParseResult {
  nodes: RichNode[];
  /** Flattened text, used for substring search in the picker. */
  plain: string;
  issues: RichParseIssue[];
}

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|[a-zA-Z]+);/g, (match, dec?: string, hex?: string) => {
    if (dec !== undefined) return String.fromCodePoint(Number(dec));
    if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
    return ENTITIES[match.toLowerCase()] ?? match;
  });
}

const TAG_RE = /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\s*(\/?)\s*>/g;
const ATTR_RE = /([A-Za-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

/**
 * @param strict when true (the default) an unknown tag throws; the sweep pass
 *   uses `false` to collect a histogram of everything present first.
 */
export function parseRichText(input: string, strict = true): RichParseResult {
  const issues: RichParseIssue[] = [];
  const root: RichNode[] = [];
  const stack: { tag: string; children: RichNode[] }[] = [];
  const top = (): RichNode[] => stack[stack.length - 1]?.children ?? root;

  let plain = '';
  const pushText = (raw: string): void => {
    if (raw === '') return;
    const text = decodeEntities(raw);
    plain += text;
    const target = top();
    const last = target[target.length - 1];
    if (last && last.t === 's') last.v += text;
    else target.push({ t: 's', v: text });
  };

  let cursor = 0;
  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(input); m !== null; m = TAG_RE.exec(input)) {
    pushText(input.slice(cursor, m.index));
    cursor = m.index + m[0].length;

    const closing = m[1] === '/';
    const tag = (m[2] ?? '').toLowerCase();
    const attrText = m[3] ?? '';
    const selfClosing = m[4] === '/';

    if (!ALLOWED_TAGS.has(tag)) {
      const detail = `<${closing ? '/' : ''}${tag}>`;
      issues.push({ kind: 'unknown-tag', detail });
      if (strict) throw new Error(`richtext: tag not in allowlist: ${detail}`);
      continue; // drop the tag, keep its text content
    }

    if (closing) {
      // Find the nearest matching open tag; ignore strays.
      const at = stack.findLastIndex((f) => f.tag === tag);
      if (at === -1) {
        issues.push({ kind: 'unbalanced', detail: `stray </${tag}>` });
        continue;
      }
      while (stack.length > at) {
        const frame = stack.pop()!;
        if (stack.length > at) issues.push({ kind: 'unbalanced', detail: `implicitly closed <${frame.tag}>` });
      }
      continue;
    }

    if (VOID_TAGS.has(tag) || selfClosing) {
      if (tag === 'br') {
        plain += '\n';
        top().push({ t: 'br' });
      }
      continue;
    }

    let color: string | undefined;
    ATTR_RE.lastIndex = 0;
    for (let a = ATTR_RE.exec(attrText); a !== null; a = ATTR_RE.exec(attrText)) {
      const name = (a[1] ?? '').toLowerCase();
      const value = a[2] ?? a[3] ?? a[4] ?? '';
      if (!ALLOWED_ATTRS[tag]?.has(name)) {
        issues.push({ kind: 'unknown-attr', detail: `${tag}@${name}` });
        continue;
      }
      if (name === 'color') {
        if (HEX_COLOR.test(value) || NAMED_COLORS.has(value.toLowerCase())) color = value.toLowerCase();
        else issues.push({ kind: 'bad-color', detail: `${tag}@color=${value}` });
      }
    }

    stack.push({ tag, children: [] });
    // The element is attached on close (or at EOF) so its children are complete.
    const frame = stack[stack.length - 1]!;
    const parent = stack.length >= 2 ? stack[stack.length - 2]!.children : root;
    const node: RichNode = color
      ? { t: 'el', tag: tag as 'font', color, c: frame.children }
      : { t: 'el', tag: tag as 'b', c: frame.children };
    parent.push(node);
  }

  pushText(input.slice(cursor));

  for (const frame of stack) {
    issues.push({ kind: 'unbalanced', detail: `unclosed <${frame.tag}> at end of string` });
  }

  return { nodes: root, plain, issues };
}

/** Collects a tag/attribute histogram without failing on unknown markup. */
export function surveyHtml(strings: Iterable<string>): {
  tags: Record<string, number>;
  attrs: Record<string, number>;
  colors: Record<string, number>;
} {
  const tags: Record<string, number> = {};
  const attrs: Record<string, number> = {};
  const colors: Record<string, number> = {};
  for (const s of strings) {
    TAG_RE.lastIndex = 0;
    for (let m = TAG_RE.exec(s); m !== null; m = TAG_RE.exec(s)) {
      const tag = (m[2] ?? '').toLowerCase();
      tags[tag] = (tags[tag] ?? 0) + 1;
      ATTR_RE.lastIndex = 0;
      for (let a = ATTR_RE.exec(m[3] ?? ''); a !== null; a = ATTR_RE.exec(m[3] ?? '')) {
        const name = (a[1] ?? '').toLowerCase();
        attrs[`${tag}@${name}`] = (attrs[`${tag}@${name}`] ?? 0) + 1;
        if (name === 'color') {
          const v = (a[2] ?? a[3] ?? a[4] ?? '').toLowerCase();
          colors[v] = (colors[v] ?? 0) + 1;
        }
      }
    }
  }
  return { tags, attrs, colors };
}
