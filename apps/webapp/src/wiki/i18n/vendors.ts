import { plural } from '../kit/format';
import type { Localised } from './index';

/**
 * The vendors section: its labels and the wiki author's explanations of how
 * each merchant fills its shelves.
 *
 * Russian is the author's wording. Numbers that come from data are passed in;
 * the mechanics the prose describes (the 4-drop unlock, the ×1.5…×3.5 roll,
 * the coin divisor) are the partner wiki's statements, and the page marks
 * them as such.
 */
export interface VendorsStrings {
  title: string;
  wipTitle: string;
  wipBody: string;
  tabs: { regular: string; ancient: string; guild: string };
  guildTabs: { tasks: string; exchange: string };

  // the shared filter bar
  searchPlaceholder: string;
  qualityLabel: string;
  qualityAny: string;
  qualityTitle: (quality: number, name: string) => string;
  hideRecipes: (count: number) => string;
  hideRecipesTitle: string;
  nothing: string;

  // an item cell
  qualityShort: (quality: number) => string;
  precious: string;
  inStock: (count: number) => string;
  itemCost: (cost: string) => string;

  // headers
  code: (npc: string, currency: string) => string;
  refreshTag: (time: string, pct: number) => string;
  refreshTitle: (base: string, fastest: string, partner: string | null) => string;
  manualRefresh: (item: string, count: number) => string;
  clientDefault: string;

  // the partner's figures
  partnerMark: string;
  partnerFootnote: (version: string) => string;
  snapshot: (version: string) => string;

  // regular merchant
  formulaSlots: (count: number) => string;
  regularRule: string;
  fixedTitle: (count: number) => string;
  fixedTail: string;
  shopLevel: string;
  shopLevelTitle: (level: number, count: number) => string;
  regularPoolNote: (level: number, count: number, total: number, minMul: string, maxMul: string, precious: boolean) => string;
  chanceNote: (slots: number) => string;
  stockTitle: (count: number) => string;
  priceTitle: string;
  preciousTitle: (price: string) => string;
  equipHint: string;
  unlockHint: string;
  countRule: string;
  goldUnit: string;

  // ancient merchant
  totalSlots: (formula: string) => string;
  ancientRule: string;
  needsLevel: (level: number) => string;
  forGold: string;
  forGoldTitle: (minMul: string, maxMul: string) => string;
  coins: (amount: string) => string;
  coinsTitle: (amount: string) => string;
  priceRank: string;
  ancientPoolNote: (formula: string) => string;
  coinRangeTitle: string;
  ancientHint: string;
  sellBack: string;

  // guild merchant
  guildCurrency: string;
  orderRefresh: (item: string, count: number) => string;
  taskReset: (count: number) => string;
  refreshLimit: (count: number) => string;
  guildRule: string;
  slotsTag: (from: number, to: number) => string;
  dailyTag: (count: number) => string;
  targetTag: (count: number, points: number) => string;
  rewardsTitle: string;
  rewardsHead: { level: string; value: string; slots: string; points: string; chest: string };
  levelName: (level: number) => string;
  runesTitle: string;
  difficulty: (level: number) => string;
  difficultyHead: string;
  runeNeed: string;
  runeChance: string;
  runeReward: string;
  acceptsTitle: string;
  orderAll: string;
  ordersNote: string;
  needTitle: (min: number, max: number, level: string) => string;
  orderLevelTitle: (level: string) => string;

  // point exchange
  dailyExchanges: (from: number, to: number, perSlot: number) => string;
  refreshes: (count: number) => string;
  exchangeRule: (divisor: number, base: number, floor: number, cap: number, from: number, to: number, perSlot: number, refreshes: number) => string;
  offersTitle: (count: number) => string;
  offersNote: (count: number, cap: number, manual: string | null) => string;
  manualNote: (item: string, price: number) => string;
  pointsUnit: string;
  formulaTitle: (cost: string, divisor: number, base: number, quality: number, floor: number) => string;
  manualTitle: string;

  // talents
  talentsTitle: string;
  talentTag: (name: string) => string;
  talentTitle: (name: string, id: string, tree: string) => string;
  talentOpen: string;
  talentUnknown: string;
  effects: Record<string, (value: number) => string>;
}

