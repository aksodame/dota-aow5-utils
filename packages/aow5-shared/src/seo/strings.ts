/**
 * Every string that ends up in a `<title>`, a `<meta>` or a social card, in the
 * three languages the game ships.
 *
 * **Here rather than in the webapp's `i18n/strings.ts`, and that is the point.**
 * These strings have two consumers that must never disagree: the browser tab a
 * reader sees, which the SPA writes at runtime, and the card a crawler sees,
 * which the API renders server-side without ever loading the SPA. A copy in
 * each is two things to translate and two things to forget — and the failure is
 * invisible, because nobody reads their own link previews in a language they do
 * not speak.
 *
 * The game's own nouns — item, ability, hero and room names — are **not** here.
 * Those come out of the extracted locale files, the same ones the board renders
 * from. See `names.ts`.
 *
 * Phrasing note: these read as *descriptions of a page*, not as UI labels. A
 * button says "Price"; a card says "12.4k gold". The overlap with the webapp's
 * table is therefore smaller than it looks, and where a word does appear in
 * both — `event`, `gold` — it is the same word on purpose.
 */

export const SEO_LANGS = ['en', 'ru', 'zh'] as const;
export type SeoLang = (typeof SEO_LANGS)[number];

export function isSeoLang(value: unknown): value is SeoLang {
  return typeof value === 'string' && (SEO_LANGS as readonly string[]).includes(value);
}

/**
 * The BCP-47 tag and the OpenGraph locale for each language.
 *
 * OpenGraph wants `ll_CC` with a real territory, which is why these are not
 * just the language code with an underscore: `zh_CN` is the Simplified Chinese
 * the addon ships, and `zh` alone is rejected by some scrapers outright.
 */
export const OG_LOCALE: Record<SeoLang, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  zh: 'zh_CN',
};

/** What `<html lang>` and `hreflang` say. Simple here, but kept beside `OG_LOCALE` so the two are read together. */
export const HREFLANG: Record<SeoLang, string> = {
  en: 'en',
  ru: 'ru',
  zh: 'zh-Hans',
};

export interface SeoStrings {
  /** The site's name. Appended to every title and used as `og:site_name`. */
  brand: string;
  /** The separator between a page's own name and the brand. */
  sep: string;
  routes: {
    browse: { title: string; description: string };
    build: { description: string };
    mine: { title: string; description: string };
    edit: { title: string; description: string };
    view: { title: string; description: string };
    settings: { title: string; description: string };
    /**
     * The overlay's page.
     *
     * `title` is the name the page's own heading uses — see
     * `Strings.tracker.heading` in the web app. One thing, one name: a `<title>`
     * and a social card that called it a drop tracker while the page it opens
     * calls it a farm tracker is a link that looks like it went somewhere else.
     */
    tracker: { title: string; description: string };
  };
  /** The word for the Event category, which is not a numbered tier. */
  event: string;
  /** The unit a price is quoted in. */
  gold: string;
  /** Joins the facts in a build's description: `Axe · T6 · Frozen Plain`. */
  factSep: string;
  /** `by <author>`. */
  by: string;
  /** The plural-agnostic word beside a like count on a card. */
  likes: string;
  /** Beside the headline ability on a card, when the build names one. */
  mainSpell: string;
  /** Stands in for a title on a build whose author left it blank. */
  untitled: string;
  /** The alt text on a build's card image. */
  cardAlt: string;
  /** The alt text on the tracker page's card, which is a picture of the overlay. */
  overlayAlt: string;
  /**
   * The farm overlay's own words, for the card that depicts it.
   *
   * **Copied from `apps/tracker/src/i18n/<lang>.ts`, not translated again
   * here.** The API's tracker card is a picture of that app, and a figure
   * labelled one way on the card and another way in the overlay is a card
   * mislabelling the thing it is selling. The web app's `/tracker` page keeps
   * its own copy for the same reason and from the same source — see
   * `Strings.tracker.preview`.
   *
   * Only the six cards a fresh profile has on, which is what the card draws;
   * `DEFAULT_CARDS` in `apps/tracker/core/cards.ts` is that list.
   */
  overlay: {
    /** Which window the title bar names: `AOW5 tracker`. The brand is not translated. */
    window: string;
    /** The room line's run-in. "In hideout" but "At Frozen Tundra". */
    at: string;
    cards: Record<'session' | 'sessionGold' | 'sessionBest' | 'mapTime' | 'mapGold' | 'mapGoldAverage', string>;
    /** The loot list's three headings. Every one of them sorts, in the app. */
    columns: { name: string; unit: string; total: string };
  };
}

