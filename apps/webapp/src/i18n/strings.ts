/** UI chrome strings. Item names and descriptions come from the game data. */

export type Lang = 'en' | 'ru' | 'zh';
export const LANGUAGES: Lang[] = ['en', 'ru', 'zh'];
export const LANGUAGE_LABELS: Record<Lang, string> = { en: 'English', ru: 'Русский', zh: '中文' };

/**
 * The rarity scale, 1–7.
 *
 * The addon ships quality as a bare number and never names the tiers, so these
 * are the site's names for them. Two are anchored in the data — the essence a
 * quality-5 item dismantles into is "Legendary", a quality-6 one "Mythic" — and
 * the ladder below them is the usual one. Seven is two potions and nothing
 * else; "Divine" is a guess, and the only one here.
 */
export type Rarity = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Strings {
  title: string;
  tagline: string;
  loading: string;
  loadFailed: string;
  retry: string;
  defaultSection: (n: number) => string;
  renameSection: string;
  clearSection: string;
  emptySlot: string;
  slotLabel: (section: string, slot: number) => string;
  unknownItem: string;
  copyLink: string;
  copied: string;
  copyFailed: string;
  linkLength: (n: number) => string;
  emptyBoardHint: string;
  reset: string;
  resetConfirm: string;
  exportJson: string;
  importJson: string;
  importFailed: string;
  pickItem: string;
  searchPlaceholder: string;
  noResults: string;
  resultsCapped: (shown: number, total: number) => string;
  clearSlot: string;
  close: string;
  warnTableMismatch: string;
  warnUnknownItems: (n: number) => string;
  errUnsupportedVersion: string;
  errMalformed: string;
  dismiss: string;
  itemCount: (n: number) => string;
  level: string;
  cost: string;
  provisional: string;
  placeInSlot: string;
  detailsHint: string;
  loadingDetails: string;
  stats: string;
  ability: string;
  glyph: string;
  recipe: string;
  usedIn: (n: number) => string;
  tags: string;
  /** Fallback for a grade with no name — see `rarityLabel`. */
  quality: string;
  rarity: Record<Rarity, string>;
  cooldown: string;
  manaCost: string;
  castRange: string;
  craftTime: string;
  /** The two lines above an item's stats: what kind of skill it is, and on whom. */
  skill: string;
  affects: string;
  /**
   * What goes between a label and its value — `Skill: Passive`.
   *
   * A string rather than a literal `:` in the JSX because Chinese sets it as a
   * fullwidth colon, which carries its own spacing.
   */
  colon: string;
  behavior: Record<'passive' | 'active' | 'toggle', string>;
  affectsLabel: (team: 'enemy' | 'friendly' | 'both', scope: 'units' | 'heroes' | 'creeps') => string;
  pickerHint: string;
  heads_up: string;
  attribution: string;
  addSection: string;
  removeSection: string;
  copyFrom: string;
  copySection: (name: string) => string;
  sectionsUsed: (used: number, max: number) => string;
  slotGroup: Record<'potion' | 'equip' | 'rune' | 'pet' | 'neutral' | 'backpack', string>;
  addDescription: string;
  descriptionPlaceholder: string;
  longLinkWarning: string;
  theme: string;
  language: string;
  workshopLink: string;

  hero: string;
  chooseHero: string;
  noHero: string;
  heroHint: string;
  unknownHero: string;
  heroChangeConfirm: (n: number) => string;
  spells: string;
  /** Short label per ability key, drawn on an empty spell slot. */
  spellSlot: Record<'q' | 'w' | 'e' | 'd' | 'r' | 'passive' | 'f', string>;
  pickSpell: string;
  clearSpell: string;
  emptySpell: string;
  unknownSpell: string;
  pickHeroFirst: string;
  noSpellsForHero: string;
  noSpellsInSlot: string;
  unfinishedAbilities: (n: number) => string;
  warnUnknownHero: string;
  warnUnknownSpells: (n: number) => string;

  referralCode: string;
  referralHint: string;
  /** The author's, on a build somebody else saved. */
  referralAuthorCode: string;
  referralAuthorHint: string;
  /** The author's own, on their saved build — where it is stored with it. */
  referralBuildHint: string;
  referralCopy: string;
  referralCopied: string;
  referralClear: string;
}

