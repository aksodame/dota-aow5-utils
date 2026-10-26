import { CURRENT_RULESET, poolInSeason, type PoolsFile, type RulesetId } from './pools.ts';
import { seasonalPatch, sourceFileOf, type ChestRef, type ItemsExtraFile, type TowerChest } from './items-extra.ts';

/**
 * The consumables section: potions, elixirs, drinks, and the containers —
 * chests, crates, rune pouches, magic-tower chests — that open into a pool.
 *
 * Which items those are is a rule rather than a list, the partner wiki's
 * `isConsumable`: defined in the potions file, typed `potion`, capped by a
 * `use_max`, or opening a pool. The page, the server's card and the tests all
 * ask this module, so the three agree on what the section holds.
 */

type Lang = 'en' | 'ru' | 'zh';

/**
 * The three chips at the top of the list. A container is one whatever else it
 * is; `limited` is anything else a hero can only use so many of; `plain` is
 * the rest.
 */
export type ConsumableCategory = 'limited' | 'container' | 'plain';

/** The two fields of an item the rule reads besides the wiki tables. */
export interface ConsumableBase {
  id: string;
  type: string;
}

/** How many of it a hero may consume, in the wiki's season unless asked. */
export function consumableUseMax(
  extra: ItemsExtraFile,
  itemId: string,
  ruleset: RulesetId = CURRENT_RULESET,
): number | undefined {
  return seasonalPatch(extra, itemId, ruleset)?.useMax ?? extra.items[itemId]?.useMax;
}

/** The magic-tower chest an item is, with its table row, or undefined. */
export function towerChestOf(extra: ItemsExtraFile, itemId: string): { ref: ChestRef; chest: TowerChest } | undefined {
  const ref = extra.items[itemId]?.chest;
  const chest = ref === undefined ? undefined : extra.chests[ref.chest];
  return ref === undefined || chest === undefined ? undefined : { ref, chest };
}

/** The pool an item opens: a container's own, or its tower chest's. */
export function consumablePool(extra: ItemsExtraFile, itemId: string): string | undefined {
  return extra.items[itemId]?.container?.pool ?? towerChestOf(extra, itemId)?.chest.pool;
}

/**
 * The partner's rule, on our fields — the list this section shows. Unlike
 * `isConsumable` in `items-extra.ts` it counts the magic-tower chests, which
 * carry `chest` rather than `container`, and reads the wiki season's use cap.
 */
export function inConsumables(extra: ItemsExtraFile, item: ConsumableBase, ruleset: RulesetId = CURRENT_RULESET): boolean {
  return (
    sourceFileOf(extra, item.id) === 'ak_items_potion' ||
    item.type === 'potion' ||
    consumableUseMax(extra, item.id, ruleset) !== undefined ||
    consumablePool(extra, item.id) !== undefined
  );
}

/**
 * Whether the wiki shows `itemId` on its Consumables page rather than on the
 * item catalogue — `inConsumables` for a caller that has only the id and,
 * perhaps, the item table's type. The partner wiki's `isConsumable`, which
 * every link to an item went through; tower chests included.
 */
export function isConsumable(extra: ItemsExtraFile, itemId: string, type?: string): boolean {
  return inConsumables(extra, { id: itemId, type: type ?? '' });
}

export function consumableCategory(
  extra: ItemsExtraFile,
  itemId: string,
  ruleset: RulesetId = CURRENT_RULESET,
): ConsumableCategory {
  if (consumablePool(extra, itemId) !== undefined) return 'container';
  return consumableUseMax(extra, itemId, ruleset) !== undefined ? 'limited' : 'plain';
}

/**
 * Draws per open for each difficulty a tower chest can be won on.
 *
 * The table states the normal chest's count; the easy chest gives 70 % of it
 * and the hard one 150 %, rounded — what the game's own tooltips on the easy
 * and hard chests say, and what the partner wiki computed. An unsealed chest
 * becomes one of the three on a successful evacuation.
 */
export function chestDraws(chest: TowerChest): { easy: number; normal: number; hard: number } {
  return { easy: Math.round(chest.count * 0.7), normal: chest.count, hard: Math.round(chest.count * 1.5) };
}

