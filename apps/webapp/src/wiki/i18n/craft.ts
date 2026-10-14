import { plural } from '../kit/format';
import type { Localised } from './index';

/**
 * The Crafting section's words. Russian is the partner wiki's own wording;
 * English and Chinese follow the game's terms (制作 craft, 图纸 recipe,
 * 材料 material, 分解 dismantle, 交易所 Exchange).
 */
export interface CraftStrings {
  title: string;
  searchPlaceholder: string;
  level: string;
  levelChip: (level: number) => string;
  group: string;
  groups: { equip: string; material: string; potion: string };
  /** `N items can be crafted`, or the empty line. */
  count: (n: number) => string;
  countNone: string;
  essencePrice: string;
  essencePriceTitle: string;
  profSell: string;
  profSellTitle: string;
  profDis: string;
  profDisTitle: string;
  emptyList: string;

  // the main card
  qualityLevel: (level: number) => string;
  talent: (name: string) => string;
  talentTitle: (node: string, nodeId: string, tree: string, recipe: string | null) => string;
  /** The recipe item's own name already says it is one ("Recipe: …"). */
  recipe: (name: string) => string;
  recipeTitle: (name: string, id: string) => string;
  noFormula: string;
  noFormulaTitle: string;
  ownPrice: (gold: string) => string;
  noPrice: string;
  rowTalent: string;
  rowRecipe: string;

  // the tree
  tree: string;
  matDepth: string;
  matDepthTitle: string;
  colPrice: string;
  colExchange: string;
  colCraft: string;
  exchangePlaceholder: string;
  exchangeTitle: string;
  notInData: string;
  nodeTitle: (p: {
    name: string;
    id: string;
    count: number;
    own: string | null;
    buy: string | null;
    craft: string | null;
    verdict: 'buy' | 'craft' | null;
    collapsed: boolean;
  }) => string;
  unknownTitle: (id: string, count: number) => string;
  cheaperToBuy: (buy: string, craft: string) => string;
  noNeeds: string;
  collapsedNote: (n: number) => string;
  truncatedNote: (depth: number, nodes: number) => string;
  unknownNote: string;

  // the summary
  summary: string;
  craftYourself: string;
  craftYourselfTitle: string;
  buyReady: string;
  unknownCost: string;
  verdictBuy: string;
  verdictCraft: string;
  enterPrice: string;
  samePrice: string;
  materials: (n: number) => string;
  higherLocs: string;
  higherLocsTitle: string;
  hardNote: string;
  perClear: (avg: string) => string;
  locTitle: (room: string, avg: string, total: number) => string;
  moreLocs: (n: number) => string;
  onlyCraft: string;
  unknownSource: string;
  matTitle: (name: string, count: number) => string;
  emptyRecipe: string;
  sellDismantle: string;
  sellItem: string;
  sellComponents: string;
  dismantle: (essence: string) => string;
  dismantleChance: (chance: string) => string;
  dismantleNone: string;
  dismantleTitle: string;
  profitable: (bits: string[]) => string;
  profitSell: string;
  profitDis: string;
  incomplete: (n: number) => string;
  whereToGet: string;
  farmTitle: (room: string, avg: string) => string;
  craftTag: (name: string) => string;
  craftTagTitle: (name: string) => string;
  noData: string;
  pick: string;
}

