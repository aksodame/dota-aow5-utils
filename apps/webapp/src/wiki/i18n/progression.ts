import { plural } from '../kit/format';
import type { Localised } from './index';

/**
 * The progression section's words. Russian is the partner wiki's own wording
 * (`tab-progression.js` and the bar under the tree in `index.html`); numbers
 * arrive already formatted for the reader's language.
 */
export interface ProgressionStrings {
  title: string;
  tabsLabel: string;
  heroesLabel: string;
  /** Under the tabs: what a click on a node does. */
  barHint: string;
  farmLabel: string;
  allLocations: string;
  roomOption: (level: number, name: string) => string;
  resetMarks: string;
  noData: string;
  profession: string;
  heroPage: string;

  /** The header line: `tree4 · 88 nodes · Warrior · 3 learned`. */
  nodes: (count: string) => string;
  learned: (count: string) => string;
  calcCheck: string;
  calcCheckTitle: string;
  notInSeason: (season: string) => string;
  noTree: string;
  treeNote: string;
  treeLabel: (name: string) => string;
  linked: string;

  // Node tooltip
  nodeLevel: (level: number) => string;
  blueprint: string;
  skill: string;
  cost: string;
  goldWord: string;
  researchTime: (seconds: string) => string;
  needs: string;
  clickOn: string;
  clickOff: string;
  learnedBadge: string;

  // Profession tiers
  tiersTitle: (count: number) => string;
  tierCol: string;
  nameCol: string;
  heroLevelCol: string;
  unlockCol: string;
  growthCol: string;
  rewardCol: string;
  tier: (tier: number) => string;
  attrs: { str: string; agi: string; int: string };
  cosmetics: (count: number) => string;
  tiersNote: string;

  // Resources
  branchTitle: (name: string) => string;
  branchTitleBare: string;
  allTitle: string;
  inCalc: (on: string, total: string) => string;
  treesInCalc: (on: string, total: string) => string;
  timeLine: (time: string) => string;
  gold: string;
  perClear: (amount: string) => string;
  noGoldHere: string;
  clears: (count: number, formatted: string) => string;
  perClearItem: (amount: string) => string;
  noneDropHere: string;
  noneNeeded: string;
  skipped: (count: number) => string;
  skippedProfessions: (names: string) => string;
  branchOff: string;
  locNote: (name: string) => string;
  noLocNote: string;
  costSource: string;
}

