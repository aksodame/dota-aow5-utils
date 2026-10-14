import type { ItemSummary } from 'aow5-shared/data';
import { isConsumable, type CraftLookup, type CraftPricing, type ItemsExtraFile } from 'aow5-shared/wiki';
import { itemPath, wikiPath } from '@/router';
import type { Lang } from '@/i18n/strings';
import type { CraftStrings } from '../../i18n/craft';

/**
 * What every part of the Crafting page reads, handed down as one object.
 *
 * `pricing` is rebuilt whenever an exchange price changes — its memo is only
 * valid for one set of prices — and everything else is stable for the visit.
 */
export interface CraftContext {
  lang: Lang;
  t: CraftStrings;
  lookup: CraftLookup;
  pricing: CraftPricing;
  prices: Readonly<Record<string, number>>;
  byId: ReadonlyMap<string, ItemSummary>;
  extra: ItemsExtraFile;
  /** `gold` / `зол.` / `金币`, after an amount. */
  goldUnit: string;
}

/**
 * Where a mention of an item goes: a consumable's page is in Consumables, as
 * the partner wiki linked it; everything else is the item's own page.
 */
export function itemHref(ctx: Pick<CraftContext, 'extra' | 'byId'>, id: string): string {
  const type = ctx.byId.get(id)?.type;
  return isConsumable(ctx.extra, id, type) ? wikiPath('consumables', id) : itemPath(id);
}

export function nameOf(ctx: Pick<CraftContext, 'byId'>, id: string): string {
  return ctx.byId.get(id)?.name ?? id;
}
