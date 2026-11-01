import type { AttrBonus, DpsSourceId, EffectFacts, EnemyKind } from 'aow5-shared/wiki';
import type { Localised } from './index';
import { STAT_NAMES } from './statNames';

/**
 * The stats calculator's words, and the item editor's (the items page reuses
 * the editor, and with it this table).
 *
 * Russian is the partner wiki's own wording. Formatting of numbers is the
 * caller's: every function that prints one takes `n`, the page's `num()`.
 */

type N = (value: number) => string;
type AttrName = 'str' | 'agi' | 'int';

export type SlotKind = 'slot' | 'neutral' | 'pet' | 'bag' | 'soul' | 'rune';

export interface CalcStrings {
  title: string;
  wipTitle: string;
  wip: string;
  hero: string;
  /** The note line beside the hero select. */
  note: {
    computed: (level: number) => string;
    noData: string;
    universal: string;
    primary: (attr: AttrName) => string;
    overrides: (count: number) => string;
  };
  attr: Record<AttrName, string>;
  modes: { delta: string; deltaTitle: string; full: string; fullTitle: string; label: string };
  recalc: string;
  recalcTitle: string;
  resetAll: string;
  resetAllTitle: string;
  hint: string;
  head: { stat: string; base: (level: number) => string; items: string; buffs: string; plus: string; total: string };
  /** The permanent consumables column: one-time items with a lifetime limit. */
  buffs: {
    title: string;
    note: string;
    empty: string;
    all: string;
    allTitle: string;
    max: (n: number) => string;
    offPanel: string;
    perUse: (amount: string, label: string) => string;
    /** Labels for buff keys that are not panel rows. */
    keys: Record<string, string>;
  };
  /** The achievements dialog and the button that opens it. */
  achievements: {
    button: string;
    buttonTitle: string;
    title: string;
    note: string;
    /** The heading of the one series the game files under `level`. */
    levelCategory: string;
    reset: string;
    close: string;
    loading: string;
    empty: string;
    /** The bonus line when no level of a series is selected. */
    notSelected: string;
    selected: (n: number) => string;
  };
  cell: {
    seasonRange: (max: number) => string;
    override: string;
    fromHero: (hero: string, level: number) => string;
    overrideMark: string;
    seasonTotal: (pct: string) => string;
    seasonTitle: string;
    pctBonus: (pct: string) => string;
  };
  groups: Record<'attrs' | 'hpMana' | 'attack' | 'defence' | 'crits' | 'season' | 'other' | 'amps', string>;
  /** The panel's own row names. */
  rows: Record<string, string>;
  formulas: (b: AttrBonus, n: N) => string;
  effects: {
    title: string;
    conditional: string;
    unmodelled: string;
    none: string;
    line: (f: EffectFacts, n: N) => string;
  };
  inv: {
    title: string;
    note: string;
    slot: (i: number) => string;
    kinds: Record<Exclude<SlotKind, 'slot' | 'rune'>, string>;
    rune: (i: number) => string;
    runes: string;
    remove: string;
    add: string;
  };
  editor: {
    empty: string;
    soul: string;
    rune: (target: string | null) => string;
    params: string;
    noDesc: string;
  };
  picker: {
    titles: Record<SlotKind, string>;
    runeFor: (hero: string) => string;
    search: string;
    meta: (id: string, level: number, quality: number) => string;
    nothing: string;
    choose: string;
    close: string;
    loading: string;
  };
  base: {
    title: string;
    noData: string;
    summary: (p: { hero: string; level: number; base: string; growth: string; tiers: number; nodes: number }) => string;
    tiersLead: string;
    tier: (name: string, level: number, str: string, agi: string, int: string) => string;
    attrHead: (levels: number) => string[];
    toAll: (v: string) => string;
    derivedHead: string[];
    treesTitle: string;
    treeChip: (name: string, id: string, nodes: number) => string;
    treeNoStats: string;
    unusedLead: string;
    notesTitle: string;
    vanilla: (count: number) => string;
    vanillaNone: string;
    s3Only: (hero: string) => string;
    marks: string;
    notModelled: string;
  };
  /** The DPS sub-tab: its target form, summary, source bars and caveats. */
  dps: DpsStrings;
  /** Stat names the game's own tables leave unnamed. Keys are item/panel stat keys. */
  statNames: Record<string, string>;
  stats: StatsEditorStrings;
}

export interface DpsStrings {
  tab: { stats: string; dps: string };
  title: string;
  note: string;
  enemy: {
    title: string;
    preset: string;
    presetBoss: string;
    custom: string;
    kind: string;
    kinds: Record<EnemyKind, string>;
    maxHp: string;
    armor: string;
    magicResistance: string;
    healthRegen: string;
    damageReduction: string;
    damageResistance: string;
    physicalIncrease: string;
    duration: string;
    durationHint: string;
    reset: string;
  };
  summary: {
    title: string;
    windowDps: string;
    windowDamage: string;
    ttk: string;
    ttkNone: string;
    attacks: string;
    killAttacks: string;
    killDamage: string;
    attackSpeed: string;
    aps: string;
    critChance: string;
    critMultiplier: string;
    armor: string;
    armorBreak: string;
    penetration: string;
    poisonStacks: string;
    doomStacks: string;
    noItems: string;
  };
  sources: {
    title: string;
    share: string;
    damage: string;
    dps: string;
    labels: Record<DpsSourceId, string>;
  };
  /** Actives that the reader can tick to use on cooldown. */
  active: {
    title: string;
    note: string;
    feather: string;
    featherAncestor: string;
    phase: string;
    madness: string;
    meta: (cooldown: string, duration: string, interval: string, pct: string) => string;
    phaseMeta: (cooldown: string, duration: string) => string;
    madnessMeta: (cooldown: string, duration: string) => string;
  };
  /** Per-second window and the kill's event log. */
  timeline: {
    title: string;
    windowTab: string;
    killTab: string;
    second: string;
    time: string;
    source: string;
    damage: string;
    hp: string;
    note: string;
    empty: string;
    firstOnly: string;
  };
  notes: { title: string; lines: string[] };
}

/** The item editor. */
export interface StatsEditorStrings {
  title: string;
  cooldown: (s: string) => string;
  noStats: string;
  divine: string;
  divineTitle: (base: number, ability: number) => string;
  enhance: (pct: number) => string;
  enhanceTitle: string;
  refine: (level: number) => string;
  refineTitle: string;
  fix: string;
  fixTitle: (pct: number) => string;
  enh: string;
  enhTitle: (pct: number) => string;
  stoneFixTitle: (pct: number) => string;
  dashEffect: (divineOnly: boolean) => string;
  dashStone: string;
  cols: { prop: string; range: string; roll: string; item: string; stone: string; total: string };
  effectGroup: string;
  stoneGroup: string;
  fixedValue: string;
  fixedRange: string;
  rangeTitle: (half: string) => string;
  stepsTitle: string;
  stepChip: (rollPct: string, value: string, count: number) => string;
  stepValue: (value: string, count: number, refine: number) => string;
  current: (value: string, rollPct: string) => string;
  withStone: (value: string) => string;
  reverse: string;
  colours: string;
  effectColours: string;
  stoneRange: string;
  stoneSliderOnly: string;
  stoneSlider: string;
  stoneItemDash: (only: boolean) => string;
  stoneValue: (only: boolean, value: string, rollPct: string) => string;
  stoneTotal: (only: boolean) => string;
  stoneCol: string;
  totalCol: string;
  noStoneCol: string;
  totalOwn: string;
  stoneNote: (fixed: number) => string;
  note: (p: { fixed: number; divine: number; ability: number; stone: boolean }) => string;
}

const ROWS_RU: Record<string, string> = {
  bonus_strength: 'Сила',
  bonus_agility: 'Ловкость',
  bonus_intelligence: 'Интеллект',
  bonus_all_stats: 'Все атрибуты',
  bonus_health: 'Здоровье',
  health_regen: 'Регенерация здоровья',
  bonus_mana: 'Мана',
  mana_regen: 'Регенерация маны',
  bonus_attack_damage: 'Урон от атаки',
  all_attack_damage_percent: 'Урон от атаки, %',
  attack_speed: 'Скорость атаки',
  attack_speed_pct: 'Скорость атаки, %',
  bonus_movespeed: 'Скорость передвижения',
  bonus_armor: 'Броня',
  base_magic_resistance: 'Маг. сопротивление',
  damage_resistance_pct: 'Сопротивление урону, %',
  evasion_pct: 'Уклонение, %',
  physical_crit_chance_pct: 'Шанс физ. крита, %',
  magical_crit_chance_pct: 'Шанс маг. крита, %',
  omni_crit_chance_pct: 'Шанс общего крита, %',
  crit_damage_pct: 'Урон от крита, %',
  season_contribution: 'Уровень личного вклада',
  season_world: 'Уровень мира',
  block: 'Блок',
  extra_backpack_slot_limit: 'Слоты рюкзака',
  outgoing_damage_pct: 'Бонус к урону, %',
  outgoing_damage_pct_2: 'Итоговый урон, %',
  physical_damage_add_pct: 'Физ. урон, %',
  magical_damage_add_pct: 'Маг. урон, %',
  spell_amplify_pct: 'Урон навыка, %',
  dot_outgoing_damage_pct: 'Периодический урон, %',
  poison_outgoing_damage_pct: 'Урон ядом, %',
  bleed_outgoing_damage_pct: 'Урон кровотечением, %',
};

const ROWS_EN: Record<string, string> = {
  bonus_strength: 'Strength',
  bonus_agility: 'Agility',
  bonus_intelligence: 'Intelligence',
  bonus_all_stats: 'All Stats',
  bonus_health: 'Health',
  health_regen: 'Health Regen',
  bonus_mana: 'Mana',
  mana_regen: 'Mana Regen',
  bonus_attack_damage: 'Attack Damage',
  all_attack_damage_percent: 'Attack Damage, %',
  attack_speed: 'Attack Speed',
  attack_speed_pct: 'Attack Speed, %',
  bonus_movespeed: 'Movement Speed',
  bonus_armor: 'Armor',
  base_magic_resistance: 'Magic Resistance',
  damage_resistance_pct: 'Damage Resistance, %',
  evasion_pct: 'Evasion, %',
  physical_crit_chance_pct: 'Physical Crit Chance, %',
  magical_crit_chance_pct: 'Magical Crit Chance, %',
  omni_crit_chance_pct: 'Omni Crit Chance, %',
  crit_damage_pct: 'Crit Damage, %',
  season_contribution: 'Personal contribution level',
  season_world: 'World level',
  block: 'Block',
  extra_backpack_slot_limit: 'Backpack Slots',
  outgoing_damage_pct: 'Damage Bonus, %',
  outgoing_damage_pct_2: 'Final Damage, %',
  physical_damage_add_pct: 'Physical Damage, %',
  magical_damage_add_pct: 'Magical Damage, %',
  spell_amplify_pct: 'Spell Amplify, %',
  dot_outgoing_damage_pct: 'Damage over Time, %',
  poison_outgoing_damage_pct: 'Poison Damage, %',
  bleed_outgoing_damage_pct: 'Bleed Damage, %',
};