export const PROGRESSION: Localised<ProgressionStrings> = {
  en: {
    title: 'Progression',
    tabsLabel: 'Talent trees',
    heroesLabel: 'Heroes',
    barHint:
      'Click a node to mark it as learned — it stops counting towards the resources. Marks are kept in your browser and survive a reload.',
    farmLabel: 'Farming location',
    allLocations: 'All locations',
    roomOption: (level, name) => `Lv. ${level} · ${name}`,
    resetMarks: 'Reset marks',
    noData: 'No data',
    profession: 'Profession',
    heroPage: 'Abilities and runes',

    nodes: (count) => `${count} nodes`,
    learned: (count) => `${count} learned`,
    calcCheck: 'Count in the all-trees totals',
    calcCheckTitle:
      "Untick this if you are not levelling this profession: its tree will not be part of “Resources for all trees” (the list is kept in your browser).",
    notInSeason: (season) => `Not in season ${season}, so never part of the all-trees totals.`,
    noTree: 'This profession has no tree laid out in the data.',
    treeNote:
      'Click a node to mark it as learned and see how much is left to gather. Marks are saved in your browser and survive a reload. The bright link is the main path; the dim ones are extra requirements.',
    treeLabel: (name) => `Talent tree: ${name}`,
    linked: 'Linked node',

    nodeLevel: (level) => `Node level: ${level}`,
    blueprint: 'Blueprint',
    skill: 'Ability',
    cost: 'Cost',
    goldWord: 'gold',
    researchTime: (seconds) => `Research time: ${seconds} s`,
    needs: 'Unlocked after',
    clickOn: 'Click to mark as learned',
    clickOff: 'Click to count it again',
    learnedBadge: 'Learned',

    tiersTitle: (count) => `Profession tiers (${count})`,
    tierCol: 'Tier',
    nameCol: 'Name',
    heroLevelCol: 'Hero level',
    unlockCol: 'Unlock',
    growthCol: 'Growth',
    rewardCol: 'Reward',
    tier: (tier) => `Tier ${tier}`,
    attrs: { str: 'Strength', agi: 'Agility', int: 'Intelligence' },
    cosmetics: (count) => `cosmetics ×${count}`,
    tiersNote: 'Tiers raise attribute growth and award cosmetics; the hero tree is levelled separately.',

    branchTitle: (name) => `Resources of “${name}”`,
    branchTitleBare: 'Resources of this tree',
    allTitle: 'Resources for all trees',
    inCalc: (on, total) => `${on} of ${total} nodes counted`,
    treesInCalc: (on, total) => `${on} of ${total} trees`,
    timeLine: (time) => `research time ${time}`,
    gold: 'Gold',
    perClear: (amount) => `~${amount} per clear`,
    noGoldHere: 'no gold drops in this location',
    clears: (count, formatted) => `≈${formatted} ${count === 1 ? 'clear' : 'clears'}`,
    perClearItem: (amount) => `~${amount} per clear`,
    noneDropHere: 'None of the resources needed drops in this location.',
    noneNeeded: 'Nothing needed — every node is marked as learned.',
    skipped: (count) => `${count} more ${count === 1 ? 'resource does' : 'resources do'} not drop in this location.`,
    skippedProfessions: (names) =>
      `Without professions: ${names} (unticked on the profession's card — their trees are not in these numbers).`,
    branchOff: 'This tree belongs to a profession taken out of the totals, so the all-trees line leaves it out.',
    locNote: (name) =>
      `Location “${name}”: both lines show only the resources that drop there, with an estimate of the clears needed (average drop per full clear, hard difficulty). `,
    noLocNote: 'Pick a farming location above: the lines keep only its resources and show how many clears it takes. ',
    costSource: 'Costs are from ak_talent.txt: the node’s gold (cost_coin) and materials (cost).',
  },
  ru: {
    title: 'Прокачка',
    tabsLabel: 'Деревья талантов',
    heroesLabel: 'Герои',
    barHint:
      'Клик по узлу отмечает его как прокачанный — он перестаёт учитываться в ресурсах. Отметки хранятся в браузере и переживают перезагрузку страницы.',
    farmLabel: 'Локация для фарма',
    allLocations: 'Все локации',
    roomOption: (level, name) => `Ур. ${level} · ${name}`,
    resetMarks: 'Сбросить отметки',
    noData: 'Нет данных',
    profession: 'Профессия',
    heroPage: 'Способности и руны',

    nodes: (count) => `узлов ${count}`,
    learned: (count) => `прокачано ${count}`,
    calcCheck: 'Учитывать в расчёте по всем деревьям',
    calcCheckTitle:
      'Снимите галочку, если профессию не качаете: её дерево не попадёт в строку «Ресурсы на все деревья» (список хранится в браузере)',
    notInSeason: (season) => `Профессии нет в сезоне ${season} — в расчёт по всем деревьям она не входит.`,
    noTree: 'Для этой профессии дерево в данных не размечено.',
    treeNote:
      'Клик по узлу отмечает его как прокачанный — видно, сколько останется собрать. Отметки сохраняются в браузере и не сбрасываются при перезагрузке. Яркая связь — основной путь, тусклые — дополнительные требования.',
    treeLabel: (name) => `Дерево талантов: ${name}`,
    linked: 'Узел по ссылке',

    nodeLevel: (level) => `Уровень узла: ${level}`,
    blueprint: 'Чертёж',
    skill: 'Навык',
    cost: 'Стоимость',
    goldWord: 'золото',
    researchTime: (seconds) => `Время исследования: ${seconds} с`,
    needs: 'Открывается после',
    clickOn: 'Клик — отметить как прокачанный',
    clickOff: 'Клик — вернуть в расчёт',
    learnedBadge: 'Прокачан',

    tiersTitle: (count) => `Ступени профессии (${count})`,
    tierCol: 'Ступень',
    nameCol: 'Название',
    heroLevelCol: 'Уровень героя',
    unlockCol: 'Открытие',
    growthCol: 'Рост',
    rewardCol: 'Награда',
    tier: (tier) => `${tier} ступень`,
    attrs: { str: 'сила', agi: 'ловкость', int: 'интеллект' },
    cosmetics: (count) => `косметика ×${count}`,
    tiersNote: 'Ступени открывают рост характеристик и выдают косметику; дерево героя качается отдельно.',

    branchTitle: (name) => `Ресурсы ветки «${name}»`,
    branchTitleBare: 'Ресурсы ветки',
    allTitle: 'Ресурсы на все деревья',
    inCalc: (on, total) => `узлов в расчёте ${on} из ${total}`,
    treesInCalc: (on, total) => `деревьев ${on} из ${total}`,
    timeLine: (time) => `время исследования ${time}`,
    gold: 'Золото',
    perClear: (amount) => `за зачистку ~${amount}`,
    noGoldHere: 'в этой локации золото не падает',
    clears: (count, formatted) =>
      `≈${formatted} ${plural(count, 'ru', { one: 'зачистка', few: 'зачистки', many: 'зачисток', other: 'зачистки' })}`,
    perClearItem: (amount) => `за зачистку ~${amount}`,
    noneDropHere: 'В этой локации ни один из нужных ресурсов не падает.',
    noneNeeded: 'Ресурсы не нужны — все узлы отмечены как прокачанные.',
    skipped: (count) =>
      `Ещё ${count} ${plural(count, 'ru', { one: 'ресурс', few: 'ресурса', many: 'ресурсов', other: 'ресурса' })} в этой локации не падает.`,
    skippedProfessions: (names) =>
      `Без профессий: ${names} (галочка снята в карточке профессии — их деревья в эти числа не входят).`,
    branchOff: 'Эта ветка принадлежит профессии, снятой с расчёта, — в строке «на все деревья» её нет.',
    locNote: (name) =>
      `Локация «${name}»: в обеих строках только те ресурсы, которые в ней падают, и оценка числа зачисток (средний дроп за полную зачистку, сложная сложность). `,
    noLocNote: 'Выберите локацию для фарма — в строках останутся только её ресурсы и появится число зачисток. ',
    costSource: 'Стоимость — из ak_talent.txt: золото (cost_coin) и материалы (cost) узла.',
  },
  zh: {
    title: '天赋成长',
    tabsLabel: '天赋树',
    heroesLabel: '英雄',
    barHint: '点击节点即标记为已学习，它将不再计入所需资源。标记保存在浏览器中，刷新页面后依然保留。',
    farmLabel: '刷图地图',
    allLocations: '全部地图',
    roomOption: (level, name) => `${level}级 · ${name}`,
    resetMarks: '重置标记',
    noData: '无数据',
    profession: '职业',
    heroPage: '技能与符印',

    nodes: (count) => `${count} 个节点`,
    learned: (count) => `已学习 ${count}`,
    calcCheck: '计入全部天赋树合计',
    calcCheckTitle: '如果你不练这个职业，请取消勾选：它的天赋树将不计入「全部天赋树所需资源」（列表保存在浏览器中）',
    notInSeason: (season) => `该职业不在 ${season} 赛季中，不计入全部天赋树合计。`,
    noTree: '数据中没有该职业的天赋树布局。',
    treeNote: '点击节点即标记为已学习，便能看到还需收集多少。标记保存在浏览器中，刷新后不会丢失。高亮连线为主路径，暗色连线为额外前置条件。',
    treeLabel: (name) => `天赋树：${name}`,
    linked: '链接指向的节点',

    nodeLevel: (level) => `节点等级：${level}`,
    blueprint: '图纸',
    skill: '技能',
    cost: '消耗',
    goldWord: '金币',
    researchTime: (seconds) => `研究时间：${seconds} 秒`,
    needs: '前置节点',
    clickOn: '点击标记为已学习',
    clickOff: '点击重新计入',
    learnedBadge: '已学习',

    tiersTitle: (count) => `职业阶段（${count}）`,
    tierCol: '阶段',
    nameCol: '名称',
    heroLevelCol: '英雄等级',
    unlockCol: '解锁',
    growthCol: '成长',
    rewardCol: '奖励',
    tier: (tier) => `第 ${tier} 阶段`,
    attrs: { str: '力量', agi: '敏捷', int: '智力' },
    cosmetics: (count) => `外观 ×${count}`,
    tiersNote: '职业阶段提升属性成长并发放外观；英雄天赋树需另行学习。',

    branchTitle: (name) => `「${name}」所需资源`,
    branchTitleBare: '本天赋树所需资源',
    allTitle: '全部天赋树所需资源',
    inCalc: (on, total) => `计入 ${on} / ${total} 个节点`,
    treesInCalc: (on, total) => `${on} / ${total} 棵天赋树`,
    timeLine: (time) => `研究时间 ${time}`,
    gold: '金币',
    perClear: (amount) => `每次清图 ~${amount}`,
    noGoldHere: '该地图不掉落金币',
    clears: (_count, formatted) => `≈${formatted} 次清图`,
    perClearItem: (amount) => `每次清图 ~${amount}`,
    noneDropHere: '所需资源在该地图都不掉落。',
    noneNeeded: '无需资源——所有节点都已标记为已学习。',
    skipped: (count) => `另有 ${count} 种资源在该地图不掉落。`,
    skippedProfessions: (names) => `未计入的职业：${names}（已在职业卡片中取消勾选，它们的天赋树不计入这些数字）。`,
    branchOff: '此天赋树属于已取消计入的职业，「全部天赋树」一栏中不包含它。',
    locNote: (name) => `地图「${name}」：两栏只显示在该地图掉落的资源，并估算所需清图次数（每次完整清图的平均掉落，困难难度）。`,
    noLocNote: '选择上方的刷图地图后，两栏只保留该地图掉落的资源，并显示所需清图次数。',
    costSource: '消耗数据来自 ak_talent.txt：节点的金币（cost_coin）与材料（cost）。',
  },
};
