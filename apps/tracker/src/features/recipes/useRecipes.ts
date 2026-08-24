import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecipeTarget } from '@core/ipc.ts';
import { craftPlan, progress, type NeedsOf, type RequirementProgress } from '@core/recipes.ts';
import { useItems } from '@/features/items/table';

/**
 * The recipe graph, and what it says you still have to farm.
 *
 * The graph lives in `items.full.json`, which is 1.2 MB — twenty times the
 * index the rest of the app runs on. It is loaded with a dynamic `import()`
 * the first time this hook runs, so the farm HUD never pays for a panel the
 * player may never open, and the parse cost lands on a window that is already
 * doing nothing else.
 */

/** Ingredients of an id, or undefined for anything that is not crafted. */
export type RecipeGraph = { needsOf: NeedsOf; craftable: (id: string) => boolean };

let cached: Promise<RecipeGraph> | null = null;

/** Loaded once per renderer, then shared: two panels would otherwise parse it twice. */
function loadGraph(): Promise<RecipeGraph> {
  cached ??= import('aow5-shared/public/data/items.full.json').then((module) => {
    const full = module.default;
    const needsOf: NeedsOf = (id) => {
      const needs = full[id]?.needs;
      return needs && needs.length > 0 ? needs : undefined;
    };
    return { needsOf, craftable: (id: string) => needsOf(id) !== undefined };
  });
  return cached;
}

/** One thing to make, and the materials for it. */
export interface RecipeGroup {
  id: string;
  /** How many, summed over everything that asked for it. */
  count: number;
  /** True when nothing asked for this directly — it is here because a step above needs it. */
  derived: boolean;
  /** Materials, richest tier first. Empty while the graph is still loading. */
  rows: RequirementProgress[];
  complete: boolean;
}

export interface Recipes {
  /** Null until the graph has loaded, which is one parse of a 1.2 MB file. */
  graph: RecipeGraph | null;
  /** One entry per crafting step: the targets, then whatever they pull in. */
  groups: RecipeGroup[];
  /** Does this id have a recipe? False while the graph is still loading. */
  craftable: (id: string) => boolean;
}

/**
 * Turns the chosen targets into a crafting plan, one line per step.
 *
 * A line is a thing to make and the materials it takes. That is what
 * `craftPlan` produces; the work here is pairing each step's materials with
 * what has dropped.
 *
 * One level deep unless asked otherwise: a crafted ingredient is a material
 * like any other until the player opens it up, at which point it becomes the
 * next job. See `craftPlan`.
 */
export function useRecipes(
  targets: readonly RecipeTarget[],
  have: ReadonlyMap<string, number>,
  /** Ids the player ticked off by hand. Done is done, whatever the count says. */
  ticked: ReadonlySet<string>,
  /** Ingredients the player is making rather than finding, each its own step. */
  expanded: ReadonlySet<string>,
): Recipes {
  const itemTable = useItems();
  const [graph, setGraph] = useState<RecipeGraph | null>(null);

  useEffect(() => {
    let live = true;
    void loadGraph().then((loaded) => {
      if (live) setGraph(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  /*
   * Targets and ticks are compared by value, not by identity: both arrive
   * inside a fresh config object on every broadcast from main — several a
   * second while a slider moves — and re-flattening the graph on each would be
   * work done to produce the same answer.
   */
  const targetKey = targets.map((t) => `${t.id}:${t.count}`).join(',');
  const tickKey = [...ticked].sort().join(',');
  const expandKey = [...expanded].sort().join(',');

  const groups = useMemo(() => {
    if (!graph) return [];
    return craftPlan(targets, graph.needsOf, { expand: expanded }).map((step) => {
      const rows = progress(step.needs, have)
        .map((row) => (ticked.has(row.id) ? { ...row, done: true } : row))
        /*
         * Deepest material first, which is `progress`'s unfinished-first order
         * thrown away on purpose. A list that reshuffles as items complete is
         * unreadable at a glance, and tier order is stable for the whole grind
         * — the rare thing you are really waiting on stays where you last
         * looked for it.
         */
        .sort((a, b) => {
          const left = itemTable.get(a.id);
          const right = itemTable.get(b.id);
          return right.level - left.level || b.count - a.count || left.name.localeCompare(right.name);
        });

      return {
        id: step.id,
        count: step.count,
        derived: step.derived,
        rows,
        // A step with nothing left to gather is ready to make. One with no
        // materials at all — a plain item the player is simply counting — is
        // never "ready", because there is nothing to be ready for.
        complete: rows.length > 0 && rows.every((row) => row.done),
      };
    });
    // The `*Key` strings stand in for the collections, which are new objects on
    // every broadcast from main. `itemTable` is in the list because the tie
    // break below orders by name, and a name depends on the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, targetKey, tickKey, expandKey, have, itemTable]);

  const craftable = useCallback((id: string) => graph?.craftable(id) ?? false, [graph]);

  return { graph, groups, craftable };
}
