import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Answers the spike's questions from a capture, quoting real payload values.
 *
 *   node spike/analyse.ts [capture/gsi.3002.jsonl]
 *
 * Deliberately reports what moved and what did not: a field that is present but
 * frozen at zero for a whole match is the interesting negative result, and is
 * easy to mistake for "working" if you only look at one payload.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const file = process.argv[2] ?? path.join(ROOT, 'capture', 'gsi.3002.jsonl');

interface Payload {
  provider?: { timestamp?: number };
  map?: Record<string, unknown>;
  player?: Record<string, unknown>;
  hero?: Record<string, unknown>;
  items?: Record<string, { name?: string }>;
  abilities?: Record<string, { name?: string }>;
  events?: unknown;
}

const rows = fs
  .readFileSync(file, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { t: string; n: number; body: string })
  .map((r) => ({ t: r.t, p: JSON.parse(r.body) as Payload }));

if (rows.length === 0) {
  process.stdout.write('no payloads captured\n');
  process.exit(1);
}

const first = rows[0]!;
const last = rows[rows.length - 1]!;
const span = (Date.parse(last.t) - Date.parse(first.t)) / 1000;

const line = (label: string, value: string) => process.stdout.write(`  ${label.padEnd(26)} ${value}\n`);
const head = (s: string) => process.stdout.write(`\n${s}\n${'-'.repeat(s.length)}\n`);

head(`capture: ${path.basename(file)}`);
line('payloads', String(rows.length));
line('wall-clock span', `${span.toFixed(0)}s`);
line('components present', Object.keys(last.p).join(', '));

// --- identity and session ---------------------------------------------------

head('session');
const m = last.p.map ?? {};
line('customgamename', String(m.customgamename ?? '(absent)'));
line('map.name', String(m.name ?? '(absent)'));
line('matchid', String(m.matchid ?? '(absent)'));
line('game_state', String(m.game_state ?? '(absent)'));
line('player.activity', String(last.p.player?.activity ?? '(absent)'));

const states = [...new Set(rows.map((r) => String(r.p.map?.game_state ?? '')))].filter(Boolean);
line('game_state values seen', states.join(' -> ') || '(none)');
const maps = [...new Set(rows.map((r) => String(r.p.map?.name ?? '')))].filter(Boolean);
line('map.name values seen', maps.join(' -> ') || '(none)');
const matches = [...new Set(rows.map((r) => String(r.p.map?.matchid ?? '')))].filter(Boolean);
line('matchid values seen', matches.join(' -> ') || '(none)');

// --- which numeric fields actually move -------------------------------------
// The whole question for gold is "is this real or a stationary zero".

head('numeric fields: did they move?');
const track: [string, (p: Payload) => unknown][] = [
  ['map.game_time', (p) => p.map?.game_time],
  ['player.gold', (p) => p.player?.gold],
  ['player.gold_reliable', (p) => p.player?.gold_reliable],
  ['player.gold_from_creep_kills', (p) => p.player?.gold_from_creep_kills],
  ['player.gpm', (p) => p.player?.gpm],
  ['player.xpm', (p) => p.player?.xpm],
  ['player.kills', (p) => p.player?.kills],
  ['player.last_hits', (p) => p.player?.last_hits],
  ['hero.level', (p) => p.hero?.level],
  ['hero.xp', (p) => p.hero?.xp],
  ['hero.health', (p) => p.hero?.health],
];
for (const [label, get] of track) {
  const values = rows.map((r) => get(r.p)).filter((v) => typeof v === 'number') as number[];
  if (values.length === 0) {
    line(label, 'ABSENT');
    continue;
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const moved = lo !== hi;
  line(label, `${moved ? 'MOVED' : 'static'}  ${lo} -> ${hi}${moved ? ` (delta ${hi - lo})` : ''}`);
}

// --- inventory over time ----------------------------------------------------
// A drop shows up as a slot whose name changed between two payloads.

head('inventory');
const nameOf = (p: Payload, slot: string) => p.items?.[slot]?.name ?? 'empty';
const slots = [...new Set(rows.flatMap((r) => Object.keys(r.p.items ?? {})))].sort();
line('slots reported', String(slots.length));
line('slot names', slots.join(' '));

const held = (p: Payload) =>
  Object.entries(p.items ?? {})
    .filter(([, v]) => v?.name && v.name !== 'empty')
    .map(([k, v]) => `${k}=${v.name}`);
line('held at start', held(first.p).join(' ') || '(none)');
line('held at end', held(last.p).join(' ') || '(none)');

let changes = 0;
for (let i = 1; i < rows.length; i++) {
  for (const slot of slots) {
    const before = nameOf(rows[i - 1]!.p, slot);
    const after = nameOf(rows[i]!.p, slot);
    if (before === after) continue;
    changes++;
    if (changes <= 40) {
      process.stdout.write(`  ${rows[i]!.t}  ${slot.padEnd(20)} ${before} -> ${after}\n`);
    }
  }
}
line('slot changes observed', String(changes) + (changes > 40 ? ' (first 40 shown)' : ''));

// --- abilities --------------------------------------------------------------

head('abilities');
const abilityNames = Object.values(last.p.abilities ?? {})
  .map((a) => a?.name)
  .filter(Boolean);
line('ability ids', abilityNames.join(' ') || '(absent)');

// --- events -----------------------------------------------------------------

head('events');
const withEvents = rows.filter((r) => r.p.events !== undefined);
line('payloads with events', `${withEvents.length} / ${rows.length}`);
if (withEvents.length > 0) {
  process.stdout.write(`  sample: ${JSON.stringify(withEvents[0]!.p.events).slice(0, 300)}\n`);
}

process.stdout.write('\n');
