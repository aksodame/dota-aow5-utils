import { SLOT_KIND, type ItemId, type SlotKindMask } from '../types/items.ts';
import type { SeasonKey } from '../data/seasons.ts';
import { ABILITY_SLOTS, SPELLS_PER_SECTION, type AbilityId, type HeroId, type HeroInfo } from '../types/heroes.ts';
import type { MapId } from '../types/maps.ts';

/**
 * A build is one loadout for one hero on one map.
 *
 * It used to be up to nine of them in a row — the planner let an author lay out
 * a deck per stage of a run and share the lot in a single link. That is not
 * what a guide is. A guide is advice for clearing a specific room at a specific
 * tier, and nine of them in one document meant nine things to read before
 * finding the one that applied. So a build now holds a single loadout and names
 * the map it is for, and an author who wants to cover two maps publishes two
 * builds — which is also what makes a build filterable, likeable and rankable
 * as a unit.
 *
 * The slots and their indices are unchanged from the old per-section layout.
 * Nothing about which slot means what has moved; only the number of loadouts
 * has, and the Life Soul that S2 added, which is appended after all of them.
 */
export type SlotGroupKey = 'potion' | 'equip' | 'rune' | 'pet' | 'neutral' | 'backpack' | 'soul';

/**
 * Which panel a group is drawn in.
 *
 * Five: the consumables carried into a run, the six worn pieces, the single
 * Life Soul, the two single slots that are carried rather than worn, and the
 * runes. A group's panel is presentation, but it lives here rather than in the
 * webapp because it is a statement about the game — a rune is not gear, and a
 * neutral drop is not one of your six equipment slots — and the tracker will
 * want the same grouping.
 */
export type SlotPanel = 'gear' | 'rune' | 'consumable' | 'carry' | 'soul';

export interface SlotGroup {
  key: SlotGroupKey;
  /** The group's canonical kind. */
  kind: SlotKindMask;
  /**
   * What the picker will actually offer for these slots. Defaults to `kind`;
   * a group can deliberately accept more than its own type.
   */
  accepts: SlotKindMask;
  /** Index of the group's first slot within the loadout. */
  start: number;
  count: number;
  /** Columns to render the group's slots in. */
  columns: number;
  panel: SlotPanel;
  /**
   * Hidden groups keep their slots — positions are baked into every shared
   * link — but are not drawn. A hidden slot that already holds something is
   * still shown, so nothing a link carries can silently vanish.
   */
  hidden?: boolean;
  /**
   * The seasons this group is offered in. Absent means every season.
   *
   * Unlike `hidden` this is not a decision about the site: the addon ships the
   * Life Soul items with `AllowedRulesets "s2"` and deletes them from its own
   * catalogue in S1, so offering the slot there would be offering a slot the
   * game does not have. Out of season it behaves exactly like a hidden group —
   * the slot still exists, and is still drawn when it holds something, because
   * a link's slot positions are frozen and nothing it carries may vanish.
   */
  seasons?: readonly SeasonKey[];
}

/**
 * Slot positions are baked into every shared link, so this order is frozen.
 * Adding a group means appending to the end and bumping the codec version.
 */
