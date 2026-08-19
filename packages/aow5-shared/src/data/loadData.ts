import type { IndexRow, ItemFull, ItemsIndex, LocaleDetail, Meta } from '../types/items.ts';
import type {
  AbilityFull,
  AbilityId,
  AbilityLocale,
  HeroId,
  HeroInfo,
  HeroesData,
  LocaleAbilities,
} from '../types/heroes.ts';

/**
 * Loads the extracted data.
 *
 * Everything lives in public/ and is fetched rather than imported: refreshing
 * the game data then costs nothing in the JS bundle, and Vite never has to walk
 * a thousand PNGs. Only the index and the active language's names are needed to
 * paint the board; descriptions and full records are pulled on demand.
 */

// Guarded so the pure helpers below can be imported by `node --test`, where
// Vite's import.meta.env does not exist.
const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const dataUrl = (file: string) => `${base}data/${file}`;

export const iconUrl = (icon: string): string =>
  icon === 'placeholder.png' ? `${base}icons/placeholder.png` : `${base}icons/items/${icon}`;

export const abilityIconUrl = (icon: string): string =>
  icon === 'placeholder.png' ? `${base}icons/placeholder.png` : `${base}icons/abilities/${icon}`;

export const heroIconUrl = (icon: string): string =>
  icon === 'placeholder.png' ? `${base}icons/placeholder.png` : `${base}icons/heroes/${icon}`;

export interface ItemSummary {
  idx: number;
  id: string;
  type: string;
  quality: number;
  level: number;
  cost: number;
  icon: string;
  /** Bitmask of the slot kinds this item may be placed into. */
  kinds: number;
  name: string;
  /** Lowercased `name id` for substring filtering in the picker. */
  search: string;
}

/** One ability, with its localized text already joined on. */
export interface SpellSummary extends AbilityFull {
  name: string;
  text?: AbilityLocale;
}

/** The roster and spell book, small enough to load with the board. */
export interface HeroData {
  heroes: HeroInfo[];
  byHero: Map<HeroId, HeroInfo>;
  spells: Map<AbilityId, SpellSummary>;
  /** Frozen ability table, rebuilt by index so the codec can resolve spells. */
  abilityIds: string[];
  /** Roster order; a hero's URL byte is its position here plus one. */
  heroIds: HeroId[];
}

export interface CoreData {
  meta: Meta;
  ids: string[];
  /** Slot-kind mask per id-table position, parallel to `ids`. */
  kinds: number[];
  items: ItemSummary[];
  byId: Map<string, ItemSummary>;
  heroes: HeroData;
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) throw new Error(`failed to load ${file}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** Builds the item summaries the board and picker render from. */
export function buildSummaries(rows: IndexRow[], names: Record<string, string>): ItemSummary[] {
  return rows.map((row: IndexRow) => {
    const [idx, id, type, quality, level, cost, icon, kinds] = row;
    const name = names[id] ?? id;
    return { idx, id, type, quality, level, cost, icon, kinds, name, search: `${name} ${id}`.toLowerCase() };
  });
}

/**
 * Rebuilds the id table from the index rather than shipping it twice.
 *
 * `idx` is the position in the frozen table, so placing each row at its own
 * index reproduces the table exactly — except that the index only carries
 * playable items, leaving empty strings where hidden or disabled ones were.
 * Those holes are intentional: the codec treats them as unknown indices so a
 * link pointing at one survives a round trip instead of resolving to `''`.
 */
export function rebuildIdTable(rows: IndexRow[], length: number): { ids: string[]; kinds: number[] } {
  const ids = new Array<string>(length).fill('');
  const kinds = new Array<number>(length).fill(0);
  for (const row of rows) {
    const idx = row[0];
    if (idx >= 0 && idx < length) {
      ids[idx] = row[1];
      kinds[idx] = row[7];
    }
  }
  return { ids, kinds };
}

/**
 * Rebuilds the frozen ability table by index, the same trick as the item table.
 *
 * heroes.json only carries selectable abilities, so a position belonging to one
 * that was dropped or is unfinished comes back as an empty string. The codec
 * treats those as unknown indices, which is what lets a guide from a newer build
 * round-trip through this one unchanged.
 */
export function rebuildAbilityTable(abilities: Record<string, AbilityFull>, length: number): string[] {
  const ids = new Array<string>(length).fill('');
  for (const ability of Object.values(abilities)) {
    if (ability.idx >= 0 && ability.idx < length) ids[ability.idx] = ability.id;
  }
  return ids;
}

export async function loadCore(lang: string): Promise<CoreData> {
  const [meta, index, heroesData] = await Promise.all([
    getJson<Meta>('meta.json'),
    getJson<ItemsIndex>('items.index.json'),
    getJson<HeroesData>('heroes.json'),
  ]);

  const chosen = meta.languages.includes(lang) ? lang : (meta.languages[0] ?? 'en');
  const [names, abilityText] = await Promise.all([
    getJson<{ names: Record<string, string> }>(`locale.${chosen}.names.json`).then((r) => r.names),
    // Ability text is a few dozen records, so it rides along with the board
    // rather than being lazy like item descriptions.
    getJson<LocaleAbilities>(`locale.${chosen}.abilities.json`)
      .then((r) => r.abilities)
      .catch(() => ({}) as Record<string, AbilityLocale>),
  ]);

  const items = buildSummaries(index.rows, names);
  const { ids, kinds } = rebuildIdTable(index.rows, meta.idTableLength);

  const spells = new Map<AbilityId, SpellSummary>();
  for (const ability of Object.values(heroesData.abilities)) {
    const text = abilityText[ability.id];
    spells.set(ability.id, { ...ability, name: text?.name ?? ability.id, text });
  }

  const heroes: HeroData = {
    heroes: heroesData.heroes,
    byHero: new Map(heroesData.heroes.map((h) => [h.id, h])),
    spells,
    abilityIds: rebuildAbilityTable(heroesData.abilities, heroesData.abilityTableLength),
    heroIds: heroesData.heroes.map((h) => h.id),
  };

  return { meta, ids, kinds, items, byId: new Map(items.map((i) => [i.id, i])), heroes };
}

let detailsCache: { lang: string; data: Record<string, LocaleDetail> } | null = null;

export async function loadDetails(lang: string): Promise<Record<string, LocaleDetail>> {
  if (detailsCache?.lang === lang) return detailsCache.data;
  const data = await getJson<Record<string, LocaleDetail>>(`locale.${lang}.details.json`);
  detailsCache = { lang, data };
  return data;
}

let fullCache: Record<string, ItemFull> | null = null;

export async function loadFull(): Promise<Record<string, ItemFull>> {
  if (fullCache) return fullCache;
  fullCache = await getJson<Record<string, ItemFull>>('items.full.json');
  return fullCache;
}
