import type { Localised } from './index';
import { plural } from '../kit/format';

const ru = (n: number, one: string, few: string, many: string) => plural(n, 'ru', { one, few, many, other: few });

export interface HeroesStrings {
  title: string;
  searchPlaceholder: string;
  /** The count under the search: every hero, or `shown of total`. */
  count: (shown: number, total: number) => string;
  nothingFound: string;
  pickOne: string;
  abilities: (n: number) => string;
  runes: (n: number) => string;
  talentTree: string;
  talentTreeTitle: (tree: string) => string;
  /** The partner's note over the ability list; `fallback` is the season abilities missing from `season` are read from. */
  note: (season: string, fallback: string | null) => string;
  passive: string;
  passiveTitle: string;
  slotTitle: (key: string) => string;
  onlyInTitle: (seasons: string) => string;
  runeOnlyInTitle: (seasons: string) => string;
  differsTitle: (a: string, b: string) => string;
  stub: string;
  stubTitle: string;
  gameName: (name: string) => string;
  gameNameTitle: string;
  cooldown: (seconds: string) => string;
  mana: (amount: string) => string;
  unlock: (talent: string) => string;
  unlockTitle: (node: string, tree: string, level: number) => string;
  runesTitle: (n: number) => string;
  noRunes: string;
  runeOpen: string;
  tierOpen: (name: string) => string;
  iconMissing: string;
  /**
   * The partner wiki's own names for abilities the game left in Chinese or as
   * a placeholder ("Ability 002") in this language. Shown as the name, with
   * the game's own beside it.
   */
  wikiNames: Record<string, string>;
}