const en: Strings = {
  title: 'AOW5 Build Planner',
  tagline: 'Plan an Age of Weapons 5 item build and share it as a link.',
  loading: 'Loading item data…',
  loadFailed: 'Could not load the item data.',
  retry: 'Retry',
  defaultSection: (n) => `Section ${n}`,
  renameSection: 'Rename section',
  clearSection: 'Clear section',
  emptySlot: 'empty',
  slotLabel: (section, slot) => `${section}, slot ${slot}`,
  unknownItem: 'Unknown item',
  copyLink: 'Copy share link',
  copied: 'Link copied',
  copyFailed: 'Copy failed — select the link and copy it manually',
  linkLength: (n) => `${n} characters`,
  emptyBoardHint: 'Add an item to generate a share link.',
  reset: 'Reset board',
  resetConfirm: 'Clear the whole board and return to a single empty section?',
  exportJson: 'Export to file',
  importJson: 'Import from file',
  importFailed: 'That does not look like an exported build.',
  pickItem: 'Choose an item',
  searchPlaceholder: 'Search by name or id…',
  noResults: 'No items match.',
  resultsCapped: (shown, total) => `Showing ${shown} of ${total} matches — refine the search to narrow it down.`,
  clearSlot: 'Clear this slot',
  close: 'Close',
  warnTableMismatch: 'This link was made before the item list was last updated, so some items may be missing.',
  warnUnknownItems: (n) =>
    `${n} slot${n === 1 ? '' : 's'} hold an item this page does not recognise. They are kept as they are if you share the link on.`,
  errUnsupportedVersion:
    'This link was made by a newer version of the planner and cannot be opened here. Try reloading the page.',
  errMalformed: 'The link could not be read, so an empty board was loaded.',
  dismiss: 'Dismiss',
  itemCount: (n) => `${n} items`,
  level: 'Lv',
  cost: 'Cost',
  provisional: 'name search only',
  placeInSlot: 'Place in slot',
  detailsHint: 'Select an item to see its stats.',
  loadingDetails: 'Loading details…',
  stats: 'Stats',
  ability: 'Ability',
  glyph: 'Glyph',
  recipe: 'Recipe',
  usedIn: (n) => `Used in ${n} recipe${n === 1 ? '' : 's'}`,
  tags: 'Tags',
  quality: 'Quality',
  rarity: {
    1: 'Common',
    2: 'Uncommon',
    3: 'Rare',
    4: 'Epic',
    5: 'Legendary',
    6: 'Mythic',
    7: 'Divine',
  },
  cooldown: 'Cooldown',
  manaCost: 'Mana cost',
  castRange: 'Cast range',
  craftTime: 'Craft time',
  skill: 'Skill',
  affects: 'Affects',
  colon: ': ',
  behavior: { passive: 'Passive', active: 'Active', toggle: 'Toggle' },
  affectsLabel: (team, scope) =>
    `${{ enemy: 'Enemy', friendly: 'Allied', both: 'All' }[team]} ${{ units: 'units', heroes: 'heroes', creeps: 'creeps' }[scope]}`,
  pickerHint: 'Click an item to inspect it, then place it in the slot. Double-click to place it directly.',
  heads_up: 'Heads up',
  attribution:
    'Fan-made custom game build sharing for Age of Weapons 5. Not affiliated with Valve; item art and names remain the property of Valve and the addon authors.',
  addSection: 'Add section',
  removeSection: 'Remove section',
  copyFrom: 'or copy',
  copySection: (name) => `Add a copy of “${name}”`,
  sectionsUsed: (used, max) => `${used} of ${max}`,
  slotGroup: {
    potion: 'Potions',
    equip: 'Equipment',
    rune: 'Runes',
    pet: 'Pet',
    neutral: 'Neutral',
    backpack: 'Backpack',
  },
  addDescription: 'Add a note',
  descriptionPlaceholder: 'What is this section for? Enter to save, Shift+Enter for a new line.',
  longLinkWarning: 'This link is getting long — some chat apps may cut it off. Send it as a file instead if that happens.',
  theme: 'Toggle theme',
  language: 'Language',
  workshopLink: 'Age of Weapons 5 on the Steam Workshop',

  hero: 'Hero',
  chooseHero: 'Choose a hero',
  noHero: 'No hero',
  heroHint: 'Pick the hero this build is for. Each section can then take one ability per key.',
  unknownHero: 'Unknown hero',
  heroChangeConfirm: (n) =>
    `Switching hero clears the ${n} spell${n === 1 ? '' : 's'} already chosen, because abilities belong to one hero. Continue?`,
  spells: 'Spells',
  spellSlot: { q: 'Q', w: 'W', e: 'E', d: 'D', r: 'R', passive: 'Passive', f: 'F' },
  pickSpell: 'Choose a spell',
  clearSpell: 'Clear this spell',
  emptySpell: 'empty',
  unknownSpell: 'Unknown spell',
  pickHeroFirst: 'Choose a hero to pick spells.',
  noSpellsForHero: 'The addon has not finished this hero’s abilities yet, so there is nothing to choose.',
  noSpellsInSlot: 'No finished ability binds to this key.',
  unfinishedAbilities: (n) =>
    `${n} ability${n === 1 ? ' is' : 'ies are'} still unfinished in the game itself and cannot be chosen.`,
  warnUnknownHero: 'This build is for a hero this page does not recognise. It is kept as it is if you share the link on.',
  warnUnknownSpells: (n) =>
    `${n} spell slot${n === 1 ? '' : 's'} hold an ability this page does not recognise. They are kept as they are if you share the link on.`,

  referralCode: 'Referral code',
  referralHint: 'Kept in this browser and in the page address, so it travels with a link you share.',
  referralAuthorCode: 'Author’s referral code',
  referralAuthorHint: 'The code the author of this build asked to be credited with.',
  referralBuildHint: 'Saved with this build, so everyone who opens it sees your code — and kept in this browser for the planner.',
  referralCopy: 'Copy referral code',
  referralCopied: 'Referral code copied',
  referralClear: 'Erase referral code',
};

