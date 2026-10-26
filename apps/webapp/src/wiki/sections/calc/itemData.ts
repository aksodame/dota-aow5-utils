import { useEffect, useState } from 'react';
import type { ItemFull, RichNode } from 'aow5-shared/types';
import { CURRENT_RULESET, seasonalPatch, stoneLinks, type ItemsExtraFile } from 'aow5-shared/wiki';
import { useWikiData } from '../../kit';

/**
 * The item side of the calculator: an item's stats as the wiki's season has
 * them, its fate stone, and a name for every stat key.
 */

/** The season the wiki describes; an item's values are patched to it. */
const SEASON = CURRENT_RULESET;

/** `items-extra.json`: season patches, glyph targets. Null until it arrives. */
export function useItemsExtra(): ItemsExtraFile | null {
  const { data } = useWikiData<[ItemsExtraFile]>(['items-extra.json']);
  return data?.[0] ?? null;
}

/** An item's values in the wiki's season (the base table with the season's patch over it). */
export function itemValues(item: ItemFull, extra: ItemsExtraFile | null): Record<string, number | string> {
  const patch = extra !== null ? seasonalPatch(extra, item.id, SEASON) : undefined;
  return patch?.values ?? item.values;
}

/** An item's cooldown in the wiki's season. */
export function itemCooldown(item: ItemFull, extra: ItemsExtraFile | null): number | undefined {
  const patch = extra !== null ? seasonalPatch(extra, item.id, SEASON) : undefined;
  return patch?.cooldown ?? item.ability?.cooldown;
}

const linkCache = new WeakMap<object, ReturnType<typeof stoneLinks>>();

/** Fate-stone ancestry (`ancestral → stone`, `base → stone`), computed once per item table. */
export function linksOf(full: Record<string, ItemFull>): ReturnType<typeof stoneLinks> {
  let hit = linkCache.get(full);
  if (hit === undefined) {
    hit = stoneLinks(Object.values(full));
    linkCache.set(full, hit);
  }
  return hit;
}

/** An ancestral item's base item (the one its fate stone upgrades). */
export function ancestralBase(full: Record<string, ItemFull>, id: string): string | undefined {
  const stone = linksOf(full).fromStone.get(id);
  return stone !== undefined ? full[stone]?.upgradesFrom : undefined;
}

/** A description's text without markup. */
export function plainText(nodes: readonly RichNode[] | undefined): string {
  if (nodes === undefined) return '';
  let out = '';
  for (const node of nodes) {
    if (node.t === 's') out += node.v;
    else if (node.t === 'br') out += ' ';
    else out += plainText(node.c);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Bags and backpacks, which the game marks by nothing but their name.
 *
 * The partner wiki matched "сумка / рюкзак / мешок" on the Russian names, and
 * the stat `extra_backpack_slot_limit` is no sign — boots and bracers carry it
 * too. So does this page, whatever the reader's language: the Russian name
 * table is fetched once (it is the one the partner's rule was written for).
 */
const BAG_NAME = /(сумка|сумки|рюкзак|мешок\s)/i;

let ruNames: Promise<Record<string, string>> | null = null;

function loadRuNames(): Promise<Record<string, string>> {
  if (ruNames === null) {
    const env = (import.meta as { env?: { BASE_URL?: string; VITE_AOW5_DATA_VERSION?: string } }).env;
    const version = env?.VITE_AOW5_DATA_VERSION ?? '';
    const url = `${env?.BASE_URL ?? '/'}data/locale.ru.names.json${version === '' ? '' : `?v=${version}`}`;
    ruNames = fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<{ names: Record<string, string> }>) : { names: {} }))
      .then((r) => r.names)
      .catch(() => {
        ruNames = null;
        return {};
      });
  }
  return ruNames;
}

/** The ids of every bag, once the Russian names have arrived. */
export function useBagIds(): ReadonlySet<string> | null {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    let live = true;
    void loadRuNames().then((names) => {
      if (!live) return;
      setIds(new Set(Object.entries(names).filter(([, name]) => BAG_NAME.test(name)).map(([id]) => id)));
    });
    return () => {
      live = false;
    };
  }, []);
  return ids;
}

/*
 * The namer itself lives in the kit: the card's plain stat list draws the same
 * names, and must not pull this module's calculator strings in to do it.
 */
export { useStatNamer, type StatName } from '../../kit/statNames';

