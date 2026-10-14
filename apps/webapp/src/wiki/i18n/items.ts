import type { Lang } from '@/i18n/strings';
import type { Localised } from './index';

/**
 * The item page's wiki panels: where an item drops, who sells it, what
 * unlocks it, its fate stone, its Life Soul skill. Russian is the partner
 * wiki's own wording (`tab-items.js`); English and Chinese use the game's terms
 * (fate stone / 命石, Ancestral / 先祖, Life Soul / 命魂, Support Shop — see the
 * glossaries).
 *
 * The page's own headings and badges are in `strings.itemPage`, because the
 * page is in the main bundle; these load with the panels' chunk.
 */
export interface ItemWikiStrings {
  /** Fallbacks for a unit type the game's codex does not label. */
  monsterTypes: Record<string, string>;

  drops: {
    title: (n: number) => string;
    titleBare: string;
    capped: (shown: number, total: number) => string;
    tip: (name: string, type: string, rooms: string, chance: string) => string;
    note: string;
    noteRecipe: string;
    recipeNone: string;
    firstTitle: string;
    firstLead: string;
    firstTail: string;
    firstTip: (name: string) => string;
  };

  containers: {
    title: (n: number) => string;
    tip: (name: string, chance: string, pool: string) => string;
    note: string;
  };

  unlock: {
    title: string;
    talent: (tree: string) => string;
    talentTip: string;
    via: string;
    recipes: string;
    free: string;
  };

  /** The panel that gathers vendors, the Sky and the paid sources. */
  sourcesTitle: string;

  vendors: {
    title: string;
    names: { regular: string; ancient: string; guild: string };
    shopLevel: (level: number) => string;
    unlockDrops: (n: number) => string;
    precious: (ceil: string) => string;
    gold: (min: string, max: string) => string;
    coins: (min: string, max: string) => string;
    points: (n: string) => string;
    stock: (n: number) => string;
    openTip: string;
  };

  sky: {
    title: string;
    endless: string;
    bosses: (stages: string, waves: string) => string;
    merchants: (stages: string, waves: string) => string;
    endlessTip: string;
    chest: (tier: number) => string;
    chestLead: string;
    chestTip: (tier: number) => string;
  };

  paid: {
    title: string;
    gacha: (chest: string) => string;
    gachaTip: (chest: string, pools: string) => string;
    mall: (pack: string) => string;
    mallLine: (count: number, price: string, packed: boolean) => string;
    note: string;
  };

  soul: {
    title: string;
    note: (multiplier: string | null, rules: string) => string;
    rule: (quality: string, multiplier: string) => string;
    skill: string;
    transform: string;
    window: string;
    windowValue: (s: string) => string;
    segments: string;
    segmentsValue: (n: number) => string;
    aim: string;
    aims: { point: (range: string) => string; direction: string; self: string };
    cast: string;
    seconds: (s: string) => string;
    cooldown: string;
    cooldownValue: (base: string, min: string | null, levels: number) => string;
    longNote: (window: string | null, boss: string, cdr: string) => string;
  };

  facet: {
    title: string;
    fromFacet: string;
    upgradedBy: string;
    upgrades: string;
    improves: string;
    into: string;
    waves: (waves: string, bosses: string) => string;
    noWaves: string;
    mergeNote: string;
    compareTitle: string;
    compareShow: (name: string) => string;
    compareHide: string;
    cols: { stat: string; regular: string; facet: string; ancestral: string; diff: string };
    ownTip: (own: string, facet: string) => string;
    compareNote: string;
  };

  /** "From the code": a mechanic the tooltip does not mention. */
  codeNoteLabel: string;
  codeNotes: Record<string, string>;
}


