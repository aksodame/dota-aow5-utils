/**
 * The wiki's shape as the rest of the site sees it: its sections, their
 * addresses, and what a page in it says about itself.
 *
 * **Here rather than in the webapp's route table**, because three things need
 * the same list and must never disagree about it: the SPA's router, the API's
 * prerenderer (which answers `/wiki/…` with the right `<head>` before any
 * JavaScript runs) and the card renderer behind `og:image`. The webapp's
 * `lib/routes.ts` re-exports it rather than declaring its own.
 */

import { clampWidth, oneLine } from './text.ts';
import type { SeoLang } from './strings.ts';

export const WIKI_PREFIX = 'wiki';

/**
 * The sections, in the order the wiki's own row draws them.
 *
 * The things a player looks up most come first — an item, a box, a monster —
 * and the pages about the game's rules last.
 */
export const WIKI_SECTIONS = [
  'items',
  'consumables',
  'monsters',
  'sky',
  'craft',
  'progression',
  'heroes',
  'vendors',
  'calc',
  'faq',
  'patchnotes',
] as const;

export type WikiSection = (typeof WIKI_SECTIONS)[number];

/** Where `/wiki` itself lands. */
export const DEFAULT_WIKI_SECTION: WikiSection = 'items';

export function isWikiSection(value: unknown): value is WikiSection {
  return typeof value === 'string' && (WIKI_SECTIONS as readonly string[]).includes(value);
}

/**
 * What one segment after the section may look like.
 *
 * Every id the wiki puts in a path is the addon's own — `monster_10000`,
 * `M001`, `tree4`, `T123`, `npc_dota_hero_axe` — or a key of ours like
 * `tier1`: letters, digits, `_` and `-`. Matched rather than looked up, so a
 * matcher can stay pure; a well-formed id that names nothing is the page's to
 * report.
 */
export const WIKI_SEGMENT = /^[A-Za-z0-9_-]{1,48}$/;

/** No page in the wiki is deeper than this below its section. */
export const WIKI_DEPTH = 3;

/** A page of the wiki, site-root relative. */
export function wikiPagePath(section: WikiSection, path: readonly string[] = [], base = '/'): string {
  const tail = path.filter((part) => part !== '').map(encodeURIComponent);
  return `${base}${WIKI_PREFIX}/${[section, ...tail].join('/')}`;
}

/**
 * What a page of the wiki says about itself, for its `<head>` and its card.
 *
 * Assembled by whoever has the record — the section's page in the browser, the
 * prerenderer on the server — from the same data, so the two produce the same
 * tags. `facts` is already joined; `description` is the page's own prose, and
 * may be empty when the record has none.
 */
export interface WikiPageFacts {
  section: WikiSection;
  /** The segments after the section, exactly as the page's URL has them. */
  path: readonly string[];
  name: string;
  /** `Boss · Lv. 7 · Temple of the End` — short, already in the reader's language. */
  facts: string;
  description: string;
}

/**
 * The card for a page of the wiki.
 *
 * The segments are joined with `~`, which no segment can contain, so the path
 * parses back without a lookup. `version` is the data version, exactly as an
 * item card has it: the card is a picture of data that changes when the pak
 * does, and a scraper that cached last month's picture should be told so.
 */
export function wikiCardPath(section: WikiSection, path: readonly string[], version?: string, lang?: SeoLang): string {
  const key = path.length === 0 ? section : `${section}/${path.join('~')}`;
  const suffix = [version, lang].filter((part): part is string => part !== undefined && part !== '').join('.');
  return `/api/og/wiki/${key}${suffix === '' ? '' : `.${suffix}`}.png`;
}

/** The section's own card, the one its landing page and its missing pages share. */
export function wikiSectionCardPath(section: WikiSection, lang?: SeoLang): string {
  return wikiCardPath(section, [], undefined, lang);
}

export interface WikiSeoStrings {
  /** `Wiki`, which goes between a page's name and the brand. */
  wiki: string;
  /** The alt text on a wiki card. */
  cardAlt: string;
  /** One title and description per section, for its landing page and its card. */
  sections: Record<WikiSection, { title: string; description: string }>;
}

/**
 * Every section's own words, in the three languages.
 *
 * Descriptions of a page rather than UI labels — see the note at the top of
 * `strings.ts`. The titles are the same nouns the wiki's own row of tabs uses,
 * so a link preview names the page it opens.
 */
