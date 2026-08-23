import { defineConfig } from 'drizzle-kit';

/**
 * Generates migrations from core/db/schema.ts into drizzle/.
 *
 * Only ever run by hand (`pnpm --filter aow5-utils-api db:generate`); the server
 * applies what is already committed and never generates anything at runtime.
 *
 * Note what drizzle-kit does NOT manage: virtual tables and triggers. The FTS5
 * index over builds is a hand-written migration created with
 * `drizzle-kit generate --custom` — so an empty diff here does not mean the
 * schema is unchanged, it means nothing *drizzle-kit can see* changed.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './core/db/schema.ts',
  out: './drizzle',
  // Only used by `drizzle-kit studio`/`push`, which this project does not use
  // — the server owns its own connection. Kept so studio works if you want it.
  dbCredentials: { url: process.env['DATABASE_PATH'] ?? './aow5.db' },
});
