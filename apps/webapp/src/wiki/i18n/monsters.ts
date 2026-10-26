import type { MonsterTypeGroup } from 'aow5-shared/wiki';
import { plural } from '../kit/format';
import type { Localised } from './index';

/**
 * The monsters section's words. Russian is the partner wiki's own wording —
 * the labels, the tooltips and above all the notes that explain how a drop is
 * rolled. English and Chinese follow the game's terms (see the glossaries):
 * drop pool / 掉落池, weight / 权重, hunter / 猎手怪, recipe / 图纸.
 *
 * The data has no hunter `interval` or `watchRange` (the map does not set
 * them; the server's defaults are in encrypted code), so the hunter lines say
 * what the map does set and the note says "periodically" where the partner
 * printed a number.
 */
export interface MonstersStrings {
  /**
   * The wiki author's own remarks on a few units — what the pak defines but
   * never wires up. Keyed by unit id; written by hand, so content, not data.
   */
  notes: Record<string, string>;
  title: string;
  difficulty: string;
  location: string;
  allLocations: string;
  locationOption: (level: number, name: string, dlc: boolean) => string;
  allLoot: string;
  allLootTitle: string;
  searchMonster: string;
  type: string;
  typeAll: string;
  /** The filter buttons — "Элитник" covers the buildings too. */
  typeFilter: Record<MonsterTypeGroup, string>;
  sort: string;
  sorts: { level: string; name: string; location: string; drops: string };
  count: (n: number) => string;
  nothingFound: string;
  emptyAnd: string;
  emptyTry: string;
  rowLevel: (level: number) => string;
  rowItems: (n: number) => string;
  hunterLine: (room: string, wave: string) => string;
  hunterFooter: string;

  // the middle column
  items: string;
  and: string;
  or: string;
  andTitle: string;
  orTitle: string;
  guaranteed: string;
  guaranteedTitle: string;
  noRecipes: string;
  noRecipesTitle: string;
  searchItem: string;
  removeFromFilter: string;
  clearPicks: string;
  foundAll: (n: number) => string;
  guaranteedCount: (n: number) => string;
  selectionCount: (n: number) => string;
  inFilter: (n: number, hint: string) => string;
  noSuchItem: string;
  noDrop: string;
  sources: (n: number) => string;
  itemLevel: (level: number) => string;
  openItem: string;
  pickHint: string;
  pickedHint: string;

  // the map
  mapTitle: string;
  mapPick: string;
  mapsAvailable: (n: number, list: string) => string;
  noMaps: string;
  dotTitle: (name: string, chance: string, count: number) => string;
  rarityDot: string;
  hunterDot: (name: string, wave: string) => string;
  mapSwitchTitle: (n: number, name: string) => string;
  mapPoints: (n: number) => string;
  hunter: string;

  // hunter wave, from whatever the map sets
  wave: (min: number | null, max: number | null) => string;
  waveChance: (chance: string) => string;
  waveDelay: (minutes: string) => string;
  waveDefaults: string;

  // the monster card
  building: string;
  consideredHero: string;
  locationTagTitle: string;
  levelTag: (level: number) => string;
  stats: string;
  stat: {
    level: string;
    hp: string;
    damage: string;
    armor: string;
    magicResist: string;
    moveSpeed: string;
    gold: string;
    stunResist: string;
    exp: string;
    attackRange: string;
  };
  guards: (n: number) => string;
  guardKinds: (n: number) => string;
  guardWeight: (name: string, id: string, weight: number) => string;
  noData: string;
  guardNote: string;
  spawns: string;
  spawnPoints: (n: number) => string;
  spawnAvg: (avg: string) => string;
  spawnTitle: string;
  rarityNote: string;
  hunterSection: string;
  hunterOther: string;
  hunterNote: string;
  firstDrop: string;
  firstNote: string;
  drop: string;
  noPool: string;
  dropRate: (chance: string) => string;
  dropRange: (range: string, cap: number, difficulty: string) => string;
  zone: string;
  zoneTitle: (room: string, avg: string) => string;
  zoneNoRoom: string;
  zoneEmpty: string;
  zoneNoLoc: string;
  zoneNote: (room: string, level: number, avg: string) => string;
  recipesHidden: (n: number) => string;
  hardOnly: (list: string) => string;
  formula: (avg: string) => string;
  cellShare: (value: string) => string;
  cellChance: (value: string) => string;
  cellZone: (value: string) => string;
  cellWeight: (weight: string) => string;