const EN: SeoStrings = {
  brand: 'AOW5 Builds',
  sep: ' — ',
  routes: {
    browse: {
      title: 'Build guides for Age of Weapons 5',
      description:
        'Browse build guides for the Dota 2 custom game Age of Weapons 5: one loadout per map, filed by tier, with the gear, spells and runes that clear it.',
    },
    build: {
      // A build's title is the author's, so this is only the tail of the
      // sentence — see `describeBuild`.
      description: 'A build guide for Age of Weapons 5.',
    },
    mine: { title: 'My creations', description: 'The builds you have published, and the drafts you have not.' },
    edit: {
      title: 'Build editor',
      description: 'Put a loadout together, price it, and publish it as a guide.',
    },
    view: {
      title: 'Shared loadout',
      description: 'A loadout somebody shared as a link: the gear, the spells and the runes it holds.',
    },
    settings: { title: 'Settings', description: 'Your account, the providers that vouch for it, and the language.' },
    tracker: {
      title: 'Farm tracker',
      description: 'The desktop tracker for Age of Weapons 5: watch your drops, get told about the ones worth keeping.',
    },
  },
  event: 'Event',
  gold: 'gold',
  factSep: ' · ',
  by: 'by',
  likes: 'likes',
  mainSpell: 'Main',
  untitled: 'Untitled build',
  cardAlt: 'Build card',
  overlayAlt: 'The farm overlay, with a session in progress',
  overlay: {
    window: 'tracker',
    at: 'At ',
    cards: {
      session: 'session time',
      sessionGold: 'session gold',
      sessionBest: 'session best',
      mapTime: 'current time',
      mapGold: 'current gold',
      mapGoldAverage: 'gold per map',
    },
    columns: { name: 'picked up', unit: 'val', total: 'total' },
  },
};

const RU: SeoStrings = {
  brand: 'Сборки AOW5',
  sep: ' — ',
  routes: {
    browse: {
      title: 'Гайды по сборкам для Age of Weapons 5',
      description:
        'Гайды по сборкам для пользовательской карты Dota 2 «Age of Weapons 5»: по сборке на комнату, разложенные по тирам, с предметами, способностями и рунами, которые её проходят.',
    },
    build: { description: 'Гайд по сборке для Age of Weapons 5.' },
    mine: { title: 'Мои сборки', description: 'Опубликованные сборки и черновики, которые ещё не вышли.' },
    edit: { title: 'Редактор сборок', description: 'Соберите комплект, укажите цену и опубликуйте как гайд.' },
    view: {
      title: 'Сборка по ссылке',
      description: 'Комплект, которым поделились ссылкой: предметы, способности и руны в нём.',
    },
    settings: { title: 'Настройки', description: 'Аккаунт, привязанные сервисы и язык сайта.' },
    tracker: {
      title: 'Фарм-трекер',
      description:
        'Настольный трекер для Age of Weapons 5: следит за дропом и сообщает о том, что стоит оставить.',
    },
  },
  event: 'Событие',
  gold: 'золота',
  factSep: ' · ',
  by: 'от',
  likes: 'лайков',
  mainSpell: 'Основное',
  untitled: 'Сборка без названия',
  cardAlt: 'Карточка сборки',
  overlayAlt: 'Оверлей фарм-трекера с активной сессией',
  overlay: {
    window: 'трекер',
    at: 'Комната: ',
    cards: {
      session: 'время сессии',
      sessionGold: 'золото сессии',
      sessionBest: 'лучший дроп',
      mapTime: 'время комнаты',
      mapGold: 'золото комнаты',
      mapGoldAverage: 'сред. золото',
    },
    columns: { name: 'добыча', unit: 'цена', total: 'всего' },
  },
};

const ZH: SeoStrings = {
  brand: 'AOW5 配装',
  // No spaces around the dash: CJK typography sets these tight, and a padded
  // em dash in a Chinese title reads as a gap rather than as a separator.
  sep: '—',
  routes: {
    browse: {
      title: 'Age of Weapons 5 配装攻略',
      description:
        '浏览 Dota 2 自定义游戏 Age of Weapons 5 的配装攻略：每张地图一套配装，按层级归档，包含通关所需的装备、技能与符文。',
    },
    build: { description: 'Age of Weapons 5 配装攻略。' },
    mine: { title: '我的配装', description: '你已发布的配装，以及尚未发布的草稿。' },
    edit: { title: '配装编辑器', description: '组建一套配装，标注价格，并作为攻略发布。' },
    view: { title: '分享的配装', description: '通过链接分享的一套配装：其中的装备、技能与符文。' },
    settings: { title: '设置', description: '你的账号、已绑定的服务与站点语言。' },
    tracker: {
      title: '刷图追踪器',
      description: 'Age of Weapons 5 的桌面追踪器：监控掉落，并提示值得保留的物品。',
    },
  },
  event: '活动',
  gold: '金币',
  // A middle dot with no padding, for the same reason as `sep`.
  factSep: '·',
  by: '作者',
  likes: '点赞',
  mainSpell: '主技能',
  untitled: '未命名配装',
  cardAlt: '配装卡片',
  overlayAlt: '刷图追踪器浮层，展示进行中的一场',
  overlay: {
    window: '追踪器',
    at: '在',
    cards: {
      session: '本场时长',
      sessionGold: '本场金币',
      sessionBest: '本场最佳',
      mapTime: '当前时长',
      mapGold: '当前金币',
      mapGoldAverage: '每图金币',
    },
    columns: { name: '掉落', unit: '单价', total: '合计' },
  },
};

export const SEO_STRINGS: Record<SeoLang, SeoStrings> = { en: EN, ru: RU, zh: ZH };
