import { plural } from '../kit/format';
import type { Localised } from './index';

/**
 * The FAQ's own chrome. The topics themselves are content, in
 * `content/faq.<lang>.json`; these are only the words around them.
 */
export interface FaqStrings {
  title: string;
  searchPlaceholder: string;
  /** The line under a topic in the list: how much is in it. */
  blocks: (n: number) => string;
  tables: (n: number) => string;
  subtabs: string;
  /** Under every topic: the numbers are the current patch's. */
  patchNote: string;
  pools: {
    pick: string;
    /** `dispatch_M001 · level 1 — 12 items` */
    option: (id: string, level: number, items: string) => string;
    items: (n: number) => string;
    /** The line over the grid. */
    stat: (items: string, total: string) => string;
    /** The tooltip on one entry. */
    weight: (weight: string, total: string, chance: string) => string;
    unknown: string;
  };
}

export const FAQ: Localised<FaqStrings> = {
  en: {
    title: 'FAQ',
    searchPlaceholder: 'Search topics…',
    blocks: (n) => `${n} ${plural(n, 'en', { one: 'block', other: 'blocks' })}`,
    tables: (n) => `${n} ${plural(n, 'en', { one: 'table', other: 'tables' })}`,
    subtabs: 'Sub-topics',
    patchNote: 'If something has changed in a patch, check it against your version of the game.',
    pools: {
      pick: 'Pool',
      option: (id, level, items) => `${id}${level > 0 ? ` · level ${level}` : ''} — ${items}`,
      items: (n) => `${n} ${plural(n, 'en', { one: 'item', other: 'items' })}`,
      stat: (items, total) => `Items: ${items} · sum of weights: ${total}`,
      weight: (weight, total, chance) => `Weight: ${weight} of ${total}\nChance: ${chance}`,
      unknown: 'This pool is not in the current game data.',
    },
  },
  ru: {
    title: 'FAQ',
    searchPlaceholder: 'Поиск по разделам…',
    blocks: (n) => `${n} ${plural(n, 'ru', { one: 'блок', few: 'блока', many: 'блоков', other: 'блока' })}`,
    tables: (n) => `${n} ${plural(n, 'ru', { one: 'таблица', few: 'таблицы', many: 'таблиц', other: 'таблицы' })}`,
    subtabs: 'Подразделы',
    patchNote: 'Если что-то менялось в патчах — проверяйте по своей версии игры.',
    pools: {
      pick: 'Пул',
      option: (id, level, items) => `${id}${level > 0 ? ` · уровень ${level}` : ''} — ${items}`,
      items: (n) => `${n} ${plural(n, 'ru', { one: 'предмет', few: 'предмета', many: 'предметов', other: 'предмета' })}`,
      stat: (items, total) => `Предметов: ${items} · сумма весов: ${total}`,
      weight: (weight, total, chance) => `Вес: ${weight} из ${total}\nШанс: ${chance}`,
      unknown: 'Этого пула нет в текущих данных игры.',
    },
  },
  zh: {
    title: '常见问题',
    searchPlaceholder: '搜索主题…',
    blocks: (n) => `${n} 个段落`,
    tables: (n) => `${n} 张表`,
    subtabs: '子主题',
    patchNote: '如果某些内容在更新中有所改动，请以你的游戏版本为准。',
    pools: {
      pick: '掉落池',
      option: (id, level, items) => `${id}${level > 0 ? ` · ${level}级` : ''} — ${items}`,
      items: (n) => `${n} 件物品`,
      stat: (items, total) => `物品：${items} · 权重总和：${total}`,
      weight: (weight, total, chance) => `权重：${weight} / ${total}\n几率：${chance}`,
      unknown: '当前游戏数据中没有这个掉落池。',
    },
  },
};