const ROWS_ZH: Record<string, string> = {
  bonus_strength: '力量',
  bonus_agility: '敏捷',
  bonus_intelligence: '智力',
  bonus_all_stats: '全属性',
  bonus_health: '生命值',
  health_regen: '生命恢复',
  bonus_mana: '魔法值',
  mana_regen: '魔法恢复',
  bonus_attack_damage: '攻击力',
  all_attack_damage_percent: '攻击力 %',
  attack_speed: '攻击速度',
  attack_speed_pct: '攻击速度 %',
  bonus_movespeed: '移动速度',
  bonus_armor: '护甲',
  base_magic_resistance: '魔法抗性',
  damage_resistance_pct: '伤害抵抗 %',
  evasion_pct: '闪避 %',
  physical_crit_chance_pct: '物理暴击率 %',
  magical_crit_chance_pct: '魔法暴击率 %',
  omni_crit_chance_pct: '全域暴击率 %',
  crit_damage_pct: '暴击伤害 %',
  season_contribution: '个人贡献等级',
  season_world: '世界等级',
  block: '格挡',
  extra_backpack_slot_limit: '背包格子',
  outgoing_damage_pct: '伤害加成 %',
  outgoing_damage_pct_2: '最终伤害 %',
  physical_damage_add_pct: '物理伤害 %',
  magical_damage_add_pct: '魔法伤害 %',
  spell_amplify_pct: '技能伤害 %',
  dot_outgoing_damage_pct: '持续伤害 %',
  poison_outgoing_damage_pct: '中毒伤害 %',
  bleed_outgoing_damage_pct: '流血伤害 %',
};

/** Item stat keys the game's labels skip. The `%` prefix is the game's percent mark. */



const ATTR_RU: Record<AttrName, string> = { str: 'сила', agi: 'ловкость', int: 'интеллект' };
const ATTR_EN: Record<AttrName, string> = { str: 'strength', agi: 'agility', int: 'intelligence' };
const ATTR_ZH: Record<AttrName, string> = { str: '力量', agi: '敏捷', int: '智力' };
const ATTRS: AttrName[] = ['str', 'agi', 'int'];
const signed = (v: number, n: N): string => (v >= 0 ? `+${n(v)}` : `−${n(-v)}`);