export const LOADOUT_LAYOUT: SlotGroup[] = [
  { key: 'potion', kind: SLOT_KIND.POTION, accepts: SLOT_KIND.POTION, start: 0, count: 3, columns: 3, panel: 'consumable' },
  /*
   * Six worn pieces, three to a row — two rows of three, which is the shape the
   * game's own equipment panel uses. Slots 3-8 in wire order, unchanged from
   * when this was a section.
   */
  { key: 'equip', kind: SLOT_KIND.EQUIP, accepts: SLOT_KIND.EQUIP, start: 3, count: 6, columns: 3, panel: 'gear' },
  { key: 'rune', kind: SLOT_KIND.RUNE, accepts: SLOT_KIND.RUNE, start: 9, count: 3, columns: 3, panel: 'rune' },
  /*
   * Hidden for now. The slot stays in the layout so slots 13 and 14 keep their
   * positions and no existing link shifts.
   */
  { key: 'pet', kind: SLOT_KIND.PET, accepts: SLOT_KIND.PET, start: 12, count: 1, columns: 1, panel: 'carry', hidden: true },
  /*
   * The two carried slots, stacked in their own block rather than trailing the
   * worn six: neutral above, backpack below. They are not equipment — one is
   * whatever the creeps dropped and the other is spare room — and putting them
   * in the gear grid made a 3x3 that implied a ninth worn piece.
   *
   * The neutral slot is deliberately unrestricted: it offers the whole
   * catalogue rather than only the items flagged as neutral drops.
   */
  { key: 'neutral', kind: SLOT_KIND.NEUTRAL, accepts: SLOT_KIND.BACKPACK, start: 13, count: 1, columns: 1, panel: 'carry' },
  { key: 'backpack', kind: SLOT_KIND.BACKPACK, accepts: SLOT_KIND.BACKPACK, start: 14, count: 1, columns: 1, panel: 'carry' },
  /*
   * The Life Soul, S2 only, appended rather than slotted in beside the worn six
   * — every position above it is baked into links that already exist.
   *
   * It is a panel of its own rather than a seventh tile in the gear grid for
   * the same reason the addon's own item library gives it a tab of its own: it
   * is not one of the six worn pieces, it is refined rather than reforged, and
   * a character has exactly one.
   */
  { key: 'soul', kind: SLOT_KIND.SOUL, accepts: SLOT_KIND.SOUL, start: 15, count: 1, columns: 1, panel: 'soul', seasons: [2] },
];

export const SLOT_COUNT = LOADOUT_LAYOUT.reduce((n, g) => n + g.count, 0);

/** The group a slot index belongs to, precomputed for lookups during render. */
export const SLOT_GROUP_AT: SlotGroup[] = (() => {
  const out: SlotGroup[] = [];
  for (const group of LOADOUT_LAYOUT) {
    for (let i = 0; i < group.count; i++) out[group.start + i] = group;
  }
  return out;
})();

/** The canonical kind of a slot. */
export function slotKindAt(slot: number): SlotKindMask {
  return SLOT_GROUP_AT[slot]?.kind ?? SLOT_KIND.BACKPACK;
}

/** What the picker should offer for a slot. */
export function slotAcceptsAt(slot: number): SlotKindMask {
  return SLOT_GROUP_AT[slot]?.accepts ?? SLOT_KIND.BACKPACK;
}

/** The groups drawn in one panel, in layout order. */
export function groupsInPanel(panel: SlotPanel): SlotGroup[] {
  return LOADOUT_LAYOUT.filter((g) => g.panel === panel);
}

/**
 * Whether a group belongs to a season.
 *
 * `null` is "no season in hand" — a `#b=` link carries none — and answers no,
 * so a season-scoped group is drawn on those screens only when it is filled.
 * That is the same rule `hidden` already gets, and it is the safe direction:
 * a slot that holds something is always shown.
 */
export function groupInSeason(group: SlotGroup, season: SeasonKey | null | undefined): boolean {
  if (group.seasons === undefined) return true;
  return season != null && group.seasons.includes(season);
}

/**
 * The groups of a panel that should be drawn, given the season and what the
 * loadout holds. Hidden and out-of-season groups survive only when filled.
 */
export function visibleGroups(
  panel: SlotPanel,
  slots: readonly (SlotValue | null)[],
  season?: SeasonKey | null,
): SlotGroup[] {
  return groupsInPanel(panel).filter((group) => {
    if (group.hidden !== true && groupInSeason(group, season)) return true;
    for (let i = 0; i < group.count; i++) if (slots[group.start + i]) return true;
    return false;
  });
}

/**
 * Titles are free text and go into the URL for an anonymous share, so they are
 * capped harder than a database would need. Matches the `maxLength` on the
 * title input and bounds the link length.
 */
