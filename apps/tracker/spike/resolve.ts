import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the item ids GSI reports against the planner's published tables.
 *
 * This is the join that makes the whole tool possible: GSI gives bare ids like
 * `item_G210_3`, and `aow5-shared` already publishes name, rarity and — the
 * important one — **gold cost** for every playable item. Native Dota gold is
 * dead in this addon, so "gold per hour" has to mean *the value of what you
 * picked up*, which is exactly what `cost` gives.
 *
 *   node spike/resolve.ts [capture/gsi.3002.jsonl]
 *
 * Reads the extracted data from the workspace if present, else falls back to
 * the deployed copy.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
// The data lives in the shared package, which is where the planner reads it
// from too — it never had a public/ directory of its own.
const SIBLING = path.resolve(ROOT, '..', '..', 'packages', 'aow5-shared', 'public', 'data');
const REMOTE = 'https://aow5-builder.pages.dev/data';

/** Tuple layout of `items.index.json` rows — see `src/types/items.ts`. */
const INDEX_ID = 1;
const INDEX_QUALITY = 3;
const INDEX_LEVEL = 4;
const INDEX_COST = 5;

type IndexRow = [number, string, string, number, number, number, string, number];

async function loadJson<T>(file: string): Promise<T> {
  const local = path.join(SIBLING, file);
  if (fs.existsSync(local)) return JSON.parse(fs.readFileSync(local, 'utf8')) as T;
  const res = await fetch(`${REMOTE}/${file}`);
  if (!res.ok) throw new Error(`could not load ${file}: ${res.status}`);
  return (await res.json()) as T;
}

const index = await loadJson<{ rows: IndexRow[] }>('items.index.json');
const names = (await loadJson<{ names: Record<string, string> }>('locale.en.names.json')).names;

const byId = new Map<string, IndexRow>(index.rows.map((r) => [r[INDEX_ID], r]));

/**
 * The index ships only *playable* items, so ids the game legitimately holds but
 * the planner hides — pets, for one — miss. Fall back to the full table, which
 * carries every parsed item including hidden ones.
 */
let full: Record<string, { cost?: number; quality?: number; level?: number }> | null = null;
async function costOf(id: string): Promise<{ cost: number; quality: number; level: number; source: string } | null> {
  const row = byId.get(id);
  if (row) return { cost: row[INDEX_COST], quality: row[INDEX_QUALITY], level: row[INDEX_LEVEL], source: 'index' };
  full ??= await loadJson<typeof full & object>('items.full.json');
  const item = full?.[id];
  if (!item) return null;
  return { cost: item.cost ?? 0, quality: item.quality ?? 0, level: item.level ?? 0, source: 'full (hidden)' };
}
process.stdout.write(`loaded ${index.rows.length} playable items from ${fs.existsSync(SIBLING) ? 'sibling checkout' : REMOTE}\n`);

const file = process.argv[2] ?? path.join(ROOT, 'capture', 'gsi.3002.jsonl');
const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
const last = JSON.parse(JSON.parse(lines[lines.length - 1]!).body) as {
  items?: Record<string, { name?: string }>;
};

process.stdout.write('\nheld right now\n--------------\n');
let total = 0;
let unresolved = 0;
for (const [slot, v] of Object.entries(last.items ?? {})) {
  const id = v?.name;
  if (!id || id === 'empty') continue;
  const resolved = await costOf(id);
  if (!resolved) {
    unresolved++;
    process.stdout.write(`  ${slot.padEnd(12)} ${id.padEnd(16)} (unknown to the planner)\n`);
    continue;
  }
  total += resolved.cost;
  const label = names[id] ?? id;
  const note = resolved.source === 'index' ? '' : `  [${resolved.source}]`;
  process.stdout.write(
    `  ${slot.padEnd(12)} ${id.padEnd(16)} ${String(resolved.cost).padStart(7)}g  q${resolved.quality} L${resolved.level}  ${label}${note}\n`,
  );
}
process.stdout.write(`\n  ${'total'.padEnd(12)} ${''.padEnd(16)} ${String(total).padStart(7)}g\n`);
if (unresolved > 0) process.stdout.write(`  ${unresolved} id(s) not resolvable\n`);
