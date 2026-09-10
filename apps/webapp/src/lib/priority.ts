import type { BuildItemPriority, BuildPriority } from 'aow5-api-contract';
import { SLOT_GROUP_AT, type BuildState } from 'aow5-shared/codec';
import { canBeAffix, clampReforge, isAbilityValueKey, rollablePool } from 'aow5-shared/data';
import type { RollTables } from 'aow5-shared/types';

/**
 * The rules behind the priority panel, with no React in them.
 *
 * A priority is a list of opinions keyed by slot, and the panel is a list of
 * items keyed by slot, and the two have to survive an author swapping the item
 * under an opinion. Everything that decides what survives is here, so it can be
 * tested rather than reasoned about while reading JSX.
 *
 * See `aow5-shared/data`'s `rolls.ts` for the arithmetic these helpers arrange,
 * and `apps/api/core/builds/priority.ts` for the same shapes as the server
 * insists on them.
 */

/**
 * The panels the priority is about: worn gear, and the two carried slots.
 *
 * Not consumables and not runes. A potion is a potion — there is no copy of it
 * to prefer — and a rune's values do not roll, so a priority for one would be a
 * set of controls with nothing behind them. The gear is where a copy differs
 * from a copy, which is the entire subject of the panel.
 */
const PRIORITY_PANELS = new Set(['gear', 'carry']);

/** True for a slot the panel draws a card for, whatever is in it. */
export function isPrioritySlot(slot: number): boolean {
  const group = SLOT_GROUP_AT[slot];
  return group !== undefined && group.hidden !== true && PRIORITY_PANELS.has(group.panel);
}

/** The gear a build actually holds, in board order. */
export function prioritySlots(state: BuildState): { slot: number; id: string }[] {
  const out: { slot: number; id: string }[] = [];
  state.slots.forEach((value, slot) => {
    // An unknown index has no item record, so there are no stats to rank and
    // nothing to draw — the same reason the editor cannot name it as a headline.
    if (value?.k === 'id' && isPrioritySlot(slot)) out.push({ slot, id: value.id });
  });
  return out;
}

/** An empty opinion about a slot — what a card starts as. */
export function emptyEntry(slot: number): BuildItemPriority {
  return { slot, reforge: 0, divine: false, fixed: null, enhanced: null, stats: [], note: '' };
}

export function entryAt(priority: BuildPriority, slot: number): BuildItemPriority {
  return priority.find((entry) => entry.slot === slot) ?? emptyEntry(slot);
}

/** Replaces one slot's entry, keeping the list in board order. */
export function withEntry(priority: BuildPriority, entry: BuildItemPriority): BuildPriority {
  const rest = priority.filter((existing) => existing.slot !== entry.slot);
  return [...rest, entry].sort((a, b) => a.slot - b.slot);
}

/**
 * The attributes a card ranks, in the author's order.
 *
 * Only the rollable ones: an attribute with no random percentage is the same on
 * every copy of the item, so there is nothing to choose between copies and
 * nothing to rank. That includes a passive's own numbers — see `rollablePool`,
 * and the two groups `splitByKind` draws them in.
 *
 * The stored order wins for the keys it names; anything the item has and the
 * stored order does not — an attribute added by a patch, or an item swapped
 * under the card — follows in the item's own order, so a changed item degrades
 * into a sensible list rather than an empty one.
 */
export function rankedKeys(
  tables: RollTables,
  values: Record<string, number | string>,
  entry: BuildItemPriority,
): string[] {
  const own = rollablePool(tables, values);
  const known = new Set(own);
  const ordered = entry.stats.map((stat) => stat.key).filter((key) => known.has(key));
  const seen = new Set(ordered);
  return [...ordered, ...own.filter((key) => !seen.has(key))];
}

/**
 * The same list, split into the two groups a card draws.
 *
 * They are different kinds of decision and the panel says so. A *stat* can be
 * rerolled: the plan is what you keep reforging towards. A *passive* number is
 * drawn once, when the item drops, and no amount of reforging moves it — so
 * ranking one is a rule for which copy to keep, and its row carries no affix
 * marks because no affix can land there.
 */
export function splitByKind(keys: readonly string[]): { base: string[]; passive: string[] } {
  return {
    base: keys.filter((key) => !isAbilityValueKey(key)),
    passive: keys.filter(isAbilityValueKey),
  };
}