  // the location view
  back: string;
  locLevel: (level: number) => string;
  dlc: string;
  locGold: (gold: string) => string;
  monstersHere: (n: number) => string;
  bossesHere: (list: string) => string;
  guaranteedHere: (n: number) => string;
  guaranteedNote: string;
  loot: (n: number) => string;
  noLoot: string;
  lootItem: string;
  lootBest: string;
  lootClear: string;
  lootAvg: string;
  lootClearTitle: string;
  lootAvgTitle: (kills: string, n: number) => string;
  dropsFrom: string;
  lootNote: string;
}


export const MONSTERS: Localised<MonstersStrings> = {
  en: {
    notes: {
      monster_12002: "Its second phase (summoning minions in phases) is written, but not yet wired to this mini-boss.",
      monster_12010: "Its second phase (summoning minions in phases) is written, but not yet wired to this mini-boss.",
      monster_12022: "Its second phase (summoning minions in phases) is written, but not yet wired to this mini-boss.",
      monster_12023: "Not placed in the current build: it spawns in no room, has no drops configured, and some of its abilities (Battle Line Banner, Iron Counterattack, Triumphant Order) exist only as text. A future boss waiting for its patch.",
    },
    title: 'Monsters & drops',
    difficulty: 'Location difficulty',
    location: 'Location',
    allLocations: 'All locations',
    locationOption: (level, name, dlc) => `Lv. ${level} · ${name}${dlc ? ' (DLC)' : ''}`,
    allLoot: 'All loot →',
    allLootTitle: 'Show everything that drops in this location',
    searchMonster: 'Search monsters…',
    type: 'Type',
    typeAll: 'All',
    typeFilter: { boss: 'Boss', miniboss: 'Mini-boss', elite: 'Elite', normal: 'Normal', container: 'Container', gatherable: 'Gathered' },
    sort: 'Sort within a type',
    sorts: { level: 'by level', name: 'by name', location: 'by location', drops: 'by item count' },
    count: (n) => `${n} ${n === 1 ? 'unit' : 'units'}`,
    nothingFound: 'nothing found',
    emptyAnd: 'Nobody drops all the picked items — switch “AND” to “OR”',
    emptyTry: 'Try changing the filters',
    rowLevel: (level) => `Lv. ${level}`,
    rowItems: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
    hunterLine: (room, wave) => `${room}: ${wave}`,
    hunterFooter: 'A hunter is a recurring wave that comes after the player in the room',

    items: 'Items',
    and: 'AND',
    or: 'OR',
    andTitle: 'Show units that drop ALL the picked items',
    orTitle: 'Show units that drop AT LEAST ONE of the picked items',
    guaranteed: 'Guaranteed',
    guaranteedTitle:
      'Show guaranteed drops only: units with a guaranteed drop, and the items in those pools. “Ignore recipes” applies here too',
    noRecipes: 'Ignore recipes',
    noRecipesTitle: 'A recipe drops once and never again',
    searchItem: 'Search items…',
    removeFromFilter: 'Remove from the filter',
    clearPicks: 'clear',
    foundAll: (n) => `Found across all locations: ${n}`,
    guaranteedCount: (n) => `Guaranteed drops: ${n}`,
    selectionCount: (n) => `Items in the selection: ${n}`,
    inFilter: (n, hint) => `${n} in the filter · ${hint}`,
    noSuchItem: 'No such item drops anywhere',
    noDrop: 'This selection drops nothing',
    sources: (n) => `${n} ${n === 1 ? 'source' : 'sources'}`,
    itemLevel: (level) => `Lv. ${level}`,
    openItem: 'Open the item’s page',
    pickHint: 'Click to add the item to the filter',
    pickedHint: 'In the filter — click to remove',

    mapTitle: 'Location map',
    mapPick: 'pick a monster or a location',
    mapsAvailable: (n, list) => `maps exist for ${n} locations: ${list}`,
    noMaps: 'no location maps',
    dotTitle: (name, chance, count) => `${name}\nchance ${chance} · ${count} ${count === 1 ? 'monster' : 'monsters'}`,
    rarityDot: 'the variant is picked at random (trigger rarity ±1)',
    hunterDot: (name, wave) => `${name} — hunter\n${wave}`,
    mapSwitchTitle: (n, name) => `This unit spawns in ${n} locations with a map — switch to “${name}”`,
    mapPoints: (n) => `${n} spawn ${n === 1 ? 'point' : 'points'}`,
    hunter: 'hunter',

    wave: (min, max) => (min === null && max === null ? 'wave' : `wave of ${min ?? '?'}–${max ?? '?'}`),
    waveChance: (chance) => `wave chance ${chance}`,
    waveDelay: (minutes) => `first after ${minutes} min`,
    waveDefaults: 'the map leaves the wave to the server’s defaults',

    building: 'building',
    consideredHero: 'counts as a hero',
    locationTagTitle: 'Show all the loot of this location',
    levelTag: (level) => `Lv. ${level}`,
    stats: 'Stats',
    stat: {
      level: 'Level',
      hp: 'Health',
      damage: 'Damage',
      armor: 'Armor',
      magicResist: 'Magic resist.',
      moveSpeed: 'Move speed',
      gold: 'Gold',
      stunResist: 'Stun resist.',
      exp: 'Experience',
      attackRange: 'Attack range',
    },
    guards: (n) => `Guards (${n})`,
    guardKinds: (n) => `${n} ${n === 1 ? 'kind' : 'kinds'}`,
    guardWeight: (name, id, weight) => `${name} (${id}) — weight ${weight}`,
    noData: 'no data',
    guardNote:
      'While it is being hit, the object checks once a second for a hero nearby and, at every 50% of its health, spawns more guards from these groups (my_game_axe/room/comp/resourcepoint). For every quarter of health it loses it also throws out 1–2 items from its own pool.',
    spawns: 'Spawns on the map',
    spawnPoints: (n) => `${n} ${n === 1 ? 'point' : 'points'}`,
    spawnAvg: (avg) => `${avg} per run on average`,
    spawnTitle: 'From the map dump: how many units of each kind stand on spawn triggers and how likely they are to appear',
    rarityNote:
      'Some points pick their breakable variant at random: for a trigger with Rarity the game takes R−1…R+1 (clamped to 0…5) and appends it to the name as a suffix. Such a point lands on this variant only a third of the time, so its chance is already divided.',
    hunterSection: 'Hunter',
    hunterOther: 'other attributes',
    hunterNote:
      'A hunter is not an ordinary spawn: a room component periodically checks whether a live hero is near this point and, with the given chance, brings a wave of monsters. Every wave makes them stronger: damage and health grow with the wave number (modifier modifier_hunter_tracker_boost).',
    firstDrop: 'First drop',
    firstNote:
      'A guaranteed item — one from the list drops, picked by weight (the share is shown). For ordinary monsters it is the first kill by this player; for bosses it repeats on the 1st, 3rd, 5th, 10th, 35th and 100th kill.',
    drop: 'Drop',
    noPool: 'This monster has no drop pool.',
    dropRate: (chance) => `Drop chance ${chance}`,
    dropRange: (range, cap, difficulty) => `${range} ${cap === 1 ? 'item' : 'items'} per kill (${difficulty.toLowerCase()} difficulty)`,
    zone: 'Per location',
    zoneTitle: (room, avg) =>
      `Show the average number of items if every spawn of this unit in “${room}” is killed (${avg} per run on average)`,
    zoneNoRoom: 'This unit has no location',
    zoneEmpty: 'Nothing is left in the pool once recipes are excluded.',
    zoneNoLoc: 'This unit has no location — nothing to count.',
    zoneNote: (room, level, avg) =>
      `The average number of items this very unit gives if every one of its spawns in “${room}” (Lv. ${level}) is killed — ${avg} per run on average. Other units of the location are not counted.`,
    recipesHidden: (n) => `Recipes hidden (${n}) — their weights are left out of the total, so the other items’ chances are higher.`,
    hardOnly: (list) => `Added on Hard difficulty only: ${list}.`,
    formula: (avg) =>
      `Chance = DropRate × (1 − (1 − weight/total weight)^${avg}). The power is there because an item is picked independently for every slot that drops, and what matters is “at least one”. This is the base value: at run time the weight is changed by mechanics such as pool decay and the profession weight.`,
    cellShare: (value) => `share ${value}`,
    cellChance: (value) => `chance ${value}`,
    cellZone: (value) => `${value} on average from all spawns of this unit`,
    cellWeight: (weight) => `weight ${weight}`,

    back: '← back to the monster',
    locLevel: (level) => `Level ${level}`,
    dlc: 'DLC',
    locGold: (gold) => `gold per entry: ${gold}`,
    monstersHere: (n) => `Monsters of the location (${n})`,
    bossesHere: (list) => `Bosses of the location: ${list}.`,
    guaranteedHere: (n) => `Guaranteed drop (${n})`,
    guaranteedNote:
      'These units have a drop that always falls (first drop / the chest’s contents) — the whole of it is shown in the row. The table below does not count it.',
    loot: (n) => `Loot of the location (${n})`,
    noLoot: 'The monsters of this location have no drop.',
    lootItem: 'Item',
    lootBest: 'Best chance',
    lootClear: 'Chance per clear',
    lootAvg: 'Average per clear',
    lootClearTitle:
      'The chance to get at least one such item from a full clear of the location — taking into account how many units spawn and how likely they are to.',
    lootAvgTitle: (kills, n) => `How many of this item drop per clear of the location on average (${kills} ${n === 1 ? 'kill' : 'kills'} of everything that drops it)`,
    dropsFrom: 'drops from: ',
    lootNote:
      'Best chance — the chance to get the item from one kill of whichever monster of the location has it highest. Chance per clear — the chance to get at least one from a full clear of the location (1 − the product of “did not drop” over every unit, counting its spawns). Average per clear — the expected number of such items from the same clear. Hover a number for the breakdown.',
  },
  ru: {
    notes: {
      monster_12002: "Вторая фаза (фазовый призыв миньонов) написана, но этому мини-боссу ещё не подключена.",
      monster_12010: "Вторая фаза (фазовый призыв миньонов) написана, но этому мини-боссу ещё не подключена.",
      monster_12022: "Вторая фаза (фазовый призыв миньонов) написана, но этому мини-боссу ещё не подключена.",
      monster_12023: "В текущей сборке не расставлен: спавна нет ни в одной комнате, дроп не настроен, а часть способностей (знамя боевого строя, железная контратака, триумфальный приказ) существует только в виде текстов. Заготовка будущего босса — ждёт своего патча.",
    },
    title: 'Монстры и дроп',
    difficulty: 'Сложность локации',
    location: 'Локация',
    allLocations: 'Все локации',
    locationOption: (level, name, dlc) => `Ур. ${level} · ${name}${dlc ? ' (DLC)' : ''}`,
    allLoot: 'Весь лут →',
    allLootTitle: 'Показать всё, что падает в этой локации',
    searchMonster: 'Поиск монстра…',
    type: 'Тип',
    typeAll: 'Все',
    typeFilter: { boss: 'Босс', miniboss: 'Мини-босс', elite: 'Элитник', normal: 'Обычный', container: 'Контейнер', gatherable: 'Собираемые' },
    sort: 'Сортировка внутри типа',
    sorts: { level: 'по уровню', name: 'по названию', location: 'по локации', drops: 'по числу предметов' },
    count: (n) => `${n} ${plural(n, 'ru', { one: 'существо', few: 'существа', many: 'существ', other: 'существа' })}`,
    nothingFound: 'ничего не найдено',
    emptyAnd: 'Ни у кого нет всех выбранных предметов — переключите «И» на «ИЛИ»',
    emptyTry: 'Попробуйте изменить фильтры',
    rowLevel: (level) => `Ур. ${level}`,
    rowItems: (n) => `${n} предм.`,
    hunterLine: (room, wave) => `${room}: ${wave}`,
    hunterFooter: 'Охотник — периодическая волна, которая приходит к игроку в комнате',

    items: 'Предметы',
    and: 'И',
    or: 'ИЛИ',
    andTitle: 'Показывать существ, у которых есть ВСЕ выбранные предметы',
    orTitle: 'Показывать существ, у которых есть ХОТЯ БЫ ОДИН из выбранных предметов',
    guaranteed: 'Гарант',
    guaranteedTitle:
      'Показывать только гарантированный дроп: существа с гарантированным дропом и предметы из этих пулов. Галочка «Не учитывать рецепты» действует и здесь',
    noRecipes: 'Не учитывать рецепты',
    noRecipesTitle: 'Рецепт выпадает один раз и больше не попадётся',
    searchItem: 'Поиск предмета…',
    removeFromFilter: 'Убрать из фильтра',
    clearPicks: 'сбросить',
    foundAll: (n) => `Найдено по всем локациям: ${n}`,
    guaranteedCount: (n) => `Гарантированный дроп: ${n}`,
    selectionCount: (n) => `Предметы в выборке: ${n}`,
    inFilter: (n, hint) => `${n} в фильтре · ${hint}`,
    noSuchItem: 'Такого предмета нет в дропе',
    noDrop: 'У этой выборки нет дропа',
    sources: (n) => `${n} ${plural(n, 'ru', { one: 'источник', few: 'источника', many: 'источников', other: 'источника' })}`,
    itemLevel: (level) => `ур. ${level}`,
    openItem: 'Открыть страницу предмета',
    pickHint: 'Клик — добавить предмет в фильтр',
    pickedHint: 'Отмечен в фильтре — клик снимает',

    mapTitle: 'Карта локации',
    mapPick: 'выберите монстра или локацию',
    mapsAvailable: (n, list) => `карты есть для ${n} локаций: ${list}`,
    noMaps: 'карт локаций нет',
    dotTitle: (name, chance, count) =>
      `${name}\nшанс ${chance} · ${count} ${plural(count, 'ru', { one: 'монстр', few: 'монстра', many: 'монстров', other: 'монстра' })}`,
    rarityDot: 'вариант выбирается случайно (rarity триггера ±1)',
    hunterDot: (name, wave) => `${name} — охотник\n${wave}`,
    mapSwitchTitle: (n, name) => `Существо спавнится в ${n} локациях с картой — переключить на «${name}»`,
    mapPoints: (n) => `${n} ${plural(n, 'ru', { one: 'точка', few: 'точки', many: 'точек', other: 'точки' })} спавна`,
    hunter: 'охотник',

    wave: (min, max) => (min === null && max === null ? 'волна' : `волна ${min ?? '?'}–${max ?? '?'}`),
    waveChance: (chance) => `шанс волны ${chance}`,
    waveDelay: (minutes) => `появляется через ${minutes} мин`,
    waveDefaults: 'параметры волны карта оставляет серверу по умолчанию',

    building: 'строение',
    consideredHero: 'считается героем',
    locationTagTitle: 'Показать весь лут этой локации',
    levelTag: (level) => `Ур. ${level}`,
    stats: 'Характеристики',
    stat: {
      level: 'Уровень',
      hp: 'Здоровье',
      damage: 'Урон',
      armor: 'Броня',
      magicResist: 'Маг. сопр.',
      moveSpeed: 'Скорость',
      gold: 'Золото',
      stunResist: 'Сопр. стану',
      exp: 'Опыт',
      attackRange: 'Дальность атаки',
    },
    guards: (n) => `Охрана (${n})`,
    guardKinds: (n) => `${n} ${plural(n, 'ru', { one: 'вид', few: 'вида', many: 'видов', other: 'вида' })}`,
    guardWeight: (name, id, weight) => `${name} (${id}) — вес ${weight}`,
    noData: 'нет данных',
    guardNote:
      'Пока объект бьют, он раз в секунду проверяет, есть ли рядом герой, и с шагом в 50 % здоровья доспавнивает охрану из этих групп (my_game_axe/room/comp/resourcepoint). За каждый потерянный четвертью здоровья порог он ещё и выбрасывает 1–2 предмета из своего пула.',
    spawns: 'Спавны на карте',
    spawnPoints: (n) => `${n} ${plural(n, 'ru', { one: 'точка', few: 'точки', many: 'точек', other: 'точки' })}`,
    spawnAvg: (avg) => `в среднем ${avg} за заход`,
    spawnTitle: 'Из дампа карты: сколько существ каждого вида стоит на триггерах спавна и с каким шансом они появляются',
    rarityNote:
      'Часть точек выбирает вариант разрушаемого случайно: у триггера с Rarity игра берёт R−1…R+1 (зажато в 0…5) и дописывает как суффикс к имени. Такая точка попадает в этот вариант лишь в трети случаев, поэтому её шанс уже поделён.',
    hunterSection: 'Охотник',
    hunterOther: 'прочие атрибуты',
    hunterNote:
      'Охотник — это не обычный спавн: компонент комнаты периодически проверяет, есть ли живой герой рядом с этой точкой, и с указанным шансом приводит волну монстров. Каждая волна делает их сильнее: урон и запас здоровья растут с номером волны (модификатор modifier_hunter_tracker_boost).',
    firstDrop: 'Первый дроп',
    firstNote:
      'Гарантированный предмет — выпадает один из списка, выбор по весу (доля указана в таблице). Для обычных монстров — за первое убийство этим игроком; для боссов повторяется на 1, 3, 5, 10, 35 и 100-м убийстве.',
    drop: 'Дроп',
    noPool: 'У этого монстра не задан дроп-пул.',
    dropRate: (chance) => `Шанс дропа ${chance}`,
    dropRange: (range, cap, difficulty) =>
      `выпадает ${range} ${plural(cap, 'ru', { one: 'предмет', few: 'предмета', many: 'предметов', other: 'предмета' })} за убийство (${difficulty.toLowerCase()} сложность)`,
    zone: 'За локацию',
    zoneTitle: (room, avg) =>
      `Показывать среднее количество предметов, если убить все спавны этого существа в локации «${room}» (в среднем ${avg} за заход)`,
    zoneNoRoom: 'У существа не указана локация',
    zoneEmpty: 'После исключения рецептов в пуле ничего не осталось.',
    zoneNoLoc: 'У существа не указана локация — считать нечего.',
    zoneNote: (room, level, avg) =>
      `Среднее количество предметов, которое даст именно это существо, если убить все его спавны в локации «${room}» (ур. ${level}) — в среднем ${avg} за заход. Другие существа локации не учитываются.`,
    recipesHidden: (n) =>
      `Рецепты скрыты (${n} ${plural(n, 'ru', { one: 'штука', few: 'штуки', many: 'штук', other: 'штуки' })}) — их веса исключены из суммы, поэтому шансы остальных выше.`,
    hardOnly: (list) => `Только на сложной сложности добавляется: ${list}.`,
    formula: (avg) =>
      `Шанс = DropRate × (1 − (1 − вес/сумма весов)^${avg}). Степень — потому что предмет выбирается независимо на каждый выпавший слот, и нас интересует «выпадет хотя бы один». Это базовое значение: в рантайме вес меняется механиками вроде decay пула и веса профессии.`,
    cellShare: (value) => `доля ${value}`,
    cellChance: (value) => `шанс ${value}`,
    cellZone: (value) => `в среднем ${value} со всех спавнов этого существа`,
    cellWeight: (weight) => `вес ${weight}`,

    back: '← к монстру',
    locLevel: (level) => `Уровень ${level}`,
    dlc: 'DLC',
    locGold: (gold) => `золото за заход: ${gold}`,
    monstersHere: (n) => `Монстры локации (${n})`,
    bossesHere: (list) => `Боссы локации: ${list}.`,
    guaranteedHere: (n) => `Гарантированный дроп (${n})`,
    guaranteedNote:
      'У этих существ есть дроп, который выпадает всегда (первый дроп / содержимое сундука) — он показан в строке целиком. В таблице ниже он не учитывается.',
    loot: (n) => `Лут локации (${n})`,
    noLoot: 'У монстров этой локации не задан дроп.',
    lootItem: 'Предмет',
    lootBest: 'Лучший шанс',
    lootClear: 'Шанс за зачистку',
    lootAvg: 'Среднее за зачистку',
    lootClearTitle:
      'Шанс получить хотя бы один такой предмет за полную зачистку локации — с учётом того, сколько существ спавнится и с какими шансами.',
    lootAvgTitle: (kills, n) =>
      `Сколько таких предметов в среднем выпадет за зачистку локации (${kills} ${plural(n, 'ru', { one: 'убийство', few: 'убийства', many: 'убийств', other: 'убийства' })} всех, кто его роняет)`,
    dropsFrom: 'падает с: ',
    lootNote:
      'Лучший шанс — вероятность получить предмет с одного убийства того монстра локации, у кого он выше всего. Шанс за зачистку — вероятность получить хотя бы один такой предмет за полную зачистку локации (1 − произведение «не выпало» по каждому, с учётом числа спавнов). Среднее за зачистку — ожидаемое количество таких предметов за ту же зачистку. Наведите курсор на число, чтобы увидеть разбивку.',
  },
  zh: {
    notes: {
      monster_12002: "第二阶段（分阶段召唤小兵）已写好，但尚未接入这个小头目。",
      monster_12010: "第二阶段（分阶段召唤小兵）已写好，但尚未接入这个小头目。",
      monster_12022: "第二阶段（分阶段召唤小兵）已写好，但尚未接入这个小头目。",
      monster_12023: "当前版本中尚未投放：任何房间都不会刷新，掉落未配置，部分技能（战阵旗帜、钢铁反击、凯旋号令）仅以文本形式存在。这是尚待补丁上线的未来头目。",
    },
    title: '怪物与掉落',
    difficulty: '地图难度',
    location: '地图',
    allLocations: '全部地图',
    locationOption: (level, name, dlc) => `${level}级 · ${name}${dlc ? '（DLC）' : ''}`,
    allLoot: '全部掉落 →',
    allLootTitle: '显示此地图掉落的全部物品',
    searchMonster: '搜索怪物…',
    type: '类型',
    typeAll: '全部',
    typeFilter: { boss: 'BOSS', miniboss: '头目', elite: '精英', normal: '小怪', container: '可破坏物', gatherable: '采集' },
    sort: '同类型内排序',
    sorts: { level: '按等级', name: '按名称', location: '按地图', drops: '按物品数' },
    count: (n) => `${n} 个单位`,
    nothingFound: '未找到',
    emptyAnd: '没有单位同时掉落所有选中物品——请把「且」切换为「或」',
    emptyTry: '请尝试修改筛选条件',
    rowLevel: (level) => `${level}级`,
    rowItems: (n) => `${n} 件物品`,
    hunterLine: (room, wave) => `${room}：${wave}`,
    hunterFooter: '猎手怪是周期性向房间内玩家袭来的一波怪物',

    items: '物品',
    and: '且',
    or: '或',
    andTitle: '显示掉落「全部」选中物品的单位',
    orTitle: '显示掉落「至少一件」选中物品的单位',
    guaranteed: '必掉',
    guaranteedTitle: '仅显示必掉物品：有必掉物品的单位，以及这些掉落池中的物品。「不计图纸」在此同样生效',
    noRecipes: '不计图纸',
    noRecipesTitle: '图纸只会掉落一次，之后不再出现',
    searchItem: '搜索物品…',
    removeFromFilter: '从筛选中移除',
    clearPicks: '清空',
    foundAll: (n) => `在所有地图中找到：${n}`,
    guaranteedCount: (n) => `必掉物品：${n}`,
    selectionCount: (n) => `当前选择的物品：${n}`,
    inFilter: (n, hint) => `已筛选 ${n} 件 · ${hint}`,
    noSuchItem: '没有任何单位掉落此物品',
    noDrop: '当前选择没有掉落',
    sources: (n) => `${n} 个来源`,
    itemLevel: (level) => `${level}级`,
    openItem: '打开物品页面',
    pickHint: '点击将物品加入筛选',
    pickedHint: '已在筛选中——点击移除',

    mapTitle: '地图',
    mapPick: '请选择怪物或地图',
    mapsAvailable: (n, list) => `有 ${n} 张地图可显示：${list}`,
    noMaps: '暂无地图',
    dotTitle: (name, chance, count) => `${name}\n几率 ${chance} · ${count} 只`,
    rarityDot: '变体随机选择（触发器稀有度 ±1）',
    hunterDot: (name, wave) => `${name}——猎手怪\n${wave}`,
    mapSwitchTitle: (n, name) => `该单位在 ${n} 张有地图的地图中刷新——切换到「${name}」`,
    mapPoints: (n) => `${n} 个刷新点`,
    hunter: '猎手怪',

    wave: (min, max) => (min === null && max === null ? '一波' : `每波 ${min ?? '?'}–${max ?? '?'} 只`),
    waveChance: (chance) => `出现几率 ${chance}`,
    waveDelay: (minutes) => `${minutes} 分钟后出现`,
    waveDefaults: '地图未设置波次参数，使用服务器默认值',

    building: '建筑',
    consideredHero: '视为英雄',
    locationTagTitle: '显示此地图的全部掉落',
    levelTag: (level) => `${level}级`,
    stats: '属性',
    stat: {
      level: '等级',
      hp: '生命值',
      damage: '攻击力',
      armor: '护甲',
      magicResist: '魔法抗性',
      moveSpeed: '移动速度',
      gold: '金币',
      stunResist: '眩晕抗性',
      exp: '经验',
      attackRange: '攻击距离',
    },
    guards: (n) => `守卫（${n}）`,
    guardKinds: (n) => `${n} 种`,
    guardWeight: (name, id, weight) => `${name}（${id}）——权重 ${weight}`,
    noData: '无数据',
    guardNote:
      '被攻击时，该物体每秒检查附近是否有英雄，并在生命值每下降 50% 时从这些组中补充守卫（my_game_axe/room/comp/resourcepoint）。每损失四分之一生命值，它还会从自己的掉落池中掉出 1–2 件物品。',
    spawns: '地图刷新点',
    spawnPoints: (n) => `${n} 个点`,
    spawnAvg: (avg) => `每局平均 ${avg} 只`,
    spawnTitle: '来自地图数据：每种单位在刷新触发器上有多少只，以及出现的几率',
    rarityNote:
      '部分刷新点随机选择可破坏物的变体：对带 Rarity 的触发器，游戏取 R−1…R+1（限制在 0…5）并作为后缀加到名称上。这样的点只有三分之一的几率落在此变体上，因此其几率已经分摊。',
    hunterSection: '猎手怪',
    hunterOther: '其他属性',
    hunterNote:
      '猎手怪不是普通刷新：房间组件会周期性检查此点附近是否有存活的英雄，并以给定几率带来一波怪物。每一波都会更强：攻击力和生命值随波数增长（modifier_hunter_tracker_boost）。',
    firstDrop: '首次掉落',
    firstNote:
      '必掉物品——按权重从列表中掉落一件（表中为占比）。普通怪物为该玩家首次击杀时掉落；BOSS 在第 1、3、5、10、35 和 100 次击杀时重复掉落。',
    drop: '掉落',
    noPool: '该怪物没有掉落池。',
    dropRate: (chance) => `掉落几率 ${chance}`,
    dropRange: (range, _cap, difficulty) => `每次击杀掉落 ${range} 件（${difficulty}难度）`,
    zone: '按地图',
    zoneTitle: (room, avg) => `显示击杀该单位在「${room}」中全部刷新时的平均物品数（每局平均 ${avg} 只）`,
    zoneNoRoom: '该单位没有所属地图',
    zoneEmpty: '排除图纸后掉落池为空。',
    zoneNoLoc: '该单位没有所属地图——无法计算。',
    zoneNote: (room, level, avg) =>
      `击杀该单位在「${room}」（${level}级）中的全部刷新时，仅由它掉落的平均物品数——每局平均 ${avg} 只。不计地图中的其他单位。`,
    recipesHidden: (n) => `已隐藏图纸（${n} 件）——其权重不计入总和，因此其余物品的几率更高。`,
    hardOnly: (list) => `仅在困难难度追加：${list}。`,
    formula: (avg) =>
      `几率 = DropRate × (1 − (1 − 权重/总权重)^${avg})。取幂是因为每个掉落栏位都独立抽取物品，而我们关心的是「至少掉一件」。这是基础值：实际运行时权重还会受掉落池衰减、职业权重等机制影响。`,
    cellShare: (value) => `占比 ${value}`,
    cellChance: (value) => `几率 ${value}`,
    cellZone: (value) => `该单位全部刷新平均掉落 ${value} 件`,
    cellWeight: (weight) => `权重 ${weight}`,

    back: '← 返回怪物',
    locLevel: (level) => `等级 ${level}`,
    dlc: 'DLC',
    locGold: (gold) => `每次进入金币：${gold}`,
    monstersHere: (n) => `地图怪物（${n}）`,
    bossesHere: (list) => `地图 BOSS：${list}。`,
    guaranteedHere: (n) => `必掉物品（${n}）`,
    guaranteedNote: '这些单位有必定掉落的物品（首次掉落／宝箱内容）——整行显示。下方表格不计入这些物品。',
    loot: (n) => `地图掉落（${n}）`,
    noLoot: '此地图的怪物没有掉落。',
    lootItem: '物品',
    lootBest: '最高几率',
    lootClear: '每次清图几率',
    lootAvg: '每次清图平均',
    lootClearTitle: '完整清图一次至少获得一件该物品的几率——已考虑单位的刷新数量和刷新几率。',
    lootAvgTitle: (kills) => `每次清图平均掉落的数量（掉落它的单位共击杀 ${kills} 次）`,
    dropsFrom: '掉落自：',
    lootNote:
      '最高几率——击杀一次掉率最高的怪物获得该物品的几率。每次清图几率——完整清图一次至少获得一件的几率（1 − 各单位「未掉落」的乘积，计入刷新数量）。每次清图平均——同一次清图中该物品的期望数量。将鼠标悬停在数字上可查看明细。',
  },
};
