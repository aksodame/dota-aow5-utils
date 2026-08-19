import { SLOT_KIND, type ItemId, type SlotKindMask } from '../types/items.ts';
import { ABILITY_SLOTS, SPELLS_PER_SECTION, type AbilityId, type HeroId, type HeroInfo } from '../types/heroes.ts';

/**
 * A board is a variable number of sections; one on a fresh board, up to nine.
 *
 * Each section mirrors a loadout rather than a flat grid: consumables, worn
 * equipment and runes stack down the left, with the single-slot pet, neutral
 * and backpack positions in a column on the right. Every slot only accepts
 * items of its kind, which is what the picker filters on.
 */
export type SlotGroupKey = 'potion' | 'equip' | 'rune' | 'pet' | 'neutral' | 'backpack';

export interface SlotGroup {
  key: SlotGroupKey;
  /**
   * The group's canonical kind. Fixed, and used when re-homing items from a
   * pre-typed link — see `placeLegacy` in buildCodec.
   */
  kind: SlotKindMask;
  /**
   * What the picker will actually offer for these slots. Defaults to `kind`;
   * a group can deliberately accept more than its own type.
   */
  accepts: SlotKindMask;
  /** Index of the group's first slot within the section. */
  start: number;
  count: number;
  /** Columns to render the group's slots in. */
  columns: number;
  /**
   * Horizontal band the group sits in. Groups sharing a lane are drawn on the
   * same row, which is what puts the neutral slot beside the equipment block
   * and the backpack beside the runes.
   */
  lane: number;
  side: 'left' | 'right';
  /**
   * Hidden groups keep their slots — positions are baked into every shared
   * link — but are not drawn. A hidden slot that already holds something is
   * still shown, so nothing a link carries can silently vanish.
   */
  hidden?: boolean;
}

/**
 * Slot positions are baked into every shared link, so this order is frozen.
 * Adding a group means appending to the end and bumping the codec version.
 */
export const SECTION_LAYOUT: SlotGroup[] = [
  // Lane 0: potions, with the (hidden) pet slot alongside.
  { key: 'potion', kind: SLOT_KIND.POTION, accepts: SLOT_KIND.POTION, start: 0, count: 3, columns: 3, lane: 0, side: 'left' },
  // Hidden for now. The slot stays in the layout so slots 13 and 14 keep their
  // positions and no existing link shifts.
  { key: 'pet', kind: SLOT_KIND.PET, accepts: SLOT_KIND.PET, start: 12, count: 1, columns: 1, lane: 0, side: 'right', hidden: true },

  // Lane 1: the equipment block, with the neutral slot beside it.
  { key: 'equip', kind: SLOT_KIND.EQUIP, accepts: SLOT_KIND.EQUIP, start: 3, count: 6, columns: 3, lane: 1, side: 'left' },
  // Deliberately unrestricted for now: the neutral slot offers the whole
  // catalogue rather than only the 68 items flagged as neutral drops.
  { key: 'neutral', kind: SLOT_KIND.NEUTRAL, accepts: SLOT_KIND.BACKPACK, start: 13, count: 1, columns: 1, lane: 1, side: 'right' },

  // Lane 2: runes, with the backpack beside them.
  { key: 'rune', kind: SLOT_KIND.RUNE, accepts: SLOT_KIND.RUNE, start: 9, count: 3, columns: 3, lane: 2, side: 'left' },
  { key: 'backpack', kind: SLOT_KIND.BACKPACK, accepts: SLOT_KIND.BACKPACK, start: 14, count: 1, columns: 1, lane: 2, side: 'right' },
];

export const SLOTS_PER_SECTION = SECTION_LAYOUT.reduce((n, g) => n + g.count, 0);

/** The group a slot index belongs to, precomputed for lookups during render. */
export const SLOT_GROUP_AT: SlotGroup[] = (() => {
  const out: SlotGroup[] = [];
  for (const group of SECTION_LAYOUT) {
    for (let i = 0; i < group.count; i++) out[group.start + i] = group;
  }
  return out;
})();

/** The canonical kind of a slot. Used for legacy migration, not for filtering. */
export function slotKindAt(slot: number): SlotKindMask {
  return SLOT_GROUP_AT[slot]?.kind ?? SLOT_KIND.BACKPACK;
}

/** What the picker should offer for a slot. */
export function slotAcceptsAt(slot: number): SlotKindMask {
  return SLOT_GROUP_AT[slot]?.accepts ?? SLOT_KIND.BACKPACK;
}

export const MIN_SECTIONS = 1;
export const MAX_SECTIONS = 9;
/**
 * One card on a fresh board. A second empty section is not information — it is
 * a blank the visitor has to look past — so the board starts with a single
 * section and the add card offers the next one, blank or copied.
 */
