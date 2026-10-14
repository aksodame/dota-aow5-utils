import type { Localised } from './index';

/**
 * The Sky section's words. Russian is the partner wiki's own wording; the
 * game's names (Mystic Crystals, fate stones, the realm's tiers) follow the
 * game's English and Chinese locale.
 *
 * Templates take numbers already formatted by the page, so every language
 * gets its own digit grouping.
 */
export interface SkyStrings {
  title: string;
  lead: string;
  tabsLabel: string;
  tab: { tier: (tier: number) => string; endless: string; spawns: string; combos: string; scaling: string };

  /** The marker after a number the pak does not carry, and what it means. */
  partnerMark: string;
  partnerNote: string;

  kind: { normal: string; elite: string; boss: string };
  /** The partner's labels for a monster's `UnitType`, where the game's locale has none. */
  unitType: Record<string, string>;

  // --- a tier
  tierCode: (tier: number) => string;
  facts: {
    floors: string;
    invitation: string;
    daily: string;
    revives: string;
    mult: string;
    move: string;
    aspd: string;
    armor: string;
    mr: string;
  };
  chestTitle: (poolId: string, poolName: string | null) => string;
  rewardLevel: (level: number, from: string | null, below: string | null, extraDraws: number, multMin: string, multMax: string) => string;
  chestText: (coinsPerDraw: string, poolId: string, levels: string) => string;
  coinsNote: (c: {
    normal: string;
    luckyPct: string;
    lucky: string;
    bonusPct: string;
    bonus: string;
    elite: string;
    eliteLuckyPct: string;
    eliteLucky: string;
    boss: string;
    retain: string;
    coinsPerDraw: string;
  }) => string;
  expectedNote: (floors: number, crystals: string, level: number, draws: string, coins: string) => string;
  ancientNote: (itemName: string, itemId: string, perCoin: string, talents: string) => string;
  share: string;
  chestShare: (poolId: string, share: string) => string;
  monstersTitle: (n: number) => string;
  monstersNote: string;
  floorsShort: (floors: string) => string;
  nested: string;
  showSpawns: string;
  monsterPage: string;

  // --- endless
  endlessCode: string;
  kindAll: string;
  kindLabel: { equipment: string; stones: string };
  waveAll: string;
  dropTitle: (n: number) => string;
  waveDropTitle: (wave: number, n: number) => string;
  bossLine: (bosses: string, waves: string, many: boolean, manyWaves: boolean) => string;
  dropTooltip: string;
  dropTooltipLine: (boss: number, wave: number, chance: string) => string;
  wavesTitle: (n: number) => string;
  boss: (n: number) => string;
  waveMeta: (poolId: string, equipment: number, stones: number) => string;
  waveSplit: (split: string) => string;
  waveSet: string;
  waveClear: string;
  endlessNoteChance: string;
  endlessNoteDeep: (waves: string, last: number, poolId: string, level: number) => string;
  endlessNoteTeam: string;

  // --- spawn pools
  spawnsTitle: string;
  poolsCount: (n: number) => string;
  tierGroup: (tier: number, n: number) => string;
  endlessGroup: (n: number) => string;
  poolMeta: (level: number, n: number) => string;
  openMonster: string;
  jumpPool: string;
  spawnsNote: string;
  focusMissing: string;

  // --- combos
  combosTitle: string;
  combosCount: (n: number) => string;
  allTiers: string;
  tierChip: (tier: number) => string;
  endlessChip: string;
  allFloors: string;
  floorChip: (floor: number) => string;
  allKinds: string;
  filterTier: string;
  filterFloor: string;
  filterKind: string;
  combosList: (n: number) => string;
  comboMeta: (tier: string, floor: number, kind: string, weight: string) => string;
  role: { elite: string; normal: string };
  memberTitle: (id: string, role: string, x: number, y: number) => string;
  roleDefault: string;
  offset: string;
  combosNote: string;

  // --- scaling
  scalingTitle: string;
  scalingCode: (n: number) => string;
  scalingIntro: string;
  scalingPlayers: string;
  waveCounts: (normalTotal: number, maxAlive: number, eliteMin: number, eliteMax: number, eliteCfg: number, followPct: string) => string;
  tiersTitle: string;
  tiersText: (anchor: number, growth: string) => string;
  tierCell: (tier: number) => string;
  tierCellMeta: (floors: number, mult: string, move: string, aspd: string) => string;
  atFloor: (floor: number) => string;
  hpAtk: (hp: string, atk: string) => string;
  tierCellTitle: (growth: string) => string;
  endlessTitle: (n: number) => string;
  col: { floor: string; normal: string; elite: string; boss: string; armor: string; mr: string };
  growthTitle: string;
  growthText: (last: number, curveTier: number, hp: string, atk: string, armor: number, mr: number, cap: number) => string;
  deepText: (from: number, dmg: number, resist: number, stun: number) => string;
}

