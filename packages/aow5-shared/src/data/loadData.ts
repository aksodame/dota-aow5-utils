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
import type { LocaleMaps, MapId, MapInfo, MapLocale, MapsData } from '../types/maps.ts';
import type { RollTables } from '../types/rolls.ts';

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
/*
 * The site's own tier curation, re-exported here because `aow5-shared/data` is
 * the subpath both apps already import — and both need the same answer about
 * which room sits at which tier. See `tiers.ts`.
 */
export {
  affixPool,
  canBeAffix,
  canBeDivine,
  clampReforge,
  decimalsOf,
  divinePctFor,
  enhancedBand,
  isAbilityValueKey,
  isReverseKey,
  isRolled,
  iterationBonus,
  randomPctOf,
  reachableRolls,
  reforgeCost,
  reforgeCostTotal,
  rollablePool,
  stableLevel,
  statOutcomes,
  statSpan,
  valueOf,
  type ReforgeCostRow,
  type StatOutcome,
} from './rolls.ts';

export {
  TIER_KEYS,
  categoryOfMap,
  isOffered,
  isTierKey,
  listedMaps,
  listedTiers,
  tierLabel,
  tierShort,
  type TierKey,
} from './tiers.ts';

// Season hero pools, for the same reason: the API and the site must agree. See `seasons.ts`.
export {
  DEFAULT_SEASON,
  LATEST_SEASON,
  SEASON_KEYS,
  isHeroInSeason,
  isSeasonKey,
  parseSeason,
  seasonHeroes,
  seasonLabel,
  seasonsOfHero,
  type SeasonKey,
} from './seasons.ts';

const env = (import.meta as { env?: { BASE_URL?: string; VITE_AOW5_DATA_VERSION?: string } }).env;
const base = env?.BASE_URL ?? '/';
/*
 * Which data this bundle was built against, stamped in by the webapp's Vite
 * config as a hash of `meta.json`.
 *
 * The bundle's own files are content-hashed and cached forever, but the data
 * keeps one URL and is cached for an hour — so without this, a deploy that
 * refreshes the game data is new code reading old data for up to an hour. That
 * is how Void Spirit went missing after the seasons deploy: the new S2 pool
 * named a hero the cached `heroes.json` did not have. A query that changes with
 * the data makes the browser ask for the new file the moment the new code runs.
 *
 * Absent outside Vite (node tests, anything that builds without the define),
 * where the URLs stay as they were.
 */
const dataVersion = env?.VITE_AOW5_DATA_VERSION ?? '';
const dataUrl = (file: string) => `${base}data/${file}${dataVersion === '' ? '' : `?v=${dataVersion}`}`;

export const iconUrl = (icon: string): string =>
  icon === 'placeholder.png' ? `${base}icons/placeholder.png` : `${base}icons/items/${icon}`;

export const abilityIconUrl = (icon: string): string =>
  icon === 'placeholder.png' ? `${base}icons/placeholder.png` : `${base}icons/abilities/${icon}`;

export const heroIconUrl = (icon: string): string =>
  icon === 'placeholder.png' ? `${base}icons/placeholder.png` : `${base}icons/heroes/${icon}`;

/** The portal's painted scene for a room. Only rooms that ship art have one. */
export const mapImageUrl = (image: string): string => `${base}icons/maps/${image}`;

/**
 * The game's own gold coin, for anywhere the site shows an amount of it.
 *
 * A constant rather than a lookup: it is chrome the site draws, not a record in
 * any table, so there is nothing to key it by. Lifted straight out of the
 * addon's `resource/flash3` PNGs by the pipeline's step 05b — the same coin the
 * game puts beside a price, so a price here reads as the same kind of number.
 */
export const goldIconUrl = (): string => `${base}icons/ui/gold.png`;

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

/** One map, with its localized name already joined on. */
export interface MapSummary extends MapInfo {
  /** The bare name — "Temple Depths". */
  name: string;
  /** The game's own labelled form — "Lv. 6: Temple Depths". */
  label: string;
}