export const DEFAULT_SECTIONS = 1;
export const MAX_TOTAL_SLOTS = MAX_SECTIONS * SLOTS_PER_SECTION;
/** Matches the `maxLength` on the rename input; also bounds the URL length. */
export const MAX_SECTION_NAME = 56;
/**
 * Descriptions are free text and go straight into the URL, so they are capped
 * harder than they would be in a database. 160 characters is enough for "core
 * items when behind" without letting nine of them blow past what chat clients
 * will render as a link.
 */
export const MAX_SECTION_DESC = 160;

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

export interface BuildSection {
  /** null means "use the localized default", and is not serialized. */
  name: string | null;
  /** Optional free-text note. null when unset; never serialized when empty. */
  description: string | null;
  slots: (SlotValue | null)[];
  /**
   * One ability per key, indexed by `ABILITY_SLOTS`. A hero usually has several
   * abilities competing for the same key, so which one a section takes is a
   * real decision — and it can differ between sections of the same guide.
   */
  spells: (SpellValue | null)[];
}

export interface BuildState {
  v: 1;
  /**
   * The hero this guide is for. One per guide rather than per section: a build
   * is advice for playing a hero. null until one is picked, which is what keeps
   * every link shared before heroes existed decoding unchanged.
   */
  hero: HeroId | null;
  /**
   * A roster position this build cannot name — a hero added after it was
   * deployed. Held so re-sharing the link does not quietly strip the hero,
   * exactly as `unknown` slots preserve unrecognised items.
   */
  heroUnknown: number | null;
  sections: BuildSection[];
}

/**
 * `spells` seeds the forced picks — keys where the hero has exactly one
 * candidate, so there is nothing to decide. See `spellDefaults`.
 */
export function createSection(spells?: (SpellValue | null)[]): BuildSection {
  return {
    name: null,
    description: null,
    slots: Array.from({ length: SLOTS_PER_SECTION }, () => null),
    spells: Array.from({ length: SPELLS_PER_SECTION }, (_, i) => spells?.[i] ?? null),
  };
}

export function createEmptyState(sections = DEFAULT_SECTIONS): BuildState {
  const count = Math.min(MAX_SECTIONS, Math.max(MIN_SECTIONS, sections));
  return { v: 1, hero: null, heroUnknown: null, sections: Array.from({ length: count }, createSection) };
}

export function isSectionEmpty(section: BuildSection): boolean {
  return (
    section.name === null &&
    section.description === null &&
    section.slots.every((v) => v === null) &&
    section.spells.every((v) => v === null)
  );
}

/**
 * True only for an untouched board — default section count, no hero, nothing
 * named, no items. The section count matters: a board someone expanded to five
 * empty sections is a deliberate state and must still produce a share link.
 */
export function isEmptyState(state: BuildState): boolean {
  return (
    state.hero === null &&
    state.heroUnknown === null &&
    state.sections.length === DEFAULT_SECTIONS &&
    state.sections.every(isSectionEmpty)
  );
}

/**
 * The spells a section should start with for a given hero.
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

/** Total spells chosen across the board. Drives the "changing hero clears these" prompt. */
export function countSpells(state: BuildState): number {
  return state.sections.reduce((n, s) => n + s.spells.filter((v) => v !== null).length, 0);
}

/**
 * Spells a section starts with, indexed by wire position.
 *
 * The caller builds these from the hero's candidates: a key offering exactly one
 * ability is not a choice, so it is filled in rather than left as an empty tile
 * the user has to click through. The reducer stays pure and just applies them.
 */
export type SpellDefaults = (SpellValue | null)[];

export type BuildAction =
  | { type: 'setHero'; hero: HeroId | null; defaults?: SpellDefaults }
  | { type: 'setSpell'; section: number; spell: number; value: SpellValue }
  | { type: 'clearSpell'; section: number; spell: number }
  | { type: 'setSlot'; section: number; slot: number; value: SlotValue }
  | { type: 'clearSlot'; section: number; slot: number }
  | { type: 'moveSlot'; from: { section: number; slot: number }; to: { section: number; slot: number } }
  | { type: 'renameSection'; section: number; name: string | null }
  | { type: 'describeSection'; section: number; description: string | null }
  | { type: 'clearSection'; section: number; defaults?: SpellDefaults }
  | { type: 'addSection'; defaults?: SpellDefaults }
  | { type: 'duplicateSection'; section: number }
  | { type: 'removeSection'; section: number }
  | { type: 'clearAll' }
  | { type: 'hydrate'; state: BuildState };

const slotInRange = (state: BuildState, section: number, slot: number) =>
  section >= 0 && section < state.sections.length && slot >= 0 && slot < SLOTS_PER_SECTION;

