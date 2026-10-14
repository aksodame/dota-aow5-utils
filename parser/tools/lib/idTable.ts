import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DIRS } from './paths.ts';

/**
 * The frozen, append-only item id table.
 *
 * Shared build URLs encode each slot as an *index* into this table, which is
 * what keeps links to ~180 characters. That only works if an index means the
 * same thing forever, so the table is a committed artifact with two rules:
 *
 *   1. Never reorder. Never remove — an id that disappears from the game data
 *      stays as a tombstone so old links keep resolving to the right thing.
 *   2. Only append, at the end.
 *
 * Violating either silently rewrites the meaning of every link ever shared, so
 * the loader asserts the existing prefix is untouched.
 */

export const ID_TABLE_PATH = path.join(DIRS.data, 'id-table.json');
/**
 * The same contract, for hero abilities. Separate file so a new item can never
 * shift a spell index and vice versa.
 */
export const ABILITY_TABLE_PATH = path.join(DIRS.data, 'ability-table.json');
/**
 * And again for maps. A build carries the map it is written for as an index
 * here, so the same append-only contract applies — a room the addon retires
 * stays as a tombstone rather than shifting every guide filed after it.
 */
export const MAP_TABLE_PATH = path.join(DIRS.data, 'map-table.json');

export interface IdTableFile {
  schema: 1;
  note: string;
  ids: string[];
}

const NOTE =
  'APPEND-ONLY. Indices are baked into shared build URLs; reordering or removing an entry ' +
  'silently changes what every existing link points to. Removed items stay as tombstones.';

export function loadTable(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as IdTableFile;
  return parsed.ids ?? [];
}

export function loadIdTable(): string[] {
  return loadTable(ID_TABLE_PATH);
}

export function loadAbilityTable(): string[] {
  return loadTable(ABILITY_TABLE_PATH);
}

export function loadMapTable(): string[] {
  return loadTable(MAP_TABLE_PATH);
}

export interface IdTableUpdate {
  ids: string[];
  added: string[];
  /** Ids present in the table but no longer in the game data. */
  tombstones: string[];
}

export function updateIdTable(existing: string[], currentIds: Iterable<string>): IdTableUpdate {
  const ids = [...existing];
  const known = new Set(ids);
  const added: string[] = [];

  // Sorted so a fresh table is reproducible; appends keep arrival order after
  // that, which does not matter as long as it is stable.
  for (const id of [...currentIds].sort()) {
    if (known.has(id)) continue;
    known.add(id);
    ids.push(id);
    added.push(id);
  }

  const current = new Set(currentIds);
  const tombstones = existing.filter((id) => !current.has(id));
  return { ids, added, tombstones };
}

export function saveTable(file: string, ids: string[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // One id per line: appends produce a one-line diff instead of rewriting the file.
  const body = ids.map((id, i) => `    ${JSON.stringify(id)}${i === ids.length - 1 ? '' : ','}`).join('\n');
  const text = `{\n  "schema": 1,\n  "note": ${JSON.stringify(NOTE)},\n  "ids": [\n${body}\n  ]\n}\n`;
  fs.writeFileSync(file, text, 'utf8');
}

export function saveIdTable(ids: string[]): void {
  saveTable(ID_TABLE_PATH, ids);
}

export function saveAbilityTable(ids: string[]): void {
  saveTable(ABILITY_TABLE_PATH, ids);
}

export function saveMapTable(ids: string[]): void {
  saveTable(MAP_TABLE_PATH, ids);
}

/** Stable fingerprint of the table; the URL codec embeds its first 16 bits. */
export function idTableHash(ids: string[]): string {
  return crypto.createHash('sha256').update(ids.join('\n')).digest('hex');
}

export function idTableFingerprint(ids: string[]): number {
  return Number.parseInt(idTableHash(ids).slice(0, 4), 16);
}