/** Whether this row may carry a Fixed or Enhanced mark at all. */
export function affixable(tables: RollTables, key: string): boolean {
  return canBeAffix(tables, key);
}

/**
 * The entry as it should be *saved*, given the stats the item really has.
 *
 * The card renders from `rankedKeys`, so this is what writes that reading back:
 * ranks the item no longer has are dropped, and an affix pointing at one goes
 * with it — which is the rule the server also enforces, and the reason a
 * swapped item cannot leave a badge behind pointing at a stat that is gone.
 */
export function reconcile(
  tables: RollTables,
  values: Record<string, number | string>,
  entry: BuildItemPriority,
): BuildItemPriority {
  const keys = rankedKeys(tables, values, entry);
  const kept = new Set(keys);
  const targets = new Map(entry.stats.map((stat) => [stat.key, stat.target]));
  return {
    ...entry,
    reforge: clampReforge(tables, entry.reforge),
    fixed: entry.fixed !== null && kept.has(entry.fixed) ? entry.fixed : null,
    enhanced: entry.enhanced !== null && kept.has(entry.enhanced) ? entry.enhanced : null,
    stats: keys.map((key) => ({ key, target: targets.get(key) ?? null })),
  };
}

/**
 * Moves one attribute up or down the ranking, within its own group.
 *
 * A card draws stats and passive numbers as two lists, so a swap across the
 * boundary would look like a row teleporting into the block below. The stored
 * list stays one list — it is one priority — and this walks past anything of
 * the other kind to find the neighbour a reader can actually see.
 */
export function moveStat(entry: BuildItemPriority, key: string, delta: number): BuildItemPriority {
  const from = entry.stats.findIndex((stat) => stat.key === key);
  if (from < 0 || delta === 0) return entry;

  const kind = isAbilityValueKey(key);
  const step = delta > 0 ? 1 : -1;
  let to = -1;
  for (let at = from + step; at >= 0 && at < entry.stats.length; at += step) {
    const candidate = entry.stats[at];
    if (candidate !== undefined && isAbilityValueKey(candidate.key) === kind) {
      to = at;
      break;
    }
  }
  if (to < 0) return entry;

  const stats = [...entry.stats];
  const [moved] = stats.splice(from, 1);
  if (moved === undefined) return entry;
  /*
   * `to` indexes the list as it was *before* the removal, and that is the index
   * to insert at either way: moving down, everything after `from` has shifted
   * one to the left, which lands the row just past its neighbour; moving up,
   * nothing below `from` moved at all.
   */
  stats.splice(to, 0, moved);
  return { ...entry, stats };
}

/** Sets one stat's target rank. `null` is "any roll will do". */
export function setTarget(entry: BuildItemPriority, key: string, target: number | null): BuildItemPriority {
  return { ...entry, stats: entry.stats.map((stat) => (stat.key === key ? { ...stat, target } : stat)) };
}

/**
 * Marks — or unmarks — the stat an author wants fixed or enhanced.
 *
 * One of each per item, because the game gives one of each: clicking a second
 * stat moves the mark rather than adding one, and clicking the marked stat
 * again clears it. The two are independent; the same stat may hold both, which
 * is the item everybody is hoping for.
 */
export function setAffix(
  entry: BuildItemPriority,
  affix: 'fixed' | 'enhanced',
  key: string | null,
): BuildItemPriority {
  const current = entry[affix];
  return { ...entry, [affix]: current === key ? null : key };
}

/** True for an entry that says nothing — the server stores neither. */
export function isEmptyEntry(entry: BuildItemPriority): boolean {
  return (
    entry.reforge === 0 &&
    !entry.divine &&
    entry.fixed === null &&
    entry.enhanced === null &&
    entry.note.trim() === '' &&
    entry.stats.every((stat) => stat.target === null)
  );
}

/**
 * What the editor sends: the cards that say something, about slots that hold
 * something.
 *
 * Both halves matter. The panel draws a card per item whether or not its author
 * has an opinion, so the untouched ones are dropped here rather than stored;
 * and an entry whose slot has since been emptied is advice about an item that
 * is no longer in the build, which the reader would never see.
 */
export function forSaving(priority: BuildPriority, slots: readonly { slot: number }[]): BuildPriority {
  const live = new Set(slots.map((entry) => entry.slot));
  return priority.filter((entry) => live.has(entry.slot) && !isEmptyEntry(entry));
}
