/**
 * Everything the process reads from its environment, read once.
 *
 * Missing values fail here, at boot, naming the variable — rather than at the
 * first request that happens to need one.
 */
export interface AppConfig {
  port: number;
  /** Where the SQLite file lives. `:memory:` is legal and is what tests use. */
  databasePath: string;
  /**
   * The site's own origin, scheme included.
   *
   * Load-bearing twice over: it is the only `Origin` the mutation guard will
   * accept, and it is what decides whether cookies are marked `Secure`.
   */
  siteOrigin: string;
  /**
   * The Freesound API key, or null where the deployment has none.
   *
   * Optional on purpose, including in production: sound search is a convenience
   * in a desktop app, and a missing key should cost that one feature rather
   * than stop the site from booting. `FreesoundService` answers "not
   * configured" and the tracker's picker hides its search box.
   */
  freesoundToken: string | null;
  isProduction: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See infra/.env.example.`);
  }
  return value.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env['NODE_ENV'] === 'production';
  return {
    port: Number(env['PORT'] ?? 3000),
    databasePath: env['DATABASE_PATH'] ?? './aow5.db',
    // Required in production only, so `pnpm --filter aow5-utils-api dev` needs no
    // setup at all to answer /api/health.
    siteOrigin: isProduction ? required('SITE_ORIGIN') : (env['SITE_ORIGIN'] ?? 'http://localhost:5173'),
    freesoundToken: env['FREESOUND_TOKEN']?.trim() || null,
    isProduction,
  };
}

export const CONFIG = Symbol('AppConfig');
