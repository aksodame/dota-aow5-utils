/**
 * The crafting section's pages for the prerenderer: `/wiki/craft/<itemId>`,
 * one per item the game will craft.
 *
 * "Craftable" is the page's own rule — the item has a `Needs` list once its
 * S2 patch is applied, and it is in the game's item index — and the sentence
 * is `craftPageFacts`, both from `aow5-shared/wiki`, which the page in the
 * browser calls too. The craft cost here is at game prices only: exchange
 * prices exist only in a reader's browser, and the page passes none to its
 * own `<head>` either, so the two agree.
 *
 * The recipes themselves are in `items.full.json`, read from disk on the
 * first request (`fullItem`); the small wiki tables are imported.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import {
  craftInSeason,
  craftItemOf,
  craftPageFacts,
  craftPricing,
  isCraftable,
  type CraftFile,
  type CraftItem,
  type ItemsExtraFile,
  type ItemsExtraLocale,
  type ProgressionLocale,
} from 'aow5-shared/wiki';
import craftJson from 'aow5-shared/public/data/wiki/craft.json' with { type: 'json' };
import extraJson from 'aow5-shared/public/data/wiki/items-extra.json' with { type: 'json' };
import extraEn from 'aow5-shared/public/data/wiki/locale.en.items-extra.json' with { type: 'json' };
import extraRu from 'aow5-shared/public/data/wiki/locale.ru.items-extra.json' with { type: 'json' };
import extraZh from 'aow5-shared/public/data/wiki/locale.zh.items-extra.json' with { type: 'json' };
import progEn from 'aow5-shared/public/data/wiki/locale.en.progression.json' with { type: 'json' };
import progRu from 'aow5-shared/public/data/wiki/locale.ru.progression.json' with { type: 'json' };
import progZh from 'aow5-shared/public/data/wiki/locale.zh.progression.json' with { type: 'json' };
import { fullItem } from '../item-data.ts';
import { itemFacts, itemIconPath } from '../names.ts';
import { registerWikiSection } from '../wiki-pages.ts';

const CRAFT = craftJson as unknown as CraftFile;
const EXTRA = extraJson as unknown as ItemsExtraFile;
const EXTRA_LOCALE: Record<SeoLang, ItemsExtraLocale> = {
  en: extraEn as unknown as ItemsExtraLocale,
  ru: extraRu as unknown as ItemsExtraLocale,
  zh: extraZh as unknown as ItemsExtraLocale,
};
const PROG_LOCALE: Record<SeoLang, ProgressionLocale> = {
  en: progEn as unknown as ProgressionLocale,
  ru: progRu as unknown as ProgressionLocale,
  zh: progZh as unknown as ProgressionLocale,
};

const view = new Map<string, CraftItem | undefined>();

/** An item as S2 sees it, or undefined for an id the table does not define. */
function lookup(id: string): CraftItem | undefined {
  if (!view.has(id)) {
    const full = fullItem(id);
    view.set(id, full === undefined ? undefined : craftItemOf(full, EXTRA.seasonal[id]?.s2));
  }
  return view.get(id);
}

let pricing: ReturnType<typeof craftPricing> | null = null;
function basePricing() {
  pricing ??= craftPricing(lookup, () => null);
  return pricing;
}

function craftable(id: string): CraftItem | undefined {
  if (CRAFT.items[id] === undefined || itemFacts(id, 'en') === undefined) return undefined;
  const item = lookup(id);
  return isCraftable(item) ? item : undefined;
}

let ids: string[] | null = null;
function craftIds(): string[] {
  ids ??= Object.keys(CRAFT.items)
    .filter((id) => craftable(id) !== undefined)
    .sort();
  return ids;
}

function factsOf(id: string, lang: SeoLang) {
  const item = craftable(id);
  const entry = CRAFT.items[id];
  if (item === undefined || entry === undefined) return undefined;
  const unlock = craftInSeason(entry);
  const talent = unlock.talents?.[0];
  const recipe = unlock.recipes?.[0];
  return craftPageFacts(
    {
      name: itemFacts(id, lang)?.name ?? id,
      level: item.level,
      qualityName: EXTRA_LOCALE[lang].qualities[String(item.quality)],
      components: item.needs.length,
      craftCost: basePricing().craftOf(id).value,
      unlock:
        talent !== undefined
          ? { kind: 'talent', name: PROG_LOCALE[lang].nodes[talent.node]?.name ?? talent.node }
          : recipe !== undefined
            ? { kind: 'recipe', name: itemFacts(recipe, lang)?.name ?? recipe }
            : null,
    },
    lang,
  );
}

registerWikiSection('craft', {
  page(path, lang) {
    const [id, ...rest] = path;
    if (id === undefined || rest.length > 0) return undefined;
    const facts = factsOf(id, lang);
    const item = craftable(id);
    if (facts === undefined || item === undefined) return undefined;
    // The item, then its direct components.
    const icons = [id, ...item.needs.map((need) => need.id)].map((part) => itemIconPath(part)).slice(0, 6);
    return { facts: { section: 'craft', path, ...facts }, scene: null, icons };
  },
  links(lang) {
    return craftIds().flatMap((id) => {
      const facts = factsOf(id, lang);
      return facts === undefined ? [] : [{ href: wikiPagePath('craft', [id]), text: `${facts.name} — ${facts.facts}` }];
    });
  },
});