export const ITEMS: Localised<ItemWikiStrings> = {
  en: {
    monsterTypes: {
      monster_normal: 'Normal',
      monster_elite: 'Elite',
      monster_miniboss: 'Mini-boss',
      monster_boss: 'Boss',
      building: 'Structure',
      destructible: 'Container',
      summoned: 'Summon',
      monster_trap: 'Trap',
    },
    drops: {
      title: (n) => `Drops from monsters (${n})`,
      titleBare: 'Drops from monsters',
      capped: (shown, total) => `Showing the first ${shown} of ${total}.`,
      tip: (name, type, rooms, chance) => `${name} · ${type}${rooms ? `\n${rooms}` : ''}\n\nChance per kill: ${chance}`,
      note: 'Chance per kill on Hard. Recipes are left out of the pool (each drops only once); the guaranteed first drop is listed separately below.',
      noteRecipe:
        'Chance per kill on Hard while the recipe is still in the pool: once it drops, it leaves every pool. Counted together with the rest of the pool.',
      recipeNone: 'No monster has this recipe in its drops — the data names no source for it.',
      firstTitle: 'First drop',
      firstLead: 'Guaranteed first drop:',
      firstTail:
        '(share of the list; exactly one item of it drops — for ordinary monsters on the first kill, for bosses again on the 1st, 3rd, 5th, 10th, 35th and 100th kill).',
      firstTip: (name) => `Open ${name}`,
    },
    containers: {
      title: (n) => `From containers (${n})`,
      tip: (name, chance, pool) => `${name}\nChance per open: ${chance}\nPool: ${pool}`,
      note: 'Shares are by pool weight. A pool weighs less after repeated drops from the same source (see the FAQ on drop mechanics).',
    },
    unlock: {
      title: 'Unlocked by',
      talent: (tree) => `Talent · ${tree}`,
      talentTip: 'Open the node in the talent tree',
      via: 'Crafts',
      recipes: 'Recipe',
      free: 'No recipe in the game: crafted from the parts alone.',
    },
    sourcesTitle: 'Where to get it',
    vendors: {
      title: 'Can be bought',
      names: { regular: 'Merchant', ancient: 'Ancient Merchant', guild: 'Guild Merchant · Point Exchange' },
      shopLevel: (level) => `equipment: stocked from shop level ${level}`,
      unlockDrops: (n) => `appears on the shelf only after it has dropped for you ${n}+ times`,
      precious: (ceil) => `precious: up to ${ceil}`,
      gold: (min, max) => `${min}–${max} gold`,
      coins: (min, max) => `${min}–${max} Ancient Coins`,
      points: (n) => `${n} points`,
      stock: (n) => `stock ${n}`,
      openTip: 'Open the vendor',
    },
    sky: {
      title: 'Skyfall Realm',
      endless: 'Endless',
      bosses: (stages, waves) => `boss reward ${stages} (waves ${waves})`,
      merchants: (stages, waves) => `merchant level ${stages} (waves ${waves})`,
      endlessTip: 'Open Sky → Endless',
      chest: (tier) => `Tier ${tier} reward chest`,
      chestLead: 'Drops from the reward chest opened at the end of a run:',
      chestTip: (tier) => `Open Sky → Tier ${tier}`,
    },
    paid: {
      title: 'Other sources',
      gacha: (chest) => `Treasure: chest ${chest}`,
      gachaTip: (chest, pools) => `Drops from paid treasure chest ${chest} (pools ${pools}); chances within a pool follow item weights`,
      mall: (pack) => `Support Shop: ${pack}`,
      mallLine: (count, price, packed) => `${count} for ${price} points${packed ? ' (boxed form)' : ''}`,
      note: 'The Support Shop sells bundles for top-up points (paid currency); treasure chests are paid chests with item pools. Cosmetics are not shown in the wiki.',
    },
    soul: {
      title: 'Life Soul',
      note: (m, rules) =>
        `Life Soul: ${m !== null ? `multiplier ×${m}; ` : ''}every soul has the same active — Pure Damage equal to the sum of all attributes × the multiplier, plus an emergency heal (50% of missing health, then regeneration for 6 s). Souls differ only in passive stats, quality and level: ${rules}.`,
      rule: (q, m) => `${q} — ×${m}`,
      skill: 'Soul skill',
      transform: 'Transforms into',
      window: 'Transformation window',
      windowValue: (s) => `${s} s — invulnerable, no control`,
      segments: 'Damage segments',
      segmentsValue: (n) => (n === 1 ? '1 (a single hit)' : `${n} (each a separate hit)`),
      aim: 'Targeting',
      aims: { point: (r) => `at a point${r ? ` (range ${r})` : ''}`, direction: 'in a direction', self: 'on self' },
      cast: 'Execution time',
      seconds: (s) => `${s} s`,
      cooldown: 'Cooldown',
      cooldownValue: (base, min, levels) => `${base} s${min !== null ? ` (≈ ${min} s at ${levels} forges)` : ''}`,
      longNote: (w, boss, cdr) =>
        `The soul skill is a boss transformation: for ${w !== null ? `${w} s` : 'the skill’s duration'} the hero becomes ${boss}, invulnerable, immune to debuffs and out of your control — the game moves it. The damage is Pure (ignores armor and magic resistance, never crits), split evenly across the segments; each enemy takes at most one segment per wave. The cooldown is reduced only by the general Cooldown Reduction % and drops by ${cdr}% per forge level of the soul. Works only under S2 rules.`,
    },
    facet: {
      title: 'Fate stone',
      fromFacet: 'Obtained from a fate stone',
      upgradedBy: 'Upgraded by a fate stone',
      upgrades: 'Upgrades',
      improves: 'improves',
      into: 'into',
      waves: (waves, bosses) => `Drops in the Skyfall Realm’s Endless, waves: ${waves} (bosses ${bosses}).`,
      noWaves: 'Where the fate stone drops is not in the data.',
      mergeNote:
        'A fate stone’s stats do not replace the Ancestral item’s — they are added on top: the Ancestral item rolls its own stats, and the stone rolls its own (from the stone’s seed).',
      compareTitle: 'Compared with the regular item',
      compareShow: (name) => `Compare with ${name}`,
      compareHide: 'Hide the comparison',
      cols: { stat: 'Stat', regular: 'Regular', facet: 'Fate stone', ancestral: 'Ancestral', diff: 'Difference' },
      ownTip: (own, facet) => `Own stats: ${own} · fate stone: ${facet}`,
      compareNote:
        '“Ancestral” is as in the game: ascension adds the fate stone’s stats to the item’s own (each rolls separately — from the item’s seed and the stone’s; the middle of the range is shown). “+11%” means the stat is on average 11% higher on the Ancestral item; “—” means one version lacks the stat.',
    },
    codeNoteLabel: 'From the code',
    codeNotes: {
      item_0298:
        'The bonus can stick: once the slow ends, the accumulated damage reduction is not reset (a bug — the tooltip does not say so).',
      item_0305:
        'The bonus is a flat snapshot of your stats at cast time: %-amplifiers of damage and health are counted twice (at 80%, “+50%” gives +90%). Since v1.507 recasting no longer stacks the buff — the snapshot excludes its own bonus (before, the value grew with every cast).',
      item_0368: '“% total crit” goes into both halves of the sum — physical and magical — so it counts twice.',
      item_0425:
        'The bonus is a flat snapshot of your stats at cast time: %-amplifiers of damage and health are counted twice (at 80%, “+50%” gives +90%). Since v1.507 recasting no longer stacks the buff — the snapshot excludes its own bonus (before, the value grew with every cast).',
      item_0471:
        'Works only in room M014, Ender Thunder Mountain — anywhere else using it does nothing and does not even start the cooldown. On use, monsters within 800 casting a “blue” charge spell are struck by lightning: Pure Damage of 5% of their current health (never kills), and their cast is interrupted. The tooltip does not mention any of this.',
    },
  },
  ru: {
    monsterTypes: {
      monster_normal: 'Обычный',
      monster_elite: 'Элитный',
      monster_miniboss: 'Мини-босс',
      monster_boss: 'Босс',
      building: 'Строение',
      destructible: 'Контейнер',
      summoned: 'Призванный',
      monster_trap: 'Ловушка',
    },
    drops: {
      title: (n) => `Выпадает с монстров (${n})`,
      titleBare: 'Выпадает с монстров',
      capped: (shown, total) => `Показаны первые ${shown} из ${total}.`,
      tip: (name, type, rooms, chance) => `${name} · ${type}${rooms ? `\n${rooms}` : ''}\n\nШанс с одного убийства: ${chance}`,
      note: 'Шанс — с одного убийства на сложной сложности. Рецепты исключены из пула (они выпадают один раз), гарантированный первый дроп — отдельной строкой ниже.',
      noteRecipe:
        'Шанс — с одного убийства на сложной сложности, пока рецепт ещё в пуле: выпав один раз, он из пулов исчезает. Считан вместе с остальными предметами пула.',
      recipeNone: 'Ни у одного монстра в дропе этого рецепта нет — источников в данных не нашлось.',
      firstTitle: 'Первый дроп',
      firstLead: 'Гарантированный первый дроп:',
      firstTail:
        '(доля в списке; выпадает один предмет из него — у обычных монстров за первое убийство, у боссов повторяется на 1, 3, 5, 10, 35 и 100-м убийстве).',
      firstTip: (name) => `Открыть «${name}»`,
    },
    containers: {
      title: (n) => `Из контейнеров (${n})`,
      tip: (name, chance, pool) => `${name}\nШанс за одно открытие: ${chance}\nПул: ${pool}`,
      note: 'Доля показана по весам пула. Вес пула снижается после повторных выпадений из того же источника (см. FAQ «Механика дропа»).',
    },
    unlock: {
      title: 'Открывается',
      talent: (tree) => `Талант · ветка «${tree}»`,
      talentTip: 'Показать узел в дереве прокачки',
      via: 'Создаёт',
      recipes: 'Рецепт',
      free: 'Рецепта в игре нет: крафтится по одному составу.',
    },
    sourcesTitle: 'Где взять',
    vendors: {
      title: 'Можно купить',
      names: { regular: 'Обычный торговец', ancient: 'Древний торговец', guild: 'Гильдейский (обмен очков)' },
      shopLevel: (level) => `снаряжение: появится в лавке с уровня ${level}`,
      unlockDrops: (n) => `в витрине появится только после того, как выпадало вам ${n}+ раз`,
      precious: (ceil) => `ценный: до ${ceil}`,
      gold: (min, max) => `${min}–${max} зол.`,
      coins: (min, max) => `${min}–${max} мон.`,
      points: (n) => `${n} очк.`,
      stock: (n) => `запас ${n}`,
      openTip: 'Открыть вкладку «Продавцы»',
    },
    sky: {
      title: 'Небо',
      endless: 'Бесконечка',
      bosses: (stages, waves) => `награда боссов ${stages} (волны ${waves})`,
      merchants: (stages, waves) => `у торговцев уровня ${stages} (волны ${waves})`,
      endlessTip: 'Открыть «Небо» → «Бесконечка»',
      chest: (tier) => `Сундук-награда, Небо ${tier}`,
      chestLead: 'Падает из сундука-награды в конце захода:',
      chestTip: (tier) => `Открыть «Небо» → «Небо ${tier}»`,
    },
    paid: {
      title: 'Откуда ещё добывается',
      gacha: (chest) => `Гача: сундук ${chest}`,
      gachaTip: (chest, pools) => `Выпадает из платного сундука №${chest} (пулы ${pools}); шансы внутри пула — по весам предметов`,
      mall: (pack) => `Донат-магазин: ${pack}`,
      mallLine: (count, price, packed) => `${count} шт. за ${price} очков${packed ? ' (запечатанный вид)' : ''}`,
      note: 'Платный магазин торгует наборами за очки пополнения (это донат-валюта), гача — платные сундуки с пулами предметов. Предметы кастомизации в вике не показываются.',
    },
    soul: {
      title: 'Душа',
      note: (m, rules) =>
        `Душа: ${m !== null ? `множитель ×${m}, ` : ''}активный эффект у всех душ одинаков — чистый урон, равный сумме всех атрибутов × множитель, плюс экстренное исцеление (50 % недостающего здоровья и регенерация 6 сек.). Различаются души только пассивными статами, качеством и уровнем: ${rules}.`,
      rule: (q, m) => `${q} — ×${m}`,
      skill: 'Навык души',
      transform: 'Превращение',
      window: 'Окно превращения',
      windowValue: (s) => `${s} с — неуязвим, управление недоступно`,
      segments: 'Сегментов урона',
      segmentsValue: (n) => (n === 1 ? '1 (одним попаданием)' : `${n} (каждый — отдельное попадание)`),
      aim: 'Наведение',
      aims: { point: (r) => `по точке${r ? ` (радиус ${r})` : ''}`, direction: 'по направлению', self: 'на себя' },
      cast: 'Длительность исполнения',
      seconds: (s) => `${s} с`,
      cooldown: 'Кулдаун',
      cooldownValue: (base, min, levels) => `${base} с${min !== null ? ` (на ${levels} ковках ≈ ${min} с)` : ''}`,
      longNote: (w, boss, cdr) =>
        `Навык души — превращение в босса: герой на ${w !== null ? `${w} с` : 'время навыка'} становится «${boss}», всё это время он неуязвим, не получает дебаффы и не управляется — движением занимается сама игра. Урон — чистый (обходит броню и маг. сопротивление, крит не срабатывает), поровну на сегменты; каждый враг получает не больше одного сегмента за волну. Кулдаун сокращается только общим «Сокращением перезарядки, %» и падает на ${cdr} % за каждую ковку души. Работает только в правилах s2.`,
    },
    facet: {
      title: 'Грань',
      fromFacet: 'Получается из грани',
      upgradedBy: 'Улучшается гранью',
      upgrades: 'Улучшает',
      improves: 'улучшает',
      into: '→',
      waves: (waves, bosses) => `Падает в Пещере жадности, волны: ${waves} (боссы ${bosses}).`,
      noWaves: 'Место выпадения грани в данных не указано.',
      mergeNote:
        'Свойства грани не заменяют свойства предка, а прибавляются сверх них: у предка своя прокрутка собственных свойств, у грани — своя (от сида грани).',
      compareTitle: 'Сравнение с обычным предметом',
      compareShow: (name) => `Сравнить с «${name}»`,
      compareHide: 'Скрыть сравнение',
      cols: { stat: 'Характеристика', regular: 'Обычный', facet: 'Грань', ancestral: 'Предок', diff: 'Разница' },
      ownTip: (own, facet) => `Свои свойства: ${own} · грань: ${facet}`,
      compareNote:
        '«Предок» — как в игре: при вознесении к его собственным свойствам прибавляются свойства грани (у каждого своя прокрутка — от сида предмета и от сида грани, здесь показана середина диапазона). «+11 %» значит, что у предка свойство в среднем на 11 % выше; «—» — свойства нет у одной из версий.',
    },
    codeNoteLabel: 'По коду',
    codeNotes: {
      item_0298:
        'Бонус может залипнуть: после окончания замедления накопленное снижение урона не сбрасывается (баг — в подсказке не сказано).',
      item_0305:
        'Бонус — плоский снимок ваших статов на момент каста: %-усилители урона и здоровья учитываются дважды (при 80 % «+50 %» даёт +90 %). С v1.507 перекаст бафф больше не разгоняет — снимок считается за вычетом собственного бонуса (раньше значение росло с каждым кастом).',
      item_0368: '«% общего крита» входит в обе части суммы — и физическую, и магическую — то есть его вклад считается дважды.',
      item_0425:
        'Бонус — плоский снимок ваших статов на момент каста: %-усилители урона и здоровья учитываются дважды (при 80 % «+50 %» даёт +90 %). С v1.507 перекаст бафф больше не разгоняет — снимок считается за вычетом собственного бонуса (раньше значение росло с каждым кастом).',
      item_0471:
        'Работает только в комнате M014 «Гора громового конца» — вне неё применение ничего не делает и даже не запускает перезарядку. При использовании монстры с заклинанием «синего» заряда в радиусе 800 получают молнию: чистый урон в 5 % их текущего здоровья (не убивает), и их каст прерывается. В подсказке этого нет.',
    },
  },
  zh: {
    monsterTypes: {
      monster_normal: '小怪',
      monster_elite: '精英怪',
      monster_miniboss: '头目',
      monster_boss: 'BOSS',
      building: '建筑',
      destructible: '容器',
      summoned: '召唤物',
      monster_trap: '陷阱',
    },
    drops: {
      title: (n) => `怪物掉落（${n}）`,
      titleBare: '怪物掉落',
      capped: (shown, total) => `仅显示前 ${shown} 项，共 ${total} 项。`,
      tip: (name, type, rooms, chance) => `${name} · ${type}${rooms ? `\n${rooms}` : ''}\n\n每次击杀掉落几率：${chance}`,
      note: '几率为困难难度下每次击杀的掉落几率。配方不计入掉落池（每个只掉一次）；首次必掉见下方单独一行。',
      noteRecipe: '几率为困难难度下、配方仍在池中时每次击杀的掉落几率：掉落一次后即从所有池中移除。与池中其他物品一同计算。',
      recipeNone: '没有任何怪物的掉落中包含此配方——数据中找不到来源。',
      firstTitle: '首次掉落',
      firstLead: '首次必掉：',
      firstTail: '（列表内占比；从列表中掉落恰好一件——普通怪物在首次击杀时，BOSS 在第 1、3、5、10、35 和 100 次击杀时重复）。',
      firstTip: (name) => `打开「${name}」`,
    },
    containers: {
      title: (n) => `来自容器（${n}）`,
      tip: (name, chance, pool) => `${name}\n每次开启几率：${chance}\n掉落池：${pool}`,
      note: '占比按掉落池权重计算。同一来源重复掉落后，池权重会降低（见 FAQ「掉落机制」）。',
    },
    unlock: {
      title: '解锁方式',
      talent: (tree) => `天赋 ·「${tree}」`,
      talentTip: '在天赋树中查看该节点',
      via: '合成',
      recipes: '配方',
      free: '游戏中没有配方：仅凭材料即可合成。',
    },
    sourcesTitle: '获取途径',
    vendors: {
      title: '可购买',
      names: { regular: '商贩', ancient: '远古商贩', guild: '会馆商人 · 积分兑换' },
      shopLevel: (level) => `装备：商店等级 ${level} 起上架`,
      unlockDrops: (n) => `需为你掉落 ${n} 次以上后才会上架`,
      precious: (ceil) => `珍品：最高 ${ceil}`,
      gold: (min, max) => `${min}–${max} 金币`,
      coins: (min, max) => `${min}–${max} 远古币`,
      points: (n) => `${n} 积分`,
      stock: (n) => `库存 ${n}`,
      openTip: '打开商贩页面',
    },
    sky: {
      title: '倾天秘境',
      endless: '无尽秘境',
      bosses: (stages, waves) => `BOSS 奖励 ${stages}（第 ${waves} 波）`,
      merchants: (stages, waves) => `商人等级 ${stages}（第 ${waves} 波）`,
      endlessTip: '打开 秘境 → 无尽秘境',
      chest: (tier) => `${tier} 阶奖励宝箱`,
      chestLead: '掉落自一局结束时开启的奖励宝箱：',
      chestTip: (tier) => `打开 秘境 → ${tier} 阶`,
    },
    paid: {
      title: '其他来源',
      gacha: (chest) => `宝藏：宝箱 ${chest}`,
      gachaTip: (chest, pools) => `掉落自付费宝箱 ${chest}（池 ${pools}）；池内几率按物品权重`,
      mall: (pack) => `商城：${pack}`,
      mallLine: (count, price, packed) => `${count} 个，${price} 积分${packed ? '（封装形式）' : ''}`,
      note: '商城以充值积分（付费货币）出售礼包；宝藏为付费宝箱，内含物品池。外观道具不在百科中显示。',
    },
    soul: {
      title: '命魂',
      note: (m, rules) =>
        `命魂：${m !== null ? `倍率 ×${m}；` : ''}所有命魂的主动效果相同——造成等于全属性之和 × 倍率的纯粹伤害，并紧急治疗（恢复 50% 已损失生命值，随后持续回复 6 秒）。命魂之间只有被动属性、品质和等级不同：${rules}。`,
      rule: (q, m) => `${q} — ×${m}`,
      skill: '命魂技能',
      transform: '变身为',
      window: '变身时长',
      windowValue: (s) => `${s} 秒——无敌，无法操控`,
      segments: '伤害段数',
      segmentsValue: (n) => (n === 1 ? '1（单次命中）' : `${n}（每段独立命中）`),
      aim: '施放方式',
      aims: { point: (r) => `指定地点${r ? `（范围 ${r}）` : ''}`, direction: '指定方向', self: '自身' },
      cast: '施放持续时间',
      seconds: (s) => `${s} 秒`,
      cooldown: '冷却',
      cooldownValue: (base, min, levels) => `${base} 秒${min !== null ? `（${levels} 次锻造后 ≈ ${min} 秒）` : ''}`,
      longNote: (w, boss, cdr) =>
        `命魂技能即变身为 BOSS：英雄在 ${w !== null ? `${w} 秒` : '技能持续时间'}内变为「${boss}」，期间无敌、不受减益影响且无法操控——由游戏自行移动。伤害为纯粹伤害（无视护甲和魔抗，不会暴击），平均分配到各段；每个敌人每波最多承受一段。冷却只受通用「冷却缩减 %」影响，命魂每锻造一级降低 ${cdr}%。仅在 S2 规则下生效。`,
    },
    facet: {
      title: '命石',
      fromFacet: '由命石获得',
      upgradedBy: '可用命石升级',
      upgrades: '升级',
      improves: '升级',
      into: '→',
      waves: (waves, bosses) => `掉落于倾天秘境无尽模式，波次：${waves}（BOSS ${bosses}）。`,
      noWaves: '数据中未标明此命石的掉落地点。',
      mergeNote: '命石属性不会替换先祖物品的属性，而是叠加在其之上：先祖物品自身属性单独随机，命石属性也单独随机（取决于命石的种子）。',
      compareTitle: '与普通物品对比',
      compareShow: (name) => `与「${name}」对比`,
      compareHide: '隐藏对比',
      cols: { stat: '属性', regular: '普通', facet: '命石', ancestral: '先祖', diff: '差值' },
      ownTip: (own, facet) => `自身属性：${own} · 命石：${facet}`,
      compareNote:
        '「先祖」与游戏一致：升华时命石属性会加到物品自身属性上（各自独立随机——分别取决于物品与命石的种子，此处显示区间中值）。「+11%」表示先祖物品该属性平均高 11%；「—」表示其中一个版本没有该属性。',
    },
    codeNoteLabel: '代码细节',
    codeNotes: {
      item_0298: '加成可能残留：减速结束后，累积的伤害减免不会重置（漏洞——提示中未说明）。',
      item_0305:
        '加成是施放瞬间属性的固定快照：伤害和生命的百分比增益会被计算两次（80% 时「+50%」实际为 +90%）。自 v1.507 起重复施放不再叠加——快照会扣除自身加成（之前每次施放数值都会增长）。',
      item_0368: '「总暴击 %」同时计入物理和魔法两部分之和，因此贡献被计算两次。',
      item_0425:
        '加成是施放瞬间属性的固定快照：伤害和生命的百分比增益会被计算两次（80% 时「+50%」实际为 +90%）。自 v1.507 起重复施放不再叠加——快照会扣除自身加成（之前每次施放数值都会增长）。',
      item_0471:
        '仅在房间 M014「末影雷山」中有效——在其他地方使用没有任何效果，甚至不会进入冷却。使用时，800 范围内正在施放「蓝色」充能法术的怪物会遭受雷击：受到等于其当前生命值 5% 的纯粹伤害（不会致死），并被打断施法。提示中均未提及。',
    },
  },
};

/** `1, 2, 3` in the reader's language. */
export function joinList(lang: Lang, items: string[]): string {
  // Plain separators: Intl.ListFormat's narrow Chinese form has none at all between numbers.
  return items.join(lang === 'zh' ? '、' : ', ');
}