export const WIKI_SEO_STRINGS: Record<SeoLang, WikiSeoStrings> = {
  en: {
    wiki: 'Wiki',
    cardAlt: 'Wiki page card',
    sections: {
      items: {
        title: 'Items',
        description:
          'Every item in Age of Weapons 5: stats and their rolls, where it drops, what it crafts into and what it costs to reforge.',
      },
      consumables: {
        title: 'Consumables',
        description: 'Potions, chests and containers in Age of Weapons 5: what each one does and what a box can hold.',
      },
      monsters: {
        title: 'Monsters & drops',
        description:
          'Every monster in Age of Weapons 5 with its stats, spawns and loot table, and every location\'s loot by difficulty.',
      },
      sky: {
        title: 'Sky',
        description: 'The Sky tiers and the endless mode of Age of Weapons 5: reward chests, waves, spawn pools and monster scaling.',
      },
      craft: {
        title: 'Crafting',
        description: 'Recipe trees for every craftable item in Age of Weapons 5, priced against the auction so you know whether to buy or build.',
      },
      progression: {
        title: 'Progression',
        description: 'The talent trees of Age of Weapons 5, node by node: what each one gives, what it costs and where to farm it.',
      },
      heroes: {
        title: 'Heroes',
        description: 'The heroes of Age of Weapons 5: their abilities, which talent unlocks each one, and the runes that empower them.',
      },
      vendors: {
        title: 'Vendors',
        description: 'What the regular, ancient and guild vendors of Age of Weapons 5 sell and buy, and at what price.',
      },
      calc: {
        title: 'Stats calculator',
        description: 'Put together a hero and six items and see the final stats panel of Age of Weapons 5, rolls included.',
      },
      faq: {
        title: 'FAQ',
        description: 'How Age of Weapons 5 works under the hood: difficulty, drops and luck, forging, seasons, damage and more.',
      },
      patchnotes: {
        title: 'Patch notes',
        description: 'What changed in Age of Weapons 5, version by version.',
      },
    },
  },
  ru: {
    wiki: 'Вики',
    cardAlt: 'Карточка страницы вики',
    sections: {
      items: {
        title: 'Предметы',
        description:
          'Все предметы Age of Weapons 5: характеристики и их разброс, откуда падают, во что крафтятся и сколько стоит перековка.',
      },
      consumables: {
        title: 'Расходники',
        description: 'Зелья, сундуки и контейнеры Age of Weapons 5: что делает каждый и что может выпасть из ящика.',
      },
      monsters: {
        title: 'Монстры и дроп',
        description: 'Все монстры Age of Weapons 5 с характеристиками, спавнами и дропом, и лут каждой локации по сложностям.',
      },
      sky: {
        title: 'Небо',
        description: 'Тиры Неба и бесконечный режим Age of Weapons 5: сундуки-награды, волны, пулы спавна и рост монстров.',
      },
      craft: {
        title: 'Крафт',
        description: 'Деревья рецептов всех крафтовых предметов Age of Weapons 5 с ценами биржи: что выгоднее, купить или собрать.',
      },
      progression: {
        title: 'Прокачка',
        description: 'Деревья талантов Age of Weapons 5 по узлам: что даёт каждый, сколько стоит и где фармить ресурсы.',
      },
      heroes: {
        title: 'Герои',
        description: 'Герои Age of Weapons 5: способности, какой талант открывает каждую и какие руны их усиливают.',
      },
      vendors: {
        title: 'Продавцы',
        description: 'Что продают и покупают обычный, древний и гильдейский торговцы Age of Weapons 5 и по каким ценам.',
      },
      calc: {
        title: 'Калькулятор статов',
        description: 'Соберите героя и шесть предметов и посмотрите итоговую панель характеристик Age of Weapons 5 с учётом роллов.',
      },
      faq: {
        title: 'FAQ',
        description: 'Как устроена Age of Weapons 5: сложность, дроп и удача, ковка, сезоны, урон и многое другое.',
      },
      patchnotes: {
        title: 'Патчноуты',
        description: 'Что менялось в Age of Weapons 5 от версии к версии.',
      },
    },
  },
  zh: {
    wiki: '百科',
    cardAlt: '百科页面卡片',
    sections: {
      items: {
        title: '物品',
        description: '《兵器时代5》的全部物品：属性与浮动范围、掉落来源、可合成为何物以及重铸费用。',
      },
      consumables: {
        title: '消耗品',
        description: '《兵器时代5》的药水、宝箱与容器：各自的效果，以及箱子里可能开出什么。',
      },
      monsters: {
        title: '怪物与掉落',
        description: '《兵器时代5》全部怪物的属性、刷新点与掉落表，以及各地图在不同难度下的战利品。',
      },
      sky: {
        title: '天空',
        description: '《兵器时代5》的天空各层与无尽模式：奖励宝箱、波次、刷怪池与怪物成长。',
      },
      craft: {
        title: '合成',
        description: '《兵器时代5》所有可合成物品的配方树，并按交易行价格比较买与造哪个更划算。',
      },
      progression: {
        title: '天赋成长',
        description: '《兵器时代5》的天赋树逐节点解析：每个节点的效果、花费以及资源的刷取地点。',
      },
      heroes: {
        title: '英雄',
        description: '《兵器时代5》的英雄：技能、解锁各技能的天赋，以及强化技能的符印。',
      },
      vendors: {
        title: '商人',
        description: '《兵器时代5》普通、远古与公会商人的买卖清单与价格。',
      },
      calc: {
        title: '属性计算器',
        description: '选择英雄与六件装备，查看《兵器时代5》含浮动的最终属性面板。',
      },
      faq: {
        title: '常见问题',
        description: '《兵器时代5》的底层机制：难度、掉落与幸运、锻造、赛季、伤害等。',
      },
      patchnotes: {
        title: '更新日志',
        description: '《兵器时代5》各版本的改动。',
      },
    },
  },
};

/** The description budget a page's own facts and prose are cut to. Mirrors `DESCRIPTION_BUDGET`. */
const BUDGET = 155;

/** `<facts>. <prose>`, cut to the budget, or the section's own sentence when the page has neither. */
export function wikiPageDescription(page: WikiPageFacts, lang: SeoLang): string {
  const facts = oneLine(page.facts);
  const prose = oneLine(page.description);
  const fallback = WIKI_SEO_STRINGS[lang].sections[page.section].description;
  const body = prose === '' ? fallback : prose;
  return clampWidth(facts === '' ? body : `${facts}. ${body}`, BUDGET);
}
