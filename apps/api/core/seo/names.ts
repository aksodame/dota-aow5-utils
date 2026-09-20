/**
 * The game's own nouns, in the reader's language, on the server.
 *
 * The browser gets these from `loadCore`, which fetches the extracted locale
 * files at runtime. The server cannot: it is rendering a card for a crawler
 * that arrived a millisecond ago and will not wait for three HTTP round trips,
 * and it has no origin to fetch them from anyway. So it imports them, the same
 * way `core/codec/tables.ts` already imports `heroes.json` and `maps.json` —
 * and with the same consequence, which is that a `parser/` run that renames a
 * room needs the API image rebuilt before a card says the new name.
 *
 * Only the tables a card or a description actually use are imported. That used
 * to exclude item *names*, on the grounds that a card drew item icons and never
 * item names, and that the three name files were 210 kB of bundle for text
 * nothing rendered. The tracker page's card ended that: its subject is the
 * overlay's loot list, which is five item names in their rarity colours, and
 * the names are most of what makes the picture legible. So they are here now,
 * and the 210 kB buys text that is drawn — which is the same test the comment
 * it replaces was applying, answered the other way.
 */

import type { ItemFacts, SeoLang } from 'aow5-shared/seo';
import type { PreviewItem } from 'aow5-shared/overlay';
import { categoryOfMap, type TierKey } from 'aow5-shared/data';
import { ABILITY_SLOTS } from 'aow5-shared/types';
import { decodeBuild, groupsInPanel, type BuildState } from 'aow5-shared/codec';

import heroes from 'aow5-shared/public/data/heroes.json' with { type: 'json' };
import maps from 'aow5-shared/public/data/maps.json' with { type: 'json' };
import itemsIndex from 'aow5-shared/public/data/items.index.json' with { type: 'json' };
import mapsEn from 'aow5-shared/public/data/locale.en.maps.json' with { type: 'json' };
import mapsRu from 'aow5-shared/public/data/locale.ru.maps.json' with { type: 'json' };
import mapsZh from 'aow5-shared/public/data/locale.zh.maps.json' with { type: 'json' };
import abilitiesEn from 'aow5-shared/public/data/locale.en.abilities.json' with { type: 'json' };
import abilitiesRu from 'aow5-shared/public/data/locale.ru.abilities.json' with { type: 'json' };
import abilitiesZh from 'aow5-shared/public/data/locale.zh.abilities.json' with { type: 'json' };
import namesEn from 'aow5-shared/public/data/locale.en.names.json' with { type: 'json' };
import namesRu from 'aow5-shared/public/data/locale.ru.names.json' with { type: 'json' };
import namesZh from 'aow5-shared/public/data/locale.zh.names.json' with { type: 'json' };

import { HERO_TABLE, ID_TABLE } from '../codec/tables.ts';

/**
 * Hero name per language, keyed by hero id.
 *
 * Built once at module load. `heroes.json` carries all three languages inline
 * on each hero — there are five of them — so unlike rooms and abilities this
 * needs no per-language file.
 */
const HERO_NAMES: ReadonlyMap<string, Record<string, string>> = new Map(
  heroes.heroes.map((hero) => [hero.id, hero.names as Record<string, string>]),
);

/** The hero's own icon filename, for the card's portrait. */
const HERO_ICONS: ReadonlyMap<string, string> = new Map(heroes.heroes.map((hero) => [hero.id, hero.icon]));

const MAP_NAMES: Record<SeoLang, Record<string, { name: string }>> = {
  en: mapsEn.maps,
  ru: mapsRu.maps,
  zh: mapsZh.maps,
};

const ABILITY_NAMES: Record<SeoLang, Record<string, { name?: string }>> = {
  en: abilitiesEn.abilities,
  ru: abilitiesRu.abilities,
  zh: abilitiesZh.abilities,
};

/** The painted scene per room, for the cards that use one as a backdrop. Absent for rooms that ship no art. */
const MAP_IMAGES: ReadonlyMap<string, string> = new Map(
  maps.maps.flatMap((map) => (map.image === undefined ? [] : [[map.id, map.image] as const])),
);

/** Which tier the site files each room under. Its curation, not the game's — see `tiers.ts`. */
const MAP_TIERS: ReadonlyMap<string, TierKey> = new Map(maps.maps.map((map) => [map.id, categoryOfMap(map)]));

/**
 * Item id to icon filename, for the gear row on a card.
 *
 * The index is positional — `[idx, id, type, quality, level, cost, icon,
 * kinds]` — and this reaches for two of the eight columns. Indexed by name
 * through the shared constants rather than by literal, so a column added to the
 * middle of that row does not silently start drawing prices as filenames.
 */
const ITEM_ICONS: ReadonlyMap<string, string> = new Map(
  itemsIndex.rows.map((row) => [row[1] as string, row[6] as string]),
);

/**
 * The rest of an item's row, for the one card that draws items as rows rather
 * than as tiles.
 *
 * A build's gear row needs a filename and nothing else; the tracker card's loot
 * list needs the rarity to colour a name with and the cost to price a pile at.
 * Same positional index, read through the same named destructure.
 */
