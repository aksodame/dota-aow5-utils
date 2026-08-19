/**
 * Hero and ability contract between the extraction pipeline and the app.
 *
 * Age of Weapons 5 ships five playable heroes, each tied to a "profession" that
 * gates which abilities they may take. An ability declares the key it binds to
 * (`AbilitySlot`), and a hero usually has several candidates competing for the
 * same key — picking between them is the actual build decision this planner
 * captures, so a section holds one ability per slot rather than a flat list.
 *
 * Import-free, like `items.ts`, so Node tools and the browser bundle share it.
 */

import type { IconSource, RichNode } from './items.ts';

export type HeroId = string;
export type AbilityId = string;

/**
 * Ability keys in **wire order** — the position each one occupies in a shared
 * link. Frozen and append-only, exactly like the id tables: reordering would
 * silently repoint every spell in every guide already shared. `f` was appended
 * after v5 shipped, which is what made v6 a new codec version rather than an
 * edit to the old one.
 *
 * `ak_hero_dash` also has no owner, but no hero equips it — the game grants it
 * another way — so there is no dash slot.
 */
export const ABILITY_SLOTS = ['q', 'w', 'e', 'd', 'r', 'passive', 'f'] as const;
export type AbilitySlotKey = (typeof ABILITY_SLOTS)[number];
export const SPELLS_PER_SECTION = ABILITY_SLOTS.length;

/**
 * The order the keys are drawn in, which is not the wire order.
 *
 * Reads the way the kit plays: the passive that is always on, then the actives
 * left to right, with the shared heal before the ultimate.
 */
export const ABILITY_SLOT_ORDER = ['passive', 'q', 'w', 'e', 'd', 'f', 'r'] as const satisfies readonly AbilitySlotKey[];

export function isAbilitySlot(value: string): value is AbilitySlotKey {
  return (ABILITY_SLOTS as readonly string[]).includes(value);
}

/** A single hero ability. */
export interface AbilityFull {
  id: AbilityId;
  /** Position in the frozen, append-only ability table — what the URL encodes. */
  idx: number;
  /**
   * Owning hero, resolved through the ability's profession — or null for one
   * every hero is given, like the `f` heal. A shared ability appears in each
   * hero's `bySlot` but exists once in the table.
   */
  hero: HeroId | null;
  /** Empty for a shared ability, which is gated on no profession. */
  profession: string;
  slot: AbilitySlotKey;

  texture: string;
  icon: string;
  iconSource: IconSource;
  iconW: number;
  iconH: number;

  maxLevel?: number;
  cooldown?: number;
  manaCost?: number;
  healthCostPct?: number;
  castPoint?: number;
  castRange?: number;
  behavior?: string[];
  targetTeam?: string;
  targetType?: string[];
  tags?: string[];
  scriptFile?: string;

  /** Flat stat map, mirroring `ItemFull.values`. */
  values: Record<string, number | string>;
}

/**
 * One playable hero.
 *
 * `idx` is a frozen roster position starting at 1, so 0 stays free to mean "no
 * hero chosen" in the URL. Same append-only rule as the item id table.
 */
export interface HeroInfo {
  id: HeroId;
  idx: number;
  profession: string;
  /** Short name, e.g. `axe`. Doubles as the portrait filename. */
  short: string;
  /**
   * Display name per language. The addon does not localize these — it reuses
   * stock Dota heroes, whose names live in the base game rather than this VPK —
   * so they come from the frozen roster in config.
   */
  names: Record<string, string>;
  icon: string;
  iconSource: IconSource;
  /** Every selectable ability, slot order then id order. */
  abilities: AbilityId[];
  /** Candidates per key. Slots with no finished ability are absent. */
  bySlot: Partial<Record<AbilitySlotKey, AbilityId[]>>;
  /**
   * Abilities the addon defines but has not finished — shipped unnamed as
   * "Ability 001" with a "To be filled." description. Counted so the UI can say
   * why a hero has no spells rather than looking broken.
   */
  unfinished: number;
}

export interface HeroesData {
  schema: 1;
  generatedAt: string;
  heroes: HeroInfo[];
  abilities: Record<AbilityId, AbilityFull>;
  /** Frozen, append-only. Indices are what a shared link carries. */
  abilityTableLength: number;
  abilityTableHash: string;
}

/** Localized ability text, mirroring `LocaleDetail` for items. */
export interface AbilityLocale {
  name: string;
  desc?: RichNode[];
  descPlain?: string;
  /** Human-readable label per `values` key. */
  values?: Record<string, string>;
}

export interface LocaleAbilities {
  schema: 1;
  lang: string;
  abilities: Record<AbilityId, AbilityLocale>;
}