export const MAX_TITLE = 56;

/**
 * A slot holds either a known item or a raw table index we could not resolve.
 *
 * Keeping the unknown index rather than dropping it means a link shared from a
 * newer build round-trips losslessly through an older one: the slot renders as
 * a question mark, and re-encoding reproduces the original index exactly.
 */
export type SlotValue = { k: 'id'; id: ItemId } | { k: 'unknown'; idx: number };

/**
 * A chosen spell, in the same shape as a slot and for the same reason: an index
 * a newer build knows and this one does not is kept verbatim rather than
 * dropped, so a guide round-trips losslessly through an older deployment.
 */
export type SpellValue = { k: 'id'; id: AbilityId } | { k: 'unknown'; idx: number };

export interface BuildState {
  v: 2;
  /**
   * The hero this guide is for. null until one is picked.
   */
  hero: HeroId | null;
  /**
   * A roster position this build cannot name — a hero added after it was
   * deployed. Held so re-sharing the link does not quietly strip the hero,
   * exactly as `unknown` slots preserve unrecognised items.
   */
  heroUnknown: number | null;
  /**
   * The rooms this guide is for. Empty when it names none.
   *
   * A list since v8. It was one room, and one room could not say what a guide
   * covering both of a tier's is for — the author had to pick one and be wrong
   * for half their readers, or publish the same build twice. The *tier* is a
   * separate field on the saved build and is what a guide is filed under; these
   * are the rooms within it, and naming none is a real answer.
   */
  maps: MapId[];
  /**
   * Table positions this build cannot name — rooms added after it was deployed.
   * The same preservation trick as `heroUnknown`: re-sharing a link does not
   * quietly strip a room just because this deployment has not heard of it.
   */
  mapsUnknown: number[];
  /** Free text, and the only text the codec carries. */
  title: string | null;
  slots: (SlotValue | null)[];
  /**
   * One ability per key, indexed by `ABILITY_SLOTS`. A hero usually has several
   * abilities competing for the same key, so which one a build takes is a real
   * decision.
   */
  spells: (SpellValue | null)[];
}

/**
 * `spells` seeds the forced picks — keys where the hero has exactly one
 * candidate, so there is nothing to decide. See `spellDefaults`.
 */
export function createEmptyState(spells?: (SpellValue | null)[]): BuildState {
  return {
    v: 2,
    hero: null,
    heroUnknown: null,
    maps: [],
    mapsUnknown: [],
    title: null,
    slots: Array.from({ length: SLOT_COUNT }, () => null),
    spells: Array.from({ length: SPELLS_PER_SECTION }, (_, i) => spells?.[i] ?? null),
  };
}

/**
 * True only for an untouched build — no hero, no map, no title, nothing placed.
 */
export function isEmptyState(state: BuildState): boolean {
  return (
    state.hero === null &&
    state.heroUnknown === null &&
    state.maps.length === 0 &&
    state.mapsUnknown.length === 0 &&
    (state.title === null || state.title === '') &&
    state.slots.every((v) => v === null) &&
    state.spells.every((v) => v === null)
  );
}

/** Items placed. What the API stores as a build's `itemCount`. */
export function countItems(state: BuildState): number {
  return state.slots.filter((v) => v !== null).length;
}

/** Spells chosen. Drives the "changing hero clears these" prompt. */
export function countSpells(state: BuildState): number {
  return state.spells.filter((v) => v !== null).length;
}

/**
 * The spells a build should start with for a given hero.
 *
 * A key offering exactly one ability is not a decision — every hero's `f` is the
 * shared heal, and most have a single `d` — so it is filled in rather than left
 * as a tile the user must click to reach a list of one. Indexed by wire
 * position, which is what the reducer and the codec both use.
 */
export function spellDefaults(hero: HeroInfo | null | undefined): SpellDefaults {
  if (!hero) return [];
  return ABILITY_SLOTS.map((slot) => {
    const candidates = hero.bySlot[slot] ?? [];
    const only = candidates.length === 1 ? candidates[0] : undefined;
    return only ? ({ k: 'id', id: only } as SpellValue) : null;
  });
}

