import type { Localised } from './index';

/** The words every section uses: search, reset, empty states, the data footer. */
export interface CommonStrings {
  search: string;
  reset: string;
  all: string;
  loading: string;
  failed: string;
  /** `12 of 340` under a filtered list. */
  found: (shown: number, total: number) => string;
  /** When a list stops short of everything that matched. */
  capped: (shown: number, total: number) => string;
  nothing: string;
  pickOne: string;
  /** A wiki address whose record is not in the data. */
  missing: string;
  missingBody: string;
  /** The footer under every section: which season's rules, and when the data was read. */
  footer: (ruleset: string, built: string) => string;
  level: string;
  levelShort: (level: number) => string;
  gold: string;
  units: { hours: string; minutes: string; seconds: string };
  /** The exchange-price field shared by the item, consumable and crafting pages. */
  auction: { label: string; title: string; unit: string };
}

export const COMMON: Localised<CommonStrings> = {
  en: {
    search: 'Search…',
    reset: 'Reset filters',
    all: 'All',
    loading: 'Loading…',
    failed: 'Could not load this section.',
    found: (shown, total) => `${shown} of ${total}`,
    capped: (shown, total) => `Showing the first ${shown} of ${total}`,
    nothing: 'Nothing matches.',
    pickOne: 'Pick one on the left',
    missing: 'Not in the wiki',
    missingBody: 'This address names nothing in the current game data. It may have been removed in a patch.',
    footer: (ruleset, built) => `Rules: ${ruleset} · data read ${built}`,
    level: 'Level',
    levelShort: (level) => `Lv. ${level}`,
    gold: 'gold',
    units: { hours: 'h', minutes: 'min', seconds: 's' },
    auction: {
      label: 'Exchange',
      title: 'What this sells for on the Exchange. Shared across the wiki: Crafting uses it to decide whether buying beats crafting.',
      unit: 'gold',
    },
  },
  ru: {
    search: 'Поиск…',
    reset: 'Сбросить фильтры',
    all: 'Все',
    loading: 'Загрузка…',
    failed: 'Не удалось загрузить раздел.',
    found: (shown, total) => `${shown} из ${total}`,
    capped: (shown, total) => `Показаны первые ${shown} из ${total}`,
    nothing: 'Ничего не найдено.',
    pickOne: 'Выберите слева',
    missing: 'Нет в вики',
    missingBody: 'По этому адресу в текущих данных игры ничего нет. Возможно, это убрали патчем.',
    footer: (ruleset, built) => `Правила: ${ruleset} · данные собраны ${built}`,
    level: 'Уровень',
    levelShort: (level) => `ур. ${level}`,
    gold: 'зол.',
    units: { hours: 'ч', minutes: 'мин', seconds: 'с' },
    auction: {
      label: 'Биржа',
      title: 'Цена этого предмета на бирже (аукционе). Общая для всей вики — по ней «Крафт» считает, что дешевле: купить или скрафтить.',
      unit: 'зол.',
    },
  },
  zh: {
    search: '搜索…',
    reset: '重置筛选',
    all: '全部',
    loading: '加载中…',
    failed: '无法加载此分区。',
    found: (shown, total) => `${shown} / ${total}`,
    capped: (shown, total) => `仅显示前 ${shown} 项，共 ${total} 项`,
    nothing: '没有匹配项。',
    pickOne: '请在左侧选择',
    missing: '百科中没有此项',
    missingBody: '当前游戏数据中没有此地址对应的内容，可能已在更新中移除。',
    footer: (ruleset, built) => `规则：${ruleset} · 数据读取于 ${built}`,
    level: '等级',
    levelShort: (level) => `${level}级`,
    gold: '金币',
    units: { hours: '小时', minutes: '分', seconds: '秒' },
    auction: {
      label: '交易所',
      title: '此物品在交易所的价格。全百科共用：合成页据此判断买还是造更划算。',
      unit: '金币',
    },
  },
};
