/**
 * Does the thing actually start?
 *
 * `test` covers core/, and `verify-bundle` covers what the bundle asks Node
 * for, but neither of them ever runs the server — so a provider that Nest
 * cannot construct passes both and fails on the first boot. That is not a
 * hypothetical: a token exported from the same module as a provider that
 * injects it produced exactly that, and the error named a `Function` rather
 * than anything you could search for.
 *
 * So this boots the built bundle against a throwaway database, waits for
 * /api/health, and checks that every route the site depends on is mapped.
 * Cheap, and it catches the whole class.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '..', 'dist', 'main.cjs');

/** Anonymous paths, and what a working server answers for each. */
const EXPECTED: Array<{ path: string; status: number }> = [
  { path: '/api/health', status: 200 },
  // 200 with a null user, deliberately — not 401. See the auth controller.
  { path: '/api/me', status: 200 },
  { path: '/api/builds', status: 200 },
  // The only part of the new sign-in flow a smoke test can reach anonymously.
  { path: '/api/auth/challenge', status: 200 },
  // A well-formed slug that names nothing.
  { path: '/api/builds/abcd1234', status: 404 },
  { path: '/api/builds/abcd1234/comments', status: 404 },
];

const dataDir = mkdtempSync(join(tmpdir(), 'aow5-smoke-'));
const port = 3000 + (process.pid % 1000);

const child = spawn(process.execPath, [bundle], {
  env: { ...process.env, DATABASE_PATH: join(dataDir, 'smoke.db'), PORT: String(port), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

let exited: number | null = null;
child.on('exit', (code) => (exited = code ?? 0));

/**
 * The database is still open at the moment the server is killed, and Windows
 * refuses to unlink a file that is. So this waits for the process to actually
 * go, and treats a leftover temp directory as not worth failing a check over.
 */
async function stop(): Promise<void> {
  if (exited === null) {
    child.kill();
    await new Promise<void>((resolve) => {
      const done = setTimeout(resolve, 2000);
      child.once('exit', () => {
        clearTimeout(done);
        resolve();
      });
    });
  }
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // A temp directory the OS will collect anyway.
  }
}

function fail(message: string): never {
  console.error(`smoke: ${message}\n\n--- server output ---\n${output}`);
  void stop();
  process.exit(1);
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    // A process that died is a failure now, not in thirty seconds.
    if (exited !== null) fail(`the server exited with code ${exited} before it was ready`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail('the server never answered /api/health');
}

await waitForHealth();

for (const { path, status } of EXPECTED) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (response.status !== status) {
    fail(`${path} answered ${response.status}, expected ${status}`);
  }
}

// Nest logs one of these per route. Their absence means a controller silently
// did not register, which no status code above would reveal.
const mapped = [...output.matchAll(/Mapped \{([^}]+)\}/g)].length;
if (mapped < 12) fail(`only ${mapped} routes were mapped, which is fewer than this API has`);

console.log(`smoke: ok (booted, ${mapped} routes mapped, ${EXPECTED.length} paths checked)`);
await stop();
process.exit(0);