/** Replaces one slot without mutating the surrounding state. */
function withSlot(state: BuildState, section: number, slot: number, value: SlotValue | null): BuildState {
  return {
    ...state,
    sections: state.sections.map((s, si) =>
      si === section ? { ...s, slots: s.slots.map((v, vi) => (vi === slot ? value : v)) } : s,
    ),
  };
}

const spellInRange = (state: BuildState, section: number, spell: number) =>
  section >= 0 && section < state.sections.length && spell >= 0 && spell < SPELLS_PER_SECTION;

/** Replaces one spell without mutating the surrounding state. */
function withSpell(state: BuildState, section: number, spell: number, value: SpellValue | null): BuildState {
  return {
    ...state,
    sections: state.sections.map((s, si) =>
      si === section ? { ...s, spells: s.spells.map((v, vi) => (vi === spell ? value : v)) } : s,
    ),
  };
}

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case 'setHero': {
      if (action.hero === state.hero && state.heroUnknown === null) return state;
      // No ability is shared between heroes, so every existing pick would be
      // invalid. Clearing is the honest outcome; App confirms first when there
      // is anything to lose.
      return {
        ...state,
        hero: action.hero,
        heroUnknown: null,
        sections: state.sections.map((s) => ({
          ...s,
          spells: Array.from({ length: SPELLS_PER_SECTION }, (_, i) => action.defaults?.[i] ?? null),
        })),
      };
    }

    case 'setSpell':
      if (!spellInRange(state, action.section, action.spell)) return state;
      return withSpell(state, action.section, action.spell, action.value);

    case 'clearSpell':
      if (!spellInRange(state, action.section, action.spell)) return state;
      return withSpell(state, action.section, action.spell, null);

    case 'setSlot':
      if (!slotInRange(state, action.section, action.slot)) return state;
      return withSlot(state, action.section, action.slot, action.value);

    case 'clearSlot':
      if (!slotInRange(state, action.section, action.slot)) return state;
      return withSlot(state, action.section, action.slot, null);

    case 'moveSlot': {
      const { from, to } = action;
      if (!slotInRange(state, from.section, from.slot) || !slotInRange(state, to.section, to.slot)) return state;
      if (from.section === to.section && from.slot === to.slot) return state;
      const moved = state.sections[from.section]!.slots[from.slot] ?? null;
      const displaced = state.sections[to.section]!.slots[to.slot] ?? null;
      // Swap, so dragging onto an occupied slot never silently destroys an item.
      return withSlot(withSlot(state, from.section, from.slot, displaced), to.section, to.slot, moved);
    }

    case 'renameSection': {
      if (action.section < 0 || action.section >= state.sections.length) return state;
      const trimmed = action.name?.trim() ?? '';
      const name = trimmed === '' ? null : trimmed.slice(0, MAX_SECTION_NAME);
      return {
        ...state,
        sections: state.sections.map((s, si) => (si === action.section ? { ...s, name } : s)),
      };
    }

    case 'describeSection': {
      if (action.section < 0 || action.section >= state.sections.length) return state;
      const trimmed = action.description?.trim() ?? '';
      const description = trimmed === '' ? null : trimmed.slice(0, MAX_SECTION_DESC);
      return {
        ...state,
        sections: state.sections.map((s, si) => (si === action.section ? { ...s, description } : s)),
      };
    }

    case 'clearSection':
      if (action.section < 0 || action.section >= state.sections.length) return state;
      // A cleared section is a fresh one, so it gets the forced spells back
      // rather than sitting with empty tiles that offer a single option.
      return {
        ...state,
        sections: state.sections.map((s, si) => (si === action.section ? createSection(action.defaults) : s)),
      };

    case 'addSection':
      if (state.sections.length >= MAX_SECTIONS) return state;
      return { ...state, sections: [...state.sections, createSection(action.defaults)] };

    case 'duplicateSection': {
      if (state.sections.length >= MAX_SECTIONS) return state;
      const source = state.sections[action.section];
      if (!source) return state;
      // Appended rather than inserted beside its source: the copy is started
      // from the add card at the end of the grid, so that is where it appears.
      // Name and note come along too — a variation is usually a rename away.
      const copy: BuildSection = { ...source, slots: [...source.slots], spells: [...source.spells] };
      return { ...state, sections: [...state.sections, copy] };
    }

    case 'removeSection':
      if (state.sections.length <= MIN_SECTIONS) return state;
      if (action.section < 0 || action.section >= state.sections.length) return state;
      return { ...state, sections: state.sections.filter((_, si) => si !== action.section) };

    case 'clearAll':
      return createEmptyState();

    case 'hydrate':
      return action.state;

    default:
      return state;
  }
}