const ITEM_FACTS: ReadonlyMap<
  string,
  { icon: string; type: string; quality: number; level: number; cost: number }
> = new Map(
  itemsIndex.rows.map((row) => {
    const [, id, type, quality, level, cost, icon] = row;
    return [
      id as string,
      {
        icon: icon as string,
        type: type as string,
        quality: quality as number,
        level: level as number,
        cost: cost as number,
      },
    ];
  }),
);

/**
 * The rarity ramp, as hex.
 *
 * The same seven colours `--q1`…`--q7` resolve to on the page's dark theme,
 * restated because a card is drawn by a string concatenator that has no
 * stylesheet to ask. The dark values specifically: a social card has one
 * appearance and it is the dark one, the way every other card this server
 * draws already is.
 */
const QUALITY_COLOURS = ['#9aa7c7', '#5bd18a', '#4aa3ff', '#b06bff', '#ff9a3d', '#ff5c7a', '#ffd94a'] as const;

export function qualityColour(quality: number): string {
  return QUALITY_COLOURS[Math.min(Math.max(Math.trunc(quality), 1), 7) - 1] as string;
}

/**
 * One item's facts, for its page and its card.
 *
 * Undefined for an id this deployment's table does not have, which the caller
 * turns into the `missingItem` meta target — a 404 with a canonical of its own
 * rather than a redirect to the catalogue.
 *
 * **No description.** The three `locale.*.details.json` files are half a
 * megabyte each and the only thing a card would take from them is a sentence;
 * `itemDescription` already falls back to the facts plus a generic line, which
 * is what the card shows. If a card ever needs the real text, that is the
 * moment to weigh the bundle, not before.
 */
export function itemFacts(id: string, lang: SeoLang): ItemFacts | undefined {
  const facts = ITEM_FACTS.get(id);
  if (facts === undefined) return undefined;
  return {
    id,
    // English as the fallback rather than the id, as `previewItem` does it.
    name: ITEM_NAMES[lang][id] ?? ITEM_NAMES.en[id] ?? id,
    type: facts.type,
    quality: facts.quality,
    level: facts.level,
    cost: facts.cost,
    icon: facts.icon,
    description: '',
  };
  /*
   * No `seasons` either, and for the same reason as the description: it lives
   * in `items.full.json`, not in the index this file imports. So the page draws
   * an S2 chip where the card does not. That is a difference worth naming: the
   * fix is a season column on the index row, which is a schema change and a
   * re-emit, and it buys one chip on one picture.
   */
}

/** Item name per language. See the note at the top of this file for why these are imported. */
const ITEM_NAMES: Record<SeoLang, Record<string, string>> = {
  en: namesEn.names,
  ru: namesRu.names,
  zh: namesZh.names,
};

/**
 * Ability id to icon filename, for the headline spell on a card.
 *
 * From `heroes.json`'s ability table, which is the same record the editor reads
 * — so the picture beside the name on a card is the picture in the slot that
 * named it, and neither can drift without the other.
 */
const ABILITY_ICONS: ReadonlyMap<string, string> = new Map(
  Object.entries(heroes.abilities as Record<string, { icon?: string }>)
    .filter((entry): entry is [string, { icon: string }] => typeof entry[1].icon === 'string')
    .map(([id, ability]) => [id, ability.icon]),
);

/**
 * One item as the tracker card wants it, or undefined when this deployment's
 * tables do not have it.
 *
 * Undefined rather than a placeholder: `previewReadout` drops an unknown id, so
 * the card is then one row short — which is a better picture than a row with no
 * name and a price of `NaN`.
 */
export function previewItem(id: string, lang: SeoLang): PreviewItem | undefined {
  const facts = ITEM_FACTS.get(id);
  if (facts === undefined) return undefined;
  // English as the fallback rather than the id, the same way `heroName` does it.
  const name = ITEM_NAMES[lang][id] ?? ITEM_NAMES.en[id] ?? id;
  return { id, name, icon: facts.icon, quality: facts.quality, cost: facts.cost };
}

export function heroName(heroId: string | null, lang: SeoLang): string | null {
  if (heroId === null) return null;
  const names = HERO_NAMES.get(heroId);
  // English as the fallback rather than the id: a card that says
  // `npc_dota_hero_axe` is worse than one that says Axe to a Russian reader.
  return names?.[lang] ?? names?.['en'] ?? null;
}

export function heroIcon(heroId: string | null): string | null {
  return heroId === null ? null : (HERO_ICONS.get(heroId) ?? null);
}

export function mapName(mapId: string, lang: SeoLang): string | null {
  return MAP_NAMES[lang][mapId]?.name ?? MAP_NAMES.en[mapId]?.name ?? null;
}

/** The rooms a build names, in the reader's language, skipping any this deployment cannot name. */
export function mapNames(mapIds: readonly string[], lang: SeoLang): string[] {
  return mapIds.map((id) => mapName(id, lang)).filter((name): name is string => name !== null);
}

export function tierOfMap(mapId: string): TierKey | null {
  return MAP_TIERS.get(mapId) ?? null;
}