export const CRAFT: Localised<CraftStrings> = {
  ru: {
    title: 'Крафт',
    searchPlaceholder: 'Поиск предмета…',
    level: 'Уровень',
    levelChip: (level) => `Уровень ${level}`,
    group: 'Тип',
    groups: { equip: 'Снаряжение', material: 'Материалы', potion: 'Расходники' },
    count: (n) => `${n} ${plural(n, 'ru', { one: 'предмет', few: 'предмета', many: 'предметов', other: 'предмета' })} можно скрафтить`,
    countNone: 'ничего не найдено',
    essencePrice: 'Цена эссенции — легендарной',
    essencePriceTitle:
      'Цена эссенции: обычная и мифическая имеют свои цены в данных, а легендарная берётся из поля — её и продают дороже всего, поэтому цену задают ей.',
    profSell: 'Выгодно для продажи',
    profSellTitle: 'Только предметы, которые выгоднее продать, чем продать их составляющие',
    profDis: 'Выгодно для разбора',
    profDisTitle: 'Только предметы, разбор которых даёт больше, чем продажа их составляющих',
    emptyList: 'Ничего не подошло — ослабьте фильтры',

    qualityLevel: (level) => `Уровень ${level}`,
    talent: (name) => `Талант: ${name}`,
    talentTitle: (node, nodeId, tree, recipe) =>
      `Крафт открывается талантом «${node}» (${nodeId}), ветка «${tree}»` +
      (recipe !== null ? `\nРецепт: ${recipe}` : '\nПредмета-рецепта нет — крафт даёт сам талант') +
      '\n\nКлик — показать узел в дереве прокачки',
    recipe: (name) => name,
    recipeTitle: (name, id) => `${name} (${id}) — открывает возможность крафта, в состав не входит\n\nКлик — открыть предмет-рецепт`,
    noFormula: 'формула не найдена',
    noFormulaTitle:
      'Крафтится по составу, но ни предмета-рецепта, ни узла дерева, который открывает формулу, в игре нет. Состав показан по полю Needs — так его читает игра.',
    ownPrice: (gold) => `Цена: ${gold} зол.`,
    noPrice: 'Цены в данных нет',
    rowTalent: 'талант',
    rowRecipe: 'рецепт',

    tree: 'Дерево создания',
    matDepth: '+ уровень дерева для материалов',
    matDepthTitle:
      'Материалы вроде слитков и ткани по умолчанию не раскрываются — видно только, что они нужны. Галочка добавляет один уровень: показывается, из чего делается сам материал',
    colPrice: 'цена',
    colExchange: 'биржа',
    colCraft: 'крафт',
    exchangePlaceholder: 'биржа',
    exchangeTitle: 'Цена этого предмета на бирже. Общая для всех вкладок: по ней считается, что дешевле — купить или скрафтить',
    notInData: 'нет в данных сборки',
    nodeTitle: (p) =>
      `${p.name} (${p.id}) — нужно ${p.count} шт.` +
      (p.own !== null ? `\nЦена в данных: ${p.own} зол.` : '') +
      (p.buy !== null ? `\nНа бирже: ${p.buy} зол.` : '\nЦена на бирже не вписана') +
      (p.craft !== null ? `\nСобрать самому: ${p.craft} зол.` : '') +
      (p.verdict === 'buy' ? '\n\nДешевле купить на бирже' : '') +
      (p.verdict === 'craft' ? '\n\nДешевле скрафтить' : '') +
      (p.collapsed ? '\n\nУ этого материала есть свой состав — включите «+ уровень дерева для материалов» вверху, чтобы его увидеть' : ''),
    unknownTitle: (id, count) =>
      `${id} ×${count} — этого предмета нет в игре: ссылка на него висит в составе, но самого предмета и его цены в данных нет`,
    cheaperToBuy: (buy, craft) =>
      `Дешевле купить готовым: на бирже ${buy} зол. против ${craft} зол. на сборку — состав не показан. Уберите цену на бирже у самого предмета, если хотите увидеть дерево.`,
    noNeeds: 'У этого предмета нет состава — скрафтить его нельзя',
    collapsedNote: (n) =>
      `Ещё у ${n} ${plural(n, 'ru', { one: 'материала', few: 'материалов', many: 'материалов', other: 'материалов' })} состав скрыт — включите «+ уровень дерева для материалов» вверху, чтобы его показать.`,
    truncatedNote: (depth, nodes) => `Дерево показано не целиком: не больше ${depth} уровней и ${nodes} узлов.`,
    unknownNote: 'Часть составляющих в игре отсутствует — стоимость неполная.',

    summary: 'Итог по созданию',
    craftYourself: 'Собрать самому',
    craftYourselfTitle:
      'Стоимость сборки: каждая составляющая считается по вписанной цене на бирже — за неё её можно продать, значит столько она и стоит. Где цены нет, считается изготовление, а в конце — игровая цена. По этим же числам решается, что дешевле: купить или скрафтить',
    buyReady: 'Купить готовым',
    unknownCost: 'неизвестно',
    verdictBuy: 'Дешевле купить готовым на бирже',
    verdictCraft: 'Дешевле скрафтить из составляющих',
    enterPrice: 'Впишите цену на бирже у этого предмета, чтобы сравнить с крафтом.',
    samePrice: 'Крафт и покупка стоят одинаково.',
    materials: (n) => `Материалы (${n})`,
    higherLocs: 'локации выше уровнем',
    higherLocsTitle: 'Показывать локации выше уровнем, чем сам предмет — и у материалов, и у итогового предмета',
    hardNote: 'Средняя добыча за зачистку — на сложной сложности, вместе с её дополнительным пулом.',
    perClear: (avg) => `${avg} за зачистку`,
    locTitle: (room, avg, total) => `${room}\nв среднем ${avg} шт. за зачистку локации` + (total > 3 ? `\n\nВсего локаций: ${total}` : ''),
    moreLocs: (n) => `+${n}`,
    onlyCraft: 'с монстров не падает — только крафт',
    unknownSource: 'неизвестно, откуда падает',
    matTitle: (name, count) => `${name} — всего нужно ${count} шт.`,
    emptyRecipe: 'состав пуст',
    sellDismantle: 'Продажа и разбор',
    sellItem: 'Продать предмет',
    sellComponents: 'Продать составляющие',
    dismantle: (essence) => `Разобрать: ${essence}`,
    dismantleChance: (chance) => `шанс ${chance}`,
    dismantleNone: 'не разбирается',
    dismantleTitle: 'Разбор по правилу сервера, для предмета без перековки',
    profitable: (bits) => `Выгодно: ${bits.join('; ')}.`,
    profitSell: 'продать выгоднее, чем продать составляющие',
    profitDis: 'разобрать выгоднее, чем продать составляющие',
    incomplete: (n) => `У ${n} ${plural(n, 'ru', { one: 'составляющей', few: 'составляющих', many: 'составляющих', other: 'составляющих' })} нет данных в игре — расчёт неполный.`,
    whereToGet: 'Где взять предмет',
    farmTitle: (room, avg) => `${room}\nв среднем ${avg} «рецептов» нужных предметов за зачистку локации`,
    craftTag: (name) => `Крафт: ${name}`,
    craftTagTitle: (name) => `${name} с монстров не падает — его нужно скрафтить\n\nКлик — сделать этот предмет основным`,
    noData: 'нет данных',
    pick: 'Выберите предмет',
  },
  en: {
    title: 'Crafting',
    searchPlaceholder: 'Search items…',
    level: 'Level',
    levelChip: (level) => `Level ${level}`,
    group: 'Type',
    groups: { equip: 'Equipment', material: 'Materials', potion: 'Consumables' },
    count: (n) => `${n} ${plural(n, 'en', { one: 'item', other: 'items' })} can be crafted`,
    countNone: 'nothing found',
    essencePrice: 'Essence price — legendary',
    essencePriceTitle:
      'Essence prices: Equipment Essence and Mythic Gear Essence use their prices from the data; Legendary Equipment Essence takes this field, since it is the one that sells for the most.',
    profSell: 'Profitable to sell',
    profSellTitle: 'Only items that sell for more than their components would',
    profDis: 'Profitable to dismantle',
    profDisTitle: 'Only items whose dismantle is worth more than selling their components',
    emptyList: 'Nothing matches — loosen the filters',

    qualityLevel: (level) => `Level ${level}`,
    talent: (name) => `Talent: ${name}`,
    talentTitle: (node, nodeId, tree, recipe) =>
      `The craft is unlocked by the talent “${node}” (${nodeId}) in the ${tree} tree` +
      (recipe !== null ? `\nRecipe: ${recipe}` : '\nNo recipe item — the talent itself grants the craft') +
      '\n\nClick to show the node in the talent tree',
    recipe: (name) => name,
    recipeTitle: (name, id) => `${name} (${id}) unlocks the craft and is not consumed by it\n\nClick to open the recipe item`,
    noFormula: 'no recipe found',
    noFormulaTitle:
      'Crafted from its components, but the game has neither a recipe item nor a talent node that unlocks it. The components are the item’s Needs list, which is what the game reads.',
    ownPrice: (gold) => `Price: ${gold} gold`,
    noPrice: 'No price in the data',
    rowTalent: 'talent',
    rowRecipe: 'recipe',

    tree: 'Crafting tree',
    matDepth: '+ tree level for materials',
    matDepthTitle:
      'Materials such as ingots and cloth are not opened by default — the tree only shows that they are needed. This adds one level: what the material itself is made of',
    colPrice: 'price',
    colExchange: 'exchange',
    colCraft: 'craft',
    exchangePlaceholder: 'exchange',
    exchangeTitle: 'What this sells for on the Exchange. Shared across the wiki: it decides whether buying beats crafting',
    notInData: 'not in the game data',
    nodeTitle: (p) =>
      `${p.name} (${p.id}) — ${p.count} needed` +
      (p.own !== null ? `\nGame price: ${p.own} gold` : '') +
      (p.buy !== null ? `\nOn the Exchange: ${p.buy} gold` : '\nNo Exchange price entered') +
      (p.craft !== null ? `\nCraft it yourself: ${p.craft} gold` : '') +
      (p.verdict === 'buy' ? '\n\nCheaper to buy on the Exchange' : '') +
      (p.verdict === 'craft' ? '\n\nCheaper to craft' : '') +
      (p.collapsed ? '\n\nThis material has a recipe of its own — tick “+ tree level for materials” above to see it' : ''),
    unknownTitle: (id, count) => `${id} ×${count} — not in the game: the recipe names it, but the item and its price are not in the data`,
    cheaperToBuy: (buy, craft) =>
      `Cheaper to buy it ready-made: ${buy} gold on the Exchange against ${craft} gold to craft, so the tree is not shown. Clear the item’s own Exchange price to see it.`,
    noNeeds: 'This item has no components — it cannot be crafted',
    collapsedNote: (n) =>
      `${n} more ${plural(n, 'en', { one: 'material has its', other: 'materials have their' })} recipe hidden — tick “+ tree level for materials” above to show ${plural(n, 'en', { one: 'it', other: 'them' })}.`,
    truncatedNote: (depth, nodes) => `The tree is cut short: at most ${depth} levels and ${nodes} nodes.`,
    unknownNote: 'Some components are missing from the game, so the cost is incomplete.',

    summary: 'Crafting total',
    craftYourself: 'Craft it yourself',
    craftYourselfTitle:
      'The craft cost: each component counts at the Exchange price you entered — you could sell it for that, so that is what it costs you. Without one, its own craft cost counts, and failing that its game price. The same numbers decide whether buying or crafting is cheaper',
    buyReady: 'Buy ready-made',
    unknownCost: 'unknown',
    verdictBuy: 'Cheaper to buy it ready-made on the Exchange',
    verdictCraft: 'Cheaper to craft it from components',
    enterPrice: 'Enter this item’s Exchange price to compare it with crafting.',
    samePrice: 'Crafting and buying cost the same.',
    materials: (n) => `Materials (${n})`,
    higherLocs: 'higher-level locations',
    higherLocsTitle: 'Include locations above the item’s own level — for the materials and for the item',
    hardNote: 'Average drops per clear are on Hard difficulty, including its extra pool.',
    perClear: (avg) => `${avg} per clear`,
    locTitle: (room, avg, total) => `${room}\n${avg} on average per full clear` + (total > 3 ? `\n\nLocations in all: ${total}` : ''),
    moreLocs: (n) => `+${n}`,
    onlyCraft: 'no monster drops it — craft only',
    unknownSource: 'unknown where it drops',
    matTitle: (name, count) => `${name} — ${count} needed in all`,
    emptyRecipe: 'no components',
    sellDismantle: 'Sell & dismantle',
    sellItem: 'Sell the item',
    sellComponents: 'Sell the components',
    dismantle: (essence) => `Dismantle: ${essence}`,
    dismantleChance: (chance) => `${chance} chance`,
    dismantleNone: 'cannot be dismantled',
    dismantleTitle: 'Dismantled by the server’s rule, for an item at reforge 0',
    profitable: (bits) => `Profitable: ${bits.join('; ')}.`,
    profitSell: 'selling it beats selling its components',
    profitDis: 'dismantling it beats selling its components',
    incomplete: (n) => `${n} ${plural(n, 'en', { one: 'component is', other: 'components are' })} missing from the game — the numbers are incomplete.`,
    whereToGet: 'Where to get the item',
    farmTitle: (room, avg) => `${room}\n${avg} of the needed components on average per full clear (each divided by how many the recipe takes)`,
    craftTag: (name) => `Craft: ${name}`,
    craftTagTitle: (name) => `No monster drops ${name} — it has to be crafted\n\nClick to make it the main item`,
    noData: 'no data',
    pick: 'Pick an item',
  },
  zh: {
    title: '合成',
    searchPlaceholder: '搜索物品…',
    level: '等级',
    levelChip: (level) => `${level}级`,
    group: '类型',
    groups: { equip: '装备', material: '材料', potion: '消耗品' },
    count: (n) => `可制作 ${n} 件物品`,
    countNone: '没有找到',
    essencePrice: '精华价格——传说',
    essencePriceTitle: '精华价格：装备精华与神话装备精华使用数据中的价格；传说装备精华的价格取自此处——它卖得最贵，所以由你来定。',
    profSell: '出售划算',
    profSellTitle: '只显示出售成品比出售其材料更赚的物品',
    profDis: '分解划算',
    profDisTitle: '只显示分解所得高于出售其材料的物品',
    emptyList: '没有匹配项——放宽筛选条件',

    qualityLevel: (level) => `${level}级`,
    talent: (name) => `天赋：${name}`,
    talentTitle: (node, nodeId, tree, recipe) =>
      `由「${tree}」中的天赋「${node}」（${nodeId}）解锁制作` +
      (recipe !== null ? `\n图纸：${recipe}` : '\n没有图纸物品——天赋本身即解锁制作') +
      '\n\n点击在天赋树中查看该节点',
    recipe: (name) => name,
    recipeTitle: (name, id) => `${name}（${id}）——解锁制作，不作为材料消耗\n\n点击打开图纸物品`,
    noFormula: '未找到图纸',
    noFormulaTitle: '可按材料制作，但游戏中既没有图纸物品，也没有解锁该配方的天赋节点。材料取自物品的 Needs 字段——游戏正是这样读取的。',
    ownPrice: (gold) => `价格：${gold} 金币`,
    noPrice: '数据中没有价格',
    rowTalent: '天赋',
    rowRecipe: '图纸',

    tree: '制作树',
    matDepth: '+ 展开材料一层',
    matDepthTitle: '锭、布等材料默认不展开，只显示需要它们。勾选后多展开一层：显示材料本身由什么制作',
    colPrice: '价格',
    colExchange: '交易所',
    colCraft: '制作',
    exchangePlaceholder: '交易所',
    exchangeTitle: '此物品在交易所的价格。全百科共用：据此判断买还是造更划算',
    notInData: '数据中没有',
    nodeTitle: (p) =>
      `${p.name}（${p.id}）——需要 ${p.count} 个` +
      (p.own !== null ? `\n数据价格：${p.own} 金币` : '') +
      (p.buy !== null ? `\n交易所：${p.buy} 金币` : '\n未填写交易所价格') +
      (p.craft !== null ? `\n自己制作：${p.craft} 金币` : '') +
      (p.verdict === 'buy' ? '\n\n在交易所买更便宜' : '') +
      (p.verdict === 'craft' ? '\n\n自己制作更便宜' : '') +
      (p.collapsed ? '\n\n该材料有自己的配方——勾选上方「+ 展开材料一层」即可查看' : ''),
    unknownTitle: (id, count) => `${id} ×${count}——游戏中不存在：配方引用了它，但数据中没有该物品及其价格`,
    cheaperToBuy: (buy, craft) => `直接买成品更便宜：交易所 ${buy} 金币，制作需 ${craft} 金币，因此不显示制作树。清除该物品自身的交易所价格即可查看。`,
    noNeeds: '该物品没有材料——无法制作',
    collapsedNote: (n) => `另有 ${n} 种材料的配方被折叠——勾选上方「+ 展开材料一层」即可显示。`,
    truncatedNote: (depth, nodes) => `制作树未完整显示：最多 ${depth} 层、${nodes} 个节点。`,
    unknownNote: '部分材料在游戏中不存在——费用不完整。',

    summary: '制作合计',
    craftYourself: '自己制作',
    craftYourselfTitle:
      '制作费用：每种材料按你填写的交易所价格计算——你能以此价卖出，它就值这么多。没有填写时按其制作费用计算，再没有则按游戏价格。买还是造更便宜，也由这些数字决定',
    buyReady: '直接买成品',
    unknownCost: '未知',
    verdictBuy: '在交易所直接买成品更便宜',
    verdictCraft: '用材料自己制作更便宜',
    enterPrice: '填写该物品的交易所价格，即可与制作对比。',
    samePrice: '制作与购买花费相同。',
    materials: (n) => `材料（${n}）`,
    higherLocs: '更高等级的地图',
    higherLocsTitle: '也显示高于物品自身等级的地图——材料和成品都适用',
    hardNote: '每次清图的平均掉落按困难难度计算，含其额外掉落池。',
    perClear: (avg) => `每次清图 ${avg}`,
    locTitle: (room, avg, total) => `${room}\n每次清图平均 ${avg} 个` + (total > 3 ? `\n\n共 ${total} 张地图` : ''),
    moreLocs: (n) => `+${n}`,
    onlyCraft: '怪物不掉落——只能制作',
    unknownSource: '不清楚从哪里掉落',
    matTitle: (name, count) => `${name}——共需 ${count} 个`,
    emptyRecipe: '没有材料',
    sellDismantle: '出售与分解',
    sellItem: '出售成品',
    sellComponents: '出售材料',
    dismantle: (essence) => `分解：${essence}`,
    dismantleChance: (chance) => `概率 ${chance}`,
    dismantleNone: '不可分解',
    dismantleTitle: '按服务器规则分解，物品未重铸',
    profitable: (bits) => `划算：${bits.join('；')}。`,
    profitSell: '出售成品比出售材料更赚',
    profitDis: '分解比出售材料更赚',
    incomplete: (n) => `${n} 种材料在游戏数据中不存在——计算不完整。`,
    whereToGet: '在哪里获得',
    farmTitle: (room, avg) => `${room}\n每次清图平均获得所需材料 ${avg} 份（按配方所需数量折算）`,
    craftTag: (name) => `制作：${name}`,
    craftTagTitle: (name) => `${name} 不会由怪物掉落——需要制作\n\n点击将其设为主物品`,
    noData: '没有数据',
    pick: '请选择物品',
  },
};