const ru: Strings = {
  title: 'Планировщик сборок AOW5',
  tagline: 'Соберите набор предметов Age of Weapons 5 и поделитесь ссылкой.',
  loading: 'Загрузка данных о предметах…',
  loadFailed: 'Не удалось загрузить данные о предметах.',
  retry: 'Повторить',
  defaultSection: (n) => `Раздел ${n}`,
  renameSection: 'Переименовать раздел',
  clearSection: 'Очистить раздел',
  emptySlot: 'пусто',
  slotLabel: (section, slot) => `${section}, ячейка ${slot}`,
  unknownItem: 'Неизвестный предмет',
  copyLink: 'Скопировать ссылку',
  copied: 'Ссылка скопирована',
  copyFailed: 'Не удалось скопировать — выделите ссылку вручную',
  linkLength: (n) => `${n} символов`,
  emptyBoardHint: 'Добавьте предмет, чтобы получить ссылку.',
  reset: 'Очистить всё',
  resetConfirm: 'Очистить всю доску и вернуться к одному пустому разделу?',
  exportJson: 'Экспорт в файл',
  importJson: 'Импорт из файла',
  importFailed: 'Это не похоже на экспортированную сборку.',
  pickItem: 'Выберите предмет',
  searchPlaceholder: 'Поиск по названию или id…',
  noResults: 'Ничего не найдено.',
  resultsCapped: (shown, total) => `Показано ${shown} из ${total} — уточните запрос.`,
  clearSlot: 'Очистить ячейку',
  close: 'Закрыть',
  warnTableMismatch: 'Ссылка сделана до последнего обновления списка предметов, поэтому некоторых может не хватать.',
  warnUnknownItems: (n) => `${n} ячеек занято предметами, которых эта страница не знает. Они сохранятся, если передать ссылку дальше.`,
  errUnsupportedVersion:
    'Ссылка сделана более новой версией планировщика и здесь не открывается. Попробуйте обновить страницу.',
  errMalformed: 'Не удалось прочитать ссылку, загружена пустая доска.',
  dismiss: 'Закрыть',
  itemCount: (n) => `${n} предметов`,
  level: 'Ур',
  cost: 'Цена',
  provisional: 'поиск только по названию',
  placeInSlot: 'Поместить в ячейку',
  detailsHint: 'Выберите предмет, чтобы увидеть характеристики.',
  loadingDetails: 'Загрузка характеристик…',
  stats: 'Характеристики',
  ability: 'Способность',
  glyph: 'Руна',
  recipe: 'Рецепт',
  usedIn: (n) => `Используется в ${n} рецептах`,
  tags: 'Теги',
  quality: 'Качество',
  rarity: {
    1: 'Обычное',
    2: 'Необычное',
    3: 'Редкое',
    4: 'Эпическое',
    5: 'Легендарное',
    6: 'Мифическое',
    7: 'Божественное',
  },
  cooldown: 'Перезарядка',
  manaCost: 'Расход маны',
  castRange: 'Дальность',
  craftTime: 'Время создания',
  skill: 'Навык',
  affects: 'Действует на',
  colon: ': ',
  behavior: { passive: 'Пассивный', active: 'Активный', toggle: 'Переключаемый' },
  affectsLabel: (team, scope) =>
    `${{ enemy: 'вражеских', friendly: 'союзных', both: 'всех' }[team]} ${{ units: 'юнитов', heroes: 'героев', creeps: 'крипов' }[scope]}`,
  pickerHint: 'Нажмите на предмет, чтобы посмотреть характеристики, затем поместите его в ячейку. Двойной клик — сразу поместить.',
  heads_up: 'Обратите внимание',
  attribution:
    'Фанатский обмен сборками для пользовательской игры Age of Weapons 5. Не связан с Valve; изображения и названия предметов принадлежат Valve и авторам аддона.',
  addSection: 'Добавить раздел',
  removeSection: 'Удалить раздел',
  copyFrom: 'или скопировать',
  copySection: (name) => `Добавить копию «${name}»`,
  sectionsUsed: (used, max) => `${used} из ${max}`,
  slotGroup: {
    potion: 'Зелья',
    equip: 'Снаряжение',
    rune: 'Руны',
    pet: 'Питомец',
    neutral: 'Нейтральный',
    backpack: 'Рюкзак',
  },
  addDescription: 'Добавить заметку',
  descriptionPlaceholder: 'Для чего этот раздел? Enter — сохранить, Shift+Enter — новая строка.',
  longLinkWarning: 'Ссылка становится длинной — некоторые мессенджеры могут её обрезать. Тогда отправьте её файлом.',
  theme: 'Переключить тему',
  language: 'Язык',
  workshopLink: 'Age of Weapons 5 в Steam Workshop',

  hero: 'Герой',
  chooseHero: 'Выберите героя',
  noHero: 'Без героя',
  heroHint: 'Выберите героя, для которого этот гайд. После этого каждый раздел может взять по одной способности на клавишу.',
  unknownHero: 'Неизвестный герой',
  heroChangeConfirm: (n) =>
    `Смена героя очистит выбранные способности (${n}), так как они принадлежат одному герою. Продолжить?`,
  spells: 'Способности',
  spellSlot: { q: 'Q', w: 'W', e: 'E', d: 'D', r: 'R', passive: 'Пассив', f: 'F' },
  pickSpell: 'Выберите способность',
  clearSpell: 'Очистить способность',
  emptySpell: 'пусто',
  unknownSpell: 'Неизвестная способность',
  pickHeroFirst: 'Выберите героя, чтобы указать способности.',
  noSpellsForHero: 'Способности этого героя ещё не готовы в аддоне, выбирать нечего.',
  noSpellsInSlot: 'На эту клавишу нет готовых способностей.',
  unfinishedAbilities: (n) => `Способностей, ещё не доделанных в самой игре: ${n}. Их нельзя выбрать.`,
  warnUnknownHero: 'Гайд для героя, которого эта страница не знает. Он сохранится, если передать ссылку дальше.',
  warnUnknownSpells: (n) =>
    `${n} ячеек способностей занято тем, чего эта страница не знает. Они сохранятся, если передать ссылку дальше.`,

  referralCode: 'Реферальный код',
  referralHint: 'Хранится в этом браузере и в адресе страницы, поэтому передаётся вместе с вашей ссылкой.',
  referralAuthorCode: 'Реферальный код автора',
  referralAuthorHint: 'Код, который автор этой сборки просит указывать.',
  referralBuildHint: 'Сохраняется вместе со сборкой, поэтому его видит каждый, кто её откроет, — и остаётся в этом браузере для планировщика.',
  referralCopy: 'Скопировать реферальный код',
  referralCopied: 'Реферальный код скопирован',
  referralClear: 'Стереть реферальный код',
};

