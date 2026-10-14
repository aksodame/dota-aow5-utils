/**
 * Fetching the wiki's data files.
 *
 * The wiki's tables live under `public/data/wiki/` beside the builder's, one
 * file per domain plus one locale file per domain and language. They are
 * fetched on demand — a reader who opens the monsters section never downloads
 * the talent trees — and each file is fetched at most once per page load.
 *
 * Same base and the same cache-busting version as `loadData.ts`, so a deploy
 * that changes the data changes every URL it is served from.
 */

const env = (import.meta as { env?: { BASE_URL?: string; VITE_AOW5_DATA_VERSION?: string } }).env;
const base = env?.BASE_URL ?? '/';
const dataVersion = env?.VITE_AOW5_DATA_VERSION ?? '';

/** The URL of one wiki data file, e.g. `wikiDataUrl('monsters.json')`. */
export function wikiDataUrl(file: string): string {
  return `${base}data/wiki/${file}${dataVersion === '' ? '' : `?v=${dataVersion}`}`;
}

const cache = new Map<string, Promise<unknown>>();

/**
 * One wiki data file, parsed. Memoised by name; a failed fetch is forgotten so
 * the next caller can try again rather than inheriting the failure.
 */
export function loadWikiFile<T>(file: string): Promise<T> {
  const hit = cache.get(file);
  if (hit !== undefined) return hit as Promise<T>;

  const pending = fetch(wikiDataUrl(file)).then(async (res) => {
    if (!res.ok) throw new Error(`failed to load wiki/${file}: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  });
  cache.set(file, pending);
  pending.catch(() => cache.delete(file));
  return pending;
}

/** A domain's locale file for one language: `locale.<lang>.<domain>.json`. */
export function loadWikiLocale<T>(domain: string, lang: string): Promise<T> {
  return loadWikiFile<T>(`locale.${lang}.${domain}.json`);
}
