import type { Lang } from '@/i18n/strings';
import { plural } from '../kit/format';
import type { Localised } from './index';

/**
 * The consumables section's words. Russian is the partner wiki's own wording;
 * English and Chinese follow the game's terms (chest, drop pool, evacuation,
 * Support Shop — see the glossaries).
 */
export interface ConsumablesStrings {
  title: string;
  searchPlaceholder: string;
  category: string;
  categories: { all: string; limited: string; container: string; plain: string };
  subtype: string;
  subclasses: Record<string, string>;
  /** `12 items`, or the empty line. */
  count: (n: number) => string;
  nothingFound: string;
  tryFilters: string;
  pickOne: string;

  // list rows
  rowCarriedOut: string;
  rowFromPool: (draws: number) => string;
  rowGold: (min: string, max: string) => string;
  rowLevel: (level: number) => string;
  rowCost: (cost: string) => string;
  rowUses: (uses: number) => string;
  rowPool: (pool: string) => string;

  // header tags
  levelTag: (level: number) => string;
  usesTag: (uses: number) => string;
  timeTag: (time: number) => string;
  towerTag: (tower: string) => string;
  unsealed: string;
  goldPerOpen: (min: string, max: string) => string;

  // tower chest block
  chestTitle: string;
  unsealedTitle: string;
  tower: string;
  towerValue: (tower: string, level: number) => string;
  runDifficulty: string;
  anyDifficulty: string;
  drawsFromPool: string;
  otherVariants: string;
  whereOpened: string;
  atBase: string;
  unsealedNote: (counts: { easy: number; normal: number; hard: number }) => string;
  chestNote: (draws: number, pool: string) => string;

  // what it gives
  gives: string;
  goldPerOpenRow: string;
  drawsPerOpen: string;
  itemFromPool: string;
  always: string;
  goldNote: (cost: string) => string;

  whatItDoes: string;
  numbers: string;

  // other sources
  otherSources: string;
  gachaTag: (chest: string) => string;
  gachaTitle: (chest: string, pools: string) => string;
  mallTag: (pack: string) => string;
  mallLine: (count: number, price: string, packed: boolean) => string;
  mallTitle: (pack: string) => string;

  // recipe
  recipe: string;
  noRecipe: string;
  needs: string;

  // pool table
  opensPool: (pool: string) => string;
  poolEmpty: string;
  colItem: string;
  colWeight: string;
  colShare: string;
  shareNoteGated: (chance: string) => string;
  shareNote: string;
  wearable: string;

  /** Said once, beside the sort, because the partner's comment says the opposite. */
  sortNote: string;
}

const forms = (lang: Lang, n: number, f: Parameters<typeof plural>[2]) => plural(n, lang, f);