const DPS_TEXT: Record<'ru' | 'en' | 'zh', DpsStrings> = {
  ru: {
    tab: { stats: 'Статы', dps: 'DPS' },
    title: 'DPS по цели',
    note: 'Окно урона по выбранной цели: автоатаки, проки предметов, яд и активные предметы. Способности героя, ванильные таланты и сеты пока не входят.',
    enemy: {
      title: 'Цель',
      preset: 'Пресет',
      presetBoss: 'Босс 60-й волны',
      custom: 'Свои значения',
      kind: 'Тип цели',
      kinds: { normal: 'Обычный', elite: 'Элитный', miniboss: 'Мини-босс', boss: 'Босс' },
      maxHp: 'HP',
      armor: 'Броня',
      magicResistance: 'Маг. сопротивление, %',
      healthRegen: 'Реген HP/с',
      damageReduction: 'Снижение урона, %',
      damageResistance: 'Сопротивление урону, %',
      physicalIncrease: 'Физ. урон по цели, %',
      duration: 'Окно расчёта, с',
      durationHint: 'DPS считается по манекену за это время; смерть цели учитывается отдельным расчётом.',
      reset: 'Сбросить к боссу 60-й волны',
    },
    summary: {
      title: 'Итог',
      windowDps: 'DPS в окне',
      windowDamage: 'Урон за окно',
      ttk: 'Время убийства',
      ttkNone: 'не умирает за окно',
      attacks: 'Автоатак в окне',
      killAttacks: 'Автоатак до смерти',
      killDamage: 'Урон до смерти',
      attackSpeed: 'Скорость атаки',
      aps: 'Атак/с',
      critChance: 'Шанс крита',
      critMultiplier: 'Множитель крита',
      armor: 'Броня после пробития (конец окна)',
      armorBreak: 'Броня после раскола (конец окна)',
      penetration: 'Пробитие брони',
      poisonStacks: 'Слоёв яда (конец окна)',
      doomStacks: 'Слоёв рока (конец окна)',
      noItems: 'Наденьте предметы — считать пока нечего.',
    },
    sources: {
      title: 'Источники урона',
      share: 'Доля',
      damage: 'Урон',
      dps: 'DPS',
      labels: {
        auto: 'Автоатаки',
        talonsLight: 'Когти дракона — лёгкий удар',
        talonsHeavy: 'Когти дракона — тяжёлый удар (ожидание 1 %)',
        bleed: 'Кровотечение',
        bloodEcho: 'Эхо кровавого пула',
        burn: 'Горение (сумка)',
        poison: 'Яд — тики',
        poisonBurst: 'Всплеск Кобры (ожидание)',
        witchBlade: 'Клинок ведьмы — тик (ожидание)',
        feather: 'Кулон небесных перьев — актив',
        dartProc: 'Дротик — прок',
        crystalProc: 'Хрустальный меч — прок',
        valorSword: 'Меч отваги — прок',
        corrosiveSpike: 'Шип разложения — удар',
        feast: 'Пиршество — удар',
        sharpAxe: 'Острая секира — удар по здоровью',
        skullcrusher: 'Череполом — удар по здоровью',
        ruinHammer: 'Молот разрушения — удар по здоровью',
        vortex: 'Перчатки вихря — магия',
        vortexDot: 'Перчатки вихря — вихрь',
        gaze: 'Корона Селемены — удар',
      },
    },
    active: {
      title: 'Активные предметы',
      note: 'Галочка — использовать предмет по КД; перезарядка уменьшается на cooldown_reduction_pct.',
      feather: 'Кулон небесных перьев',
      featherAncestor: 'Предок: Кулон небесных перьев',
      phase: 'Фазовые сапоги',
      madness: 'Маска безумия',
      meta: (cd, duration, interval, pct) => `КД ${cd} с · ${duration} с, тик ${interval} с, ${pct} % статов`,
      phaseMeta: (cd, duration) => `КД ${cd} с · ${duration} с: +35 % скорости передвижения, +20 % уклонения`,
      madnessMeta: (cd, duration) => `КД ${cd} с · ${duration} с: +100 к скорости атаки, +25 к скорости бега, −10 брони`,
    },
    timeline: {
      title: 'Таймлайн',
      windowTab: 'Окно по секундам',
      killTab: 'Убийство: события',
      second: 'Секунда',
      time: 'Время, с',
      source: 'Источник',
      damage: 'Урон',
      hp: 'HP после',
      note: 'Оба вида — один и тот же событийный движок. В окне урон складывается по секундам, в убийстве показываются отдельные удары и тики до смерти.',
      empty: 'Событий нет.',
      firstOnly: 'Показаны первые 30 событий.',
    },
    notes: {
      title: 'Что учтено и что нет',
      lines: [
        'Считаются автоатаки, проки предметов, яд и активные предметы. Способности героя, ванильные таланты и сеты не входят.',
        'Окно и убийство — два независимых прогона: число атак в окне не применяется к цели целиком. В расчёте убийства события идут по времени и останавливаются на смерти.',
        'Первый удар не получает уязвимость, раскол и метку: Посох и сумка накладывают их после него. Поэтому первая автоатака ниже установившейся.',
        'Крит: базовые 5 % обычной атаки, шанс физ. крита и омни складываются по формуле игры; множитель — 180 % + «Урон от крита» с панели.',
        'Кровотечение: 70 % финального урона в пул, 10 тиков; 0467 срабатывает по шансу при полном HP, 0398 — по критам. 0504 превращает часть тика в физ. урон, но он помечен NO_PROC и новых кровотечений не вызывает.',
        'Эхо 0504 — обычный физический удар: на него работают крит, физ. усилители и броня, поэтому при высоком крите оно даёт основную долю урона.',
        'Горение сумки — 0,75 % макс. HP босса за тик, но не больше 10× суммы характеристик; метка даёт +4,6 % за слой, до 10.',
        'Броня: 1 − броня/(26,66 + |броня|); пробитие режет только положительную броню; раскол 0853 — до 31 % брони.',
        'Маг. сопротивление считается для яда, 0209, 0307 и 0161; физические источники его не читают.',
        'Из предметов учтены перечисленные проки, активные баффы и пассивные статы; способности героя, ауры и сеты не входят.',
        'Когти дракона: лёгкий удар срабатывает на каждую автоатаку, тяжёлый — с шансом 1 %; в расчёте тяжёлый показан матожиданием 1 %, а не отдельным проком.',
        'Яд: тики каждые 0,25 с, каждые 3 с сгорает 20 % слоёв и этот тик пропускается. Урон считает сумму статов, магическое сопротивление, коррозию 0365 (до +30 % магического урона), «Урон ядом» и «Периодический урон». Шанс слоя и размер всплеска 0365 берутся из прокрутки предмета; 0238 даёт свой слой со своим шансом. Защитный яд 0238 на атакующего в расчёт не входит: манекен не бьёт.',
        '0209: шанс тика из прокрутки (80 % статов), повторный прок сразу наносит тик; шанс «рока» — до 5 слоёв, каждый снижает маг. сопротивление (здесь 6 % за слой, до 30). 0402: каждый новый слой яда сразу вызывает дополнительный тик, не более одного на атаку.',
        'Актив 0646/0827 считается только при включённой галочке: 10 тиков по 50 % статов чистым уроном, КД 30 с уменьшается на cooldown_reduction_pct (кап 80 %).',
        '0129/0131: физ. прок 25 % × 50; у 0129 числа захардкожены в скрипте, у 0131 берутся из прокрутки. AoE 0131 считается по одной цели; вторичные прок-эффекты от этого удара не разворачиваются.',
        'Проки 2 уровня: 0124/0234/0300 снижают броню (2/5/6, 5 с); 0121/0210/0340 бьют по макс. HP на своём КД; 0457 — 30 % × 80; 0307 — магия (лов+инт)×120 % и вихрь 3 с; 0161 — удар каждые 4 с.',
        '0152 и 0155 используются по КД (12/60 и 6/60 с, CDR): учитываются средние +35 % скорости бега, +100 скорости атаки и +25 бега. 0360/0718 дают ловкость за каждые 5 скорости сверх 250 (1/2 за шаг), и она идёт в урон и скорость атаки.',
        '0166/0303 добавляют по слою яда, когда их КД 1 с готов; 0402 вызывает дополнительный тик. 0124 не наносит урона — только броня.',
      ],
    },
  },
  en: {
    tab: { stats: 'Stats', dps: 'DPS' },
    title: 'DPS against a target',
    note: 'A damage window against the chosen target: auto-attacks, item procs, poison and active items. Hero abilities, stock talents and sets are not in yet.',
    enemy: {
      title: 'Target',
      preset: 'Preset',
      presetBoss: 'Wave-60 boss',
      custom: 'Custom values',
      kind: 'Target kind',
      kinds: { normal: 'Normal', elite: 'Elite', miniboss: 'Mini-boss', boss: 'Boss' },
      maxHp: 'HP',
      armor: 'Armor',
      magicResistance: 'Magic resistance, %',
      healthRegen: 'HP regen/s',
      damageReduction: 'Damage reduction, %',
      damageResistance: 'Damage resistance, %',
      physicalIncrease: 'Physical damage taken, %',
      duration: 'Window, s',
      durationHint: 'DPS is measured on a dummy for this window; the kill is a separate calculation.',
      reset: 'Reset to the wave-60 boss',
    },
    summary: {
      title: 'Result',
      windowDps: 'Window DPS',
      windowDamage: 'Damage in window',
      ttk: 'Time to kill',
      ttkNone: 'survives the window',
      attacks: 'Auto-attacks in window',
      killAttacks: 'Auto-attacks to kill',
      killDamage: 'Damage to kill',
      attackSpeed: 'Attack speed',
      aps: 'Attacks/s',
      critChance: 'Crit chance',
      critMultiplier: 'Crit multiplier',
      armor: 'Armor after penetration (end of window)',
      armorBreak: 'Armor after break (end of window)',
      penetration: 'Armor penetration',
      poisonStacks: 'Poison stacks (end of window)',
      doomStacks: 'Doom stacks (end of window)',
      noItems: 'Equip items — there is nothing to calculate yet.',
    },
    sources: {
      title: 'Damage sources',
      share: 'Share',
      damage: 'Damage',
      dps: 'DPS',
      labels: {
        auto: 'Auto-attacks',
        talonsLight: 'Dragon talons — light strike',
        talonsHeavy: 'Dragon talons — heavy strike (1 % expected)',
        bleed: 'Bleed',
        bloodEcho: 'Blood-pool echo',
        burn: 'Burn (bag)',
        poison: 'Poison — ticks',
        poisonBurst: 'Cobra burst (expected)',
        witchBlade: 'Witch Blade tick (expected)',
        feather: 'Feather pendant — active',
        dartProc: 'Dart — proc',
        crystalProc: 'Crystal Sword — proc',
        valorSword: 'Sword of Courage — proc',
        corrosiveSpike: 'Corrosive Spine — hit',
        feast: 'Night Banquet — hit',
        sharpAxe: 'Keen Greataxe — max-health hit',
        skullcrusher: 'Skull Basher — max-health hit',
        ruinHammer: 'Hammer of Ruin — max-health hit',
        vortex: 'Vortex Gloves — magic hit',
        vortexDot: 'Vortex Gloves — vortex ticks',
        gaze: "Selimone's Crown — hit",
      },
    },
    active: {
      title: 'Active items',
      note: 'Tick to use the item on cooldown; cooldown is reduced by cooldown_reduction_pct.',
      feather: 'Feather pendant',
      featherAncestor: 'Ancestor: Feather pendant',
      phase: 'Phase Boots',
      madness: 'Mask of Madness',
      meta: (cd, duration, interval, pct) => `CD ${cd} s · ${duration} s, ${interval} s tick, ${pct} % of stats`,
      phaseMeta: (cd, duration) => `CD ${cd} s · ${duration} s: +35 % movement, +20 % evasion`,
      madnessMeta: (cd, duration) => `CD ${cd} s · ${duration} s: +100 attack speed, +25 movement, −10 armor`,
    },
    timeline: {
      title: 'Timeline',
      windowTab: 'Window by second',
      killTab: 'Kill: events',
      second: 'Second',
      time: 'Time, s',
      source: 'Source',
      damage: 'Damage',
      hp: 'HP after',
      note: 'Both views are the same event-driven engine. The window sums damage per second; the kill log shows individual hits and ticks until death.',
      empty: 'No events.',
      firstOnly: 'Showing the first 30 events.',
    },
    notes: {
      title: 'What is and is not modelled',
      lines: [
        'Auto-attacks, item procs, poison and active items are counted. Hero abilities, stock talents and sets are not.',
        'The window and the kill are two independent runs: the window\'s attack count is not applied to the target in one go. The kill run walks events in time and stops on death.',
        'The first hit gets no vulnerable, armor break or mark: the staff and the bag apply them after it. That is why the first auto-attack is lower than the steady state.',
        'Crit: the 5 % base attack chance, the physical chance and omni combine the way the game does; the multiplier is 180 % + the panel\'s crit damage.',
        'Bleed: 70 % of the final damage goes into a pool, ten ticks; 0467 rolls at full HP, 0398 on crits. 0504 turns part of a tick into physical damage, but it is tagged NO_PROC and starts no new bleeds.',
        '0504\'s echo is an ordinary physical hit: crit, physical amplifiers and armor all apply to it, so with a high crit chance it carries the bulk of the damage.',
        'The bag\'s burn is 0.75 % of the boss\'s maximum HP per tick, capped at 10× the attribute total; its mark adds 4.6 % per stack, up to 10.',
        'Armor: 1 − armor/(26.66 + |armor|); penetration cuts positive armor only; 0853\'s break removes up to 31 %.',
        'Magic resistance applies to poison, 0209, 0307 and 0161; physical sources do not read it.',
        'Item procs, active buffs and passives are in; hero abilities, auras and sets are not.',
        'Dragon talons: the light strike fires on every auto-attack, the heavy one has a 1 % chance; the figure uses its 1 % expected value, not a separate proc roll.',
        'Poison: ticks every 0.25 s, 20 % of the stacks decay every 3 s and that tick is skipped. Damage reads the attribute total, magic resistance, 0365 corrosion (up to +30 % magic damage), poison and DoT outgoing. 0365\'s stack chance and burst size come from the item roll; 0238 adds its own stack at its own chance. 0238\'s defensive poison on attackers is not in the DPS run: the dummy does not attack.',
      ],
    },
  },
  zh: {
    tab: { stats: '属性', dps: 'DPS' },
    title: '对目标 DPS',
    note: '按所选目标计算一段时间的伤害：普通攻击、物品触发、毒与主动物品。英雄技能、原版天赋与套装暂未计入。',
    enemy: {
      title: '目标',
      preset: '预设',
      presetBoss: '第 60 波 Boss',
      custom: '自定义',
      kind: '目标类型',
      kinds: { normal: '普通', elite: '精英', miniboss: '小头目', boss: 'Boss' },
      maxHp: '生命',
      armor: '护甲',
      magicResistance: '魔法抗性，%',
      healthRegen: '生命回复/秒',
      damageReduction: '伤害减免，%',
      damageResistance: '伤害抗性，%',
      physicalIncrease: '受到物理伤害，%',
      duration: '计算窗口，秒',
      durationHint: 'DPS 按木桩在窗口内的伤害计算；击杀时间单独计算。',
      reset: '重置为第 60 波 Boss',
    },
    summary: {
      title: '结果',
      windowDps: '窗口 DPS',
      windowDamage: '窗口伤害',
      ttk: '击杀时间',
      ttkNone: '窗口内未击杀',
      attacks: '窗口内普攻次数',
      killAttacks: '击杀所需普攻',
      killDamage: '击杀所需伤害',
      attackSpeed: '攻击速度',
      aps: '攻击/秒',
      critChance: '暴击率',
      critMultiplier: '暴击倍率',
      armor: '穿透后护甲（窗口结束）',
      armorBreak: '破甲后护甲（窗口结束）',
      penetration: '护甲穿透',
      poisonStacks: '毒层数（窗口结束）',
      doomStacks: '厄运层数（窗口结束）',
      noItems: '请先装备物品——暂无可计算内容。',
    },
    sources: {
      title: '伤害来源',
      share: '占比',
      damage: '伤害',
      dps: 'DPS',
      labels: {
        auto: '普通攻击',
        talonsLight: '龙爪——轻击',
        talonsHeavy: '龙爪——重击（1% 期望）',
        bleed: '流血',
        bloodEcho: '血池回响',
        burn: '灼烧（背包）',
        poison: '毒——跳伤',
        poisonBurst: '眼镜蛇爆发（期望）',
        witchBlade: '女巫之刃——跳伤（期望）',
        feather: '天羽护符——主动',
        dartProc: '飞镖——触发',
        crystalProc: '水晶剑——触发',
        valorSword: '勇气剑——触发',
        corrosiveSpike: '侵蚀之刺——攻击',
        feast: '夜宴——攻击',
        sharpAxe: '锐利巨斧——最大生命伤害',
        skullcrusher: '碎颅锤——最大生命伤害',
        ruinHammer: '毁灭之锤——最大生命伤害',
        vortex: '涡流手套——魔法伤害',
        vortexDot: '涡流手套——持续伤害',
        gaze: '赛莉蒙妮之冠——攻击',
      },
    },
    active: {
      title: '主动物品',
      note: '勾选后按冷却使用；冷却受 cooldown_reduction_pct 缩减。',
      feather: '天羽护符',
      featherAncestor: '先祖：天羽护符',
      phase: '相位鞋',
      madness: '疯狂面具',
      meta: (cd, duration, interval, pct) => `冷却 ${cd} 秒 · ${duration} 秒，${interval} 秒一跳，${pct}% 属性`,
      phaseMeta: (cd, duration) => `冷却 ${cd} 秒 · ${duration} 秒：移动速度 +35%，闪避 +20%`,
      madnessMeta: (cd, duration) => `冷却 ${cd} 秒 · ${duration} 秒：攻击速度 +100，移动速度 +25，护甲 −10`,
    },
    timeline: {
      title: '时间线',
      windowTab: '按秒窗口',
      killTab: '击杀：事件',
      second: '秒',
      time: '时间，秒',
      source: '来源',
      damage: '伤害',
      hp: '剩余生命',
      note: '两种视图使用同一套事件驱动引擎：窗口按秒汇总伤害，击杀日志显示死亡前的每次命中与跳伤。',
      empty: '没有事件。',
      firstOnly: '仅显示前 30 个事件。',
    },
    notes: {
      title: '已计入与未计入',
      lines: [
        '计入普通攻击、物品触发、毒与主动物品；英雄技能、原版天赋与套装暂未计入。',
        '窗口与击杀是两次独立演算：窗口内的攻击次数不会一次性全部打到目标上；击杀演算按时间推进并在死亡时停止。',
        '第一次命中不吃易伤、破甲与焚印：法杖和背包是在命中之后才施加。因此第一下普攻低于稳定值。',
        '暴击：普通攻击基础 5%、物理暴击率与全能按游戏公式合并；倍率为 180% + 面板暴击伤害。',
        '流血：最终伤害的 70% 进入池，10 次跳伤；0467 按满血几率触发，0398 按暴击触发。0504 将部分跳伤转为物理伤害，但标记为 NO_PROC，不会再次触发流血。',
        '0504 的回响是普通物理伤害：暴击、物理增幅与护甲都会作用于它，因此高暴击时会成为主要伤害来源。',
        '背包灼烧每次跳伤为 Boss 最大生命的 0.75%，不超过属性总和的 10 倍；焚印每层 +4.6%，最多 10 层。',
        '护甲：1 − 护甲/(26.66 + |护甲|)；穿透只削减正护甲；0853 的破甲最多 31%。',
        '魔法抗性作用于毒、0209、0307 与 0161；物理来源不读取。',
        '物品计入上述触发、主动增益与被动属性；英雄技能、光环与套装未计入。',
        '龙爪：轻击每次普通攻击都会触发，重击有 1% 几率；计算中重击按 1% 期望值显示，而不是单独掷骰。',
        '毒：每 0.25 秒跳伤，每 3 秒衰减 20% 层数且该次跳伤跳过。伤害读取属性总和、魔法抗性、0365 的腐蚀（最多 +30% 魔法伤害）、毒与持续伤害增幅。0365 的加层几率与爆发比例取自物品随机值；0238 按自身几率加 1 层。0238 对攻击者的防御性施毒不计入 DPS：木桩不会攻击。',
        '0209：跳伤几率取自随机值（80% 属性），再次触发会立即结算一次；厄运最多 5 层，每层降低魔法抗性（此处每层 6%，最多 30）。0402：每次新增毒层立即额外结算一次跳伤，每次攻击最多一次。',
        '0646/0827 的主动仅在勾选时计入：10 次跳伤，每次为 50% 属性的纯粹伤害；30 秒冷却受 cooldown_reduction_pct 缩减（上限 80%）。',
        '0129/0131：25% × 50 的物理触发；0129 的数值写死在脚本中，0131 读取随机值。0131 的 AoE 只按单体计算；该次命中的二次触发效果不展开。',
        '2 级触发：0124/0234/0300 破甲（2/5/6，持续 5 秒）；0121/0210/0340 按自身冷却造成最大生命伤害；0457 为 30% × 80；0307 造成（敏捷+智力）×120% 魔法伤害并附加 3 秒涡流；0161 每 4 秒攻击一次。',
        '0152 和 0155 按冷却使用（12/60 与 6/60 秒，受 CDR）：计入平均 +35% 移速、+100 攻速与 +25 移速。0360/0718 每超出 250 的 5 点移速提供敏捷（每步 1/2），并转化为伤害与攻速。',
        '0166/0303 在 1 秒冷却就绪时增加 1 层毒；0402 额外结算一次跳伤。0124 不造成伤害，只破甲。',
      ],
    },
  },
};

