/**
 * The Skyfall Realm's pages for the prerenderer: one per sub-tab,
 * `/wiki/sky/<tier1|tier2|tier3|endless|spawns|combos|scaling>`.
 *
 * Imported, like `names.ts` imports its tables: `sky.json` and `pools.json`
 * are a few hundred kilobytes together, every page of the section reads both,
 * and a bundled import cannot go missing from the image.
 *
 * Which address names what, the sentence a page says about itself and the
 * items on its card are `skyPageFacts` / `skyPageItems` in `aow5-shared/wiki`,
 * which the page in the browser calls too.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import { SKY_SUBTABS, skyPageFacts, skyPageItems, skySubtabTier, type PoolsFile, type SkyFile, type SkyLocale } from 'aow5-shared/wiki';
import skyData from 'aow5-shared/public/data/wiki/sky.json' with { type: 'json' };
import poolsData from 'aow5-shared/public/data/wiki/pools.json' with { type: 'json' };
import skyEn from 'aow5-shared/public/data/wiki/locale.en.sky.json' with { type: 'json' };
import skyRu from 'aow5-shared/public/data/wiki/locale.ru.sky.json' with { type: 'json' };
import skyZh from 'aow5-shared/public/data/wiki/locale.zh.sky.json' with { type: 'json' };
import { itemIconPath, mapScenePath } from '../names.ts';
import { registerWikiSection } from '../wiki-pages.ts';

const SKY = skyData as unknown as SkyFile;
const POOLS = poolsData as unknown as PoolsFile;
const LOCALES: Record<SeoLang, SkyLocale> = {
  en: skyEn as SkyLocale,
  ru: skyRu as SkyLocale,
  zh: skyZh as SkyLocale,
};

/** The realm's room has no painted scene today; the card gets one the day it does. */
const SCENE = mapScenePath(SKY.roomId) === null ? null : SKY.roomId;

registerWikiSection('sky', {
  page(path, lang) {
    const facts = skyPageFacts(SKY, LOCALES[lang], POOLS, path, lang);
    if (facts === undefined) return undefined;
    const key = SKY_SUBTABS.find((k) => k === path[0]);
    const tier = key === undefined ? null : skySubtabTier(key);
    return {
      facts: { section: 'sky', path, ...facts },
      scene: SCENE,
      icons: key === undefined ? [] : skyPageItems(SKY, POOLS, key).map(itemIconPath),
      tier: tier === null ? null : `T${tier}`,
    };
  },
  links(lang) {
    return SKY_SUBTABS.map((key) => {
      const facts = skyPageFacts(SKY, LOCALES[lang], POOLS, [key], lang);
      return { href: wikiPagePath('sky', [key]), text: facts === undefined ? key : `${facts.name} — ${facts.facts}` };
    });
  },
});