export const CONSUMABLES: Localised<ConsumablesStrings> = {
  en: {
    title: 'Consumables',
    searchPlaceholder: 'Search consumables…',
    category: 'Category',
    categories: { all: 'All', limited: 'Single-use', container: 'Containers', plain: 'Regular' },
    subtype: 'Subtype',
    subclasses: { beverages: 'Drinks', treasure: 'Chests and containers', potion: 'Other', precious: 'Precious materials' },
    count: (n) => `${n} ${forms('en', n, { one: 'item', other: 'items' })}`,
    nothingFound: 'nothing found',
    tryFilters: 'Try changing the filters',
    pickOne: 'Pick a consumable on the left',

    rowCarriedOut: 'carried out by evacuation',
    rowFromPool: (draws) => `${draws} from the pool`,
    rowGold: (min, max) => `gold ${min}–${max}`,
    rowLevel: (level) => `Lv. ${level}`,
    rowCost: (cost) => `${cost} gold`,
    rowUses: (uses) => `uses: ${uses}`,
    rowPool: (pool) => `pool ${pool}`,

    levelTag: (level) => `Level ${level}`,
    usesTag: (uses) => `Uses: ${uses}`,
    timeTag: (time) => `Time: ${time}`,
    towerTag: (tower) => tower,
    unsealed: 'unsealed',
    goldPerOpen: (min, max) => `${min}–${max} per open`,

    chestTitle: 'Tower chest',
    unsealedTitle: 'Unsealed chest',
    tower: 'Tower',
    towerValue: (tower, level) => `${tower}, level ${level}`,
    runDifficulty: 'Run difficulty',
    anyDifficulty: 'any',
    drawsFromPool: 'Items from the pool',
    otherVariants: 'Other variants',
    whereOpened: 'Opened',
    atBase: 'at the base',
    unsealedNote: (c) =>
      `Picked up inside the tower and cannot be opened there. On a successful evacuation it turns into an Easy (${c.easy}), Normal (${c.normal}) or Hard (${c.hard}) chest, by the run's difficulty; on a failed one it is lost.`,
    chestNote: (draws, pool) =>
      `Opening the chest gives ${draws} draws from pool ${pool}. The variant is set by the difficulty of the run it was won in: Easy gives 70% of the Normal chest's items, Hard 150% (rounded). An unsealed chest from the tower turns into one of these on a successful evacuation.`,

    gives: 'What it gives',
    goldPerOpenRow: 'Gold per open',
    drawsPerOpen: 'Draws per open',
    itemFromPool: 'Item from the pool',
    always: 'always',
    goldNote: (cost) => `The gold is random, between the item's cost × 0.5 and × 0.8 (this item costs ${cost} gold).`,

    whatItDoes: 'What it does',
    numbers: 'Numbers',

    otherSources: 'Other sources',
    gachaTag: (chest) => `Treasure chest: ${chest}`,
    gachaTitle: (chest, pools) => `Drops from the paid treasure chest ${chest} (pools ${pools})`,
    mallTag: (pack) => `Support Shop: ${pack}`,
    mallLine: (count, price, packed) => `${count} for ${price} points${packed ? ' (boxed form)' : ''}`,
    mallTitle: (pack) => `Bundle "${pack}":`,

    recipe: 'Crafting recipe',
    noRecipe: 'There is no blueprint for this item — the recipe is open as soon as it is needed.',
    needs: 'Needed to craft',

    opensPool: (pool) => `What it opens — pool ${pool}`,
    poolEmpty: 'The pool is empty or not described in the data.',
    colItem: 'Item',
    colWeight: 'Weight',
    colShare: 'Share',
    shareNoteGated: (chance) =>
      `Share is the chance of getting this particular item when an item drops at all (by the pool's weights). An item drops in only ${chance} of opens; the rest give gold alone.`,
    shareNote: "Share is the chance of getting this particular item from one open (by the pool's weights).",
    wearable: 'cosmetic',

    sortNote: 'Most expensive first, then by name.',
  },
  ru: {
    title: 'Расходники',
    searchPlaceholder: 'Поиск расходника…',
    category: 'Категория',
    categories: { all: 'Все', limited: 'Одноразовые', container: 'Контейнеры', plain: 'Расходные' },
    subtype: 'Подтип',
    subclasses: { beverages: 'Напитки', treasure: 'Сундуки и контейнеры', potion: 'Прочее', precious: 'Ценные материалы' },
    count: (n) => `${n} ${forms('ru', n, { one: 'предмет', few: 'предмета', many: 'предметов', other: 'предмета' })}`,
    nothingFound: 'ничего не найдено',
    tryFilters: 'Попробуйте изменить фильтры',
    pickOne: 'Выберите расходник слева',

    rowCarriedOut: 'выносится эвакуацией',
    rowFromPool: (draws) => `${draws} из пула`,
    rowGold: (min, max) => `золото ${min}–${max}`,
    rowLevel: (level) => `Ур. ${level}`,
    rowCost: (cost) => `${cost} зол.`,
    rowUses: (uses) => `применений: ${uses}`,
    rowPool: (pool) => `пул ${pool}`,

    levelTag: (level) => `Уровень ${level}`,
    usesTag: (uses) => `Применений: ${uses}`,
    timeTag: (time) => `Время: ${time}`,
    towerTag: (tower) => tower,
    unsealed: 'незапечатанный',
    goldPerOpen: (min, max) => `${min}–${max} за открытие`,

    chestTitle: 'Сундук башни',
    unsealedTitle: 'Незапечатанный сундук',
    tower: 'Башня',
    towerValue: (tower, level) => `${tower}, уровень ${level}`,
    runDifficulty: 'Сложность забега',
    anyDifficulty: 'любая',
    drawsFromPool: 'Предметов из пула',
    otherVariants: 'Другие варианты',
    whereOpened: 'Где открывается',
    atBase: 'в базе',
    unsealedNote: (c) =>
      `Подбирается внутри башни, открыть его там нельзя. При удачной эвакуации превращается в простой (${c.easy}), обычный (${c.normal}) или сложный (${c.hard}) сундук — по сложности забега, при неудаче пропадает.`,
    chestNote: (draws, pool) =>
      `За открытие сундук даёт ${draws} вытяжек из пула ${pool}. Вариант задаёт сложность забега, в котором он добыт: простой — 70 % предметов от обычного, сложный — 150 % (с округлением). Незапечатанный сундук из башни превращается в один из этих вариантов при удачной эвакуации.`,

    gives: 'Что даёт',
    goldPerOpenRow: 'Золото за открытие',
    drawsPerOpen: 'Вытяжек за открытие',
    itemFromPool: 'Предмет из пула',
    always: 'всегда',
    goldNote: (cost) => `Золото выпадает случайно в диапазоне цены предмета × 0.5…0.8 (у этого предмета цена ${cost} золота).`,

    whatItDoes: 'Что делает',
    numbers: 'Числа',

    otherSources: 'Откуда ещё добывается',
    gachaTag: (chest) => `Гача: сундук ${chest}`,
    gachaTitle: (chest, pools) => `Выпадает из платного сундука ${chest} (пулы ${pools})`,
    mallTag: (pack) => `Донат-магазин: ${pack}`,
    mallLine: (count, price, packed) => `${count} шт. за ${price} очков${packed ? ' (запечатанный вид)' : ''}`,
    mallTitle: (pack) => `Набор «${pack}»:`,

    recipe: 'Рецепт крафта',
    noRecipe: 'Рецепта на этот предмет нет — состав открывается сразу, как только он нужен.',
    needs: 'Требуется для создания',

    opensPool: (pool) => `Что открывает — пул ${pool}`,
    poolEmpty: 'Пул пуст или не описан в данных.',
    colItem: 'Предмет',
    colWeight: 'Вес',
    colShare: 'Доля',
    shareNoteGated: (chance) =>
      `Доля — вероятность получить именно этот предмет, если предмет вообще выпал (по весам пула). Сам предмет выпадает только в ${chance} открытий, в остальных — одно золото.`,
    shareNote: 'Доля — вероятность получить именно этот предмет из одного открытия (по весам пула).',
    wearable: 'косметика',

    sortNote: 'Сначала дороже, затем по названию.',
  },
  zh: {
    title: '消耗品',
    searchPlaceholder: '搜索消耗品…',
    category: '类别',
    categories: { all: '全部', limited: '限次使用', container: '容器', plain: '常规' },
    subtype: '子类',
    subclasses: { beverages: '饮品', treasure: '宝箱与容器', potion: '其他', precious: '珍贵材料' },
    count: (n) => `${n} 件物品`,
    nothingFound: '未找到',
    tryFilters: '请尝试调整筛选条件',
    pickOne: '请在左侧选择消耗品',

    rowCarriedOut: '撤离后带出',
    rowFromPool: (draws) => `从掉落池抽 ${draws} 次`,
    rowGold: (min, max) => `金币 ${min}–${max}`,
    rowLevel: (level) => `${level}级`,
    rowCost: (cost) => `${cost} 金币`,
    rowUses: (uses) => `可用 ${uses} 次`,
    rowPool: (pool) => `掉落池 ${pool}`,

    levelTag: (level) => `等级 ${level}`,
    usesTag: (uses) => `可使用次数：${uses}`,
    timeTag: (time) => `时间：${time}`,
    towerTag: (tower) => tower,
    unsealed: '未封装',
    goldPerOpen: (min, max) => `每次开启 ${min}–${max}`,

    chestTitle: '秘塔宝箱',
    unsealedTitle: '未封装宝箱',
    tower: '秘塔',
    towerValue: (tower, level) => `${tower}，${level}级`,
    runDifficulty: '挑战难度',
    anyDifficulty: '任意',
    drawsFromPool: '掉落池物品数',
    otherVariants: '其他版本',
    whereOpened: '开启地点',
    atBase: '基地',
    unsealedNote: (c) =>
      `在秘塔内拾取，塔内无法开启。成功撤离后按挑战难度变为简单（${c.easy}）、普通（${c.normal}）或困难（${c.hard}）宝箱；撤离失败则消失。`,
    chestNote: (draws, pool) =>
      `开启宝箱可从掉落池 ${pool} 抽取 ${draws} 次。版本取决于获得它时的挑战难度：简单为普通宝箱物品数的 70%，困难为 150%（四舍五入）。秘塔中的未封装宝箱在成功撤离后会变为其中一种。`,

    gives: '开启所得',
    goldPerOpenRow: '每次开启金币',
    drawsPerOpen: '每次开启抽取次数',
    itemFromPool: '掉落池物品',
    always: '必定',
    goldNote: (cost) => `金币随机，介于物品价格 × 0.5 至 × 0.8 之间（此物品价格为 ${cost} 金币）。`,

    whatItDoes: '效果',
    numbers: '数值',

    otherSources: '其他获取途径',
    gachaTag: (chest) => `珍宝箱：${chest}`,
    gachaTitle: (chest, pools) => `可从付费珍宝箱 ${chest} 中开出（掉落池 ${pools}）`,
    mallTag: (pack) => `商城：${pack}`,
    mallLine: (count, price, packed) => `${count} 个，${price} 点${packed ? '（封装形式）' : ''}`,
    mallTitle: (pack) => `礼包「${pack}」：`,

    recipe: '合成配方',
    noRecipe: '此物品没有图纸——需要时配方即已开放。',
    needs: '合成所需',

    opensPool: (pool) => `开启内容 — 掉落池 ${pool}`,
    poolEmpty: '掉落池为空或数据中没有描述。',
    colItem: '物品',
    colWeight: '权重',
    colShare: '占比',
    shareNoteGated: (chance) =>
      `占比为掉落物品时恰好获得该物品的概率（按掉落池权重）。仅 ${chance} 的开启会掉落物品，其余只给金币。`,
    shareNote: '占比为一次开启获得该物品的概率（按掉落池权重）。',
    wearable: '饰品',

    sortNote: '价格从高到低，然后按名称。',
  },
};