/** Draws for one variant; undefined for the unsealed chest, which is not opened as itself. */
export function chestVariantDraws(chest: TowerChest, variant: ChestRef['variant']): number | undefined {
  return variant === 'temporary' ? undefined : chestDraws(chest)[variant];
}

/** An item's cost in a season: the seasonal patch over the base table. */
export function seasonalCost(extra: ItemsExtraFile, itemId: string, base: number, ruleset: RulesetId = CURRENT_RULESET): number {
  return seasonalPatch(extra, itemId, ruleset)?.cost ?? base;
}

/** Difficulty names, the game's (`item_MTB…` name suffixes). */
export const CHEST_VARIANT_NAMES: Record<Lang, Record<ChestRef['variant'], string>> = {
  en: { easy: 'Easy', normal: 'Normal', hard: 'Hard', temporary: 'Unsealed' },
  ru: { easy: 'Лёгкий', normal: 'Обычный', hard: 'Сложный', temporary: 'Незапечатанный' },
  zh: { easy: '简单', normal: '普通', hard: '困难', temporary: '未封装' },
};

export const CONSUMABLE_CATEGORY_NAMES: Record<Lang, Record<ConsumableCategory, string>> = {
  en: { limited: 'Single-use', container: 'Container', plain: 'Regular' },
  ru: { limited: 'Одноразовый', container: 'Контейнер', plain: 'Расходный' },
  zh: { limited: '限次使用', container: '容器', plain: '常规消耗品' },
};

/** What `consumablePageFacts` needs, already resolved to names in the reader's language. */
export interface ConsumableFactsInput {
  name: string;
  category: ConsumableCategory;
  level: number;
  cost: number;
  useMax?: number;
  /** The pool's name (or id) and how many rows it has. */
  pool?: { name: string; size: number };
  /** Percent chance an open draws from the pool at all. */
  chance?: number;
  /** Draws per open. */
  draws?: number;
  gold?: [min: number, max: number];
  chest?: { tower: string; level: number; variant: ChestRef['variant'] };
}

const LOCALE: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };

/**
 * The page's title, short facts and one-sentence description — the same
 * sentence in the browser tab and on the server's card.
 */
export function consumablePageFacts(input: ConsumableFactsInput, lang: Lang): { name: string; facts: string; description: string } {
  const n = (value: number) => new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 1 }).format(value);
  const s = FACTS[lang];
  const bits: string[] = [CONSUMABLE_CATEGORY_NAMES[lang][input.category]];
  if (input.chest !== undefined) {
    bits.push(input.chest.tower, s.level(input.chest.level), CHEST_VARIANT_NAMES[lang][input.chest.variant]);
  } else {
    if (input.level > 0) bits.push(s.level(input.level));
    if (input.cost > 0) bits.push(s.gold(n(input.cost)));
    if (input.useMax !== undefined) bits.push(s.uses(input.useMax));
  }

  const parts: string[] = [];
  if (input.gold !== undefined) parts.push(s.givesGold(n(input.gold[0]), n(input.gold[1])));
  if (input.pool !== undefined) {
    parts.push(
      s.opens(
        input.pool.name,
        input.pool.size,
        input.chance !== undefined && input.chance < 100 ? n(input.chance) : null,
        input.draws ?? 1,
      ),
    );
  }
  const description =
    parts.length > 0 ? s.sentence(input.name, parts.join(s.and)) : s.plain(input.name, CONSUMABLE_CATEGORY_NAMES[lang][input.category]);

  return { name: input.name, facts: bits.join(' · '), description };
}

interface FactsStrings {
  level: (level: number) => string;
  gold: (amount: string) => string;
  uses: (count: number) => string;
  givesGold: (min: string, max: string) => string;
  opens: (pool: string, size: number, chance: string | null, draws: number) => string;
  and: string;
  sentence: (name: string, what: string) => string;
  plain: (name: string, category: string) => string;
}