export const CALC: Localised<CalcStrings> = {
  ru: {
    title: 'Статы персонажа',
    wipTitle: 'Вкладка в работе (WIP)',
    wip:
      'База героя считается сама — для выбранного героя на 30 уровне, со своей веткой профессии и всеми общими деревьями (взятыми целиком), но её можно править руками. Ещё считает предметы в 6 слотах, нейтральном, у питомца, в сумке и у души, 3 руны, прокрутку статов как в карточке предмета (у предков настраивается и наложенная грань: своя прокрутка и «фикс»). Пока не учитываются: ванильные таланты героя, сеты и способности; боевые эффекты предметов считает подвкладка DPS; руны статов не добавляют — они правят параметры способностей героя.',
    hero: 'Герой:',
    note: {
      computed: (level) => `${level} уровень · посчитано из игры`,
      noData: 'нет данных героя — впишите базу руками',
      universal: 'универсал',
      primary: (a) => `основной: ${ATTR_RU[a]}`,
      overrides: (count) => `правок вручную: ${count}`,
    },
    attr: { str: 'Сила', agi: 'Ловкость', int: 'Интеллект' },
    modes: {
      label: 'Статы от атрибутов',
      delta: 'Статы от атрибутов: только от предметов',
      deltaTitle:
        'База считается из героя (30 уровень), панель без предметов уже включает и флат игры, и прибавки атрибутов. В этом режиме «Плюс сверху» показывает только вклад предметов — ровно то, что они добавили к панели.',
      full: 'считать целиком',
      fullTitle:
        '«Плюс сверху» — вся атрибутная часть (сила×6 HP, ловкость×0.075 брони и т. д.), а в «Базе» остаётся только флат игры: видно, сколько дают сами атрибуты. «Итого» в обоих режимах одинаковое.',
    },
    recalc: 'Пересчитать из героя',
    recalcTitle: 'Забыть ручные правки колонки «База» и снова посчитать статы от героя на 30 уровне',
    resetAll: 'Сбросить всё',
    resetAllTitle: 'Очистить базу, слоты и руны; достижения останутся',
    hint:
      'База считается сама: для выбранного героя на 30 уровне, со всеми ступенями профессии и всеми узлами — своей ветки и общих деревьев, взятыми целиком (что именно вошло — в блоке «Откуда база» под панелью). Поле можно править руками — у такой строки появляется пометка, а кнопка «Пересчитать из героя» возвращает расчёт. Дальше предметы прибавляются сами, а вклад атрибутов считается разницей — чтобы ничего не посчиталось дважды. Уровни сезона (вклад и мир) дают по +2 % урона и −2 % получаемого за уровень и работают в самом конце — после брони, независимыми множителями.',
    head: { stat: 'Стат', base: (level) => `База (герой, ${level} ур.)`, items: 'Предметы', buffs: 'Бафы', plus: 'Плюс сверху', total: 'Итого' },
    buffs: {
      title: 'Бафы',
      note: 'Одноразовые предметы с лимитом использований: каждое использование навсегда добавляет к панели. Укажите, сколько уже использовано, или нажмите «Все».',
      empty: 'Нет данных о постоянных предметах.',
      all: 'Все',
      allTitle: 'Применить максимум использований',
      max: (n) => `из ${n}`,
      offPanel: 'Постоянные эффекты вне панели — удача, обзор, склад, слоты биржи, сопротивление яду — здесь не считаются.',
      perUse: (amount, label) => `${label} +${amount} за использование`,
      keys: {
        all_strength_pct: 'Сила, %',
        all_agility_pct: 'Ловкость, %',
        all_intelligence_pct: 'Интеллект, %',
        all_all_stats_pct: 'Все атрибуты, %',
        bonus_movespeed_pct: 'Скорость передвижения, %',
      },
    },
    achievements: {
      button: 'Достижения',
      buttonTitle: 'Отметить полученные достижения — их бонусы идут в колонку «Бафы»',
      title: 'Достижения',
      note: 'Отметьте полученные этапы. Этапы начисляются по порядку: III включает I и II; под названием видно, что даёт текущий выбор — этот бонус идёт в колонку «Бафы». Повторный клик по выбранному уровню снимает выбор серии.',
      levelCategory: 'Уровень героя',
      reset: 'Сбросить все',
      close: 'Закрыть',
      loading: 'Загрузка достижений…',
      empty: 'Нет данных о достижениях.',
      notSelected: 'Бонус не выбран',
      selected: (n) => `Выбрано серий: ${n}`,
    },
    cell: {
      seasonRange: (max) => `От 0 до ${max}`,
      override: 'Правка вручную: очистите поле, чтобы вернуть значение из героя',
      fromHero: (hero, level) => `Из героя: ${hero}, ${level} уровень, без предметов`,
      overrideMark: 'вручную',
      seasonTotal: (pct) => `+${pct} % урона, −${pct} % получаемого`,
      seasonTitle: 'Сезонные баффы применяются в самом конце, после брони; уровни вклада и мира — независимые множители',
      pctBonus: (pct) => `в т. ч. ${pct} от «% к атрибуту»`,
    },
    groups: {
      attrs: 'Атрибуты',
      hpMana: 'Здоровье и мана',
      attack: 'Атака',
      defence: 'Защита',
      crits: 'Криты',
      season: 'Сезон',
      other: 'Прочее',
      amps: 'Усилители урона',
    },
    rows: ROWS_RU,
    formulas: (b, n) =>
      `Сила: +${n(b.strength_health)} HP и +${n(b.strength_health_regen)} регена за пункт. Ловкость: +${n(b.agility_armor)} брони и скорость атаки по кривой «ЛОВ/(ЛОВ+${n(b.agility_attack_speed_decay)})×${n(b.agility_attack_speed_cap)}». Интеллект: +${n(b.intelligence_mana)} маны, +${n(b.intelligence_mana_regen)} регена и МР по кривой «ИНТ/(ИНТ+${n(b.intelligence_magic_resistance_decay)})×${n(b.intelligence_magic_resistance_cap)}». Основной атрибут: +${n(b.primary_attr_attack_damage)} урона атаки за пункт (у универсала — ${n(b.universal_attr_attack_damage)} за каждый из трёх).`,
    effects: {
      title: 'Эффекты предметов',
      conditional: '(условный)',
      unmodelled: 'Не влияют на панель (боевые эффекты и прок-и)',
      none: 'У надетых предметов нет эффектов, влияющих на панель.',
      line: (f, n) => {
        switch (f.kind) {
          case 'prism':
            return `весь физ. урон посоха (${n(f.moved)}%) переведён в магический: −${n(f.moved)}% физ, +${n(f.gained)}% маг (×${n(f.pct / 100)})`;
          case 'crown':
            return `наибольший атрибут (${ATTR_RU[ATTRS[f.best]!]}) +${n(f.boost)}%, остальные −${n(f.reduce)}%: ${ATTRS.map((a, i) => `${ATTR_RU[a]} ${signed(f.grants[i]!, n)}`).join(', ')}`;
          case 'sageBoots':
            return `+${n(f.pct)}% маг. урона от маны: ${n(f.extra)} сверх ${n(f.threshold)}, шаг ${n(f.per)} маны = +${n(f.step)}% (потолок ${n(f.cap)}%)`;
          case 'arcaneCloak':
            return `+${n(f.hp)} здоровья — ровно столько, сколько маны (потолок маны)`;
          case 'nullifier':
            return `+${n(f.pct)}% маг. урона: вампиризм ${n(f.lifesteal)}% → шаг ${n(f.step)}% = +${n(f.per)}% (потолок ${n(f.cap)}%)`;
          case 'primalCrystal':
            return `физ. крит ${n(f.total)}% → −${n(f.moved)}% физ, +${n(f.gained)}% маг-крита (перевод ${n(f.convert)}%: ${n(f.agi)} ловкости / ${n(f.stepAgi)} × ${n(f.perPct)}, потолок ${n(f.cap)}%)`;
          case 'overcrit':
            return `физ. крит ${n(f.total)}% при капе ${n(f.cap)}%: превышение ${n(f.overflow)}% → +${n(f.amp)}% урона крита (${n(f.perStep)}% за каждые ${n(f.step)}%)`;
          case 'infinity':
            return `+${n(f.amp)}% урона крита: ${n(f.physical)}% физ. + ${n(f.magical)}% маг. крита × ${n(f.convert)}%`;
          case 'usurerCodex':
            return `+${n(f.amp)}% маг. урона, пока не исчерпан «долг» (он растёт за применения заклинаний)`;
          case 'stoneGolem':
            return `Скрипт: −${n(f.attackSpeed)}% скорости атаки и −${n(f.moveSpeed)}% передвижения; в описании — только −${n(f.tooltipPct)}% передвижения`;
        }
      },
    },
    inv: {
      title: 'Инвентарь',
      note: 'как в игре: 6 слотов, нейтральный, питомец, сумка, душа и 3 руны',
      slot: (i) => `Слот ${i}`,
      kinds: { neutral: 'Нейтральный слот', pet: 'Питомец', bag: 'Сумка', soul: 'Душа' },
      rune: (i) => `Руна ${i}`,
      runes: 'Руны (правят способности героя, статов панели не дают)',
      remove: 'Убрать',
      add: 'Выбрать предмет',
    },
    editor: {
      empty:
        'Выбери предмет в слоте — здесь появятся его статы: прокрутка (сид), «фикс», «улучшено», божественная ковка и перековка — как в карточке предмета. У предка ниже появится ещё блок наложенной грани.',
      soul: 'Душа занимает в игре отдельный слот. Активный эффект у всех душ общий (урон суммой атрибутов и лечение) — различаются они пассивкой и статами панели.',
      rune: (target) =>
        `Руна не даёт статов панели — она меняет параметры способности${target ? ` «${target}»` : ''} (в отборе видны только руны этого героя).`,
      params: 'Параметры:',
      noDesc: '',
    },
    picker: {
      titles: {
        slot: 'Выбор предмета',
        neutral: 'Нейтральный предмет',
        pet: 'Питомец',
        bag: 'Сумка (рюкзак)',
        soul: 'Душа (отдельный слот)',
        rune: 'Руна',
      },
      runeFor: (hero) => `Руна для ${hero}`,
      search: 'Поиск по названию или id…',
      meta: (id, level, quality) => `${id} · ур. ${level} · качество ${quality}`,
      nothing: 'Ничего не нашлось.',
      choose: 'Выбрать',
      close: 'Закрыть',
      loading: 'Загрузка предметов…',
    },
    base: {
      title: 'Откуда база',
      noData: 'Данных по этому герою нет — база не считается, вписывайте руками.',
      summary: (p) =>
        `${p.hero}, ${p.level} уровень, без предметов. База и рост — из игры (${p.base} и рост ${p.growth} за уровень), все ${p.tiers} ступени профессии и все узлы своей ветки и общих деревьев взяты целиком — всего ${p.nodes} узлов.`,
      tiersLead: 'Ступени профессии (их рост прибавляется к росту атрибутов):',
      tier: (name, level, str, agi, int) => `${name} (ур. ${level}): +${str} силы, +${agi} ловкости, +${int} интеллекта`,
      attrHead: (levels) => ['Атрибут', 'База (1 ур.)', `Рост за ${levels} ур.`, 'в т.ч. ступени', 'Узлы', '% от узлов', 'Итого'],
      toAll: (v) => `(+${v} ко всем)`,
      derivedHead: ['Стат', 'База игры', 'Узлы', 'От атрибутов', 'Множитель', 'Итого'],
      treesTitle: 'Деревья в расчёте (все взяты целиком)',
      treeChip: (name, id, nodes) => `${name} (${id}) · ${nodes} узлов`,
      treeNoStats: 'статов нет',
      unusedLead: 'Панель пока не считает (эти статы узлов в «Итого» не входят):',
      notesTitle: 'Чего в расчёте нет',
      vanilla: (count) =>
        `Ванильные таланты героя (слоты Ability10–17): в игре прописаны ${count}, но какая из парной пары выбрана — из данных не видно, в расчёт не входят.`,
      vanillaNone: 'Ванильные таланты героя: слоты Ability10–17 у него пустые.',
      s3Only: (hero) => `${hero} заведён только в наборе правил s3 — в s2 его ветка не действует.`,
      marks: 'Отметки из вкладки «Прокачка» на базу не влияют: своя ветка и все общие деревья считаются взятыми целиком.',
      notModelled:
        'Не учтены сеты, способности и боевые эффекты предметов (их вклад — в слотах справа), а также дерево tree20 — в интерфейсе игры оно не показано.',
    },
    statNames: STAT_NAMES.ru,
    stats: {
      title: 'Характеристики',
      cooldown: (s) => `Перезарядка: ${s} с`,
      noStats: 'У предмета нет числовых характеристик.',
      divine: 'Божественная ковка',
      divineTitle: (base, ability) =>
        `+${base}% ко всем свойствам и +${ability}% к свойствам эффекта (ability_value_*). В игре включается при качестве предмета 5+ и уровне перековки 7–9; свойства эффекта не фиксируются и не усиливаются`,
      enhance: (pct) => `Надбавка «улучшено»: ${pct}%`,
      enhanceTitle: 'В игре надбавка «улучшено» случайна для каждого предмета: от 20 % до 38 %',
      refine: (level) => `Перековка: ${level}`,
      refineTitle:
        'Уровень перековки предмета (0–9): каждая перековка поднимает нижний край прокрутки на 3 %, а у свойств эффекта верхние положения упираются в потолок',
      fix: 'фикс',
      fixTitle: (pct) => `Зафиксированный стат: +${pct}% к прокрученному значению. В игре зафиксирован один стат предмета`,
      enh: 'усил',
      enhTitle: (pct) =>
        `«Улучшено»: +${pct}% к прокрученному значению. В игре усилен один стат предмета, надбавка случайна: 20–38 % (20 — фиолетовая, 21–25 — золотая, 26–38 — красная)`,
      stoneFixTitle: (pct) => `Зафиксированный стат грани: +${pct}% к её прокрученному значению (как на карточке самой грани)`,
      dashEffect: (divineOnly) =>
        `Свойство эффекта предмета: не фиксируется и не усиливается, ${divineOnly ? 'работает только божественная ковка' : 'надбавок нет'}`,
      dashStone: 'У этого свойства грани надбавок нет',
      cols: { prop: 'Свойство', range: 'Разброс', roll: 'Прокрутка', item: 'Предмет', stone: 'Грань', total: 'Итог' },
      effectGroup: 'Эффект предмета',
      stoneGroup: 'Свойства грани (прибавляются)',
      fixedValue: 'Значение зафиксировано в данных предмета, прокрутки нет',
      fixedRange: 'Прокрутки нет: значение задано в данных предмета',
      rangeTitle: (half) => `Разброс ±${half}% от базового значения, прокрутка непрерывная`,
      stepsTitle: 'Возможные значения свойства эффекта: прокрутка квантована шагом 1/5, поэтому значений всего несколько',
      stepChip: (rollPct, value, count) => `Прокрутка ${rollPct} %: ${value} — одно из ${count} возможных значений`,
      stepValue: (value, count, refine) => `Значение ${value} — одно из ${count} возможных при перековке ${refine}`,
      current: (value, rollPct) => `Текущая прокрутка: ${value} (${rollPct} % от допуска)`,
      withStone: (value) => `С гранью итог: ${value}`,
      reverse: 'Обратное свойство: чем меньше, тем лучше',
      colours: 'Цвет, как в игре: серый → белый → зелёный → фиолетовый → золотой → красный',
      effectColours: 'У свойств эффекта серого и белого нет — самый низ зелёный',
      stoneRange:
        'Окно прокрутки грани — тот же разброс из игры, что у предметов; перековка предмета на грань не влияет (та ролит только его собственные свойства)',
      stoneSliderOnly: 'Прокрутка грани: это свойство есть только у неё — ползунок двигает значение предмета',
      stoneSlider: 'Прокрутка грани — от её сида; двигает вклад в колонках «Грань» и «Итог» выше',
      stoneItemDash: (only) =>
        only ? 'У самого предмета этого свойства нет — оно только от грани' : 'Строка-ползунок грани: её вклад прибавляется в строках свойств выше',
      stoneValue: (only, value, rollPct) =>
        `${only ? `Свойство только от грани: ${value} — у самого предмета его нет` : `Свойство грани: ${value} — прибавляется к свойству предмета выше`}\nПрокрутка ${rollPct} % от допуска, своя у каждой грани`,
      stoneTotal: (only) => (only ? 'Итог равен свойству грани: у предмета своего нет' : 'Итог смотрите в строке свойства предмета выше'),
      stoneCol: 'Вклад грани — ползунки в группе «Свойства грани (прибавляются)»',
      totalCol: 'Итог: свойство предмета + грань',
      noStoneCol: 'У грани нет этого свойства',
      totalOwn: 'Итог равен свойству предмета: грань сюда ничего не добавляет',
      stoneNote: (fixed) =>
        `Грань не куют: надбавок «улучшено», божественной ковки и перековки у неё нет — можно только отметить стат зафиксированным (+${fixed}% к прокрученному значению). Разброс — прокрутка −½…+½ от процента из игры, цвет — как в игре.`,
      note: ({ fixed, divine, ability, stone }) =>
        `Диапазон — разброс при получении предмета (прокрутка −½…+½ от процента из игры), цвет — как в игре. «фикс» даёт стату +${fixed}%, «усил» («улучшено») — +20–38 % одному стату, «Божественная ковка» — +${divine}% всем свойствам и +${ability}% свойствам эффекта (у обратных — в минус, это улучшение). Надбавки открываются на перековке 4–9 и только у качества 5 и выше. Свойства эффекта стоят отдельной группой внизу: прокрутка у них ступенями (шаг 1/5), «фикс» и «усил» к ним не применяются.${
          stone ? ' Свойства грани — своей группой: «Грань» — её вклад, «Итог» — сумма со свойством предмета; перековка и «усил» на грань не действуют.' : ''
        }`,
    },
    dps: DPS_TEXT.ru,
  },

  en: {
    title: 'Character stats',
    wipTitle: 'Work in progress',
    wip:
      "The hero's base is computed for you — the chosen hero at level 30, with their own profession tree and every common tree taken in full — and you can still edit it by hand. Items in the 6 slots, the neutral slot, the pet, the bag and the soul are counted, plus 3 runes, with stats rolled exactly as on the item card (an ancestral item's fate stone has its own roll and fixed stat too). Not counted yet: the hero's stock talents, sets and abilities; item combat effects are the DPS sub-tab's job; runes add no stats — they change the hero's abilities.",
    hero: 'Hero:',
    note: {
      computed: (level) => `level ${level} · computed from the game`,
      noData: 'no data for this hero — enter the base by hand',
      universal: 'universal',
      primary: (a) => `primary: ${ATTR_EN[a]}`,
      overrides: (count) => `manual edits: ${count}`,
    },
    attr: { str: 'Strength', agi: 'Agility', int: 'Intelligence' },
    modes: {
      label: 'Stats from attributes',
      delta: 'Stats from attributes: items only',
      deltaTitle:
        'The base comes from the hero (level 30); the panel without items already includes both the game\'s flat values and what attributes add. In this mode "On top" shows only what items contribute — exactly what they add to the panel.',
      full: 'count in full',
      fullTitle:
        '"On top" is the whole attribute part (strength × 6 HP, agility × 0.075 armor and so on) and "Base" keeps only the game\'s flat values, so you see what attributes themselves give. "Total" is the same in both modes.',
    },
    recalc: 'Recompute from hero',
    recalcTitle: 'Forget the manual edits in the "Base" column and compute the stats from the hero at level 30 again',
    resetAll: 'Reset all',
    resetAllTitle: 'Clear the base, the slots and the runes; achievements stay',
    hint:
      'The base computes itself: the chosen hero at level 30, with every profession tier and every node — their own tree and the common ones, taken in full (what went in is in "Where the base comes from" below the panel). You can edit a field by hand — the row gets a mark, and "Recompute from hero" brings the computed value back. Items then add on top by themselves, and the attributes\' contribution is counted as a difference, so nothing is counted twice. Season levels (contribution and world) give +2% damage dealt and −2% damage taken per level, applied last — after armor, as independent multipliers.',
    head: { stat: 'Stat', base: (level) => `Base (hero, lv. ${level})`, items: 'Items', buffs: 'Buffs', plus: 'On top', total: 'Total' },
    buffs: {
      title: 'Buffs',
      note: 'One-time items with a lifetime limit: every use adds to the panel for good. Enter how many are used, or press “All”.',
      empty: 'No permanent items in the data.',
      all: 'All',
      allTitle: 'Apply the maximum number of uses',
      max: (n) => `of ${n}`,
      offPanel: 'Permanent effects outside the panel — luck, vision, storage, Exchange slots, poison resistance — are not counted here.',
      perUse: (amount, label) => `${label} +${amount} per use`,
      keys: {
        all_strength_pct: 'Strength, %',
        all_agility_pct: 'Agility, %',
        all_intelligence_pct: 'Intelligence, %',
        all_all_stats_pct: 'All Stats, %',
        bonus_movespeed_pct: 'Movement speed, %',
      },
    },
    achievements: {
      button: 'Achievements',
      buttonTitle: 'Mark the achievements you have claimed — their bonuses go into the “Buffs” column',
      title: 'Achievements',
      note: 'Mark the stages you have claimed. Stages are claimed in order: III includes I and II; under the name is what the current selection grants — that bonus goes into the “Buffs” column. Clicking the selected level again clears the series.',
      levelCategory: 'Hero level',
      reset: 'Clear all',
      close: 'Close',
      loading: 'Loading achievements…',
      empty: 'No achievement data.',
      notSelected: 'No bonus selected',
      selected: (n) => `Series selected: ${n}`,
    },
    cell: {
      seasonRange: (max) => `0 to ${max}`,
      override: 'Edited by hand: clear the field to get the hero\'s value back',
      fromHero: (hero, level) => `From the hero: ${hero}, level ${level}, no items`,
      overrideMark: 'manual',
      seasonTotal: (pct) => `+${pct}% damage, −${pct}% taken`,
      seasonTitle: 'Season buffs apply last, after armor; contribution and world levels are independent multipliers',
      pctBonus: (pct) => `incl. ${pct} from "% attribute"`,
    },
    groups: {
      attrs: 'Attributes',
      hpMana: 'Health & mana',
      attack: 'Attack',
      defence: 'Defence',
      crits: 'Crits',
      season: 'Season',
      other: 'Other',
      amps: 'Damage amplifiers',
    },
    rows: ROWS_EN,
    formulas: (b, n) =>
      `Strength: +${n(b.strength_health)} HP and +${n(b.strength_health_regen)} regen per point. Agility: +${n(b.agility_armor)} armor, and attack speed on the curve "AGI/(AGI+${n(b.agility_attack_speed_decay)})×${n(b.agility_attack_speed_cap)}". Intelligence: +${n(b.intelligence_mana)} mana, +${n(b.intelligence_mana_regen)} regen, and magic resistance on the curve "INT/(INT+${n(b.intelligence_magic_resistance_decay)})×${n(b.intelligence_magic_resistance_cap)}". Primary attribute: +${n(b.primary_attr_attack_damage)} attack damage per point (a universal hero gets ${n(b.universal_attr_attack_damage)} for each of the three).`,
    effects: {
      title: 'Item effects',
      conditional: '(conditional)',
      unmodelled: "Don't affect the panel (combat effects and procs)",
      none: 'None of the equipped items has an effect on the panel.',
      line: (f, n) => {
        switch (f.kind) {
          case 'prism':
            return `all the staff's physical damage (${n(f.moved)}%) becomes magical: −${n(f.moved)}% physical, +${n(f.gained)}% magical (×${n(f.pct / 100)})`;
          case 'crown':
            return `highest attribute (${ATTR_EN[ATTRS[f.best]!]}) +${n(f.boost)}%, the others −${n(f.reduce)}%: ${ATTRS.map((a, i) => `${ATTR_EN[a]} ${signed(f.grants[i]!, n)}`).join(', ')}`;
          case 'sageBoots':
            return `+${n(f.pct)}% magical damage from mana: ${n(f.extra)} above ${n(f.threshold)}, every ${n(f.per)} mana = +${n(f.step)}% (cap ${n(f.cap)}%)`;
          case 'arcaneCloak':
            return `+${n(f.hp)} health — exactly as much as your mana (max mana)`;
          case 'nullifier':
            return `+${n(f.pct)}% magical damage: lifesteal ${n(f.lifesteal)}% → every ${n(f.step)}% = +${n(f.per)}% (cap ${n(f.cap)}%)`;
          case 'primalCrystal':
            return `physical crit ${n(f.total)}% → −${n(f.moved)}% physical, +${n(f.gained)}% magical crit (converts ${n(f.convert)}%: ${n(f.agi)} agility / ${n(f.stepAgi)} × ${n(f.perPct)}, cap ${n(f.cap)}%)`;
          case 'overcrit':
            return `physical crit ${n(f.total)}% against a ${n(f.cap)}% cap: ${n(f.overflow)}% over → +${n(f.amp)}% crit damage (${n(f.perStep)}% per ${n(f.step)}%)`;
          case 'infinity':
            return `+${n(f.amp)}% crit damage: ${n(f.physical)}% physical + ${n(f.magical)}% magical crit × ${n(f.convert)}%`;
          case 'usurerCodex':
            return `+${n(f.amp)}% magical damage until the "debt" runs out (it grows with every spell cast)`;
          case 'stoneGolem':
            return `Script: −${n(f.attackSpeed)}% attack speed and −${n(f.moveSpeed)}% movement; the tooltip says only −${n(f.tooltipPct)}% movement`;
        }
      },
    },
    inv: {
      title: 'Inventory',
      note: 'as in the game: 6 slots, neutral, pet, bag, soul and 3 runes',
      slot: (i) => `Slot ${i}`,
      kinds: { neutral: 'Neutral slot', pet: 'Pet', bag: 'Bag', soul: 'Soul' },
      rune: (i) => `Rune ${i}`,
      runes: "Runes (change the hero's abilities, give no panel stats)",
      remove: 'Remove',
      add: 'Choose an item',
    },
    editor: {
      empty:
        'Pick an item in a slot and its stats appear here: the roll (seed), "fixed", "Enhanced", Divine Forged and reforge — as on the item card. An ancestral item also gets a block for its fate stone.',
      soul: 'In the game a soul has a slot of its own. Every soul shares the same active (damage from the sum of attributes, and a heal) — they differ in their passive and panel stats.',
      rune: (target) =>
        `A rune gives no panel stats — it changes the parameters of the ability${target ? ` "${target}"` : ''} (the picker lists only this hero's runes).`,
      params: 'Parameters:',
      noDesc: '',
    },
    picker: {
      titles: { slot: 'Choose an item', neutral: 'Neutral item', pet: 'Pet', bag: 'Bag (backpack)', soul: 'Soul (own slot)', rune: 'Rune' },
      runeFor: (hero) => `Rune for ${hero}`,
      search: 'Search by name or id…',
      meta: (id, level, quality) => `${id} · lv. ${level} · quality ${quality}`,
      nothing: 'Nothing found.',
      choose: 'Choose',
      close: 'Close',
      loading: 'Loading items…',
    },
    base: {
      title: 'Where the base comes from',
      noData: 'There is no data for this hero — the base is not computed; enter it by hand.',
      summary: (p) =>
        `${p.hero}, level ${p.level}, no items. Base and growth are the game's (${p.base}, growing ${p.growth} per level); all ${p.tiers} profession tiers and every node of their own tree and the common trees are taken in full — ${p.nodes} nodes in all.`,
      tiersLead: 'Profession tiers (their growth adds to attribute growth):',
      tier: (name, level, str, agi, int) => `${name} (lv. ${level}): +${str} strength, +${agi} agility, +${int} intelligence`,
      attrHead: (levels) => ['Attribute', 'Base (lv. 1)', `Growth over ${levels} lv.`, 'of it tiers', 'Nodes', '% from nodes', 'Total'],
      toAll: (v) => `(+${v} to all)`,
      derivedHead: ['Stat', 'Game base', 'Nodes', 'From attributes', 'Multiplier', 'Total'],
      treesTitle: 'Trees in the calculation (all taken in full)',
      treeChip: (name, id, nodes) => `${name} (${id}) · ${nodes} nodes`,
      treeNoStats: 'no stats',
      unusedLead: 'Not on the panel yet (these node stats are not in "Total"):',
      notesTitle: 'What is not counted',
      vanilla: (count) =>
        `The hero's stock talents (slots Ability10–17): the game lists ${count}, but which of each pair is taken is not in the data, so they are left out.`,
      vanillaNone: "The hero's stock talents: slots Ability10–17 are empty.",
      s3Only: (hero) => `${hero} exists only in the s3 ruleset — his tree does not apply in s2.`,
      marks: 'Marks on the Progression page do not affect the base: their own tree and every common tree count as fully taken.',
      notModelled:
        "Sets, item abilities and combat effects are not counted (their contribution is in the slots), nor is tree20 — the game's interface does not show it.",
    },
    statNames: STAT_NAMES.en,
    stats: {
      title: 'Stats',
      cooldown: (s) => `Cooldown: ${s} s`,
      noStats: 'This item has no numeric stats.',
      divine: 'Divine Forged',
      divineTitle: (base, ability) =>
        `+${base}% to every stat and +${ability}% to effect values (ability_value_*). In the game it comes with quality 5+ and reforge level 7–9; effect values are never fixed or enhanced`,
      enhance: (pct) => `"Enhanced" bonus: ${pct}%`,
      enhanceTitle: 'In the game the "Enhanced" bonus is random for every item: 20% to 38%',
      refine: (level) => `Reforge: ${level}`,
      refineTitle:
        "The item's reforge level (0–9): each reforge lifts the bottom of the roll by 3%, and effect values' top steps hit the ceiling",
      fix: 'fixed',
      fixTitle: (pct) => `Fixed stat: +${pct}% to the rolled value. In the game one stat of an item is fixed`,
      enh: 'enh.',
      enhTitle: (pct) =>
        `"Enhanced": +${pct}% to the rolled value. In the game one stat of an item is enhanced, by a random 20–38% (20 purple, 21–25 gold, 26–38 red)`,
      stoneFixTitle: (pct) => `The fate stone's fixed stat: +${pct}% to its rolled value (as on the stone's own card)`,
      dashEffect: (divineOnly) =>
        `An effect value: never fixed or enhanced, ${divineOnly ? 'only Divine Forged applies' : 'no bonuses apply'}`,
      dashStone: 'No bonuses on this fate-stone stat',
      cols: { prop: 'Stat', range: 'Range', roll: 'Roll', item: 'Item', stone: 'Stone', total: 'Total' },
      effectGroup: 'Item effect',
      stoneGroup: 'Fate stone stats (added)',
      fixedValue: "The value is fixed in the item's data; it does not roll",
      fixedRange: "Does not roll: the value is set in the item's data",
      rangeTitle: (half) => `Rolls ±${half}% around the base value, continuously`,
      stepsTitle: 'Possible effect values: the roll is quantised in fifths, so there are only a few',
      stepChip: (rollPct, value, count) => `Roll ${rollPct}%: ${value} — one of ${count} possible values`,
      stepValue: (value, count, refine) => `Value ${value} — one of ${count} possible at reforge ${refine}`,
      current: (value, rollPct) => `Current roll: ${value} (${rollPct}% of the tolerance)`,
      withStone: (value) => `Total with the stone: ${value}`,
      reverse: 'Reverse stat: lower is better',
      colours: 'Colour as in the game: grey → white → green → purple → gold → red',
      effectColours: 'Effect values have no grey or white — the bottom is green',
      stoneRange:
        "The stone's roll window is the game's same spread as items'; the item's reforge does not touch the stone (it rolls only the item's own stats)",
      stoneSliderOnly: "The stone's roll: only the stone has this stat, so the slider moves the item's value",
      stoneSlider: 'The stone\'s roll, from its own seed; moves its share in the "Stone" and "Total" columns above',
      stoneItemDash: (only) => (only ? 'The item itself has no such stat — it comes only from the stone' : "The stone's slider row: its share is added in the stat rows above"),
      stoneValue: (only, value, rollPct) =>
        `${only ? `From the stone only: ${value} — the item itself has none` : `Fate stone stat: ${value} — added to the item's stat above`}\nRoll ${rollPct}% of the tolerance, each stone its own`,
      stoneTotal: (only) => (only ? "Total equals the stone's stat: the item has none of its own" : "See the total on the item's stat row above"),
      stoneCol: 'The stone\'s share — sliders in "Fate stone stats (added)"',
      totalCol: "Total: the item's stat + the stone",
      noStoneCol: 'The stone has no such stat',
      totalOwn: "Total equals the item's own stat: the stone adds nothing here",
      stoneNote: (fixed) =>
        `Fate stones are not forged: no "Enhanced", Divine Forged or reforge — you can only mark a stat as fixed (+${fixed}% to the rolled value). The range is a roll of −½…+½ of the game's percentage; colours are the game's.`,
      note: ({ fixed, divine, ability, stone }) =>
        `The range is the spread when the item drops (a roll of −½…+½ of the game's percentage); colours are the game's. "fixed" gives a stat +${fixed}%, "enh." ("Enhanced") one stat 20–38%, "Divine Forged" +${divine}% to every stat and +${ability}% to effect values (on reverse stats it goes down — which is the improvement). The bonuses unlock at reforge 4–9 and only on quality 5+ items. Effect values are a group of their own at the bottom: their roll is quantised (in fifths), and neither "fixed" nor "enh." applies to them.${
          stone ? ' Fate stone stats are their own group: "Stone" is its share, "Total" the sum with the item\'s stat; the item\'s reforge and "enh." do not apply to the stone.' : ''
        }`,
    },
    dps: DPS_TEXT.en,
  },

  zh: {
    title: '角色属性',
    wipTitle: '施工中',
    wip:
      '英雄的基础属性自动计算：所选英雄 30 级，含本职业天赋树与全部通用天赋树（全部点满），也可以手动修改。另计 6 个物品栏、中立物品栏、宠物、背包与命魂中的物品以及 3 个符印，属性随机值与物品卡片一致（先祖物品还可调节其命石：独立随机值与「固定」）。暂未计入：英雄原版天赋、套装与技能；物品战斗效果由 DPS 子标签计算；符印不加属性——它们修改英雄技能的参数。',
    hero: '英雄：',
    note: {
      computed: (level) => `${level} 级 · 按游戏数据计算`,
      noData: '没有该英雄的数据——请手动填写基础属性',
      universal: '全才',
      primary: (a) => `主属性：${ATTR_ZH[a]}`,
      overrides: (count) => `手动修改：${count}`,
    },
    attr: { str: '力量', agi: '敏捷', int: '智力' },
    modes: {
      label: '属性带来的加成',
      delta: '属性带来的加成：仅计物品',
      deltaTitle: '基础取自英雄（30 级），无物品时的面板已包含游戏的固定值与属性加成。此模式下「额外」只显示物品的贡献——即物品为面板增加的部分。',
      full: '完整计算',
      fullTitle: '「额外」为全部属性部分（力量×6 生命值、敏捷×0.075 护甲等），「基础」只保留游戏固定值：可以看出属性本身带来多少。两种模式的「合计」相同。',
    },
    recalc: '按英雄重新计算',
    recalcTitle: '清除「基础」列的手动修改，重新按 30 级英雄计算',
    resetAll: '全部重置',
    resetAllTitle: '清空基础、物品栏与符印；成就保留',
    hint:
      '基础属性自动计算：所选英雄 30 级，含全部职业阶段与全部天赋节点——本职业天赋树与通用天赋树，全部点满（具体内容见面板下方「基础来源」）。字段可手动修改——该行会出现标记，「按英雄重新计算」可恢复计算值。之后物品自动叠加，属性的贡献按差值计算——避免重复计算。赛季等级（贡献与世界）每级提供 +2% 造成伤害与 −2% 承受伤害，在最后结算——护甲之后，作为独立乘区。',
    head: { stat: '属性', base: (level) => `基础（英雄 ${level} 级）`, items: '物品', buffs: '增益', plus: '额外', total: '合计' },
    buffs: {
      title: '增益',
      note: '有使用次数上限的一次性物品：每次使用都会永久增加面板。填写已使用次数，或点击「全部」。',
      empty: '数据中没有永久物品。',
      all: '全部',
      allTitle: '应用最大使用次数',
      max: (n) => `共 ${n}`,
      offPanel: '面板之外的永久效果——幸运、视野、仓库、交易所栏位、毒抗——此处不计入。',
      perUse: (amount, label) => `每次使用 ${label} +${amount}`,
      keys: {
        all_strength_pct: '力量，%',
        all_agility_pct: '敏捷，%',
        all_intelligence_pct: '智力，%',
        all_all_stats_pct: '全属性，%',
        bonus_movespeed_pct: '移动速度，%',
      },
    },
    achievements: {
      button: '成就',
      buttonTitle: '标记已领取的成就——加成会计入「增益」列',
      title: '成就',
      note: '标记已领取的阶段。阶段按顺序领取：III 包含 I 和 II；名称下方显示当前选择提供的加成，该加成会计入「增益」列。再次点击已选等级可取消该系列的选择。',
      levelCategory: '英雄等级',
      reset: '全部清除',
      close: '关闭',
      loading: '正在加载成就…',
      empty: '没有成就数据。',
      notSelected: '未选择加成',
      selected: (n) => `已选择系列：${n}`,
    },
    cell: {
      seasonRange: (max) => `0 至 ${max}`,
      override: '手动修改：清空字段即可恢复英雄数值',
      fromHero: (hero, level) => `取自英雄：${hero}，${level} 级，无物品`,
      overrideMark: '手动',
      seasonTotal: (pct) => `+${pct}% 伤害，−${pct}% 承受伤害`,
      seasonTitle: '赛季增益在最后结算，在护甲之后；贡献等级与世界等级为独立乘区',
      pctBonus: (pct) => `其中 ${pct} 来自「% 属性」`,
    },
    groups: {
      attrs: '属性',
      hpMana: '生命与魔法',
      attack: '攻击',
      defence: '防御',
      crits: '暴击',
      season: '赛季',
      other: '其他',
      amps: '伤害增幅',
    },
    rows: ROWS_ZH,
    formulas: (b, n) =>
      `力量：每点 +${n(b.strength_health)} 生命值与 +${n(b.strength_health_regen)} 生命恢复。敏捷：+${n(b.agility_armor)} 护甲，攻击速度按曲线「敏捷/(敏捷+${n(b.agility_attack_speed_decay)})×${n(b.agility_attack_speed_cap)}」。智力：+${n(b.intelligence_mana)} 魔法值、+${n(b.intelligence_mana_regen)} 魔法恢复，魔法抗性按曲线「智力/(智力+${n(b.intelligence_magic_resistance_decay)})×${n(b.intelligence_magic_resistance_cap)}」。主属性：每点 +${n(b.primary_attr_attack_damage)} 攻击力（全才英雄三项属性每点各 ${n(b.universal_attr_attack_damage)}）。`,
    effects: {
      title: '物品效果',
      conditional: '（有条件）',
      unmodelled: '不影响面板（战斗效果与触发效果）',
      none: '已装备的物品没有影响面板的效果。',
      line: (f, n) => {
        switch (f.kind) {
          case 'prism':
            return `法杖的全部物理伤害（${n(f.moved)}%）转为魔法伤害：−${n(f.moved)}% 物理，+${n(f.gained)}% 魔法（×${n(f.pct / 100)}）`;
          case 'crown':
            return `最高属性（${ATTR_ZH[ATTRS[f.best]!]}）+${n(f.boost)}%，其余 −${n(f.reduce)}%：${ATTRS.map((a, i) => `${ATTR_ZH[a]} ${signed(f.grants[i]!, n)}`).join('，')}`;
          case 'sageBoots':
            return `魔法值带来 +${n(f.pct)}% 魔法伤害：超出 ${n(f.threshold)} 的 ${n(f.extra)}，每 ${n(f.per)} 点魔法值 = +${n(f.step)}%（上限 ${n(f.cap)}%）`;
          case 'arcaneCloak':
            return `+${n(f.hp)} 生命值——与魔法值（最大魔法值）相等`;
          case 'nullifier':
            return `+${n(f.pct)}% 魔法伤害：吸血 ${n(f.lifesteal)}% → 每 ${n(f.step)}% = +${n(f.per)}%（上限 ${n(f.cap)}%）`;
          case 'primalCrystal':
            return `物理暴击 ${n(f.total)}% → −${n(f.moved)}% 物理，+${n(f.gained)}% 魔法暴击（转化 ${n(f.convert)}%：${n(f.agi)} 敏捷 / ${n(f.stepAgi)} × ${n(f.perPct)}，上限 ${n(f.cap)}%）`;
          case 'overcrit':
            return `物理暴击 ${n(f.total)}%，上限 ${n(f.cap)}%：溢出 ${n(f.overflow)}% → 暴击伤害 +${n(f.amp)}%（每 ${n(f.step)}% +${n(f.perStep)}%）`;
          case 'infinity':
            return `暴击伤害 +${n(f.amp)}%：物理 ${n(f.physical)}% + 魔法 ${n(f.magical)}% 暴击 × ${n(f.convert)}%`;
          case 'usurerCodex':
            return `+${n(f.amp)}% 魔法伤害，直到「债务」耗尽（每次施法都会增加债务）`;
          case 'stoneGolem':
            return `脚本：攻击速度 −${n(f.attackSpeed)}%、移动速度 −${n(f.moveSpeed)}%；描述只写移动速度 −${n(f.tooltipPct)}%`;
        }
      },
    },
    inv: {
      title: '物品栏',
      note: '与游戏一致：6 个栏位、中立、宠物、背包、命魂与 3 个符印',
      slot: (i) => `栏位 ${i}`,
      kinds: { neutral: '中立物品栏', pet: '宠物', bag: '背包', soul: '命魂' },
      rune: (i) => `符印 ${i}`,
      runes: '符印（修改英雄技能，不提供面板属性）',
      remove: '移除',
      add: '选择物品',
    },
    editor: {
      empty: '在栏位中选择物品，这里会显示它的属性：随机值（种子）、「固定」、「强化」、神铸与重铸——与物品卡片一致。先祖物品下方还会出现其命石的设置。',
      soul: '命魂在游戏中占用单独的栏位。所有命魂的主动效果相同（按属性总和造成伤害并治疗）——区别在于被动与面板属性。',
      rune: (target) => `符印不提供面板属性——它修改技能${target ? `「${target}」` : ''}的参数（列表中只显示该英雄的符印）。`,
      params: '参数：',
      noDesc: '',
    },
    picker: {
      titles: { slot: '选择物品', neutral: '中立物品', pet: '宠物', bag: '背包', soul: '命魂（独立栏位）', rune: '符印' },
      runeFor: (hero) => `${hero} 的符印`,
      search: '按名称或 id 搜索…',
      meta: (id, level, quality) => `${id} · ${level} 级 · 品质 ${quality}`,
      nothing: '未找到。',
      choose: '选择',
      close: '关闭',
      loading: '正在加载物品…',
    },
    base: {
      title: '基础来源',
      noData: '没有该英雄的数据——基础属性不计算，请手动填写。',
      summary: (p) =>
        `${p.hero}，${p.level} 级，无物品。基础与成长取自游戏（${p.base}，每级成长 ${p.growth}），全部 ${p.tiers} 个职业阶段以及本职业与通用天赋树的全部节点均已点满——共 ${p.nodes} 个节点。`,
      tiersLead: '职业阶段（其成长计入属性成长）：',
      tier: (name, level, str, agi, int) => `${name}（${level} 级）：+${str} 力量，+${agi} 敏捷，+${int} 智力`,
      attrHead: (levels) => ['属性', '基础（1 级）', `${levels} 级成长`, '其中职业阶段', '天赋节点', '节点 %', '合计'],
      toAll: (v) => `（全属性 +${v}）`,
      derivedHead: ['属性', '游戏基础', '天赋节点', '来自属性', '倍率', '合计'],
      treesTitle: '计入的天赋树（全部点满）',
      treeChip: (name, id, nodes) => `${name}（${id}）· ${nodes} 个节点`,
      treeNoStats: '无属性',
      unusedLead: '面板暂不计算（这些节点属性不计入「合计」）：',
      notesTitle: '未计入的内容',
      vanilla: (count) => `英雄原版天赋（Ability10–17 栏位）：游戏中有 ${count} 个，但每对中选了哪一个无法从数据得知，因此不计入。`,
      vanillaNone: '英雄原版天赋：Ability10–17 栏位为空。',
      s3Only: (hero) => `${hero}仅存在于 s3 规则集——其天赋树在 s2 中无效。`,
      marks: '「天赋」页面中的标记不影响基础：本职业天赋树与全部通用天赋树均视为点满。',
      notModelled: '未计入套装、物品技能与战斗效果（其贡献见物品栏），以及 tree20——游戏界面中不显示该天赋树。',
    },
    statNames: STAT_NAMES.zh,
    stats: {
      title: '属性',
      cooldown: (s) => `冷却时间：${s} 秒`,
      noStats: '该物品没有数值属性。',
      divine: '神铸',
      divineTitle: (base, ability) =>
        `所有属性 +${base}%，效果数值（ability_value_*）+${ability}%。游戏中在物品品质 5 及以上、重铸等级 7–9 时出现；效果数值不会被固定或强化`,
      enhance: (pct) => `「强化」加成：${pct}%`,
      enhanceTitle: '游戏中每件物品的「强化」加成随机：20% 至 38%',
      refine: (level) => `重铸：${level}`,
      refineTitle: '物品的重铸等级（0–9）：每次重铸将随机下限提高 3%，效果数值的高档会触及上限',
      fix: '固定',
      fixTitle: (pct) => `固定属性：随机值 +${pct}%。游戏中每件物品有一条固定属性`,
      enh: '强化',
      enhTitle: (pct) => `「强化」：随机值 +${pct}%。游戏中每件物品有一条强化属性，加成随机：20–38%（20 紫色，21–25 金色，26–38 红色）`,
      stoneFixTitle: (pct) => `命石的固定属性：其随机值 +${pct}%（与命石自身的卡片一致）`,
      dashEffect: (divineOnly) => `物品效果数值：不会被固定或强化，${divineOnly ? '只有神铸生效' : '没有任何加成'}`,
      dashStone: '该命石属性没有加成',
      cols: { prop: '属性', range: '范围', roll: '随机值', item: '物品', stone: '命石', total: '合计' },
      effectGroup: '物品效果',
      stoneGroup: '命石属性（叠加）',
      fixedValue: '数值在物品数据中固定，不随机',
      fixedRange: '不随机：数值由物品数据给定',
      rangeTitle: (half) => `在基础值 ±${half}% 范围内连续随机`,
      stepsTitle: '效果数值的可能取值：随机值以 1/5 为步长量化，因此只有几个取值',
      stepChip: (rollPct, value, count) => `随机值 ${rollPct}%：${value}——${count} 个可能取值之一`,
      stepValue: (value, count, refine) => `数值 ${value}——重铸 ${refine} 时 ${count} 个可能取值之一`,
      current: (value, rollPct) => `当前随机值：${value}（公差的 ${rollPct}%）`,
      withStone: (value) => `含命石合计：${value}`,
      reverse: '反向属性：越小越好',
      colours: '颜色与游戏一致：灰 → 白 → 绿 → 紫 → 金 → 红',
      effectColours: '效果数值没有灰色与白色——最低为绿色',
      stoneRange: '命石的随机范围与物品相同；物品的重铸不影响命石（重铸只影响物品自身属性）',
      stoneSliderOnly: '命石随机值：只有命石有此属性——滑块改变物品的数值',
      stoneSlider: '命石随机值，来自其自身种子；改变上方「命石」与「合计」列中的贡献',
      stoneItemDash: (only) => (only ? '物品本身没有此属性——仅来自命石' : '命石滑块行：其贡献叠加到上方属性行'),
      stoneValue: (only, value, rollPct) =>
        `${only ? `仅来自命石：${value}——物品本身没有` : `命石属性：${value}——叠加到上方物品属性`}\n随机值为公差的 ${rollPct}%，每块命石各不相同`,
      stoneTotal: (only) => (only ? '合计等于命石属性：物品本身没有' : '合计见上方物品属性行'),
      stoneCol: '命石的贡献——滑块在「命石属性（叠加）」组中',
      totalCol: '合计：物品属性 + 命石',
      noStoneCol: '命石没有此属性',
      totalOwn: '合计等于物品自身属性：命石不增加此项',
      stoneNote: (fixed) => `命石不能锻造：没有「强化」、神铸与重铸——只能标记固定属性（随机值 +${fixed}%）。范围为游戏百分比的 −½…+½，颜色与游戏一致。`,
      note: ({ fixed, divine, ability, stone }) =>
        `范围为获得物品时的随机范围（游戏百分比的 −½…+½），颜色与游戏一致。「固定」使属性 +${fixed}%，「强化」为一条属性提供 20–38%，「神铸」为所有属性 +${divine}%、效果数值 +${ability}%（反向属性变小——正是提升）。这些加成在重铸 4–9 级、品质 5 及以上才开放。效果数值单独列在下方：随机为阶梯式（步长 1/5），「固定」与「强化」对其无效。${
          stone ? ' 命石属性自成一组：「命石」列为贡献，「合计」为与物品属性之和；物品的重铸与「强化」不作用于命石。' : ''
        }`,
    },
    dps: DPS_TEXT.zh,
  },
};
