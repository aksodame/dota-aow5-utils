import fs from 'node:fs';
import path from 'node:path';

/**
 * Deterministic JSON writers.
 *
 * Everything the pipeline emits is committed to git, so byte-stability across
 * runs is a hard requirement: a second `npm run extract` must leave the working
 * tree clean. That rules out `JSON.stringify` key order surprises and pretty
 * printing that balloons a 2 MB file into 12 MB of diff noise.
 */

/** Recursively sorts object keys so output does not depend on insertion order. */
export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeys(src[key]);
    return out as unknown as T;
  }
  return value;
}

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Explicit LF: git normalises on commit, but the on-disk bytes should match
  // too, or the determinism check flags phantom changes on Windows.
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
}

/** Compact, key-sorted, single line. For small files like meta.json. */
export function writeJson(file: string, value: unknown): void {
  write(file, `${JSON.stringify(sortKeys(value))}\n`);
}

/** Key-sorted with 2-space indent. For hand-reviewed reports. */
export function writeJsonPretty(file: string, value: unknown): void {
  write(file, `${JSON.stringify(sortKeys(value), null, 2)}\n`);
}

/**
 * One top-level entry per line: near-minified size, but `git diff` shows which
 * items actually changed instead of one 2 MB line.
 */
export function writeJsonByEntry(file: string, obj: Record<string, unknown>): void {
  const keys = Object.keys(obj).sort();
  if (keys.length === 0) {
    write(file, '{}\n');
    return;
  }
  const lines = keys.map(
    (key, i) => `${JSON.stringify(key)}:${JSON.stringify(sortKeys(obj[key]))}${i === keys.length - 1 ? '' : ','}`,
  );
  write(file, `{\n${lines.join('\n')}\n}\n`);
}

/**
 * Like `writeJsonByEntry` but for a document whose bulk lives under one array
 * key — emits the scalar header fields first, then one array element per line.
 */
export function writeJsonWithRows(
  file: string,
  header: Record<string, unknown>,
  rowsKey: string,
  rows: unknown[],
): void {
  const headerLines = Object.keys(header)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(sortKeys(header[key]))},`);
  const rowLines = rows.map((row, i) => `${JSON.stringify(row)}${i === rows.length - 1 ? '' : ','}`);
  const body = rows.length === 0 ? '[]' : `[\n${rowLines.join('\n')}\n]`;
  write(file, `{\n${headerLines.join('\n')}\n${JSON.stringify(rowsKey)}:${body}\n}\n`);
}