/** The map table a guide is filed against. */
export interface MapData {
  maps: MapSummary[];
  byId: Map<MapId, MapSummary>;
  /**
   * Frozen map table, rebuilt by index so the codec can resolve a map the same
   * way it resolves items and spells. Position 0 is the reserved "no map"
   * slot and is always an empty string.
   */
  mapIds: string[];
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
  maps: MapData;
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

/**
 * Rebuilds the frozen map table by index, the same trick as the item and
 * ability tables — except that map indices are 1-based, because 0 is reserved
 * for "no map chosen". Slot 0 is therefore always an empty string, and so is
 * any position belonging to a room the addon has since retired; the codec
 * treats both as unknown and round-trips them unchanged.
 */
export function rebuildMapTable(maps: MapInfo[], length: number): string[] {
  const ids = new Array<string>(length + 1).fill('');
  for (const map of maps) {
    if (map.idx >= 1 && map.idx <= length) ids[map.idx] = map.id;
  }
  return ids;
}

export async function loadCore(lang: string): Promise<CoreData> {
  const [meta, index, heroesData, mapsData] = await Promise.all([
    getJson<Meta>('meta.json'),
    getJson<ItemsIndex>('items.index.json'),
    getJson<HeroesData>('heroes.json'),
    getJson<MapsData>('maps.json'),
  ]);

  const chosen = meta.languages.includes(lang) ? lang : (meta.languages[0] ?? 'en');
  const [names, abilityText, mapText] = await Promise.all([
    getJson<{ names: Record<string, string> }>(`locale.${chosen}.names.json`).then((r) => r.names),
    // Ability text is a few dozen records, so it rides along with the board
    // rather than being lazy like item descriptions.
    getJson<LocaleAbilities>(`locale.${chosen}.abilities.json`)
      .then((r) => r.abilities)
      .catch(() => ({}) as Record<string, AbilityLocale>),
    // Eighteen records. Cheaper to fetch than to think about deferring.
    getJson<LocaleMaps>(`locale.${chosen}.maps.json`)
      .then((r) => r.maps)
      .catch(() => ({}) as Record<MapId, MapLocale>),
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

  const mapSummaries: MapSummary[] = mapsData.maps.map((map) => {
    const text = mapText[map.id];
    return { ...map, name: text?.name ?? map.id, label: text?.label ?? text?.name ?? map.id };
  });

  const maps: MapData = {
    maps: mapSummaries,
    byId: new Map(mapSummaries.map((m) => [m.id, m])),
    mapIds: rebuildMapTable(mapsData.maps, mapsData.mapTableLength),
  };

  return { meta, ids, kinds, items, byId: new Map(items.map((i) => [i.id, i])), heroes, maps };
}

let detailsCache: { lang: string; data: Record<string, LocaleDetail> } | null = null;

export async function loadDetails(lang: string): Promise<Record<string, LocaleDetail>> {
  if (detailsCache?.lang === lang) return detailsCache.data;
  const data = await getJson<Record<string, LocaleDetail>>(`locale.${lang}.details.json`);
  detailsCache = { lang, data };
  return data;
}

/**
 * The roll tables, fetched once and kept.
 *
 * A few kilobytes, and lazy anyway: only a screen reasoning about a *particular*
 * copy of an item — the editor's priority panel, and the build page drawing one
 * back — has any use for them. See `rolls.ts` for what they mean.
 */
let rollsCache: RollTables | null = null;

export async function loadRolls(): Promise<RollTables> {
  if (rollsCache) return rollsCache;
  rollsCache = await getJson<RollTables>('rolls.json');
  return rollsCache;
}

let fullCache: Record<string, ItemFull> | null = null;

export async function loadFull(): Promise<Record<string, ItemFull>> {
  if (fullCache) return fullCache;
  fullCache = await getJson<Record<string, ItemFull>>('items.full.json');
  return fullCache;
}
