import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Live view over a running capture: prints the moment an inventory slot
 * changes, and keeps running items/hour and loot-value/hour.
 *
 *   node spike/watch.ts [capture/gsi.3002.jsonl]
 *
 * Tails the JSONL rather than binding the port, so it runs alongside
 * `capture-gsi.ts` without competing for it. The capture stays a dumb recorder;
 * all interpretation lives here.
 *
 * This is the spike's actual question made observable: play, kill something,
 * and see whether a drop shows up at all.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
// The data lives in the shared package, which is where the planner reads it
// from too — it never had a public/ directory of its own.
const SIBLING = path.resolve(ROOT, '..', '..', 'packages', 'aow5-shared', 'public', 'data');
const REMOTE = 'https://aow5-builder.pages.dev/data';
const file = process.argv[2] ?? path.join(ROOT, 'capture', 'gsi.3002.jsonl');

const INDEX_ID = 1;
const INDEX_COST = 5;
type IndexRow = [number, string, string, number, number, number, string, number];

async function loadJson<T>(name: string): Promise<T> {
  const local = path.join(SIBLING, name);
  if (fs.existsSync(local)) return JSON.parse(fs.readFileSync(local, 'utf8')) as T;
  const res = await fetch(`${REMOTE}/${name}`);
  if (!res.ok) throw new Error(`could not load ${name}: ${res.status}`);
  return (await res.json()) as T;
}

const index = await loadJson<{ rows: IndexRow[] }>('items.index.json');
const names = (await loadJson<{ names: Record<string, string> }>('locale.en.names.json')).names;
const costById = new Map(index.rows.map((r) => [r[INDEX_ID], r[INDEX_COST]]));
let full: Record<string, { cost?: number }> | null = null;

async function describe(id: string): Promise<{ label: string; cost: number }> {
  let cost = costById.get(id);
  if (cost === undefined) {
    // Hidden items (pets) are absent from the playable index.
    full ??= await loadJson<Record<string, { cost?: number }>>('items.full.json');
    cost = full[id]?.cost ?? 0;
  }
  return { label: names[id] ?? id, cost };
}

interface Payload {
  map?: { game_time?: number; matchid?: string; game_state?: string; name?: string };
  hero?: { level?: number; xp?: number };
  items?: Record<string, { name?: string }>;
}

const held = (p: Payload): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [slot, v] of Object.entries(p.items ?? {})) {
    if (v?.name && v.name !== 'empty') out.set(slot, v.name);
  }
  return out;
};

let prev: Map<string, string> | null = null;
let prevXp: number | undefined;
let startTime: number | null = null;
let lastTime = 0;
let gained = 0;
let gainedValue = 0;
let xpGained = 0;
let offset = 0;
let carry = '';
let seen = 0;

const hhmmss = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function rates(): string {
  if (startTime === null) return '';
  const elapsed = lastTime - startTime;
  if (elapsed <= 0) return `elapsed ${hhmmss(0)}`;
  const perHour = (n: number) => ((n * 3600) / elapsed).toFixed(0);
  return (
    `elapsed ${hhmmss(elapsed)}   ` +
    `items +${gained} (${perHour(gained)}/hr)   ` +
    `value +${gainedValue}g (${perHour(gainedValue)}g/hr)   ` +
    `xp +${xpGained} (${perHour(xpGained)}/hr)`
  );
}

async function handle(p: Payload): Promise<void> {
  seen++;
  const now = p.map?.game_time;
  if (typeof now === 'number') {
    if (startTime === null) startTime = now;
    lastTime = now;
  }

  if (typeof p.hero?.xp === 'number') {
    if (prevXp !== undefined && p.hero.xp > prevXp) xpGained += p.hero.xp - prevXp;
    prevXp = p.hero.xp;
  }

  const current = held(p);
  if (prev === null) {
    prev = current;
    const value = (await Promise.all([...current.values()].map(describe))).reduce((n, d) => n + d.cost, 0);
    process.stdout.write(
      `baseline: ${current.size} item(s) held, worth ${value}g  ` +
        `[match ${p.map?.matchid ?? '?'} on ${p.map?.name ?? '?'}, ${p.map?.game_state ?? '?'}]\n\n`,
    );
    return;
  }

  for (const [slot, id] of current) {
    const before = prev.get(slot);
    if (before === id) continue;
    const d = await describe(id);
    gained++;
    gainedValue += d.cost;
    process.stdout.write(
      `[${hhmmss(lastTime - (startTime ?? lastTime))}] + ${slot.padEnd(12)} ${d.label} (${d.cost}g)` +
        `${before ? `  replacing ${names[before] ?? before}` : ''}\n    ${rates()}\n`,
    );
  }
  for (const [slot, id] of prev) {
    if (!current.has(slot)) {
      process.stdout.write(`[${hhmmss(lastTime - (startTime ?? lastTime))}] - ${slot.padEnd(12)} ${names[id] ?? id} left the slot\n`);
    }
  }
  prev = current;
}

/** Reads whatever is new since the last poll; the capture only ever appends. */
async function poll(): Promise<void> {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return; // capture has not created it yet
  }
  if (size <= offset) return;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(size - offset);
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);
  offset = size;

  const text = carry + buf.toString('utf8');
  const lines = text.split('\n');
  carry = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      await handle(JSON.parse(JSON.parse(line).body as string) as Payload);
    } catch {
      // A partially flushed line; the carry picks it up next poll.
    }
  }
}

process.stdout.write(`watching ${file}\nplay, kill something that drops loot, and watch for '+' lines\n\n`);
await poll();
const timer = setInterval(() => void poll(), 1000);

const stop = () => {
  clearInterval(timer);
  process.stdout.write(`\n${seen} payload(s) seen\n${rates() || '(no game clock seen)'}\n`);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
