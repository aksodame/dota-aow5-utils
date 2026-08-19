/** UI chrome strings. Item names and descriptions come from the game data. */

export type Lang = 'en' | 'ru';
export const LANGUAGES: Lang[] = ['en', 'ru'];
export const LANGUAGE_LABELS: Record<Lang, string> = { en: 'English', ru: 'Русский' };

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
  errUnsupportedVersion: (v: number) => string;
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
  quality: string;
  cooldown: string;
  manaCost: string;
  castRange: string;
  craftTime: string;
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
  exportJson: 'Export JSON',
  importJson: 'Import JSON',
  importFailed: 'That does not look like an exported build.',
  pickItem: 'Choose an item',
  searchPlaceholder: 'Search by name or id…',
  noResults: 'No items match.',
  resultsCapped: (shown, total) => `Showing ${shown} of ${total} matches — refine the search to narrow it down.`,
  clearSlot: 'Clear this slot',
  close: 'Close',
  warnTableMismatch: 'This link was made with a different version of the item database. Items may be missing.',
  warnUnknownItems: (n) =>
    `${n} slot${n === 1 ? '' : 's'} reference an item this build does not know. They are kept intact when you re-share the link.`,
  errUnsupportedVersion: (v) => `This link uses share format v${v}, which this page cannot read. Try updating the page.`,
  errMalformed: 'The link could not be read, so an empty board was loaded.',
  dismiss: 'Dismiss',
  itemCount: (n) => `${n} items`,
  level: 'Lv',
  cost: 'Cost',
  provisional: 'provisional',
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
  cooldown: 'Cooldown',
  manaCost: 'Mana cost',
  castRange: 'Cast range',
  craftTime: 'Craft time',
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
  longLinkWarning: 'This link is getting long — some chat apps may cut it off. Export JSON instead if it breaks.',
  theme: 'Toggle theme',
  language: 'Language',
  workshopLink: 'Age of Weapons 5 on the Steam Workshop',

  hero: 'Hero',
  chooseHero: 'Choose a hero',
  noHero: 'No hero',
  heroHint: 'Pick the hero this guide is for. Each section can then take one ability per key.',
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
    `${n} ability${n === 1 ? ' is' : 'ies are'} still unfinished in the game data and cannot be chosen.`,
  warnUnknownHero: 'This guide is for a hero this build does not know. It is kept intact when you re-share the link.',
  warnUnknownSpells: (n) =>
    `${n} spell slot${n === 1 ? '' : 's'} reference an ability this build does not know. They are kept intact when you re-share the link.`,

  referralCode: 'Referral code',
  referralHint: 'Kept in this browser and in the page address, so it travels with a link you share.',
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
  exportJson: 'Экспорт JSON',
  importJson: 'Импорт JSON',
  importFailed: 'Это не похоже на экспортированную сборку.',
  pickItem: 'Выберите предмет',
  searchPlaceholder: 'Поиск по названию или id…',
  noResults: 'Ничего не найдено.',
  resultsCapped: (shown, total) => `Показано ${shown} из ${total} — уточните запрос.`,
  clearSlot: 'Очистить ячейку',
  close: 'Закрыть',
  warnTableMismatch: 'Ссылка создана с другой версией базы предметов. Некоторые предметы могут отсутствовать.',
  warnUnknownItems: (n) => `${n} ячеек ссылаются на неизвестные предметы. Они сохранятся при повторной отправке ссылки.`,
  errUnsupportedVersion: (v) => `Ссылка использует формат v${v}, который эта страница не читает. Обновите страницу.`,
  errMalformed: 'Не удалось прочитать ссылку, загружена пустая доска.',
  dismiss: 'Закрыть',
  itemCount: (n) => `${n} предметов`,
  level: 'Ур',
  cost: 'Цена',
  provisional: 'предварительно',
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
  cooldown: 'Перезарядка',
  manaCost: 'Расход маны',
  castRange: 'Дальность',
  craftTime: 'Время создания',
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
  longLinkWarning: 'Ссылка становится длинной — некоторые мессенджеры могут её обрезать. Используйте экспорт JSON.',
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
  unfinishedAbilities: (n) => `Способностей, ещё не готовых в данных игры: ${n}. Их нельзя выбрать.`,
  warnUnknownHero: 'Гайд создан для героя, неизвестного этой версии. Он сохранится при повторной отправке ссылки.',
  warnUnknownSpells: (n) =>
    `${n} ячеек способностей ссылаются на неизвестные способности. Они сохранятся при повторной отправке ссылки.`,

  referralCode: 'Реферальный код',
  referralHint: 'Хранится в этом браузере и в адресе страницы, поэтому передаётся вместе с вашей ссылкой.',
  referralCopy: 'Скопировать реферальный код',
  referralCopied: 'Реферальный код скопирован',
  referralClear: 'Стереть реферальный код',
};

export const STRINGS: Record<Lang, Strings> = { en, ru };

const STORAGE_KEY = 'aow5.lang';

/** Language is a viewer preference, not part of the shared build state. */
export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const fromQuery = new URLSearchParams(window.location.search).get('lang');
  if (fromQuery && (LANGUAGES as string[]).includes(fromQuery)) return fromQuery as Lang;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (LANGUAGES as string[]).includes(stored)) return stored as Lang;
  return window.navigator.language.startsWith('ru') ? 'ru' : 'en';
}

export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode or blocked storage; the choice just will not persist.
  }
}