export function abilityName(abilityId: string, lang: SeoLang): string | null {
  return ABILITY_NAMES[lang][abilityId]?.name ?? ABILITY_NAMES.en[abilityId]?.name ?? null;
}

/**
 * Where a picture sits under the assets root.
 *
 * Mirrors `iconUrl`, `heroIconUrl` and `mapImageUrl` in `aow5-shared/data`,
 * which build the browser's URLs for the same files — including the one case
 * that is not a simple join: an item whose extraction found no art is recorded
 * as `placeholder.png`, and that file lives at the root of `icons/` rather than
 * inside `icons/items/`. Joining it naively yields a path that does not exist,
 * which the card would draw as an empty tile — the same outcome as an empty
 * slot, and therefore a bug nobody would notice.
 */
const PLACEHOLDER = 'placeholder.png';

function iconPath(folder: string, file: string | null): string | null {
  if (file === null) return null;
  return file === PLACEHOLDER ? `icons/${PLACEHOLDER}` : `icons/${folder}/${file}`;
}

/** The path to one item's icon, or null when this deployment has no such item. */
export function itemIconPath(itemId: string): string | null {
  return iconPath('items', ITEM_ICONS.get(itemId) ?? null);
}

/** The path to one ability's icon, or null when this deployment has no such ability. */
export function abilityIconPath(abilityId: string): string | null {
  return iconPath('abilities', ABILITY_ICONS.get(abilityId) ?? null);
}

/** The path to a hero's art, or null when the build names no hero. */
export function heroIconPath(heroId: string | null): string | null {
  return iconPath('heroes', heroIcon(heroId));
}

/**
 * The path to a room's painted scene, or null.
 *
 * Only rooms that ship art have one, and `MapInfo.image` is absent for the rest
 * — so this reads the map table rather than assuming `<id>.png`, which would
 * name a file that is not there for every event room.
 */
export function mapScenePath(mapId: string | undefined): string | null {
  if (mapId === undefined) return null;
  const image = MAP_IMAGES.get(mapId);
  return image === undefined ? null : `icons/maps/${image}`;
}

/**
 * The loadout a stored payload holds, or null when this deployment cannot read
 * it.
 *
 * Null is a real outcome rather than an error: a payload written by a newer
 * codec than this image knows is exactly the case the version byte exists to
 * detect, and the honest response is a card with no gear row on it rather than
 * a 500 on somebody's link preview.
 */
export function decodeStored(payload: string): BuildState | null {
  const decoded = decodeBuild(payload, ID_TABLE, HERO_TABLE);
  return decoded.ok ? decoded.state : null;
}

/**
 * Which ability sits in the slot the author called the build's headline.
 *
 * The *slot* is stored on the build and the *ability* is in the payload, which
 * is the whole point of storing a slot key: `'q'` keeps naming this build's Q
 * after the author swaps what is in it. So answering "what is this build's main
 * spell called" needs both, and this is the only place that joins them.
 *
 * Falls back the way every other screen does when the author chose no headline
 * — see `mainSpellKey` in the webapp — except that the fallback here is only
 * `q`, not the full kit order. A card has one line for this, and a build whose
 * author named nothing is better served by a blank than by a passive nobody
 * thinks of as the point of the build.
 */
export function mainSpellName(state: BuildState | null, slot: string | null, lang: SeoLang): string | null {
  // A worn Life Soul takes the `f` key over, so a card whose headline is `f`
  // names the soul rather than the Emergency Heal every build in the list has.
  const soul = headlineSoul(state, slot);
  if (soul !== null) return ITEM_NAMES[lang][soul] ?? ITEM_NAMES.en[soul] ?? null;
  const id = mainSpellId(state, slot);
  return id === null ? null : abilityName(id, lang);
}

/** Where a Life Soul is worn. From the layout, so it follows the layout. */
const SOUL_SLOT: number | null = groupsInPanel('soul')[0]?.start ?? null;

/**
 * The Life Soul standing in for the headline, or null.
 *
 * Non-null only when the headline key is `f` and the loadout wears one — the
 * same rule `equippedSoul` applies in the webapp, restated here because the
 * server decodes payloads of its own and must not disagree with the page the
 * card is a picture of.
 */
export function headlineSoul(state: BuildState | null, slot: string | null): string | null {
  if (state === null || SOUL_SLOT === null) return null;
  if ((slot ?? 'q') !== 'f') return null;
  const value = state.slots[SOUL_SLOT];
  return value?.k === 'id' ? value.id : null;
}

/**
 * The headline ability's *id*, which is what a picture needs and a name does
 * not.
 *
 * Split out rather than returning a pair, because the two callers want
 * different halves at different moments: the description is built from facts
 * and never loads an image, and the card wants both. The slot-to-ability join
 * lives here either way.
 */
export function mainSpellId(state: BuildState | null, slot: string | null): string | null {
  if (state === null) return null;
  const key = slot ?? 'q';
  const at = ABILITY_SLOTS.indexOf(key as (typeof ABILITY_SLOTS)[number]);
  if (at < 0) return null;
  const value = state.spells[at];
  return value?.k === 'id' ? value.id : null;
}
