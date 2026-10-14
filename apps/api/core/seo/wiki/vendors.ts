/**
 * The vendors' pages for the prerenderer: `/wiki/vendors/<regular|ancient>`
 * and `/wiki/vendors/guild/<tasks|exchange>`.
 *
 * Four pages, all drawn from `wiki/vendors.json` and its locale — imported,
 * as `names.ts` imports its tables, because they are a few kilobytes and every
 * vendor request needs them. The sentence a page says about itself is
 * `vendorPageFacts` in `aow5-shared/wiki`, which the page in the browser calls
 * too. The card's icons are a few things the vendor always stocks.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import {
  PARTNER_ANCIENT_FIXED,
  PARTNER_GUILD_REWARDS,
  PARTNER_GUILD_RUNE_TASKS,
  PARTNER_REGULAR_FIXED,
  vendorAddress,
  vendorPageFacts,
  vendorPaths,
  type VendorAddress,
  type VendorsFile,
  type VendorsLocale,
} from 'aow5-shared/wiki';
import vendorsJson from 'aow5-shared/public/data/wiki/vendors.json' with { type: 'json' };
import localeEn from 'aow5-shared/public/data/wiki/locale.en.vendors.json' with { type: 'json' };
import localeRu from 'aow5-shared/public/data/wiki/locale.ru.vendors.json' with { type: 'json' };
import localeZh from 'aow5-shared/public/data/wiki/locale.zh.vendors.json' with { type: 'json' };
import { itemIconPath } from '../names.ts';
import { registerWikiSection } from '../wiki-pages.ts';

const FILE = vendorsJson as unknown as VendorsFile;
const LOCALES: Record<SeoLang, VendorsLocale> = {
  en: localeEn as VendorsLocale,
  ru: localeRu as VendorsLocale,
  zh: localeZh as VendorsLocale,
};

/** Up to six items the page is about: the fixed stock, the order chests, the first offers. */
function iconsOf(address: VendorAddress): (string | null)[] {
  const ids =
    address.vendor === 'regular'
      ? PARTNER_REGULAR_FIXED.map(([id]) => id)
      : address.vendor === 'ancient'
        ? PARTNER_ANCIENT_FIXED.map((slot) => slot.id)
        : address.guild === 'exchange'
          ? FILE.guild.exchange.offers.map(([id]) => id)
          : [...PARTNER_GUILD_REWARDS.map((r) => r.chest), ...PARTNER_GUILD_RUNE_TASKS.map((r) => r.itemId)];
  return ids
    .map(itemIconPath)
    .filter((path): path is string => path !== null)
    .slice(0, 6);
}

registerWikiSection('vendors', {
  page(path, lang) {
    const address = vendorAddress(path);
    if (address === undefined) return undefined;
    const facts = vendorPageFacts(FILE, LOCALES[lang], address, lang);
    return { facts: { section: 'vendors', path, ...facts }, icons: iconsOf(address) };
  },
  links(lang) {
    return vendorPaths().map((path) => {
      const facts = vendorPageFacts(FILE, LOCALES[lang], vendorAddress(path)!, lang);
      return { href: wikiPagePath('vendors', path), text: `${facts.name} — ${facts.facts}` };
    });
  },
});
