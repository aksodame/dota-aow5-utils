import { decodeBuild, groupsInPanel, type HeroTable, type IdTable } from 'aow5-shared/codec';
import { ABILITY_SLOT_ORDER, ABILITY_SLOTS } from 'aow5-shared/types';
import type { CoreData, ItemSummary, SpellSummary } from 'aow5-shared/data';

/**
 * What a browse row draws: the main spell, and the gear.
 *
 * Decoded on the client rather than denormalised into columns on the server.
 * The payload is already in the row — see the note on `BuildSummary` — and
 * decoding it is a few hundred bytes of bit-reading, where a set of preview
 * columns would be four more things to keep in step with the codec.
 *
 * Pure, so it can be memoised per row and tested without a DOM.
 */

export interface BuildPreview {
  /** The build's headline ability, or null when it names none. */
  spell: SpellSummary | null;
  /**
   * The worn six, in slot order, with `null` where a slot is empty.
   *
   * The whole gear block rather than "the first few items placed": that earlier
   * reading started at slot 0, so a row's preview led with potions and could
   * run out before reaching any equipment at all. Holes are kept so the six
   * tiles line up between rows — a build missing its boots should read as
   * missing them, not as having five pieces.
   */
  items: (ItemSummary | null)[];
}

/**
 * Which key counts as "the main skill".
 *
 * `q` first. The ultimate looked like the obvious headline and is not: in this
 * game the ultimate is largely fixed per hero, so a list of rows led by it is a
 * list that says nothing but the hero — which the portrait beside it already
 * said. `q` is the key a build is actually built around, so it is what
 * distinguishes one row from the next. Then the rest in the order the kit
 * reads, with the passive last. The shared `f` heal is excluded outright: every
 * hero has it, so it identifies nothing.
 */
const MAIN_SPELL_ORDER = ['q', 'w', 'e', 'r', 'd', 'passive'] as const;

/**
 * The slots a preview draws, taken from the layout rather than hardcoded.
 *
 * `panel: 'gear'` is the worn equipment and nothing else — the neutral and
 * backpack slots moved to their own panel, so this follows them automatically.
 */
const GEAR_SLOTS: number[] = groupsInPanel('gear')
  .filter((group) => group.hidden !== true)
  .flatMap((group) => Array.from({ length: group.count }, (_, i) => group.start + i));

/**
 * How many item tiles a row draws — the worn six.
 *
 * Exported so the skeleton draws the same number without hardcoding it: a
 * placeholder row that is a different width from a real one makes the list jump
 * as each page lands.
 */
export const BUILD_PREVIEW_ITEMS = GEAR_SLOTS.length;

/**
 * Which slot is the build's headline — the author's, or the kit's.
 *
 * The one place that answers the question, so a row, a build page, a shared
 * link and the editor cannot disagree about which of the seven is "the" spell.
 * Null only when the build names no ability this deployment can draw.
 *
 * The fallback is not a guess the site keeps to itself: a build with no chosen
 * headline still *has* one on every screen that shows it, so the same ability
 * is marked whether or not the author ever opened the select.
 */
export function mainSpellKey(
  spells: ReadonlyArray<{ k: 'id'; id: string } | { k: 'unknown'; idx: number } | null>,
  core: CoreData,
  explicit?: string | null,
): (typeof ABILITY_SLOTS)[number] | null {
  const drawable = (key: (typeof ABILITY_SLOTS)[number]): boolean => {
    const at = ABILITY_SLOTS.indexOf(key);
    const value = at < 0 ? null : spells[at];
    // An `unknown` spell has no name or icon, so it cannot be a headline: the
    // row would lead with a blank tile and the page would ring one.
    return value?.k === 'id' && core.heroes.spells.get(value.id) !== undefined;
  };

  if (explicit != null) {
    const named = ABILITY_SLOTS.find((key) => key === explicit);
    if (named !== undefined && drawable(named)) return named;
  }
  return MAIN_SPELL_ORDER.find((key) => drawable(key)) ?? null;
}

export function buildPreview(
  payload: string,
  core: CoreData,
  tables: { items: IdTable; heroes: HeroTable },
  /**
   * The author's own headline, as a slot key.
   *
   * Their answer beats the guess below, which is the point of the field: `q` is
   * a decent reading of most kits and wrong about the build that is really
   * about its W. Undefined or null is "they did not say", and an anonymous
   * `#b=` link never says — the codec carries no such field — so the order is
   * still what draws those.
   */
  mainSpell?: string | null,
): BuildPreview {
  const decoded = decodeBuild(payload, tables.items, tables.heroes);
  if (!decoded.ok) return { spell: null, items: [] };
  const state = decoded.state;

  /*
   * The same answer every other screen draws — see `mainSpellKey`. It falls
   * back to the kit order when the author named nothing, and when what they
   * named cannot be drawn: the server refuses that pair on save, and a row that
   * met one anyway should still show something rather than nothing.
   */
  const key = mainSpellKey(state.spells, core, mainSpell);
  const at = key === null ? -1 : ABILITY_SLOTS.indexOf(key);
  const value = at < 0 ? null : state.spells[at];
  const spell: SpellSummary | null = value?.k === 'id' ? (core.heroes.spells.get(value.id) ?? null) : null;

  const items = GEAR_SLOTS.map((slot) => {
    const value = state.slots[slot];
    // An `unknown` index has no icon to draw, so it reads as an empty slot
    // rather than as a question mark in a row meant to be scannable.
    if (value?.k !== 'id') return null;
    return core.byId.get(value.id) ?? null;
  });

  return { spell, items };
}

/** The spells a build chose, in the order the kit reads rather than wire order. */
export function spellsInDisplayOrder(
  spells: ReadonlyArray<{ k: 'id'; id: string } | { k: 'unknown'; idx: number } | null>,
  core: CoreData,
): Array<{ key: string; spell: SpellSummary | null; unknown: boolean }> {
  return ABILITY_SLOT_ORDER.map((key) => {
    const value = spells[ABILITY_SLOTS.indexOf(key)] ?? null;
    if (value === null) return { key, spell: null, unknown: false };
    if (value.k === 'unknown') return { key, spell: null, unknown: true };
    return { key, spell: core.heroes.spells.get(value.id) ?? null, unknown: false };
  });
}
