import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { DIRS } from './lib/paths.ts';

/**
 * Runs the whole extraction pipeline in order, then verifies the result.
 * Each step is also runnable on its own; see package.json scripts.
 *
 * Flags are forwarded to every step, so `npm run extract -- --offline` skips
 * the CDN fetch.
 */

const STEPS = [
  '01-vpk-index.ts',
  '02-extract-raw.ts',
  '03-parse-locales.ts',
  '04-build-items.ts',
  '04b-build-heroes.ts',
  '04c-build-maps.ts',
  '04d-build-rolls.ts',
  'make-placeholder.ts',
  '05-icons-vpk.ts',
  '05b-icons-ui.ts',
  '06-icons-cdn.ts',
  '07-emit.ts',
  // The wiki's tables. After the emit, because they read the emitted item
  // table and join against it rather than re-deriving it.
  '08a-wiki-monsters.ts',
  '08b-wiki-progression.ts',
  '08c-wiki-sky-vendors.ts',
  '08d-wiki-items.ts',
  'verify.ts',
];

const forwarded = process.argv.slice(2);
const started = process.hrtime.bigint();

for (const script of STEPS) {
  const result = spawnSync(process.execPath, [path.join(DIRS.tools, script), ...forwarded], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.stdout.write(`\nPipeline stopped: ${script} exited with code ${result.status ?? 'signal'}\n`);
    process.exit(result.status ?? 1);
  }
}

const seconds = Number(process.hrtime.bigint() - started) / 1e9;
process.stdout.write(`\nPipeline complete in ${seconds.toFixed(1)}s\n`);
