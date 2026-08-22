import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads Dota's console log for the AOW5 markers that exist *today*, with no
 * changes from the addon developer.
 *
 *   node spike/parse-console.ts [C:/Users/user/aow5-console.log]
 *
 * Requires `-con_logfile <path>` in Dota's launch options. Two prefixes matter:
 *   [VScript]         client-side Lua print()
 *   [PanoramaScript]  Panorama $.Msg()
 *
 * The room-enter line is the useful one, and it is an accident of the addon's
 * banner code calling `$.Msg` with the *localized* room name. So the name has
 * to be mapped back to a room id — hence `data/rooms.json`, which carries every
 * language the addon ships. If the developer adds structured `[AOW5TRK]` lines
 * this whole heuristic is replaced by a JSON.parse, which is the point of
 * asking.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const file = process.argv[2] ?? 'C:/Users/user/aow5-console.log';

interface Room {
  en?: string;
  ru?: string;
  type?: string;
  level?: number;
  gold?: number;
}
const rooms = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rooms.json'), 'utf8')) as { rooms: Record<string, Room> })
  .rooms;

/** Localized room name -> id, across every language in the table. */
const roomByName = new Map<string, string>();
for (const [id, r] of Object.entries(rooms)) {
  for (const key of ['en', 'ru'] as const) {
    const name = r[key];
    if (name) roomByName.set(name.toLowerCase(), id);
  }
}

/** `08/16 17:30:40 ` — wall clock, one-second resolution, no year. */
const LINE = /^(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2}) (.*)$/;

type Event =
  | { t: Date; kind: 'match_start' }
  | { t: Date; kind: 'map_preload'; map: string }
  | { t: Date; kind: 'room_enter'; room: string; name: string }
  | { t: Date; kind: 'room_picker'; open: string[] }
  | { t: Date; kind: 'structured'; payload: unknown };

const events: Event[] = [];
const year = new Date().getFullYear();
const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

for (const raw of text.split(/\r?\n/)) {
  const m = LINE.exec(raw);
  if (!m) continue;
  const [, mm, dd, hh, mi, ss, rest] = m;
  const t = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));

  // Structured lines, once the developer adds them. Preferred over everything below.
  const tracker = /\[AOW5TRK\]\s*(\{.*\})\s*$/.exec(rest!);
  if (tracker) {
    try {
      events.push({ t, kind: 'structured', payload: JSON.parse(tracker[1]!) });
      continue;
    } catch {
      // fall through to the heuristics
    }
  }

  if (rest!.includes('[onClientNativeGameStateChanged] currentState: 2')) {
    events.push({ t, kind: 'match_start' });
    continue;
  }
  const preload = /\[ClientRuleset\] begin preload rawMap=(\S+)/.exec(rest!);
  if (preload) {
    events.push({ t, kind: 'map_preload', map: preload[1]! });
    continue;
  }
  const picker = /状态=ready.*?直接开放=([^\s]*)\s+稳定开放=([^\s]*)/.exec(rest!);
  if (picker) {
    const open = `${picker[1]},${picker[2]}`.split(',').filter(Boolean);
    events.push({ t, kind: 'room_picker', open });
    continue;
  }

  // A bare `[PanoramaScript] <room name>` is the room-enter banner.
  const pano = /\[PanoramaScript\]\s+(.+)$/.exec(rest!);
  if (pano) {
    const id = roomByName.get(pano[1]!.trim().toLowerCase());
    if (id) events.push({ t, kind: 'room_enter', room: id, name: pano[1]!.trim() });
  }
}

// --- report -----------------------------------------------------------------

const hhmmss = (d: Date) => d.toTimeString().slice(0, 8);
const mmss = (s: number) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;

process.stdout.write(`${path.basename(file)} — ${events.length} recognised event(s)\n\n`);

const structured = events.filter((e) => e.kind === 'structured');
if (structured.length > 0) {
  process.stdout.write(`${structured.length} structured [AOW5TRK] line(s) — using those\n`);
  for (const e of structured.slice(0, 10)) process.stdout.write(`  ${hhmmss(e.t)}  ${JSON.stringify(e.payload)}\n`);
  process.stdout.write('\n');
}

for (const e of events) {
  if (e.kind === 'match_start') process.stdout.write(`${hhmmss(e.t)}  match start\n`);
  else if (e.kind === 'map_preload') process.stdout.write(`${hhmmss(e.t)}  map preload ${e.map}\n`);
  else if (e.kind === 'room_picker') process.stdout.write(`${hhmmss(e.t)}  room picker open — ${e.open.length} room(s) available\n`);
  else if (e.kind === 'room_enter') {
    const r = rooms[e.room];
    process.stdout.write(
      `${hhmmss(e.t)}  ENTER ${e.room} "${e.name}"${r?.type ? ` (${r.type} L${r.level})` : ''}\n`,
    );
  }
}

// Consecutive entries bound a run. Without an exit marker this includes the
// walk back and the picker, so it is an upper bound on clear time — stated
// rather than quietly presented as the real thing.
const entries = events.filter((e): e is Extract<Event, { kind: 'room_enter' }> => e.kind === 'room_enter');
process.stdout.write(`\nruns\n----\n`);
if (entries.length === 0) {
  process.stdout.write('  no room entries found\n');
} else if (entries.length === 1) {
  process.stdout.write(
    `  1 room entered (${entries[0]!.room}); need a second entry or a run-end marker to measure a duration\n`,
  );
} else {
  let total = 0;
  for (let i = 1; i < entries.length; i++) {
    const secs = (entries[i]!.t.getTime() - entries[i - 1]!.t.getTime()) / 1000;
    total += secs;
    process.stdout.write(`  ${entries[i - 1]!.room}  ${mmss(secs)}  (entry to next entry)\n`);
  }
  process.stdout.write(`  average ${mmss(total / (entries.length - 1))} over ${entries.length - 1} run(s)\n`);
}
process.stdout.write('\nnote: durations are entry-to-entry, so they include the walk back and room\n');
process.stdout.write('selection. A run-end marker from the addon would make them exact.\n');
