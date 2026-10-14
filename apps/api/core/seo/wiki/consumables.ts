/**
 * The consumables section's pages for the prerenderer:
 * `/wiki/consumables/<itemId>`, one per potion, drink or container.
 *
 * Which items those are is `inConsumables` and the sentence each page says is
 * `consumablePageFacts(consumableFactsInput(…))`, both in `aow5-shared/wiki`,
 * which the page in the browser calls too. The wiki tables are imported, the
 * way `names.ts` imports its own: a few hundred kilobytes, needed by every
 * request here, and an import cannot go missing from the image.
 *
 * The hidden-but-in-game items the section lists (unsealed tower chests, the
 * Greed Cave crates, the tower's purification potions) are not in the item
 * index `names.ts` carries, so their type, level and cost come from
 * `items.full.json` on disk via `fullItem` — read once, on the first request
 * that needs one.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import {
  consumableFactsInput,
  consumableName,
  consumablePageFacts,
  consumablePool,
  inConsumables,
  poolInSeason,
  poolShares,
  towerChestOf,
  type ItemsExtraFile,
  type ItemsExtraLocale,
  type PoolsFile,
  type PoolsLocale,
} from 'aow5-shared/wiki';
import extraJson from 'aow5-shared/public/data/wiki/items-extra.json' with { type: 'json' };
import poolsJson from 'aow5-shared/public/data/wiki/pools.json' with { type: 'json' };
import extraEn from 'aow5-shared/public/data/wiki/locale.en.items-extra.json' with { type: 'json' };
import extraRu from 'aow5-shared/public/data/wiki/locale.ru.items-extra.json' with { type: 'json' };
import extraZh from 'aow5-shared/public/data/wiki/locale.zh.items-extra.json' with { type: 'json' };
import poolsEn from 'aow5-shared/public/data/wiki/locale.en.pools.json' with { type: 'json' };
import poolsRu from 'aow5-shared/public/data/wiki/locale.ru.pools.json' with { type: 'json' };
import poolsZh from 'aow5-shared/public/data/wiki/locale.zh.pools.json' with { type: 'json' };
import { fullItem } from '../item-data.ts';
import { itemFacts, itemIconPath } from '../names.ts';
import { registerWikiSection } from '../wiki-pages.ts';

const EXTRA = extraJson as unknown as ItemsExtraFile;
const POOLS = poolsJson as unknown as PoolsFile;
const EXTRA_LOCALE: Record<SeoLang, ItemsExtraLocale> = {
  en: extraEn as unknown as ItemsExtraLocale,
  ru: extraRu as unknown as ItemsExtraLocale,
  zh: extraZh as unknown as ItemsExtraLocale,
};
const POOLS_LOCALE: Record<SeoLang, PoolsLocale> = {
  en: poolsEn as unknown as PoolsLocale,
  ru: poolsRu as unknown as PoolsLocale,
  zh: poolsZh as unknown as PoolsLocale,
};

/** What the facts need of an item, from the index or, for a hidden one, the full table. */
interface Base {
  id: string;
  type: string;
  level: number;
  cost: number;
  gameName: string | undefined;
}

function baseOf(id: string, lang: SeoLang): Base | undefined {
  const indexed = itemFacts(id, lang);
  if (indexed !== undefined) {
    return { id, type: indexed.type, level: indexed.level, cost: indexed.cost, gameName: indexed.name };
  }
  const full = fullItem(id) as (ReturnType<typeof fullItem> & { flags?: { inGame?: number } }) | undefined;
  if (full === undefined || full.flags?.inGame !== 1) return undefined;
  return { id, type: full.type, level: full.level, cost: full.cost, gameName: undefined };
}

/**
 * Every id the section lists, in the base table's order. Every item is in
 * exactly one KV file, so `tables` enumerates them all without the full table.
 */
let ids: string[] | null = null;
function consumableIds(): string[] {
  if (ids === null) {
    ids = Object.values(EXTRA.tables)
      .flat()
      .filter((id) => {
        const base = baseOf(id, 'en');
        return base !== undefined && inConsumables(EXTRA, base);
      })
      .sort();
  }
  return ids;
}

function factsOf(id: string, lang: SeoLang) {
  const base = baseOf(id, lang);
  if (base === undefined || !inConsumables(EXTRA, base)) return undefined;
  const poolNames = POOLS_LOCALE[lang].names;
  const name = consumableName(EXTRA, id, base.gameName, poolNames);
  return consumablePageFacts(
    consumableFactsInput(EXTRA, POOLS, { id, name, level: base.level, cost: base.cost }, { pools: poolNames, towers: EXTRA_LOCALE[lang].towers }),
    lang,
  );
}

/** The item's icon — a hidden tower chest borrows its normal variant's, which is the same art — then the pool's heaviest five. */
function iconsOf(id: string): (string | null)[] {
  const own = itemIconPath(id) ?? (() => {
    const normal = towerChestOf(EXTRA, id)?.chest.items.normal;
    return normal === undefined ? null : itemIconPath(normal);
  })();
  const poolId = consumablePool(EXTRA, id);
  const pool = poolId === undefined ? undefined : POOLS.pools[poolId];
  const top = pool === undefined ? [] : poolShares(poolInSeason(pool)).map((entry) => itemIconPath(entry.id)).filter((path) => path !== null);
  return [own, ...top.slice(0, 5)];
}

registerWikiSection('consumables', {
  page(path, lang) {
    const [id, ...rest] = path;
    if (id === undefined || rest.length > 0) return undefined;
    const facts = factsOf(id, lang);
    if (facts === undefined) return undefined;
    return { facts: { section: 'consumables', path, ...facts }, scene: null, icons: iconsOf(id) };
  },
  links(lang) {
    return consumableIds().flatMap((id) => {
      const facts = factsOf(id, lang);
      return facts === undefined ? [] : [{ href: wikiPagePath('consumables', [id]), text: `${facts.name} — ${facts.facts}` }];
    });
  },
});
