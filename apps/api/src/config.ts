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
   * Load-bearing three times over: it is the OpenID realm Steam shows the user,
   * the only `Origin` the mutation guard will accept, and what a post-login
   * redirect is resolved against.
   */
  siteOrigin: string;
  /** From steamcommunity.com/dev/apikey. Only the auth module requires it. */
  steamApiKey: string;
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
    steamApiKey: env['STEAM_API_KEY'] ?? '',
    isProduction,
  };
}

export const CONFIG = Symbol('AppConfig');
