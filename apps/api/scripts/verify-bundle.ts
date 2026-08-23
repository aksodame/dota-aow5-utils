/**
 * What dist/main.cjs is still allowed to ask Node for.
 *
 * This exists because the failure it catches cannot be reproduced in
 * development. Both workspace packages ship as raw TypeScript; in the checkout
 * pnpm links them as symlinks that resolve to a real path under packages/, so
 * Node strips their types and a bundle that forgot to inline them runs
 * perfectly here. In the image, `pnpm deploy --prod` copies them in as real
 * directories under node_modules — where type stripping does not apply — and
 * the first import dies. The only way to see it before a deploy is to assert on
 * the artifact, which is what this does.
 *
 * The tracker pins the same class of invariant the same way; see the comment on
 * `externalizeDepsPlugin` in its electron.vite.config.ts.
 */
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'main.cjs');

/**
 * Everything here is a real package in the runtime image, installed by
 * `pnpm deploy --prod`. Anything else means the bundle is reaching for
 * something that will not be there.
 */
const ALLOWED = new Set([
  'better-sqlite3',
  'reflect-metadata',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/throttler',
  'drizzle-orm',
]);

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

const source = readFileSync(BUNDLE, 'utf8');
const required = new Set(
  [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1]!).filter((s) => !s.startsWith('.')),
);

const offenders: string[] = [];
for (const specifier of required) {
  if (builtins.has(specifier)) continue;
  if (ALLOWED.has(packageOf(specifier))) continue;
  offenders.push(specifier);
}

if (offenders.length > 0) {
  console.error(`dist/main.cjs requires things the runtime image will not have:\n  ${offenders.join('\n  ')}`);
  console.error(
    offenders.some((s) => s.startsWith('aow5-'))
      ? '\nA workspace package escaped the bundle. Check `noExternal` in tsup.config.ts —\n' +
          'this runs fine in the checkout and fails only once deployed.'
      : '\nEither add it to the allowlist here and to the runtime image, or bundle it.',
  );
  process.exit(1);
}

console.log(`verify-bundle: ok (${[...required].length} external requires, all present in the image)`);
