/**
 * The heavy half of the item tables, read from disk when a card asks for it.
 *
 * `names.ts` imports what every request needs — the index row, the three name
 * files — straight into the bundle, because they are small and always wanted.
 * This is the other half: `items.full.json` is 1.3 MB and each
 * `locale.<lang>.details.json` is half a megabyte, and a card quotes four lines
 * out of the lot. Compiling four megabytes of text into `main.cjs` for that is
 * the trade the icons already declined, so this declines it the same way: the
 * files ship beside the icons under `ASSETS_DIR` and are read on first use.
 *
 * Cached forever once read. The process is replaced on every deploy and the
 * data cannot change under a running one — a refresh *is* a deploy, because the
 * tables are committed — so there is nothing to invalidate.
 *
 * Every read is allowed to fail. A missing or malformed file costs a card its
 * stat lines, which is a worse picture and not a failed request; that is the
 * same rule `CardService` applies to a missing icon.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import type { SeoLang } from 'aow5-shared/seo';

let assetsDir = '';
/** Set once at boot from the config, because this module has no injector. */
export function useAssetsDir(dir: string): void {
  assetsDir = dir;
}

const cache = new Map<string, unknown>();

function dataFile<T>(name: string): T | undefined {
  if (cache.has(name)) return cache.get(name) as T | undefined;
  let parsed: T | undefined;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(assetsDir, 'data', name), 'utf8')) as T;
  } catch {
    // Logged by its absence: the card simply draws without these lines.
    parsed = undefined;
  }
  cache.set(name, parsed);
  return parsed;
}

/** One item's full record, or undefined where the table could not be read. */
export function fullItem(id: string): ItemFull | undefined {
  return dataFile<Record<string, ItemFull>>('items.full.json')?.[id];
}

/**
 * One item's localized detail — the description, the lore, the stat labels.
 *
 * The emitted file is a flat `id -> detail` map. `LocaleDetails` in the shared
 * types describes it as `{ schema, lang, items }`, which is what the *shape*
 * was meant to be; the writer emits the map on its own. Both are read here
 * rather than picking one, because a caller of this function should not be the
 * thing that breaks when the emitter is reconciled with its type.
 */
export function itemDetail(id: string, lang: SeoLang): LocaleDetail | undefined {
  const file = dataFile<Record<string, LocaleDetail> & { items?: Record<string, LocaleDetail> }>(
    `locale.${lang}.details.json`,
  );
  return file?.items?.[id] ?? file?.[id];
}

/** One stat line as a card draws it: `+25%` and what it is. */
export interface CardStat {
  value: string;
  label: string;
}

/**
 * The stat lines for an item's card.
 *
 * Deliberately the *stats* and not the passive. A passive is a paragraph — the
 * Arcane Bracelet's is two sentences about stacking mana regeneration — and a
 * card that tried to carry one would have room for nothing else and would still
 * cut it off mid-clause. The numbers are what distinguishes one sword from
 * another at a glance, and they fit.
 *
 * `limit` is a ceiling, not the layout's own: the renderer knows how many rows
 * fit in two columns and clamps again. This one only exists so that an item
 * with thirteen stats does not build thirteen strings for a card that will draw
 * six of them.
 */
export function cardStats(id: string, lang: SeoLang, limit = 8): CardStat[] {
  const full = fullItem(id);
  if (full === undefined) return [];
  const labels = itemDetail(id, lang)?.values ?? {};

  const out: CardStat[] = [];
  for (const [key, raw] of Object.entries(full.values)) {
    if (out.length >= limit) break;
    if (typeof raw !== 'number' || raw === 0) continue;
    /*
     * Every `ability_*` key, not just `ability_value_*`.
     *
     * These are the description's own numbers — "200 times the mana spent" —
     * rather than bonuses of their own, and the addon ships no label for them,
     * so they came out as `Ability bloodmoon…` in a column of ellipses. This is
     * `isTuningKey` in the webapp, exactly; the page has never shown them, and
     * a card that did would be advertising stats the page then does not list.
     */
    if (key.startsWith('ability_')) continue;

    const pct = key.endsWith('_pct');
    const sign = raw > 0 ? '+' : '';
    out.push({
      value: `${sign}${round(raw)}${pct ? '%' : ''}`,
      // The addon's labels arrive as `+All Stats Bonus`; the sign belongs to
      // the number, so it is dropped rather than printed twice.
      label: (labels[key] ?? prettify(key)).replace(/^\+\s*/, '').trim(),
    });
  }
  return out;
}

/** Two decimals at most, and no trailing zeroes — `2.5`, `10`, `0.25`. */
function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** `bonus_all_stats` -> `Bonus all stats`, for the keys the addon never labelled. */
function prettify(key: string): string {
  const words = key.replace(/_pct$/, '').replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