/**
 * Simplified Chinese, the language the addon itself is written in.
 *
 * The item and ability text has always been here — the extraction pipeline
 * ships `locale.zh.*` alongside the other two, because the addon's own strings
 * are Chinese and everything else is a translation of them. This is the site's
 * chrome catching up with its data.
 */
const zh: Strings = {
  title: 'AOW5 配装规划器',
  tagline: '规划 Age of Weapons 5 的配装，并用一条链接分享出去。',
  loading: '正在加载物品数据…',
  loadFailed: '无法加载物品数据。',
  retry: '重试',
  defaultSection: (n) => `第 ${n} 段`,
  renameSection: '重命名分段',
  clearSection: '清空分段',
  emptySlot: '空',
  slotLabel: (section, slot) => `${section}，第 ${slot} 格`,
  unknownItem: '未知物品',
  copyLink: '复制分享链接',
  copied: '链接已复制',
  copyFailed: '复制失败 — 请手动选中链接复制',
  linkLength: (n) => `${n} 个字符`,
  emptyBoardHint: '放入一件物品即可生成分享链接。',
  reset: '重置面板',
  resetConfirm: '清空整个面板，只保留一个空分段？',
  exportJson: '导出到文件',
  importJson: '从文件导入',
  importFailed: '这看起来不是导出的配装文件。',
  pickItem: '选择物品',
  searchPlaceholder: '按名称或 id 搜索…',
  noResults: '没有匹配的物品。',
  resultsCapped: (shown, total) => `已显示 ${total} 个匹配中的 ${shown} 个 — 请细化搜索条件。`,
  clearSlot: '清空此格',
  close: '关闭',
  warnTableMismatch: '这条链接生成于物品表最近一次更新之前，因此可能有物品对不上。',
  warnUnknownItems: (n) => `有 ${n} 格装着本页面不认识的物品。继续分享链接时，它们会原样保留。`,
  errUnsupportedVersion: '这条链接由更新版本的规划器生成，无法在此打开。请尝试刷新页面。',
  errMalformed: '无法读取这条链接，已载入空面板。',
  dismiss: '知道了',
  itemCount: (n) => `${n} 件物品`,
  level: 'Lv',
  cost: '价格',
  provisional: '仅按名称搜索',
  placeInSlot: '放入此格',
  detailsHint: '选择一件物品即可查看它的属性。',
  loadingDetails: '正在加载详情…',
  stats: '属性',
  ability: '技能数据',
  glyph: '符印',
  recipe: '配方',
  usedIn: (n) => `用于 ${n} 个配方`,
  tags: '标签',
  quality: '品质',
  rarity: {
    1: '普通',
    2: '优秀',
    3: '稀有',
    4: '史诗',
    5: '传说',
    6: '神话',
    7: '神圣',
  },
  cooldown: '冷却',
  manaCost: '魔法消耗',
  castRange: '施法距离',
  craftTime: '制作时间',
  skill: '技能',
  affects: '作用于',
  colon: '：',
  behavior: { passive: '被动', active: '主动', toggle: '切换' },
  affectsLabel: (team, scope) =>
    `${{ enemy: '敌方', friendly: '友方', both: '全体' }[team]}${{ units: '单位', heroes: '英雄', creeps: '小兵' }[scope]}`,
  pickerHint: '点击物品查看详情，再放入格子。双击可直接放入。',
  heads_up: '请注意',
  attribution:
    'Age of Weapons 5 的玩家自制配装分享工具。与 Valve 无关；物品图标与名称仍归 Valve 及模组作者所有。',
  addSection: '添加分段',
  removeSection: '删除分段',
  copyFrom: '或复制',
  copySection: (name) => `添加“${name}”的副本`,
  sectionsUsed: (used, max) => `${used} / ${max}`,
  slotGroup: {
    potion: '药剂',
    equip: '装备',
    rune: '符印',
    pet: '宠物',
    neutral: '中立',
    backpack: '背包',
  },
  addDescription: '添加备注',
  descriptionPlaceholder: '这一段是干什么的？回车保存，Shift+回车换行。',
  longLinkWarning: '链接有点长了 — 有些聊天软件会把它截断。真遇上了，就改发文件。',
  theme: '切换主题',
  language: '语言',
  workshopLink: 'Steam 创意工坊上的 Age of Weapons 5',

  hero: '英雄',
  chooseHero: '选择英雄',
  noHero: '不选英雄',
  heroHint: '选择这套配装针对的英雄。之后每个分段的每个按键都可以选一个技能。',
  unknownHero: '未知英雄',
  heroChangeConfirm: (n) => `技能属于特定英雄，更换英雄会清空已选的 ${n} 个技能。是否继续？`,
  spells: '技能',
  spellSlot: { q: 'Q', w: 'W', e: 'E', d: 'D', r: 'R', passive: '被动', f: 'F' },
  pickSpell: '选择技能',
  clearSpell: '清除此技能',
  emptySpell: '空',
  unknownSpell: '未知技能',
  pickHeroFirst: '先选好英雄才能选技能。',
  noSpellsForHero: '模组还没做完这个英雄的技能，暂时无从选起。',
  noSpellsInSlot: '这个按键上没有已完成的技能。',
  unfinishedAbilities: (n) => `有 ${n} 个技能在游戏里尚未完成，无法选择。`,
  warnUnknownHero: '这套配装针对的英雄本页面不认识。继续分享链接时，它会原样保留。',
  warnUnknownSpells: (n) => `有 ${n} 个技能格装着本页面不认识的技能。继续分享链接时，它们会原样保留。`,

  referralCode: '推荐码',
  referralHint: '保存在这个浏览器和页面地址里，因此会随你分享的链接一起传出去。',
  referralAuthorCode: '作者的推荐码',
  referralAuthorHint: '这套配装的作者希望填写的推荐码。',
  referralBuildHint: '与这套配装一起保存，打开它的人都会看到你的推荐码 — 同时也留在这个浏览器里供规划器使用。',
  referralCopy: '复制推荐码',
  referralCopied: '推荐码已复制',
  referralClear: '清除推荐码',
};

export const STRINGS: Record<Lang, Strings> = { en, ru, zh };

/**
 * A rarity's name, or the bare grade when it has none.
 *
 * Only 1–7 are named. Quality 0 is the one vanilla item whose grade the addon
 * writes as a string, and no playable item has it — so it falls back rather
 * than being invented.
 */
export function rarityLabel(strings: Strings, quality: number): string {
  const named = (strings.rarity as Record<number, string | undefined>)[quality];
  return named ?? `${strings.quality} ${quality}`;
}

const STORAGE_KEY = 'aow5.lang';

/** Language is a viewer preference, not part of the shared build state. */
export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const fromQuery = new URLSearchParams(window.location.search).get('lang');
  if (fromQuery && (LANGUAGES as string[]).includes(fromQuery)) return fromQuery as Lang;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (LANGUAGES as string[]).includes(stored)) return stored as Lang;
  const browser = window.navigator.language;
  if (browser.startsWith('ru')) return 'ru';
  // `zh-Hans`, `zh-CN`, `zh-TW` — one Chinese translation for all of them.
  if (browser.startsWith('zh')) return 'zh';
  return 'en';
}

export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode or blocked storage; the choice just will not persist.
  }
}