export const VENDORS: Localised<VendorsStrings> = {
  en: {
    title: 'Vendors',
    wipTitle: 'Work in progress',
    wipBody: 'The data is still being checked and the layout will change.',
    tabs: { regular: 'Regular merchant', ancient: 'Ancient Merchant', guild: 'Guild Merchant' },
    guildTabs: { tasks: 'Hand-ins (orders)', exchange: 'Buying (point exchange)' },

    searchPlaceholder: 'Search item…',
    qualityLabel: 'Quality',
    qualityAny: 'Any quality',
    qualityTitle: (quality, name) => `Quality ${quality} — ${name}`,
    hideRecipes: (count) => `Hide blueprints${count > 0 ? ` (${count})` : ''}`,
    hideRecipesTitle: 'Blueprints drop once and are not always wanted on a shopping list',
    nothing: 'Nothing matches the filters.',

    qualityShort: (quality) => `q. ${quality}`,
    precious: 'precious',
    inStock: (count) => `in stock: ${count}`,
    itemCost: (cost) => `Item cost: ${cost} gold`,

    code: (npc, currency) => `${npc} · currency: ${currency}`,
    refreshTag: (time, pct) => `Restock: ${time} (−${pct}% from talents)`,
    refreshTitle: (base, fastest, partner) =>
      `The client's restock interval is ${base}; each point of shop_time from talents takes 1% off, down to ${fastest}.` +
      (partner === null ? '' : ` The partner wiki states ${partner}.`),
    manualRefresh: (item, count) => `Manual refresh: ${item} ×${count}/day`,
    clientDefault: "The client's default; the server may send another value.",

    partnerMark: "Stated by the partner wiki: the game keeps this in encrypted server code, so it is not read from the game's files.",
    partnerFootnote: (version) =>
      `Values marked * are the partner wiki's (its ${version} snapshot): the vendors' server code is encrypted, so prices, fixed stock and order rules cannot be read from the game files.`,
    snapshot: (version) => `from the wiki's ${version} snapshot`,

    formulaSlots: (count) => `Blueprints on display: up to ${count}`,
    regularRule:
      'The merchant builds his display from scratch every time: five permanent slots, basic consumables, equipment no higher than the shop level, and "unlocked" items — those that have dropped for you 4 or more times (they weigh double in the draw). Shop level = 1 + shop_level from the talent tree (the Craftsman Talent tree).',
    fixedTitle: (count) => `Permanent slots (${count})`,
    fixedTail: 'Always in the shop',
    shopLevel: 'Shop level',
    shopLevelTitle: (level, count) => `Shop level ${level}: ${count} candidate items`,
    regularPoolNote: (level, count, total, minMul, maxMul, precious) =>
      `The list below is the reference of candidates by shop level: at shop level ${level} it holds ${count} item${count === 1 ? '' : 's'} (${total} in the data), but not all of them reach the display: equipment comes by shop level, while materials and the rest only once they have dropped for you 4+ times (see the hints on the cards). At each restock the price is rolled at ×${minMul}…×${maxMul} of the item's cost` +
      (precious ? ', and precious items take another ×1.5, rounded to hundreds' : '') +
      '.',
    chanceNote: (slots) =>
      `Slots are drawn from the set by weight: "unlocked" items weigh 2, basic consumables and equipment weigh 1. On top of that, up to ${slots} slots go to blueprints of recipes you have not unlocked yet.`,
    stockTitle: (count) => `Stock (${count})`,
    priceTitle: 'The price is rolled anew at every restock',
    preciousTitle: (price) => `Precious: up to ${price} gold`,
    equipHint: 'Equipment: reaches the display by shop level',
    unlockHint: 'Reaches the display only after it has dropped for you 4+ times',
    countRule: 'Stack size of one slot: 1 + min(4, ⌊drops / 3⌋) — that is, 1 to 5; precious items always 1.',
    goldUnit: 'gold',

    totalSlots: (formula) => `Slots in all: ${formula}`,
    ancientRule:
      'The merchant sells for Ancient Coins: eight permanent slots, and random ones — from basic consumables and "unlocked" items that have dropped for you 4 or more times (those marked "sellable to the Ancient Merchant"). The random part does not depend on the shop level — only on your drop counter and the ancient_shop_count talents. The coin price is floor(gold price / 5), where the gold price is ×1.5…×3.5 of the item\'s cost.',
    needsLevel: (level) => `needs level ${level}`,
    forGold: 'for gold',
    forGoldTitle: (minMul, maxMul) =>
      `Sold for gold by the same formula as the regular merchant (×${minMul}…×${maxMul} of the item's cost)`,
    coins: (amount) => `${amount} coins`,
    coinsTitle: (amount) => `Price: ${amount} Ancient Coins`,
    priceRank: "Price of a random item = floor(gold price / 5), where the gold price is ×1.5…×3.5 of ItemCost.",
    ancientPoolNote: (formula) =>
      `The merchant sells these items for Ancient Coins: price = floor(gold price / 5), where the gold price is ×1.5…×3.5 of the item's cost — hence the range on the label. Only items that have dropped for you 4+ times reach the random slots (you did not have to pick them up). With them he fills up to ${formula}.`,
    coinRangeTitle: 'Price in Ancient Coins (a range: it is re-rolled at every restock)',
    ancientHint: 'Reaches the display only after it has dropped for you 4+ times',
    sellBack: 'He buys items from you for gold only, at the ordinary sale price (half the item\'s cost).',

    guildCurrency: 'Bounty Gold and exchange points',
    orderRefresh: (item, count) => `Order refresh: ${item} ×${count}`,
    taskReset: (count) => `Order reset: ×${count}`,
    refreshLimit: (count) => `Refresh limit: ${count}/day`,
    guildRule: 'Acquisition orders (handing items in) and the point exchange. Order levels: Common, Advanced, Rare, Master.',
    slotsTag: (from, to) => `Order slots: ${from} → ${to}`,
    dailyTag: (count) => `Orders a day: up to ${count}`,
    targetTag: (count, points) => `Daily goal: ${count} orders → ${points} points`,
    rewardsTitle: 'Rewards by order level',
    rewardsHead: { level: 'Order level', value: 'Order value', slots: 'Slots', points: 'Exchange points', chest: 'Chest' },
    levelName: (level) => `Level ${level}`,
    runesTitle: 'Rune orders',
    difficulty: (level) => `Difficulty ${level}`,
    difficultyHead: 'Difficulty',
    runeNeed: 'Asks for',
    runeChance: 'Chance',
    runeReward: 'Reward (one of)',
    acceptsTitle: 'What orders accept',
    orderAll: 'All levels',
    ordersNote:
      'The order level sets which materials can appear in an order and how many are asked for. The same material can fit several levels — then it is shown on each, with its own background. The quantity is derived from the batch\'s target value and the item\'s cost, so cheap materials are asked for in bulk (a Broken Branch, up to 10) and expensive ones in ones and twos. An order only asks for a material that has dropped for you at least once (the same drop counter that unlocks items in the shop); precious materials are outside that rule and always appear in orders.',
    needTitle: (min, max, level) => `${min}–${max} needed for a "${level}" order`,
    orderLevelTitle: (level) => `Order level: ${level}`,

    dailyExchanges: (from, to, perSlot) => `Exchanges a day: ${from} → ${to} (+${perSlot} per slot)`,
    refreshes: (count) => `Refreshes: ${count}/day`,
    exchangeRule: (divisor, base, floor, cap, from, to, perSlot, refreshes) =>
      `Offer price in points = ceil(ItemCost / ${divisor}) + ${base} + max(0, quality − ${floor}), at most ${cap}. Exchanges a day: ${from}, up to ${to} (+${perSlot} per unlocked order slot). Refresh — ${refreshes} times a day.`,
    offersTitle: (count) => `Offers (${count})`,
    offersNote: (count, cap, manual) =>
      `The merchant only puts up items that have exchange stock in the data (ExchangeInventory): there are ${count} of them. Price in points = ceil(item cost / 150) + 20 + max(0, quality − 3), but no more than ${cap}` +
      (manual === null ? '' : `; ${manual}`) +
      '.',
    manualNote: (item, price) => `${item} has a hand-set price of ${price}`,
    pointsUnit: 'pts',
    formulaTitle: (cost, divisor, base, quality, floor) => `Formula: ⌈${cost}/${divisor}⌉ + ${base} + max(0, ${quality}−${floor})`,
    manualTitle: 'Price set by hand in the config',

    talentsTitle: 'What progression gives',
    talentTag: (name) => `Talent: ${name}`,
    talentTitle: (name, id, tree) => `${name} (${id}) — the "${tree}" tree`,
    talentOpen: 'Click to show the node in the talent tree',
    talentUnknown: 'The talent trees have not loaded; showing the talent ids.',
    effects: {
      shop_level: (v) => `Shop level +${v}`,
      shop_count: (v) => `Shop slots +${v}`,
      shop_time: (v) => `Restock time −${v}%`,
      ancient_shop_level: (v) => `Ancient shop level +${v}`,
      ancient_shop_count: (v) => `Ancient shop slots +${v}`,
      merchant_daily_task_reward_bonus: (v) => `Daily order reward +${v}%`,
    },
  },
  ru: {
    title: 'Продавцы',
    wipTitle: 'Вкладка в работе (WIP)',
    wipBody: 'Данные уточняются, оформление ещё будет меняться.',
    tabs: { regular: 'Обычный торговец', ancient: 'Древний торговец', guild: 'Гильдейский торговец' },
    guildTabs: { tasks: 'Сдача предметов (заказы)', exchange: 'Покупка (обмен очков)' },

    searchPlaceholder: 'Поиск предмета…',
    qualityLabel: 'Качество',
    qualityAny: 'Любое качество',
    qualityTitle: (quality, name) => `Качество ${quality} — ${name}`,
    hideRecipes: (count) => `Убрать рецепты${count > 0 ? ` (${count})` : ''}`,
    hideRecipesTitle: 'Рецепты (чертежи) выпадают один раз и не всегда нужны в списке покупок',
    nothing: 'Под фильтры ничего не подошло.',

    qualityShort: (quality) => `кач. ${quality}`,
    precious: 'драгоценный',
    inStock: (count) => `в наличии ${count}`,
    itemCost: (cost) => `Цена предмета: ${cost} зол.`,

    code: (npc, currency) => `${npc} · валюта: ${currency}`,
    refreshTag: (time, pct) => `Обновление: ${time} (−${pct} % от прокачки)`,
    refreshTitle: (base, fastest, partner) =>
      `Интервал обновления в клиенте — ${base}; каждое очко shop_time из талантов снимает 1 %, до ${fastest}.` +
      (partner === null ? '' : ` Вики-партнёр указывает ${partner}.`),
    manualRefresh: (item, count) => `Ручное обновление: ${item} ×${count}/день`,
    clientDefault: 'Значение клиента по умолчанию; сервер может прислать другое.',

    partnerMark: 'Со слов вики-партнёра: игра держит это в зашифрованном серверном коде, из файлов игры не читается.',
    partnerFootnote: (version) =>
      `Значения со звёздочкой * — из вики-партнёра (снимок ${version}): серверный код торговцев зашифрован, поэтому цены, постоянные позиции и правила заказов из файлов игры не прочитать.`,
    snapshot: (version) => `из снимка вики ${version}`,

    formulaSlots: (count) => `Чертежей в витрине: до ${count}`,
    regularRule:
      'Витрину торговец собирает каждый раз заново: пять постоянных позиций, базовые расходники, снаряжение не выше уровня лавки и «открытые» предметы — те, что уже выпадали вам 4 и более раз (они в наборе с двойным весом). Уровень лавки = 1 + shop_level из дерева талантов (ветка «Талант ремесленника»).',
    fixedTitle: (count) => `Постоянные позиции (${count})`,
    fixedTail: 'Есть в лавке всегда',
    shopLevel: 'Уровень лавки',
    shopLevelTitle: (level, count) => `Уровень лавки ${level}: кандидатов ${count}`,
    regularPoolNote: (level, count, total, minMul, maxMul, precious) =>
      `Список ниже — справочник кандидатов по уровню лавки: при уровне лавки ${level} в него входит ${count} ${plural(count, 'ru', { one: 'предмет', few: 'предмета', many: 'предметов', other: 'предмета' })} (всего в данных ${total}), но в витрину из них попадут не все: снаряжение — по уровню лавки, а материалы и прочее — только после того, как выпадали вам 4+ раз (см. подсказки на карточках). Цена при обновлении берётся случайно в диапазоне ×${minMul}…×${maxMul} от цены предмета` +
      (precious ? ', у «драгоценных» ещё ×1.5 и округление до сотен' : '') +
      '.',
    chanceNote: (slots) =>
      `Позиции выбираются из набора взвешенно: «открытые» предметы — вес 2, базовые расходники и снаряжение — вес 1. Плюс до ${slots} позиций занимают чертежи ещё не открытых рецептов.`,
    stockTitle: (count) => `Ассортимент (${count})`,
    priceTitle: 'Цена выбирается случайно при каждом обновлении',
    preciousTitle: (price) => `Драгоценный: до ${price} зол.`,
    equipHint: 'Снаряжение: попадает в витрину по уровню лавки',
    unlockHint: 'Появится в витрине только после того, как выпадало вам 4+ раз',
    countRule: 'Стопка одной позиции: 1 + min(4, ⌊выпадений / 3⌋) — то есть от 1 до 5 штук; у «драгоценных» всегда 1.',
    goldUnit: 'зол.',

    totalSlots: (formula) => `Позиций всего: ${formula}`,
    ancientRule:
      'Торговец продаёт за древние монеты: восемь постоянных позиций и случайные — из базовых расходников и «открытых» предметов, которые выпадали вам 4 и более раз (с пометкой «продаётся древнему»). Случайная часть не зависит от уровня лавки — только от вашего счётчика выпадений и от талантов ancient_shop_count. Цена в монетах — floor(цена в золоте / 5), где цена в золоте ×1.5…×3.5 от цены предмета.',
    needsLevel: (level) => `нужен уровень ${level}`,
    forGold: 'по цене золотом',
    forGoldTitle: (minMul, maxMul) =>
      `Продаётся за золото по той же формуле, что у обычного торговца (×${minMul}…×${maxMul} от цены предмета)`,
    coins: (amount) => `${amount} мон.`,
    coinsTitle: (amount) => `Цена: ${amount} древних монет`,
    priceRank: 'Цена случайного предмета = floor(цена в золоте / 5), где цена в золоте ×1.5…×3.5 от ItemCost.',
    ancientPoolNote: (formula) =>
      `Торговец продаёт эти предметы за древние монеты: цена = floor(цена в золоте / 5), где цена в золоте ×1.5…×3.5 от цены предмета, поэтому в подписи диапазон. В случайные позиции из списка попадают только те предметы, которые выпадали вам 4+ раз (подбирать их было не обязательно). Помимо них он добирает до ${formula}.`,
    coinRangeTitle: 'Цена в древних монетах (диапазон: цена пересчитывается при обновлении)',
    ancientHint: 'Появится в витрине только после того, как выпадало вам 4+ раз',
    sellBack: 'Древними монетами торговец берёт только свою выручку — предметы у игрока он скупает за золото по обычной цене продажи (половина цены предмета).',

    guildCurrency: 'Наградные монеты и очки обмена',
    orderRefresh: (item, count) => `Обновление заказов: ${item} ×${count}`,
    taskReset: (count) => `Сброс заказа: ×${count}`,
    refreshLimit: (count) => `Лимит обновлений: ${count}/день`,
    guildRule: 'Заказы на закупку (сдача предметов) и обмен очков. Уровни заказов: обычный, продвинутый, редкий, мастер.',
    slotsTag: (from, to) => `Слотов заказов: ${from} → ${to}`,
    dailyTag: (count) => `Заказов в день: до ${count}`,
    targetTag: (count, points) => `Цель дня: ${count} заказов → ${points} очков`,
    rewardsTitle: 'Награды по уровням заказа',
    rewardsHead: { level: 'Уровень заказа', value: 'Ценность заказа', slots: 'Слотов', points: 'Очки обмена', chest: 'Сундук' },
    levelName: (level) => `Уровень ${level}`,
    runesTitle: 'Рунные заказы',
    difficulty: (level) => `Сложность ${level}`,
    difficultyHead: 'Сложность',
    runeNeed: 'Нужно',
    runeChance: 'Шанс',
    runeReward: 'Награда (одна из)',
    acceptsTitle: 'Что принимают в заказ',
    orderAll: 'Все уровни',
    ordersNote:
      'Уровень заказа задаёт, какие материалы могут попасть в заказ и сколько их попросят. Один и тот же материал может подходить нескольким уровням — тогда он показан на каждом со своим фоном. Количество считается от целевой ценности партии и стоимости предмета, поэтому дешёвых материалов просят много (например «Сломанная ветка» — до 10 шт.), а дорогих мало. В заказ попадает только материал, который выпадал вам хотя бы раз (это тот же счётчик выпадений, что открывает предметы в лавке); «драгоценные» материалы — вне этого правила, они в заказах всегда.',
    needTitle: (min, max, level) => `Нужно ${min}–${max} шт. для заказа уровня «${level}»`,
    orderLevelTitle: (level) => `Уровень заказа: ${level}`,

    dailyExchanges: (from, to, perSlot) => `Обменов в день: ${from} → ${to} (+${perSlot} за слот)`,
    refreshes: (count) => `Обновлений: ${count}/день`,
    exchangeRule: (divisor, base, floor, cap, from, to, perSlot, refreshes) =>
      `Цена предложения в очках = ceil(ItemCost / ${divisor}) + ${base} + max(0, качество − ${floor}), но не больше ${cap}. Обменов в день: ${from}, максимум ${to} (+${perSlot} за открытый слот заказа). Обновление — ${refreshes} раза в день.`,
    offersTitle: (count) => `Предложения (${count})`,
    offersNote: (count, cap, manual) =>
      `Торговец выставляет только предметы с запасом в данных (ExchangeInventory): таких ${count}. Цена в очках = ceil(цена предмета / 150) + 20 + max(0, качество − 3), но не больше ${cap}` +
      (manual === null ? '' : `; ${manual}`) +
      '.',
    manualNote: (item, price) => `у «${item}» цена задана вручную — ${price}`,
    pointsUnit: 'очк.',
    formulaTitle: (cost, divisor, base, quality, floor) => `Формула: ⌈${cost}/${divisor}⌉ + ${base} + max(0, ${quality}−${floor})`,
    manualTitle: 'Цена задана вручную в конфиге',

    talentsTitle: 'Что даёт прокачка',
    talentTag: (name) => `Талант: ${name}`,
    talentTitle: (name, id, tree) => `${name} (${id}) — ветка «${tree}»`,
    talentOpen: 'Клик — показать узел в дереве прокачки',
    talentUnknown: 'Деревья талантов не загрузились — показаны коды талантов.',
    effects: {
      shop_level: (v) => `Уровень лавки +${v}`,
      shop_count: (v) => `Позиций в лавке +${v}`,
      shop_time: (v) => `Время обновления −${v} %`,
      ancient_shop_level: (v) => `Уровень древней лавки +${v}`,
      ancient_shop_count: (v) => `Позиций у древнего торговца +${v}`,
      merchant_daily_task_reward_bonus: (v) => `Награда за ежедневные заказы +${v} %`,
    },
  },
  zh: {
    title: '商人',
    wipTitle: '施工中（WIP）',
    wipBody: '数据仍在核对，页面布局之后还会调整。',
    tabs: { regular: '普通商贩', ancient: '远古商贩', guild: '会馆商人' },
    guildTabs: { tasks: '交付物品（订单）', exchange: '购买（积分兑换）' },

    searchPlaceholder: '搜索物品…',
    qualityLabel: '品质',
    qualityAny: '任意品质',
    qualityTitle: (quality, name) => `品质 ${quality} — ${name}`,
    hideRecipes: (count) => `隐藏图纸${count > 0 ? `（${count}）` : ''}`,
    hideRecipesTitle: '图纸只掉落一次，购物清单里往往用不到',
    nothing: '没有符合筛选条件的物品。',

    qualityShort: (quality) => `品质 ${quality}`,
    precious: '珍贵',
    inStock: (count) => `库存 ${count}`,
    itemCost: (cost) => `物品价格：${cost} 金币`,

    code: (npc, currency) => `${npc} · 货币：${currency}`,
    refreshTag: (time, pct) => `刷新：${time}（天赋最多 −${pct}%）`,
    refreshTitle: (base, fastest, partner) =>
      `客户端的刷新间隔为 ${base}；天赋每 1 点 shop_time 减少 1%，最短 ${fastest}。` +
      (partner === null ? '' : `合作百科给出的数值为 ${partner}。`),
    manualRefresh: (item, count) => `手动刷新：${item} ×${count}/天`,
    clientDefault: '客户端默认值；服务器可能下发其他数值。',

    partnerMark: '来自合作百科：游戏把这部分写在加密的服务器代码里，无法从游戏文件读取。',
    partnerFootnote: (version) =>
      `带 * 的数值来自合作百科（其 ${version} 快照）：商人的服务器代码是加密的，价格、固定货位和订单规则无法从游戏文件中读取。`,
    snapshot: (version) => `取自百科 ${version} 快照`,

    formulaSlots: (count) => `货架上的图纸：最多 ${count} 个`,
    regularRule:
      '商贩每次都会重新摆货：五个固定货位、基础消耗品、不高于商店等级的装备，以及“已解锁”物品——即已为你掉落 4 次及以上的物品（在抽取中权重翻倍）。商店等级 = 1 + 天赋树中的 shop_level（「工匠天赋」）。',
    fixedTitle: (count) => `固定货位（${count}）`,
    fixedTail: '商店中始终有售',
    shopLevel: '商店等级',
    shopLevelTitle: (level, count) => `商店等级 ${level}：${count} 件候选物品`,
    regularPoolNote: (level, count, total, minMul, maxMul, precious) =>
      `下方是按商店等级列出的候选物品：商店等级 ${level} 时共 ${count} 件（数据中共 ${total} 件），但并非都会上架：装备按商店等级出现，材料等其他物品只有在为你掉落 4 次以上后才会出现（见卡片提示）。每次刷新时价格在物品价格的 ×${minMul}…×${maxMul} 之间随机` +
      (precious ? '，珍贵物品再 ×1.5 并取整到百' : '') +
      '。',
    chanceNote: (slots) => `货位按权重从集合中抽取：“已解锁”物品权重 2，基础消耗品和装备权重 1。此外最多 ${slots} 个货位留给尚未解锁配方的图纸。`,
    stockTitle: (count) => `货品（${count}）`,
    priceTitle: '每次刷新时随机定价',
    preciousTitle: (price) => `珍贵物品：最高 ${price} 金币`,
    equipHint: '装备：按商店等级上架',
    unlockHint: '为你掉落 4 次以上后才会上架',
    countRule: '单个货位的数量：1 + min(4, ⌊掉落次数 / 3⌋)，即 1–5 件；珍贵物品始终为 1。',
    goldUnit: '金币',

    totalSlots: (formula) => `货位总数：${formula}`,
    ancientRule:
      '远古商贩以远古币出售：八个固定货位，其余为随机货位——取自基础消耗品和为你掉落过 4 次以上的“已解锁”物品（标记为“可售予远古商贩”）。随机部分与商店等级无关，只取决于你的掉落计数和 ancient_shop_count 天赋。远古币价格为 floor(金币价格 / 5)，金币价格为物品价格的 ×1.5…×3.5。',
    needsLevel: (level) => `需要 ${level} 级`,
    forGold: '以金币出售',
    forGoldTitle: (minMul, maxMul) => `按普通商贩的同一公式以金币出售（物品价格的 ×${minMul}…×${maxMul}）`,
    coins: (amount) => `${amount} 币`,
    coinsTitle: (amount) => `价格：${amount} 远古币`,
    priceRank: '随机物品价格 = floor(金币价格 / 5)，金币价格为 ItemCost 的 ×1.5…×3.5。',
    ancientPoolNote: (formula) =>
      `商贩以远古币出售这些物品：价格 = floor(金币价格 / 5)，金币价格为物品价格的 ×1.5…×3.5，所以标签上是一个区间。只有为你掉落过 4 次以上的物品才会进入随机货位（无需拾取）。货位总数补足到 ${formula}。`,
    coinRangeTitle: '远古币价格（区间：每次刷新重新计算）',
    ancientHint: '为你掉落 4 次以上后才会上架',
    sellBack: '远古币只用于向他购买——他向玩家收购物品时只付金币，按普通出售价（物品价格的一半）。',

    guildCurrency: '悬赏金币与兑换积分',
    orderRefresh: (item, count) => `刷新订单：${item} ×${count}`,
    taskReset: (count) => `重置订单：×${count}`,
    refreshLimit: (count) => `刷新上限：${count}/天`,
    guildRule: '收购订单（交付物品）与积分兑换。订单等级：普通、进阶、稀有、大师。',
    slotsTag: (from, to) => `订单栏位：${from} → ${to}`,
    dailyTag: (count) => `每日订单：最多 ${count}`,
    targetTag: (count, points) => `每日目标：${count} 单 → ${points} 积分`,
    rewardsTitle: '各订单等级的奖励',
    rewardsHead: { level: '订单等级', value: '订单价值', slots: '栏位', points: '兑换积分', chest: '宝箱' },
    levelName: (level) => `${level} 级`,
    runesTitle: '符印订单',
    difficulty: (level) => `难度 ${level}`,
    difficultyHead: '难度',
    runeNeed: '需求',
    runeChance: '概率',
    runeReward: '奖励（其一）',
    acceptsTitle: '订单收取的物品',
    orderAll: '全部等级',
    ordersNote:
      '订单等级决定哪些材料会出现在订单中以及需求数量。同一种材料可能适用于多个等级——此时它会在每个等级下以不同底色显示。数量按批次目标价值与物品价格计算，所以便宜的材料要得多（例如“断枝”最多 10 个），贵的要得少。订单只会要求至少为你掉落过一次的材料（与解锁商店物品的是同一个掉落计数）；珍贵材料不受此限制，总会出现在订单中。',
    needTitle: (min, max, level) => `“${level}”订单需要 ${min}–${max} 个`,
    orderLevelTitle: (level) => `订单等级：${level}`,

    dailyExchanges: (from, to, perSlot) => `每日兑换：${from} → ${to}（每个栏位 +${perSlot}）`,
    refreshes: (count) => `刷新：${count}/天`,
    exchangeRule: (divisor, base, floor, cap, from, to, perSlot, refreshes) =>
      `商品积分价格 = ceil(ItemCost / ${divisor}) + ${base} + max(0, 品质 − ${floor})，最高 ${cap}。每日兑换 ${from} 次，最多 ${to} 次（每解锁一个订单栏位 +${perSlot}）。每天可刷新 ${refreshes} 次。`,
    offersTitle: (count) => `商品（${count}）`,
    offersNote: (count, cap, manual) =>
      `商人只上架数据中有兑换库存（ExchangeInventory）的物品：共 ${count} 件。积分价格 = ceil(物品价格 / 150) + 20 + max(0, 品质 − 3)，最高 ${cap}` +
      (manual === null ? '' : `；${manual}`) +
      '。',
    manualNote: (item, price) => `“${item}”的价格为手动设定：${price}`,
    pointsUnit: '积分',
    formulaTitle: (cost, divisor, base, quality, floor) => `公式：⌈${cost}/${divisor}⌉ + ${base} + max(0, ${quality}−${floor})`,
    manualTitle: '价格在配置中手动设定',

    talentsTitle: '天赋带来的提升',
    talentTag: (name) => `天赋：${name}`,
    talentTitle: (name, id, tree) => `${name}（${id}）——「${tree}」`,
    talentOpen: '点击在天赋树中查看该节点',
    talentUnknown: '天赋树未能加载，显示的是天赋编号。',
    effects: {
      shop_level: (v) => `商店等级 +${v}`,
      shop_count: (v) => `商店货位 +${v}`,
      shop_time: (v) => `刷新时间 −${v}%`,
      ancient_shop_level: (v) => `远古商店等级 +${v}`,
      ancient_shop_count: (v) => `远古商贩货位 +${v}`,
      merchant_daily_task_reward_bonus: (v) => `每日订单奖励 +${v}%`,
    },
  },
};