const FACTS: Record<Lang, FactsStrings> = {
  en: {
    level: (level) => `Lv. ${level}`,
    gold: (amount) => `${amount} gold`,
    uses: (count) => `${count} uses`,
    givesGold: (min, max) => `${min}–${max} gold`,
    opens: (pool, size, chance, draws) =>
      `${chance === null ? '' : `a ${chance}% chance of `}${draws > 1 ? `${draws} draws` : 'a draw'} from ${pool} (${size} items)`,
    and: ' and ',
    sentence: (name, what) => `${name}, Age of Weapons 5: each open gives ${what}.`,
    plain: (name, category) => `${name}, Age of Weapons 5 consumable (${category.toLowerCase()}): what it does, its numbers and where it comes from.`,
  },
  ru: {
    level: (level) => `ур. ${level}`,
    gold: (amount) => `${amount} зол.`,
    uses: (count) => `применений: ${count}`,
    givesGold: (min, max) => `${min}–${max} золота`,
    opens: (pool, size, chance, draws) =>
      `${chance === null ? '' : `с шансом ${chance} % `}${draws > 1 ? `${draws} вытяжек` : 'предмет'} из пула «${pool}» (${size} предм.)`,
    and: ' и ',
    sentence: (name, what) => `${name}, Age of Weapons 5: каждое открытие даёт ${what}.`,
    plain: (name, category) => `${name} — расходник Age of Weapons 5 (${category.toLowerCase()}): что делает, числа и откуда берётся.`,
  },
  zh: {
    level: (level) => `${level}级`,
    gold: (amount) => `${amount} 金币`,
    uses: (count) => `可使用 ${count} 次`,
    givesGold: (min, max) => `${min}–${max} 金币`,
    opens: (pool, size, chance, draws) =>
      `${chance === null ? '' : `${chance}% 概率`}从「${pool}」（${size} 种物品）中抽取${draws > 1 ? ` ${draws} 次` : '一次'}`,
    and: '，并',
    sentence: (name, what) => `${name}（Age of Weapons 5）：每次开启获得${what}。`,
    plain: (name, category) => `${name}（Age of Weapons 5 消耗品 · ${category}）：效果、数值与获取途径。`,
  },
};

/**
 * A consumable's display name: the game's, else its pool's (the unsealed tower
 * chests and the Greed Cave crates are hidden items with no name token of their
 * own, but their pool is named after them), else the id.
 */
export function consumableName(
  extra: ItemsExtraFile,
  itemId: string,
  gameName: string | undefined,
  poolNames: Readonly<Record<string, string>>,
): string {
  if (gameName !== undefined && gameName !== '' && gameName !== itemId) return gameName;
  const pool = consumablePool(extra, itemId);
  return (pool === undefined ? undefined : poolNames[pool]) ?? itemId;
}

/**
 * Everything `consumablePageFacts` reads, from the tables both the page and
 * the server hold. `level` and `cost` are the base table's; the season's patch
 * is applied here.
 */
export function consumableFactsInput(
  extra: ItemsExtraFile,
  pools: PoolsFile,
  item: { id: string; name: string; level: number; cost: number },
  names: { pools: Readonly<Record<string, string>>; towers: Readonly<Record<string, string>> },
  ruleset: RulesetId = CURRENT_RULESET,
): ConsumableFactsInput {
  const patch = seasonalPatch(extra, item.id, ruleset);
  const own = extra.items[item.id];
  const tower = towerChestOf(extra, item.id);
  const poolId = consumablePool(extra, item.id);
  const pool = poolId === undefined ? undefined : pools.pools[poolId];
  const useMax = consumableUseMax(extra, item.id, ruleset);
  const draws = own?.container?.draws ?? (tower === undefined ? undefined : chestVariantDraws(tower.chest, tower.ref.variant));

  const input: ConsumableFactsInput = {
    name: item.name,
    category: consumableCategory(extra, item.id, ruleset),
    level: patch?.level ?? item.level,
    cost: patch?.cost ?? item.cost,
  };
  if (useMax !== undefined) input.useMax = useMax;
  if (pool !== undefined && poolId !== undefined) {
    input.pool = { name: names.pools[poolId] ?? poolId, size: poolInSeason(pool, ruleset).entries.length };
  }
  if (own?.container !== undefined) input.chance = own.container.chance;
  if (draws !== undefined) input.draws = draws;
  if (own?.container?.gold !== undefined) input.gold = own.container.gold;
  if (tower !== undefined) {
    input.chest = { tower: names.towers[tower.chest.tower] ?? tower.chest.tower, level: tower.chest.level, variant: tower.ref.variant };
  }
  return input;
}
