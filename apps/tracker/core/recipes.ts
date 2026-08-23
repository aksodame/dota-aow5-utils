import type { ItemNeed } from 'aow5-shared/types';

/**
 * Crafting requirements, resolved.
 *
 * The addon's item table already carries the recipe graph: every craftable item
 * lists its direct ingredients in `needs`, and those ingredients often have
 * `needs` of their own. What a player actually wants to know while farming is
 * not "what does this take" but "what does this take *all the way down*, and
 * how much of it do I have" — which is `flattenNeeds` plus `progress`.
 *
 * Pure and data-source agnostic: the caller supplies a `NeedsOf` lookup, so
 * `node --test` drives this against a handful of fixtures and the overlay
 * drives it against `items.full.json` without either knowing about the other.
 */

/** A quantity of one item. */
export interface Requirement {
  id: string;
  count: number;
}

/** Direct ingredients of an item; empty for a base material. */
export type NeedsOf = (id: string) => readonly ItemNeed[] | undefined;

/**
 * Guards a recipe graph that turns out not to be a tree.
 *
 * Nothing promises the extracted data is acyclic — it is generated from the
 * addon's own KV files — and a cycle here would hang the overlay rather than
 * show a wrong number, which is much worse.
 */
export const MAX_DEPTH = 24;

export interface FlattenOptions {
  /** How many of the target to craft. Defaults to 1. */
  count?: number;
  /**
   * Ids to treat as base materials even when they have a recipe of their own.
   *
   * This is how "I already have three of these, stop expanding them" is
   * expressed — the overlay passes the ids it is counting as held.
   */
  stopAt?: ReadonlySet<string>;
}

const bump = (into: Map<string, number>, id: string, count: number) =>
  into.set(id, (into.get(id) ?? 0) + count);