export const SKY: Localised<SkyStrings> = {
  en: {
    title: 'Sky',
    lead: 'The Skyfall Realm: tiers, the endless run, spawn pools, waves and monster scaling',
    tabsLabel: 'Skyfall Realm pages',
    tab: { tier: (tier) => `Sky ${tier}`, endless: 'Endless', spawns: 'Spawn pools', combos: 'Waves', scaling: 'Monster scaling' },
    partnerMark: '*',
    partnerNote:
      '* A number stated by the partner wiki (v1.507). The game keeps it in encrypted code, so it is not in any file this wiki reads.',
    kind: { normal: 'normal', elite: 'elite', boss: 'boss' },
    unitType: {
      monster_normal: 'Normal',
      monster_elite: 'Elite',
      monster_miniboss: 'Mini-boss',
      monster_boss: 'Boss',
      building: 'Building',
      container: 'Container',
      destructible: 'Destructible',
    },

    tierCode: (tier) => `G001 · tier ${tier}`,
    facts: {
      floors: 'Floors',
      invitation: 'Entry item',
      daily: 'Entries per day',
      revives: 'Revives',
      mult: 'Monster HP and attack',
      move: 'Monster move speed',
      aspd: 'Monster attack speed',
      armor: 'Monster armor',
      mr: 'Monster magic resistance',
    },
    chestTitle: (poolId, poolName) => `Reward chest (${poolId})${poolName !== null ? ` — “${poolName}”` : ''}`,
    rewardLevel: (level, from, below, extraDraws, multMin, multMax) =>
      `level ${level} — ${from !== null ? `from ${from}` : `below ${below ?? ''}`}: ${
        extraDraws > 0 ? `+${extraDraws} draw${extraDraws === 1 ? '' : 's'}` : 'no bonus draws'
      }, ancient coins ×${multMin}–${multMax}`,
    chestText: (coinsPerDraw, poolId, levels) =>
      `At the end of a run a chest opens for the Mystic Crystals you collected: one draw per ${coinsPerDraw} crystals, and each draw gives one item from pool ${poolId}. The chest's level, set by your crystals, adds bonus draws: ${levels}.`,
    coinsNote: (c) =>
      `Monsters drop Mystic Crystals: a normal one ${c.normal} (a ${c.luckyPct}% chance of ${c.lucky} instead, another ${c.bonusPct}% of ${c.bonus}); an elite ${c.elite} (${c.eliteLuckyPct}% — ${c.eliteLucky}); a boss ${c.boss}. If the whole team dies, ${c.retain} is kept. Draws per run: ⌊crystals ÷ ${c.coinsPerDraw}⌋ + the level bonus.`,
    expectedNote: (floors, crystals, level, draws, coins) =>
      `On average a full run (${floors} floors) collects ~${crystals} crystals: chest level ${level}, ~${draws} draws and ~${coins} ancient coins — without talents; a team wipe halves the crystals.`,
    ancientNote: (itemName, itemId, perCoin, talents) =>
      `Ancient coins (“${itemName}”, ${itemId}) drop along with the items: ⌈crystals × ${perCoin} × level multiplier⌉, and the talents ${talents} add ⌊coins × percent ÷ 100⌋.`,
    share: 'Share of one draw',
    chestShare: (poolId, share) => `from ${poolId} · ${share}`,
    monstersTitle: (n) => `Monsters of the tier (${n})`,
    monstersNote:
      'Every monster the tier can field: its floors’ spawn pools and its elite and boss waves. Click one to see the spawn pool it stands in.',
    floorsShort: (floors) => `floors ${floors}`,
    nested: 'via a nested pool',
    showSpawns: 'Show its spawn pool',
    monsterPage: 'Monster page',

    endlessCode: 'GCE_BOSS · wave = boss level × 3',
    kindAll: 'All',
    kindLabel: { equipment: 'Equipment', stones: 'Fate stones' },
    waveAll: 'All waves',
    dropTitle: (n) => `Boss drops (${n})`,
    waveDropTitle: (wave, n) => `Wave ${wave} — drops (${n})`,
    bossLine: (bosses, waves, many, manyWaves) => `from boss${many ? 'es' : ''} ${bosses} (wave${manyWaves ? 's' : ''} ${waves})`,
    dropTooltip: 'Drops from endless bosses:',
    dropTooltipLine: (boss, wave, chance) => `boss ${boss}, wave ${wave}: ${chance}`,
    wavesTitle: (n) => `Waves and bosses (${n})`,
    boss: (n) => `Boss ${n}`,
    waveMeta: (poolId, equipment, stones) => `${poolId} · ${equipment} equipment · ${stones} fate stones`,
    waveSplit: (split) => `a roll: ${split}`,
    waveSet: 'Click to show this wave’s drops',
    waveClear: 'Click to clear the wave filter',
    endlessNoteChance:
      'The chance is the item’s share of that wave’s reward list. Endless items drop only from bosses: under an item are the boss numbers, and their waves in brackets. Fate stones drop only here — normal monsters never drop them.',
    endlessNoteDeep: (waves, last, poolId, level) =>
      `The reward pool changes only on waves ${waves} — and stays on the last one: from wave ${last} on, at any depth (54, 100 — any), the same pool drops (${poolId}, Level ${level}) as on wave ${last}, and quality has already hit its ceiling — from wave 18 a boss always drops quality 6 items. Deeper, only the monsters grow (from floor 50, the “extreme depth”: +30% damage and +20% damage resistance per floor, see Monster scaling) — the drops do not get better.`,
    endlessNoteTeam:
      'Since v1.506 endless runs are formed as a team: a queue with a leader, the roster can be locked, and the run can start on a chosen floor (“Starting at Floor N”). Skipped floors earn no season contribution points (which affects season progression).',

    spawnsTitle: 'Spawn pools',
    poolsCount: (n) => `${n} pools`,
    tierGroup: (tier, n) => `Tier ${tier} — ${n} pools`,
    endlessGroup: (n) => `Endless — ${n} pools`,
    poolMeta: (level, n) => `lv. ${level} · ${n}`,
    openMonster: 'open in Monsters',
    jumpPool: 'Go to this pool',
    spawnsNote:
      'A pool is the floor’s bag of monsters, not the wave itself: who, how many and where is under Waves. A link to another pool (GCM_…) means part of the weight goes to it, recursively — a nested pool.',
    focusMissing: 'This monster is not in any spawn pool — it only appears in pre-arranged waves.',

    combosTitle: 'Waves',
    combosCount: (n) => `${n} combos`,
    allTiers: 'All tiers',
    tierChip: (tier) => `Tier ${tier}`,
    endlessChip: 'Endless',
    allFloors: 'All floors',
    floorChip: (floor) => `Floor ${floor}`,
    allKinds: 'All kinds',
    filterTier: 'Tier',
    filterFloor: 'Floor',
    filterKind: 'Kind',
    combosList: (n) => `Combos (${n})`,
    comboMeta: (tier, floor, kind, weight) => `${tier} · floor ${floor} · ${kind} · weight ${weight}`,
    role: { elite: 'elite', normal: 'normal' },
    memberTitle: (id, role, x, y) => `${id} — role ${role} — offset ${x}, ${y} — show its spawn pool`,
    roleDefault: 'the combo’s own kind',
    offset: 'Offset from the arena centre',
    combosNote:
      'The coordinates are offsets from the arena centre: they show how the monsters stand (three in a line, a circle). Weight is the relative chance of picking this combo from its group. A member’s role (boss / elite / normal) sets both its strength and its crystals: boss combos can have elite and normal escorts — they pay their own crystals, not a boss’s.',

    scalingTitle: 'Monster scaling',
    scalingCode: (n) => `${n} floors`,
    scalingIntro:
      'Monsters grow with the floor (in the endless run, the wave is the floor). The regular tiers share one curve for all three, the endless run has its own table.',
    scalingPlayers:
      'The number of players in a run does not change monster stats: HP and damage depend only on the floor and the kind of monster. Only rewards depend on the group — each player gets their own boss reward, and each has their own bag.',
    waveCounts: (normalTotal, maxAlive, eliteMin, eliteMax, eliteCfg, followPct) =>
      `A normal wave: ${normalTotal} normal monsters in total, but no more than ${maxAlive} on the field at once; then the elite segment — one of the floor’s elite combos, ${eliteMin}–${eliteMax} monsters (random by weight; the “${eliteCfg}” in the config is only the value before a combo is picked). Every third floor is a boss; if there are several bosses, the next one enters early when the first drops below ${followPct} health.`,
    tiersTitle: 'Regular tiers (Sky 1–3)',
    tiersText: (anchor, growth) =>
      `Base values are given at floor ${anchor}; from there they are multiplied by ${growth} per floor and by the tier’s multiplier. Normal monsters and elites also get ×2 HP and ×0.7 attack; bosses do not.`,
    tierCell: (tier) => `Tier ${tier}`,
    tierCellMeta: (floors, mult, move, aspd) => `${floors} floors · multiplier ×${mult} · move +${move} · attack speed +${aspd}`,
    atFloor: (floor) => `Floor ${floor}`,
    hpAtk: (hp, atk) => `${hp} HP / ${atk} damage`,
    tierCellTitle: (growth) => `×${growth} per floor: each next floor multiplies these values by the same number`,
    endlessTitle: (n) => `Endless — floors (${n})`,
    col: { floor: 'Floor', normal: 'Normal', elite: 'Elite', boss: 'Boss', armor: 'Armor', mr: 'Magic res.' },
    growthTitle: 'Past the table',
    growthText: (last, curveTier, hp, atk, armor, mr, cap) =>
      `Up to floor ${last} the endless run uses tier ${curveTier}’s curve; after that the multiplier takes over: HP ×${hp} per floor, damage ×${atk}; armor +${armor} every 3 floors, magic resistance +${mr} every 3 floors (capped at ${cap}%).`,
    deepText: (from, dmg, resist, stun) =>
      `From floor ${from} the “extreme depth” applies: every further floor gives monsters +${dmg}% outgoing damage and +${resist}% damage resistance. Endless bosses’ stun resistance grows linearly: ${stun} + (floor − 1).`,
  },

  ru: {
    title: 'Небо',
    lead: 'Пещера жадности: тиры, бесконечка, пулы спавна, волны и скейл монстров',
    tabsLabel: 'Страницы Неба',
    tab: { tier: (tier) => `Небо ${tier}`, endless: 'Бесконечка', spawns: 'Пулы спавна', combos: 'Волны', scaling: 'Скейл монстров' },
    partnerMark: '*',
    partnerNote:
      '* Число из партнёрской вики (v1.507). Игра хранит его в зашифрованном коде, поэтому в файлах, которые читает эта вики, его нет.',
    kind: { normal: 'обычный', elite: 'элита', boss: 'босс' },
    unitType: {
      monster_normal: 'Обычный',
      monster_elite: 'Элитный',
      monster_miniboss: 'Мини-босс',
      monster_boss: 'Босс',
      building: 'Строение',
      container: 'Контейнер',
      destructible: 'Разрушаемый объект',
    },

    tierCode: (tier) => `qing_tian_mi_jing · тир ${tier}`,
    facts: {
      floors: 'Этажей',
      invitation: 'Предмет входа',
      daily: 'Заходов в день',
      revives: 'Воскрешений',
      mult: 'HP и атака монстров',
      move: 'Бег монстров',
      aspd: 'Скорость атаки монстров',
      armor: 'Броня монстров',
      mr: 'Маг. сопр. монстров',
    },
    chestTitle: (poolId, poolName) => `Сундук-награда (${poolId})${poolName !== null ? ` — «${poolName}»` : ''}`,
    rewardLevel: (level, from, below, extraDraws, multMin, multMax) =>
      `${level}-й — ${from !== null ? `от ${from}` : `меньше ${below ?? ''}`}: ${
        extraDraws > 0 ? `+${extraDraws} вытяжк${extraDraws === 1 ? 'а' : 'и'}` : 'без бонусных вытяжек'
      }, древние монеты ×${multMin}–${multMax}`,
    chestText: (coinsPerDraw, poolId, levels) =>
      `В конце захода открывается сундук за собранные кристаллы души: одна вытяжка — ${coinsPerDraw} кристаллов, за вытяжку падает один предмет из пула ${poolId}. Уровень сундука по кристаллам даёт бонусные вытяжки: ${levels}.`,
    coinsNote: (c) =>
      `Кристаллы души падают с монстров: обычный — ${c.normal} (шанс ${c.luckyPct} % — сразу ${c.lucky}, ещё ${c.bonusPct} % — ${c.bonus}); элита — ${c.elite} (${c.eliteLuckyPct} % — ${c.eliteLucky}); босс — ${c.boss}. Если вся команда погибла, остаётся ${c.retain}. Вытяжек за заход: ⌊кристаллы ÷ ${c.coinsPerDraw}⌋ + бонус уровня.`,
    expectedNote: (floors, crystals, level, draws, coins) =>
      `В среднем за полный заход (${floors} этажей) набирается ~${crystals} кристаллов: уровень сундука ${level}, ~${draws} вытяжек и ~${coins} древних монет — без талантов, при гибели команды кристаллов вдвое меньше.`,
    ancientNote: (itemName, itemId, perCoin, talents) =>
      `Древние монеты («${itemName}», ${itemId}) капают вместе с предметами: ⌈кристаллы × ${perCoin} × множитель уровня⌉, плюс таланты ${talents} добавляют ⌊монеты × процент ÷ 100⌋.`,
    share: 'Доля в пуле',
    chestShare: (poolId, share) => `из ${poolId} · ${share}`,
    monstersTitle: (n) => `Монстры тира (${n})`,
    monstersNote:
      'Все монстры, которых выставляет тир: пулы спавна его этажей и его элитные и боссовые волны. Клик — показать пул спавна, в котором стоит монстр.',
    floorsShort: (floors) => `этажи ${floors}`,
    nested: 'через вложенный пул',
    showSpawns: 'Показать пул спавна',
    monsterPage: 'Карточка монстра',

    endlessCode: 'GCE_BOSS · волна = уровень босса × 3',
    kindAll: 'Всё',
    kindLabel: { equipment: 'Снаряжение', stones: 'Грани' },
    waveAll: 'Все волны',
    dropTitle: (n) => `Дроп с боссов (${n})`,
    waveDropTitle: (wave, n) => `Волна ${wave} — дроп (${n})`,
    bossLine: (bosses, waves, many, manyWaves) => `${many ? 'с боссов' : 'с босса'} ${bosses} (${manyWaves ? 'волны' : 'волна'} ${waves})`,
    dropTooltip: 'Выпадает с боссов бесконечки:',
    dropTooltipLine: (boss, wave, chance) => `с босса ${boss}, волна ${wave}: ${chance}`,
    wavesTitle: (n) => `Волны и боссы (${n})`,
    boss: (n) => `Босс ${n}`,
    waveMeta: (poolId, equipment, stones) => `${poolId} · ${equipment} снаряж. · ${stones} граней`,
    waveSplit: (split) => `ролл: ${split}`,
    waveSet: 'Клик — показать дроп этой волны',
    waveClear: 'Клик — снять фильтр по этой волне',
    endlessNoteChance:
      'Шанс — доля предмета в пуле награды конкретной волны. Предметы бесконечки падают только с боссов: в подписи под предметом — номера боссов, в скобках — их волны. Грани выпадают только здесь, с обычных монстров они не падают.',
    endlessNoteDeep: (waves, last, poolId, level) =>
      `Пул награды меняется только на волнах ${waves} — на последней он и фиксируется: с ${last}-й волны и на любой глубине дальше (54-я, 100-я — любая) падает тот же пул (${poolId}, Level ${level}), что на ${last}-й, а качество уже упёрлось в максимум — с 18-й волны босс всегда роняет предметы качества 6. Глубже растут только монстры (с 50-го этажа — «сверхглубина»: +30 % урона и +20 % сопротивления за каждый этаж, см. «Скейл монстров») — сам дроп глубже не улучшается.`,
    endlessNoteTeam:
      'С v1.506 бесконечка собирается командой: очередь с лидером, состав можно залочить, а старт — с выбранного этажа («Starting at Floor N»). За пропущенные этажи очки вклада сезона не начисляются (это влияет на «Развитие сезона»).',

    spawnsTitle: 'Пулы спавна',
    poolsCount: (n) => `пулов ${n}`,
    tierGroup: (tier, n) => `Тир ${tier} — пулов ${n}`,
    endlessGroup: (n) => `Бесконечный режим — пулов ${n}`,
    poolMeta: (level, n) => `ур. ${level} · ${n}`,
    openMonster: 'открыть во вкладке монстров',
    jumpPool: 'Перейти к этому пулу',
    spawnsNote:
      'Пул задаёт «мешок» монстров этажа, а не саму волну: состав волн (кто, сколько и где стоит) — в подвкладке «Волны». Ссылка на другой пул (GCM_…) означает, что часть веса уходит в него рекурсивно, то есть это вложенный пул.',
    focusMissing: 'Этого монстра нет ни в одном пуле спавна — он выходит только в готовых волнах.',

    combosTitle: 'Волны',
    combosCount: (n) => `комбо ${n}`,
    allTiers: 'Все тиры',
    tierChip: (tier) => `Тир ${tier}`,
    endlessChip: 'Бесконечка',
    allFloors: 'Все этажи',
    floorChip: (floor) => `Этаж ${floor}`,
    allKinds: 'Все виды',
    filterTier: 'Тир',
    filterFloor: 'Этаж',
    filterKind: 'Вид',
    combosList: (n) => `Комбо (${n})`,
    comboMeta: (tier, floor, kind, weight) => `${tier} · этаж ${floor} · ${kind} · вес ${weight}`,
    role: { elite: 'элита', normal: 'обычный' },
    memberTitle: (id, role, x, y) => `${id} — роль ${role} — смещение ${x}, ${y} — показать пул спавна`,
    roleDefault: 'boss (по умолчанию)',
    offset: 'Смещение от центра площадки',
    combosNote:
      'Координаты — смещения от центра площадки: по ним видно, как расставлены монстры (например, три в линию или по кругу). Вес — относительный шанс выбрать это комбо из его группы. Роль участника (boss/элита/обычный) задаёт и его силу, и кристаллы с него: в босс-комбо бывают элитные и обычные спутники — они дают свои кристаллы, а не боссовские.',

    scalingTitle: 'Скейл монстров',
    scalingCode: (n) => `этажей ${n}`,
    scalingIntro:
      'Монстры растут от этажа (в бесконечке волна — это и есть этаж). У обычных тиров одна кривая на все три башни, в бесконечке — своя таблица.',
    scalingPlayers:
      'Число игроков в забеге характеристики монстров не меняет: HP и урон зависят только от этажа и вида монстра. От состава группы зависят только награды — с босса каждому игроку падает своя награда, и сумка у каждого своя.',
    waveCounts: (normalTotal, maxAlive, eliteMin, eliteMax, eliteCfg, followPct) =>
      `Обычная волна: ${normalTotal} обычных монстров всего, но одновременно на поле — не больше ${maxAlive}; затем элитный отрезок — одно элитное комбо этажа, ${eliteMin}–${eliteMax} монстров (случайно по весам; «${eliteCfg}» в конфиге — только значение до выбора комбо). Каждый третий этаж — босс; если боссов несколько, следующий входит досрочно, когда у первого остаётся меньше ${followPct} здоровья.`,
    tiersTitle: 'Обычные тиры (Небо 1–3)',
    tiersText: (anchor, growth) =>
      `Базовые значения даны на ${anchor}-м этаже, дальше умножаются на ${growth} за каждый этаж и на множитель тира. Обычные и элита дополнительно получают ×2 HP и ×0,7 атаки; боссы — нет.`,
    tierCell: (tier) => `Тир ${tier}`,
    tierCellMeta: (floors, mult, move, aspd) => `этажей ${floors} · множитель ×${mult} · бег +${move} · атака +${aspd}`,
    atFloor: (floor) => `Этаж ${floor}`,
    hpAtk: (hp, atk) => `${hp} HP / ${atk} урона`,
    tierCellTitle: (growth) => `Рост ×${growth} за этаж: каждый следующий этаж умножает эти значения на это же число`,
    endlessTitle: (n) => `Бесконечка — этажи (${n})`,
    col: { floor: 'Этаж', normal: 'Обычный', elite: 'Элита', boss: 'Босс', armor: 'Броня', mr: 'Маг. сопр.' },
    growthTitle: 'Что после таблицы',
    growthText: (last, curveTier, hp, atk, armor, mr, cap) =>
      `До ${last}-го этажа бесконечка идёт по кривой тира ${curveTier}, после него включается множитель: здоровье ×${hp} за этаж, урон ×${atk}; броня +${armor} за каждые 3 этажа, сопротивление магии +${mr} за 3 этажа (потолок ${cap} %).`,
    deepText: (from, dmg, resist, stun) =>
      `С ${from}-го этажа работает «сверхглубина»: за каждый следующий этаж монстры получают +${dmg} % исходящего урона и +${resist} % сопротивления урону. Сопротивление стану у боссов бесконечки растёт линейно: ${stun} + (этаж − 1).`,
  },

  zh: {
    title: '天空',
    lead: '倾天秘境：各阶、无尽、刷怪池、波次与怪物成长',
    tabsLabel: '倾天秘境页面',
    tab: { tier: (tier) => `${tier}阶秘境`, endless: '无尽', spawns: '刷怪池', combos: '波次', scaling: '怪物成长' },
    partnerMark: '*',
    partnerNote: '* 该数值来自合作百科（v1.507）。游戏把它放在加密代码中，本百科读取的文件里没有它。',
    kind: { normal: '小怪', elite: '精英', boss: '首领' },
    unitType: {
      monster_normal: '小怪',
      monster_elite: '精英怪',
      monster_miniboss: '小首领',
      monster_boss: '首领',
      building: '建筑',
      container: '容器',
      destructible: '可破坏物',
    },

    tierCode: (tier) => `G001 · ${tier}阶`,
    facts: {
      floors: '层数',
      invitation: '入场道具',
      daily: '每日次数',
      revives: '复活次数',
      mult: '怪物生命与攻击',
      move: '怪物移速',
      aspd: '怪物攻速',
      armor: '怪物护甲',
      mr: '怪物魔抗',
    },
    chestTitle: (poolId, poolName) => `结算宝箱（${poolId}）${poolName !== null ? `——「${poolName}」` : ''}`,
    rewardLevel: (level, from, below, extraDraws, multMin, multMax) =>
      `${level}级——${from !== null ? `${from} 起` : `低于 ${below ?? ''}`}：${
        extraDraws > 0 ? `额外抽取 +${extraDraws}` : '无额外抽取'
      }，远古币 ×${multMin}–${multMax}`,
    chestText: (coinsPerDraw, poolId, levels) =>
      `一次挑战结束时，会按收集到的秘晶开启宝箱：每 ${coinsPerDraw} 秘晶抽取一次，每次从掉落池 ${poolId} 中给出一件物品。宝箱等级由秘晶数决定，并提供额外抽取：${levels}。`,
    coinsNote: (c) =>
      `怪物掉落秘晶：小怪 ${c.normal}（${c.luckyPct}% 概率改为 ${c.lucky}，另有 ${c.bonusPct}% 为 ${c.bonus}）；精英 ${c.elite}（${c.eliteLuckyPct}% 为 ${c.eliteLucky}）；首领 ${c.boss}。全队阵亡时保留 ${c.retain}。每次挑战的抽取次数：⌊秘晶 ÷ ${c.coinsPerDraw}⌋ + 等级奖励。`,
    expectedNote: (floors, crystals, level, draws, coins) =>
      `一次完整挑战（${floors} 层）平均可得约 ${crystals} 秘晶：宝箱 ${level} 级，约 ${draws} 次抽取和约 ${coins} 远古币——不计天赋；全队阵亡则秘晶减半。`,
    ancientNote: (itemName, itemId, perCoin, talents) =>
      `远古币（「${itemName}」，${itemId}）随物品一同发放：⌈秘晶 × ${perCoin} × 等级倍率⌉，天赋 ${talents} 另加 ⌊远古币 × 百分比 ÷ 100⌋。`,
    share: '单次抽取占比',
    chestShare: (poolId, share) => `来自 ${poolId} · ${share}`,
    monstersTitle: (n) => `本阶怪物（${n}）`,
    monstersNote: '本阶会出现的全部怪物：各层的刷怪池以及精英与首领波次。点击可查看它所在的刷怪池。',
    floorsShort: (floors) => `第 ${floors} 层`,
    nested: '经嵌套池',
    showSpawns: '查看刷怪池',
    monsterPage: '怪物页面',

    endlessCode: 'GCE_BOSS · 波次 = 首领等级 × 3',
    kindAll: '全部',
    kindLabel: { equipment: '装备', stones: '命石' },
    waveAll: '全部波次',
    dropTitle: (n) => `首领掉落（${n}）`,
    waveDropTitle: (wave, n) => `第 ${wave} 波——掉落（${n}）`,
    bossLine: (bosses, waves) => `来自首领 ${bosses}（第 ${waves} 波）`,
    dropTooltip: '无尽首领掉落：',
    dropTooltipLine: (boss, wave, chance) => `首领 ${boss}，第 ${wave} 波：${chance}`,
    wavesTitle: (n) => `波次与首领（${n}）`,
    boss: (n) => `首领 ${n}`,
    waveMeta: (poolId, equipment, stones) => `${poolId} · 装备 ${equipment} · 命石 ${stones}`,
    waveSplit: (split) => `每次：${split}`,
    waveSet: '点击查看该波掉落',
    waveClear: '点击取消该波筛选',
    endlessNoteChance:
      '概率指物品在该波奖励列表中的占比。无尽物品只由首领掉落：物品下方是首领编号，括号内为对应波次。命石只在这里掉落，普通怪物不会掉。',
    endlessNoteDeep: (waves, last, poolId, level) =>
      `奖励池只在第 ${waves} 波变化，并停在最后一档：从第 ${last} 波起，无论多深（第 54、第 100 波都一样）掉落的都是与第 ${last} 波相同的池（${poolId}，Level ${level}），品质也已到顶——第 18 波起首领总是掉落 6 品质物品。更深处只有怪物变强（第 50 层起为「超深层」：每层 +30% 伤害、+20% 伤害抗性，见「怪物成长」）——掉落不会再变好。`,
    endlessNoteTeam:
      '自 v1.506 起无尽以组队方式进行：由队长组队排队，可锁定阵容，并可从指定层开始（「Starting at Floor N」）。跳过的层不计入赛季贡献点（影响赛季成长）。',

    spawnsTitle: '刷怪池',
    poolsCount: (n) => `${n} 个池`,
    tierGroup: (tier, n) => `${tier}阶——${n} 个池`,
    endlessGroup: (n) => `无尽模式——${n} 个池`,
    poolMeta: (level, n) => `${level}级 · ${n}`,
    openMonster: '在怪物分区打开',
    jumpPool: '跳到该池',
    spawnsNote:
      '池是该层的怪物「袋子」，不是波次本身：谁、多少、站在哪里，见「波次」。指向另一个池（GCM_…）表示部分权重递归地分给它，即嵌套池。',
    focusMissing: '该怪物不在任何刷怪池中——它只出现在预设波次里。',

    combosTitle: '波次',
    combosCount: (n) => `${n} 个组合`,
    allTiers: '全部阶',
    tierChip: (tier) => `${tier}阶`,
    endlessChip: '无尽',
    allFloors: '全部层',
    floorChip: (floor) => `第 ${floor} 层`,
    allKinds: '全部类型',
    filterTier: '阶',
    filterFloor: '层',
    filterKind: '类型',
    combosList: (n) => `组合（${n}）`,
    comboMeta: (tier, floor, kind, weight) => `${tier} · 第 ${floor} 层 · ${kind} · 权重 ${weight}`,
    role: { elite: '精英', normal: '小怪' },
    memberTitle: (id, role, x, y) => `${id} — 定位 ${role} — 偏移 ${x}, ${y} — 查看刷怪池`,
    roleDefault: '组合本身的类型',
    offset: '相对场地中心的偏移',
    combosNote:
      '坐标是相对场地中心的偏移：可以看出怪物如何站位（例如三只一排或围成一圈）。权重是从所在组中选中该组合的相对概率。成员的定位（首领/精英/小怪）同时决定其强度与秘晶：首领组合中可能有精英和小怪随从——它们给的是各自的秘晶，而不是首领的。',

    scalingTitle: '怪物成长',
    scalingCode: (n) => `${n} 层`,
    scalingIntro: '怪物随层数成长（无尽中波次即层数）。普通各阶三座共用一条曲线，无尽有自己的表。',
    scalingPlayers:
      '队伍人数不会改变怪物属性：生命与伤害只取决于层数和怪物类型。只有奖励与队伍有关——首领给每位玩家各自的奖励，每人的背包也各自独立。',
    waveCounts: (normalTotal, maxAlive, eliteMin, eliteMax, eliteCfg, followPct) =>
      `普通波次：共 ${normalTotal} 只小怪，但场上同时最多 ${maxAlive} 只；之后是精英段——本层的一个精英组合，${eliteMin}–${eliteMax} 只（按权重随机；配置中的「${eliteCfg}」只是选定组合前的值）。每第三层为首领层；若有多个首领，第一个生命低于 ${followPct} 时下一个提前登场。`,
    tiersTitle: '普通各阶（1–3 阶）',
    tiersText: (anchor, growth) =>
      `基础值以第 ${anchor} 层为准，之后每层乘以 ${growth}，再乘以该阶倍率。小怪与精英另有 ×2 生命、×0.7 攻击；首领没有。`,
    tierCell: (tier) => `${tier}阶`,
    tierCellMeta: (floors, mult, move, aspd) => `${floors} 层 · 倍率 ×${mult} · 移速 +${move} · 攻速 +${aspd}`,
    atFloor: (floor) => `第 ${floor} 层`,
    hpAtk: (hp, atk) => `${hp} 生命 / ${atk} 伤害`,
    tierCellTitle: (growth) => `每层 ×${growth}：下一层把这些数值再乘以同一个数`,
    endlessTitle: (n) => `无尽——各层（${n}）`,
    col: { floor: '层', normal: '小怪', elite: '精英', boss: '首领', armor: '护甲', mr: '魔抗' },
    growthTitle: '表格之后',
    growthText: (last, curveTier, hp, atk, armor, mr, cap) =>
      `第 ${last} 层之前，无尽沿用 ${curveTier} 阶的曲线；之后改为倍率成长：生命每层 ×${hp}，伤害 ×${atk}；护甲每 3 层 +${armor}，魔抗每 3 层 +${mr}（上限 ${cap}%）。`,
    deepText: (from, dmg, resist, stun) =>
      `第 ${from} 层起为「超深层」：之后每层怪物获得 +${dmg}% 输出伤害和 +${resist}% 伤害抗性。无尽首领的眩晕抗性线性增长：${stun} + (层数 − 1)。`,
  },
};