export const HEROES: Localised<HeroesStrings> = {
  en: {
    title: 'Heroes',
    searchPlaceholder: 'Search heroes…',
    count: (shown, total) => (shown === total ? `${total} ${total === 1 ? 'hero' : 'heroes'}` : `${shown} of ${total}`),
    nothingFound: 'Nothing found',
    pickOne: 'Pick a hero',
    abilities: (n) => `${n} ${n === 1 ? 'ability' : 'abilities'}`,
    runes: (n) => `${n} ${n === 1 ? 'rune' : 'runes'}`,
    talentTree: 'talent tree',
    talentTreeTitle: (tree) => `Profession tree: ${tree}`,
    note: (season, fallback) =>
      'Runes (seals) empower one specific ability of the hero, and the numbers depend on the tier: I–IV are separate items, each with its own card. ' +
      '"Wiki translation" marks names the build left in Chinese or as a placeholder ("Ability 002"). ' +
      `The numbers in the descriptions are from the ${season} rules' AbilityValues` +
      (fallback === null ? '' : `; for abilities ${season} does not have, from ${fallback}`) +
      '.',
    passive: 'passive',
    passiveTitle: 'Passive ability',
    slotTitle: (key) => `Slot ${key}`,
    onlyInTitle: (seasons) => `Exists only in the ${seasons} rules`,
    runeOnlyInTitle: (seasons) => `This rune is only handed out in the ${seasons} rules`,
    differsTitle: (a, b) => `The numbers differ between ${a} and ${b} — see the FAQ, “Season s3”`,
    stub: 'stub',
    stubTitle: 'The build has not written this ability yet (its tooltip says “To be filled.”), and no runes target it',
    gameName: (name) => `in game: “${name}”`,
    gameNameTitle: 'Wiki translation: the name above is the wiki’s, this is what the game shows',
    cooldown: (seconds) => `CD ${seconds} s`,
    mana: (amount) => `mana ${amount}`,
    unlock: (talent) => `unlocked by the talent “${talent}”`,
    unlockTitle: (node, tree, level) => `Node ${node} (tree “${tree}”, talent level ${level}) — open in Progression`,
    runesTitle: (n) => `Empowered by runes (${n}) — click one to open its card`,
    noRunes: 'No runes target this ability.',
    runeOpen: 'Open the rune’s card',
    tierOpen: (name) => `${name} — open its card`,
    iconMissing: 'No icon',
    wikiNames: {
      pa_013: 'Boomerang',
      lina_014: 'Searing Thunder',
      drow_002: 'Frost-Piercing Arrow',
      drow_005: 'Arrow Hail',
    },
  },
  ru: {
    title: 'Герои',
    searchPlaceholder: 'Поиск героя…',
    count: (shown, total) =>
      shown === total ? `${total} ${ru(total, 'герой', 'героя', 'героев')}` : `${shown} из ${total}`,
    nothingFound: 'Ничего не нашлось',
    pickOne: 'Выберите героя',
    abilities: (n) => `${n} ${ru(n, 'способность', 'способности', 'способностей')}`,
    runes: (n) => `${n} ${ru(n, 'руна', 'руны', 'рун')}`,
    talentTree: 'ветка прокачки',
    talentTreeTitle: (tree) => `Дерево профессии: ${tree}`,
    note: (season, fallback) =>
      'Руны (печати) усиливают конкретную способность героя — числа зависят от ступени: ' +
      'I–IV это отдельные предметы, каждый со своей карточкой. «Перевод вики» помечены ' +
      'названия, которые в русской локализации сборки остались китайскими или заглушкой ' +
      `(«Навык 002»). Числа в описаниях — из AbilityValues правил ${season}` +
      (fallback === null ? '' : `; у способностей, которых в ${season} нет, — из ${fallback}`) +
      '.',
    passive: 'пассивно',
    passiveTitle: 'Пассивная способность',
    slotTitle: (key) => `Слот ${key}`,
    onlyInTitle: (seasons) => `Есть только в правилах ${seasons}`,
    runeOnlyInTitle: (seasons) => `Руна выдаётся только в правилах ${seasons}`,
    differsTitle: (a, b) => `Числа в ${a} и ${b} отличаются — отличия в FAQ, раздел «Сезон s3»`,
    stub: 'заготовка',
    stubTitle: 'Способность ещё не описана в самой сборке (в подсказке «Ожидает заполнения»), к ней нет рун',
    gameName: (name) => `в игре: «${name}»`,
    gameNameTitle: 'Перевод вики: название выше — вики, а так способность называется в игре',
    cooldown: (seconds) => `КД ${seconds} с`,
    mana: (amount) => `мана ${amount}`,
    unlock: (talent) => `открывается талантом «${talent}»`,
    unlockTitle: (node, tree, level) => `Узел ${node} (ветка «${tree}», уровень таланта ${level}) — открыть в «Прокачке»`,
    runesTitle: (n) => `Усиливается рунами (${n}) — нажмите, чтобы открыть карточку`,
    noRunes: 'Рун к этой способности нет.',
    runeOpen: 'Открыть карточку руны',
    tierOpen: (name) => `${name} — открыть карточку`,
    iconMissing: 'Нет иконки',
    wikiNames: {
      pa_013: 'Бумеранг',
      lina_014: 'Палящий гром',
      drow_002: 'Пронзающая иней',
      drow_005: 'Град стрел',
    },
  },
  zh: {
    title: '英雄',
    searchPlaceholder: '搜索英雄…',
    count: (shown, total) => (shown === total ? `${total} 名英雄` : `${shown} / ${total}`),
    nothingFound: '没有找到',
    pickOne: '请选择英雄',
    abilities: (n) => `${n} 个技能`,
    runes: (n) => `${n} 种符印`,
    talentTree: '天赋树',
    talentTreeTitle: (tree) => `职业天赋树：${tree}`,
    note: (season, fallback) =>
      '符印只强化英雄的某一个技能，数值取决于阶级：I–IV 是各自独立的物品，各有物品卡片。' +
      '标注「百科译名」的是游戏本地化中仍为中文或占位名（「技能002」）的名称。' +
      `描述中的数值取自 ${season} 规则的 AbilityValues` +
      (fallback === null ? '' : `；${season} 中没有的技能取自 ${fallback}`) +
      '。',
    passive: '被动',
    passiveTitle: '被动技能',
    slotTitle: (key) => `${key} 键位`,
    onlyInTitle: (seasons) => `仅存在于 ${seasons} 规则`,
    runeOnlyInTitle: (seasons) => `该符印仅在 ${seasons} 规则中发放`,
    differsTitle: (a, b) => `${a} 与 ${b} 的数值不同——详见常见问题「S3 赛季」`,
    stub: '未完成',
    stubTitle: '游戏尚未写完此技能（提示为「待填充」），也没有针对它的符印',
    gameName: (name) => `游戏内：「${name}」`,
    gameNameTitle: '百科译名：上面是百科的名称，这是游戏内显示的名称',
    cooldown: (seconds) => `冷却 ${seconds} 秒`,
    mana: (amount) => `魔法 ${amount}`,
    unlock: (talent) => `由天赋「${talent}」解锁`,
    unlockTitle: (node, tree, level) => `节点 ${node}（天赋树「${tree}」，天赋等级 ${level}）——在「成长」中打开`,
    runesTitle: (n) => `可被符印强化（${n}）——点击打开物品卡片`,
    noRunes: '没有针对此技能的符印。',
    runeOpen: '打开符印卡片',
    tierOpen: (name) => `${name}——打开卡片`,
    iconMissing: '无图标',
    // The game's own Chinese names are the names here.
    wikiNames: {},
  },
};
