import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Captures Dota 2 Game State Integration payloads verbatim.
 *
 * GSI is one-way: the game POSTs JSON to a URI named in a
 * `cfg/gamestate_integration/gamestate_integration_*.cfg` file. Nothing is
 * requested, nothing is acknowledged beyond a 200 — so this is deliberately a
 * dumb recorder. Every body lands in `capture/gsi.jsonl` unparsed and
 * unfiltered, because the whole point of the spike is to find out what is in
 * them rather than to assume a shape.
 *
 *   node spike/capture-gsi.ts [port]
 *
 * Default port 3003. Port 3002 is Logitech G HUB's, which is useful: if a cfg
 * already points there and nothing is listening, binding it captures real
 * payloads with no game files touched and no restart.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const OUT_DIR = path.join(ROOT, 'capture');
const PORT = Number(process.argv[2] ?? 3003);

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `gsi.${PORT}.jsonl`);
const out = fs.createWriteStream(outFile, { flags: 'a' });

let count = 0;
let lastSummary = '';

/** One line per payload, so a long capture stays greppable and diffable. */
function record(body: string): void {
  count++;
  out.write(`${JSON.stringify({ t: new Date().toISOString(), n: count, body })}\n`);

  // A compact live view, printed only when something actually changed — a
  // heartbeat repeats the same state and would otherwise flood the terminal.
  let summary: string;
  try {
    const p = JSON.parse(body) as Record<string, any>;
    const parts = [
      p.map?.customgamename ? `game=${p.map.customgamename}` : null,
      p.map?.name ? `map=${p.map.name}` : null,
      p.map?.game_state ?? null,
      p.player?.activity ? `activity=${p.player.activity}` : null,
      p.map?.game_time !== undefined ? `t=${p.map.game_time}` : null,
      p.player?.gpm !== undefined ? `gpm=${p.player.gpm}` : null,
      p.player?.net_worth !== undefined ? `nw=${p.player.net_worth}` : null,
      p.items ? `items=[${itemNames(p.items).join(',') || '-'}]` : null,
      p.events ? `events=${JSON.stringify(p.events).slice(0, 80)}` : null,
    ].filter(Boolean);
    summary = parts.join('  ') || `(keys: ${Object.keys(p).join(',')})`;
  } catch {
    summary = `unparseable ${body.length}B`;
  }

  if (summary !== lastSummary) {
    lastSummary = summary;
    process.stdout.write(`[${count}] ${summary}\n`);
  }
}

/** Non-empty item names across every slot the payload carries. */
function itemNames(items: Record<string, any>): string[] {
  const names: string[] = [];
  for (const [slot, v] of Object.entries(items)) {
    if (v && typeof v === 'object' && typeof v.name === 'string' && v.name !== 'empty') {
      names.push(`${slot}:${v.name}`);
    }
  }
  return names;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    record(Buffer.concat(chunks).toString('utf8'));
    // Dota does not care about the body, only that it got a response.
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    process.stdout.write(`port ${PORT} is already in use — something else is listening\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`listening on http://127.0.0.1:${PORT}\nappending to ${outFile}\n`);
  process.stdout.write('waiting for Dota to POST (heartbeat is every ~10-30s when configured)\n\n');
});

const stop = () => {
  process.stdout.write(`\ncaptured ${count} payload(s) -> ${outFile}\n`);
  out.end();
  server.close(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
