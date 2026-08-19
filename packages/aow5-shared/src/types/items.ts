/**
 * The contract between the extraction pipeline (tools/) and the app (src/).
 *
 * Anything the pipeline writes into public/data/ is described here. Keep this
 * file free of imports so both the Node tools and the browser bundle can use it.
 */

export type ItemId = string;

/** Where an icon PNG came from. Stock Dota icons are not shipped in the addon. */
export type IconSource = 'vpk' | 'cdn' | 'placeholder';

/** Item categories observed in the addon data. */
export type ItemType =
  | 'equip'
  | 'blueprint'
  | 'material'
  | 'gem'
  | 'stone'
  | 'potion'
  | 'special'
  | 'identity'
  | 'change';

/**
 * Descriptions ship as a parsed tree rather than an HTML string so the app can
 * render them as React elements — no dangerouslySetInnerHTML, no sanitizer at
 * runtime. Anything outside the allowlist fails the build instead of reaching
 * the browser.
 */
export type RichTag = 'h1' | 'b' | 'i' | 'font' | 'span' | 'br';
export type RichNode =
  | { t: 's'; v: string }
  | { t: 'br' }
  | { t: 'el'; tag: Exclude<RichTag, 'br'>; color?: string; c: RichNode[] };

export interface ItemNeed {
  id: ItemId;
  count: number;
}

/**
 * Which kind of slot an item may go into.
 *
 * A bitmask rather than a single category, because one item can be valid in
 * several places — every item fits a backpack, and a neutral drop is also
 * ordinary equipment. Computed once by the pipeline so the app never has to
 * re-derive it, and shipped as one integer per index row.
 *
 * Derived from the addon data as follows:
 *   POTION   itemType 'potion', plus the `item_P*` entries the data types as
 *            'special' (drinks and other consumables that share the P naming)
 *   EQUIP    itemType 'equip', excluding pets, which have their own slot
 *   RUNE     itemType 'gem' — the "Glyph: …" items the UI calls runes
 *   PET      IsPet / PetUnitName
 *   NEUTRAL  carries ItemIsNeutralActiveDrop
 *   BACKPACK everything
 */
export const SLOT_KIND = {
  POTION: 1,
  EQUIP: 2,
  RUNE: 4,
  PET: 8,
  NEUTRAL: 16,
  BACKPACK: 32,
} as const;

export type SlotKindName = keyof typeof SLOT_KIND;
export type SlotKindMask = number;

export const SLOT_KIND_NAMES = Object.keys(SLOT_KIND) as SlotKindName[];

/** True when an item's mask satisfies the kind a slot accepts. */
export function itemFitsSlot(itemKinds: SlotKindMask, slotKind: SlotKindMask): boolean {
  return (itemKinds & slotKind) !== 0;
}

/** A single entry of `items.full.json`. Lazy-loaded; detail views only. */
export interface ItemFull {
  id: ItemId;
  /** Position in the frozen, append-only id table. This is what the URL encodes. */
  idx: number;
  type: ItemType | string;
  /** 1-7 custom rarity. 0 for the one vanilla item whose quality is a string. */
  quality: number;
  /** 1-10 progression tier. */
  level: number;
  cost: number;
  timeCost?: number;

  texture: string;
  icon: string;
  iconSource: IconSource;
  iconW: number;
  iconH: number;

  /** Crafting ingredients. Empty for items that are not crafted. */
  needs: ItemNeed[];
  /** Reverse of `needs`: items that consume this one. */
  usedBy: ItemId[];
  /** For blueprints, the item this recipe produces. */
  produces?: ItemId;
  /** For fate stones, the item this one upgrades from. */
  upgradesFrom?: ItemId;
  isRecipe?: boolean;
  synthesis?: number;

  /** Flat stat map. Almost always numeric; one entry in the data is a string. */
  values: Record<string, number | string>;

  ability?: {
    behavior?: string[];
    castPoint?: number;
    castRange?: number;
    cooldown?: number;
    manaCost?: number;
    healthCostPct?: number;
    targetTeam?: string;
    targetType?: string[];
    targetFlags?: string;
  };

  gem?: {
    kind?: string;
    /** Parsed from `gem_value` entries of the form `tag_gem_damage:10`. */
    values: Record<string, number>;
  };

  professions?: {
    allowed?: string[];
    preferred?: string[];
  };

  color?: [number, number, number];
  colorHex?: string;
  tags?: string[];
  subclass?: string;
  size?: number;
  model?: string;
  effect?: string;
  scriptFile?: string;

  stackable?: number;
  carryLimit?: number;
  initialCharges?: number;
  purchasable?: number;
  droppable?: number;
  sellable?: number;

  isPet?: boolean;
  /** Drops from neutral creeps; eligible for the neutral slot. */
  isNeutral?: boolean;
  petUnitName?: string;
  /** Bitmask of SLOT_KIND values this item may be placed into. */
  kinds: SlotKindMask;

  flags: {
    inGame: 0 | 1;
    hidden: 0 | 1;
    /** `inGame === 1 && hidden !== 1`. The filter applied to items.index.json. */
    playable: boolean;
  };
}

/**
 * `items.index.json` row. Tuple-packed: this file loads on every page view, and
 * object keys would roughly triple it for 1,500+ rows.
 */
export type IndexRow = [
  idx: number,
  id: ItemId,
  type: string,
  quality: number,
  level: number,
  cost: number,
  icon: string,
  kinds: SlotKindMask,
];

export const INDEX_IDX = 0;
export const INDEX_ID = 1;
export const INDEX_TYPE = 2;
export const INDEX_QUALITY = 3;
export const INDEX_LEVEL = 4;
export const INDEX_COST = 5;
export const INDEX_ICON = 6;
export const INDEX_KINDS = 7;

export interface ItemsIndex {
  schema: 1;
  generatedAt: string;
  /** Guards against decoding a link built against a different item table. */
  idTableHash: string;
  idTableLength: number;
  rows: IndexRow[];
}

export interface LocaleNames {
  schema: 1;
  lang: string;
  names: Record<ItemId, string>;
}

export interface LocaleDetail {
  desc?: RichNode[];
  /** Flattened description text, for substring search. */
  descPlain?: string;
  lore?: string;
  /** Human-readable label per `values` key, e.g. `bonus_all_stats` -> "+All Stats". */
  values?: Record<string, string>;
}

export interface LocaleDetails {
  schema: 1;
  lang: string;
  items: Record<ItemId, LocaleDetail>;
}

export interface Meta {
  schema: 1;
  codecVersion: number;
  generatedAt: string;
  vpkBytes: number;
  vpkMtimeMs: number;
  vpkEntryCount: number;
  itemCount: number;
  playableCount: number;
  idTableHash: string;
  idTableLength: number;
  /** Playable heroes and the abilities they may actually take. */
  heroCount: number;
  abilityCount: number;
  /** The abilities' own frozen table; spells encode indices into it. */
  abilityTableHash: string;
  abilityTableLength: number;
  languages: string[];
  icons: Record<IconSource, number>;
}
