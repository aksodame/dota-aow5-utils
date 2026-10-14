/**
 * Parser for Valve KeyValues 1 text (`resource/addon_*.txt`, `scripts/npc/*.txt`).
 *
 * Handles the dialect quirks actually present in the AOW5 files:
 *   - UTF-8 BOM and UTF-16LE encodings
 *   - `//` line comments
 *   - quoted strings with \" \\ \n \t escapes, and bare (unquoted) tokens
 *   - `[$WIN32]`-style platform conditionals (skipped)
 *   - trailing whitespace inside values (`"ItemCost" "640 "`)
 *   - a junk `"" ""` pair in one potion block
 */

export type KvNode = string | KvObject;
export interface KvObject {
  [key: string]: KvNode;
}

export interface KvParseResult {
  root: KvObject;
  /** Keys skipped because they were empty strings. */
  emptyKeys: number;
  /** Keys that appeared more than once at the same level (first wins). */
  duplicates: number;
}

export function decodeKvBuffer(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

export function parseKv(input: string | Buffer): KvParseResult {
  const text = typeof input === 'string' ? input.replace(/^﻿/, '') : decodeKvBuffer(input);
  const len = text.length;
  let i = 0;
  let emptyKeys = 0;
  let duplicates = 0;

  const skipTrivia = (): void => {
    for (;;) {
      while (i < len) {
        const c = text[i]!;
        if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++;
        else break;
      }
      if (text.startsWith('//', i)) {
        const nl = text.indexOf('\n', i);
        i = nl === -1 ? len : nl + 1;
        continue;
      }
      // Platform conditionals attach to the preceding token; just drop them.
      if (text[i] === '[') {
        const close = text.indexOf(']', i);
        i = close === -1 ? len : close + 1;
        continue;
      }
      return;
    }
  };

  const readToken = (): string | null => {
    skipTrivia();
    if (i >= len) return null;
    const c = text[i]!;
    if (c === '{' || c === '}') {
      i++;
      return c;
    }
    if (c === '"') {
      i++;
      let out = '';
      while (i < len) {
        const ch = text[i]!;
        if (ch === '\\') {
          const next = text[i + 1];
          if (next === 'n') out += '\n';
          else if (next === 't') out += '\t';
          else if (next === '"') out += '"';
          else if (next === '\\') out += '\\';
          else out += next ?? '';
          i += 2;
          continue;
        }
        if (ch === '"') {
          i++;
          return out;
        }
        out += ch;
        i++;
      }
      return out; // unterminated string at EOF; salvage what we have
    }
    // Bare token
    let start = i;
    while (i < len) {
      const ch = text[i]!;
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '"' || ch === '{' || ch === '}') break;
      i++;
    }
    return text.slice(start, i);
  };

  const parseObject = (): KvObject => {
    const obj: KvObject = {};
    for (;;) {
      const key = readToken();
      if (key === null || key === '}') return obj;
      if (key === '{') continue; // stray opener; tolerate

      const peek = readToken();
      if (peek === null) return obj;

      let value: KvNode;
      if (peek === '{') value = parseObject();
      else if (peek === '}') return obj;
      else value = peek.trim();

      if (key === '') {
        emptyKeys++;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        duplicates++;
        continue; // first wins
      }
      obj[key] = value;
    }
  };

  const root = parseObject();
  return { root, emptyKeys, duplicates };
}

/** Case-insensitively finds the first child object whose key matches `name`. */
export function findChild(obj: KvObject, name: string): KvObject | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === lower && typeof value === 'object') return value;
  }
  return undefined;
}
