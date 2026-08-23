/**
 * Where the committed migrations live.
 *
 * Resolved against the working directory rather than against this file, because
 * this file has two shapes: source under `node --test`, where `import.meta.url`
 * exists, and a line inside dist/main.cjs, where it does not. Both run with a
 * well-defined cwd — apps/api in development, /app in the image, and drizzle/
 * sits directly under each — so cwd is the one thing that is true in both.
 *
 * Override with AOW5_MIGRATIONS when neither is true.
 */
export const DEFAULT_MIGRATIONS_FOLDER = 'drizzle';

export function migrationsFolder(env: NodeJS.ProcessEnv = process.env): string {
  return env['AOW5_MIGRATIONS'] ?? DEFAULT_MIGRATIONS_FOLDER;
}
