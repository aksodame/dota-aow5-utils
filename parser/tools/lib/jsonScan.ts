/**
 * Finds the end of the JSON value starting at `start` in `s`.
 *
 * The item table is embedded inside a JavaScript call expression, so we cannot
 * just take everything up to the last `}` — there is trailing code after it.
 * A naive brace counter also breaks on braces inside string literals, of which
 * the AOW5 data has plenty (model paths, HTML descriptions).
 *
 * Returns the index one past the closing bracket.
 */
export function braceMatch(s: string, start: number): number {
  const open = s[start];
  if (open !== '{' && open !== '[') {
    throw new Error(`braceMatch: expected { or [ at ${start}, got ${JSON.stringify(open ?? '<eof>')}`);
  }

  let depth = 0;
  let inStr = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }

    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i + 1;
      if (depth < 0) throw new Error(`braceMatch: unbalanced closer at ${i}`);
    }
  }

  throw new Error(`braceMatch: unterminated value starting at ${start}`);
}