/** Sorted heaviest-first, then by id, so a list never reorders on a re-render. */
function toList(totals: Map<string, number>): Requirement[] {
  return [...totals]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/** One level down: exactly what the item's own `needs` says, scaled by `count`. */
export function directNeeds(id: string, needsOf: NeedsOf, count = 1): Requirement[] {
  const totals = new Map<string, number>();
  for (const need of needsOf(id) ?? []) bump(totals, need.id, need.count * count);
  return toList(totals);
}

/**
 * Every base material the item bottoms out in, summed.
 *
 * An ingredient reached by two different paths is counted once with the two
 * quantities added, which is the number that belongs next to a `have` count.
 * A branch that revisits an id already on its own path is a cycle and is cut
 * there rather than followed.
 */
export function flattenNeeds(id: string, needsOf: NeedsOf, options: FlattenOptions = {}): Requirement[] {
  const { count = 1, stopAt } = options;
  const totals = new Map<string, number>();

  const walk = (current: string, multiplier: number, path: ReadonlySet<string>, depth: number): void => {
    const needs = stopAt?.has(current) ? undefined : needsOf(current);
    if (!needs || needs.length === 0 || depth >= MAX_DEPTH) {
      bump(totals, current, multiplier);
      return;
    }
    const nextPath = new Set(path).add(current);
    for (const need of needs) {
      // A cycle: count the ingredient as a leaf instead of descending into it.
      if (path.has(need.id)) bump(totals, need.id, need.count * multiplier);
      else walk(need.id, need.count * multiplier, nextPath, depth + 1);
    }
  };

  for (const need of stopAt?.has(id) ? [] : (needsOf(id) ?? [])) {
    walk(need.id, need.count * count, new Set([id]), 1);
  }
  return toList(totals);
}

export interface RequirementProgress extends Requirement {
  /** How many are held. Never above `count` in the UI sense — see `done`. */
  have: number;
  /** `have >= count`. */
  done: boolean;
}

/** Pairs requirements with a held-quantity map. Unfilled requirements sort first. */
export function progress(requirements: readonly Requirement[], have: ReadonlyMap<string, number>): RequirementProgress[] {
  return requirements
    .map((req) => {
      const held = have.get(req.id) ?? 0;
      return { ...req, have: held, done: held >= req.count };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || b.count - a.count || a.id.localeCompare(b.id));
}

/** 0–1 across every requirement, each capped at its own target. 1 when there is nothing to gather. */
export function completion(rows: readonly RequirementProgress[]): number {
  let need = 0;
  let got = 0;
  for (const row of rows) {
    need += row.count;
    got += Math.min(row.have, row.count);
  }
  return need === 0 ? 1 : got / need;
}

/**
 * One thing to make, and what making it costs directly.
 *
 * A plan is a list of these: the target, then a step for each ingredient that
 * is itself crafted, then their crafted ingredients, and so on. It is
 * deliberately *not* a flattening — see `craftPlan`.
 */
export interface CraftStep {
  id: string;
  /** How many of this step's output are needed, summed over everything that asks for it. */
  count: number;
  /** Direct ingredients only, already scaled by `count`, minus anything that became a step of its own. */
  needs: Requirement[];
  /** False for a step the player asked for, true for one opened up out of a recipe above it. */
  derived: boolean;
}

/** How many nodes a plan may visit before it is assumed to be pathological. */
const MAX_VISITS = 4096;

/**
 * Expands targets into crafting steps, one level at a time.
 *
 * The alternative — `flattenNeeds` — answers "what does this cost me in raw
 * materials", which is the right question when you are choosing what to farm
 * and the wrong one when you are standing at the anvil. A sword that needs a
 * blade does not need three ore *and* a blade; it needs a blade, which is its
 * own job, with its own ingredients.
 *
 * Only one level is expanded by default: the targets, and nothing below them.
 * A crafted ingredient is listed as a material of its parent like any other,
 * because most of the time you buy or already have the blade, and a plan that
 * insisted on teaching you how to make everything down to the ore would bury
 * the one line you asked for. Naming an id in `expand` opts it in — it stops
 * being a material and becomes a step of its own, with its ingredients
 * underneath — which is the same statement from the other side, made per item
 * and only when the player wants it.
 *
 * An ingredient wanted by two steps is one step with the counts added. Cycles
 * and pathological graphs are bounded by `MAX_DEPTH` and `MAX_VISITS` — the
 * data is generated from the addon's KV files and nothing promises it is a
 * tree.
 */
export function craftPlan(
  targets: readonly Requirement[],
  needsOf: NeedsOf,
  options: { expand?: ReadonlySet<string> } = {},
): CraftStep[] {
  const expand = options.expand ?? new Set<string>();
  const asked = new Set(targets.map((t) => t.id));
  /**
   * Is this id a job of its own, rather than something to go and find?
   *
   * A target always is — it is the thing being made. Anything else has to be
   * asked for, and has to have a recipe to expand into.
   */
  const expands = (id: string): boolean => (asked.has(id) || expand.has(id)) && (needsOf(id)?.length ?? 0) > 0;

  const totals = new Map<string, number>();
  const order: string[] = [];

  const queue: { id: string; count: number; depth: number }[] = [];
  for (const target of targets) queue.push({ id: target.id, count: target.count, depth: 0 });

  let visits = 0;
  while (queue.length > 0 && visits < MAX_VISITS) {
    const step = queue.shift();
    if (!step || step.depth >= MAX_DEPTH) continue;
    visits++;

    if (!totals.has(step.id)) order.push(step.id);
    totals.set(step.id, (totals.get(step.id) ?? 0) + step.count);

    for (const need of needsOf(step.id) ?? []) {
      if (expands(need.id)) queue.push({ id: need.id, count: need.count * step.count, depth: step.depth + 1 });
    }
  }

  return order.map((id) => {
    const count = totals.get(id) ?? 0;
    return {
      id,
      count,
      // The crafted ones are steps of their own; what is left is the shopping.
      needs: directNeeds(id, needsOf, count).filter((need) => !expands(need.id)),
      derived: !asked.has(id),
    };
  });
}
