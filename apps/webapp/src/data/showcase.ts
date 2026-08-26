import type { Lang } from '@/i18n/strings';

/**
 * The real items the two UI previews are drawn from.
 *
 * Real ones — id, name, rarity, level and gold cost as `packages/aow5-shared`
 * records them — because a page that invents item names to look good is lying
 * about the one thing both tools are for. The ids are here so any of it can be
 * checked against the extracted tables.
 *
 * Icons are filenames rather than imports: this app already serves the shared
 * package's `public/` as its own (see vite.config.ts), so `ItemIcon` resolves
 * them the same way the planner does, from the same files, with no second copy
 * in the bundle.
 */

export interface ShowcaseItem {
  /** Id in the extracted tables, for verification. */
  id: string;
  /** Filename under `icons/items/`, resolved by `iconUrl`. */
  icon: string;
  /** Rarity, 0–7. Drives the tile border, as it does in the planner. */
  quality: number;
  level: number;
  /** Gold, as the game prices it. */
  cost: number;
  type: string;
  name: Record<Lang, string>;
}

const item = (
  id: string,
  icon: string,
  type: string,
  quality: number,
  level: number,
  cost: number,
  en: string,
  ru: string,
  zh: string,
): ShowcaseItem => ({ id, icon, type, quality, level, cost, name: { en, ru, zh } });

// The Chinese column is the addon's own wording, copied from
// `locale.zh.names.json` rather than translated from the English.
export const SHOWCASE = {
  lesserHealth: item('item_P000', 'icon_m2_21.png', 'potion', 1, 1, 60, 'Lesser Health Potion', 'Слабое зелье жизни', '弱效生命药剂'),
  health: item('item_P001', 'icon_m5_09.png', 'potion', 2, 2, 120, 'Health Potion', 'Зелье жизни', '生命药剂'),
  lesserMana: item('item_P004', 'icon_m2_24.png', 'potion', 1, 1, 60, 'Lesser Mana Potion', 'Слабое магическое зелье', '弱效魔法药剂'),
  powerTreads: item('item_0113', 'power_treads.png', 'equip', 2, 1, 200, 'Power Treads', 'Энергетические сапоги', '动力靴'),
  maelstrom: item('item_0117', 'maelstrom.png', 'equip', 4, 3, 1800, 'Maelstrom', 'Вихрь', '漩涡'),
  greatSword: item('item_0114', 'claymore.png', 'equip', 3, 1, 300, 'Great Sword', 'Большой меч', '大剑'),
  glyphAssault: item('item_G001', 'icon_fsz_72.png', 'gem', 2, 1, 200, 'Glyph: Assault I', 'Руна: Силовая атака I', '符印：强攻Ⅰ'),
  glyphFocus: item('item_G002', 'icon_fsz_46.png', 'gem', 2, 2, 200, 'Glyph: Focus I', 'Руна: Сосредоточенность I', '符印：专注Ⅰ'),
  glyphAssaultII: item('item_G001_2', 'icon_fs_1__10.png', 'gem', 3, 2, 600, 'Glyph: Assault II', 'Руна: Силовая атака II', '符印：强攻Ⅱ'),
  skyfallFragment: item('item_0587', 'icon_m600_01.png', 'material', 4, 6, 800, 'Skyfall Fragment', 'Осколок небес', '倾天碎片'),
  skyfallCrystal: item('item_0588', 'icon_m600_02.png', 'material', 4, 7, 2500, 'Skyfall Crystal', 'Кристалл небес', '倾天晶体'),
} satisfies Record<string, ShowcaseItem>;

/**
 * The preview board: one section, its slots filled the way a real one is.
 *
 * Laid out to match the planner's own groups — three potions, six equipment,
 * three runes, then the single neutral and backpack slots.
 */
export const PREVIEW_BOARD: {
  potions: (ShowcaseItem | null)[];
  equipment: (ShowcaseItem | null)[];
  runes: (ShowcaseItem | null)[];
  neutral: ShowcaseItem | null;
  backpack: ShowcaseItem | null;
} = {
  potions: [SHOWCASE.lesserHealth, SHOWCASE.health, SHOWCASE.lesserMana],
  equipment: [SHOWCASE.powerTreads, SHOWCASE.maelstrom, SHOWCASE.greatSword, null, null, null],
  runes: [SHOWCASE.glyphAssault, SHOWCASE.glyphFocus, null],
  neutral: SHOWCASE.skyfallFragment,
  backpack: null,
};

/**
 * What the overlay preview lists as this session's loot.
 *
 * The quantities are invented — they are what an evening looks like — but the
 * items and their unit prices are real, so every total is arithmetic anyone
 * can check rather than decoration.
 */
export const PREVIEW_LOOT: { item: ShowcaseItem; qty: number }[] = [
  { item: SHOWCASE.skyfallCrystal, qty: 3 },
  { item: SHOWCASE.skyfallFragment, qty: 11 },
  { item: SHOWCASE.glyphAssaultII, qty: 2 },
  { item: SHOWCASE.health, qty: 6 },
];

/** The seven ability keys a section carries, in the planner's own order. */
export const ABILITY_KEYS = ['P', 'Q', 'W', 'E', 'D', 'F', 'R'] as const;