/**
 * Spells a build starts with, indexed by wire position.
 *
 * The caller builds these from the hero's candidates; the reducer stays pure
 * and just applies them.
 */
export type SpellDefaults = (SpellValue | null)[];

export type BuildAction =
  | { type: 'setHero'; hero: HeroId | null; defaults?: SpellDefaults }
  /** Adds or removes one room. A guide may name several, or none. */
  | { type: 'toggleMap'; map: MapId }
  /** Replaces the whole list — used when a tier change invalidates it. */
  | { type: 'setMaps'; maps: MapId[] }
  | { type: 'setTitle'; title: string | null }
  | { type: 'setSpell'; spell: number; value: SpellValue }
  | { type: 'clearSpell'; spell: number }
  | { type: 'setSlot'; slot: number; value: SlotValue }
  | { type: 'clearSlot'; slot: number }
  | { type: 'moveSlot'; from: number; to: number }
  | { type: 'clearAll' }
  | { type: 'hydrate'; state: BuildState };

const slotInRange = (slot: number) => slot >= 0 && slot < SLOT_COUNT;
const spellInRange = (spell: number) => spell >= 0 && spell < SPELLS_PER_SECTION;

/** Replaces one slot without mutating the surrounding state. */
function withSlot(state: BuildState, slot: number, value: SlotValue | null): BuildState {
  return { ...state, slots: state.slots.map((v, i) => (i === slot ? value : v)) };
}

/** Replaces one spell without mutating the surrounding state. */
function withSpell(state: BuildState, spell: number, value: SpellValue | null): BuildState {
  return { ...state, spells: state.spells.map((v, i) => (i === spell ? value : v)) };
}

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case 'setHero': {
      if (action.hero === state.hero && state.heroUnknown === null) return state;
      // No ability is shared between heroes, so every existing pick would be
      // invalid. Clearing is the honest outcome; the editor confirms first when
      // there is anything to lose.
      return {
        ...state,
        hero: action.hero,
        heroUnknown: null,
        spells: Array.from({ length: SPELLS_PER_SECTION }, (_, i) => action.defaults?.[i] ?? null),
      };
    }

    case 'toggleMap': {
      const has = state.maps.includes(action.map);
      const maps = has ? state.maps.filter((id) => id !== action.map) : [...state.maps, action.map];
      // `mapsUnknown` is cleared by any deliberate edit: the point of keeping it
      // was to re-share a link untouched, and this is a touch.
      return { ...state, maps, mapsUnknown: [] };
    }

    case 'setMaps':
      return { ...state, maps: [...action.maps], mapsUnknown: [] };

    case 'setTitle': {
      const trimmed = action.title?.trim() ?? '';
      return { ...state, title: trimmed === '' ? null : trimmed.slice(0, MAX_TITLE) };
    }

    case 'setSpell':
      if (!spellInRange(action.spell)) return state;
      return withSpell(state, action.spell, action.value);

    case 'clearSpell':
      if (!spellInRange(action.spell)) return state;
      return withSpell(state, action.spell, null);

    case 'setSlot':
      if (!slotInRange(action.slot)) return state;
      return withSlot(state, action.slot, action.value);

    case 'clearSlot':
      if (!slotInRange(action.slot)) return state;
      return withSlot(state, action.slot, null);

    case 'moveSlot': {
      const { from, to } = action;
      if (!slotInRange(from) || !slotInRange(to) || from === to) return state;
      const moved = state.slots[from] ?? null;
      const displaced = state.slots[to] ?? null;
      // Swap, so dragging onto an occupied slot never silently destroys an item.
      return withSlot(withSlot(state, from, displaced), to, moved);
    }

    case 'clearAll':
      return createEmptyState();

    case 'hydrate':
      return action.state;

    default:
      return state;
  }
}
