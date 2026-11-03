#!/usr/bin/env node
/**
 * DPS mechanics lookup for the calculator.
 *
 *   node --experimental-strip-types scripts/dps-lookup.mjs item_0831
 *   node --experimental-strip-types scripts/dps-lookup.mjs --list
 *   node --experimental-strip-types scripts/dps-lookup.mjs --ids
 *
 * The list itself lives in `packages/aow5-shared/src/wiki/dps-mechanics.ts`;
 * this script only joins it to the emitted item data and the Russian names.
 * Types are stripped by Node, so no build step is needed.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DPS_FAMILIES,
  PANEL_FAMILIES,
  DPS_FAMILY_COUNT,
  DPS_ITEM_COUNT,
  PANEL_FAMILY_COUNT,
  PANEL_ITEM_COUNT,
  MODELED_ITEM_COUNT,
  mechanicFamilyOf,
} from '../packages/aow5-shared/src/wiki/dps-mechanics.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dataDir = resolve(root, 'packages/aow5-shared/public/data');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ROLE_LABEL = {
  talons: 'Когти дракона',
  bag: 'Сумка: горение и метка',
  bloodEcho: 'Эхо кровавого пула',
  bleedCrit: 'Кровь с крита / ускорение крови',
  bleedProc: 'Кровь с физического урона',
  flatProc: 'Дротик / Хрустальный меч: плоский физ. прок',
  mkb: 'Уязвимость и раскол брони',
  cobra: 'Кобра: яд, всплеск, коррозия',
  gloom: 'Мрачная броня: яд',
  witch: 'Клинок ведьмы: DOT и рок',
  pendant: 'Кулон яда: мгновенный тик',
  feather: 'Кулон небесных перьев: актив',
  armorPen: 'Скорбь: пробитие брони',
  brokenArmor: '0124: броня −2 за удар',
  poisonOrb: '0166: слой яда по КД 1 с',
  phase: '0152: фазовый рывок по КД',
  viper: '0303: слой яда по КД 1 с',
  madness: '0155: безумие по КД',
  sharpAxe: '0121 Острая секира: удар по макс. HP, КД 3 с',
  corrosiveSpike: '0234 Шип разложения: урон от ловкости, броня −5',
  valor: '0457 Меч отваги: 30 % × 80 физ.',
  gaze: '0161 Корона Селемены: магия каждые 4 с',
  skullcrusher: '0210/0729 Череполом: удар по макс. HP, КД 1 с',
  feast: '0300/0730 Пиршество: урон от ловкости, броня −6',
  vortex: '0307/0731 Перчатки вихря: магия и вихрь 3 с',
  ruinHammer: '0340/0728: удар по макс. HP, КД 1,5 с',
  moveHunt: '0360/0718 Сапоги преследователя: ловкость от скорости',
  tolerance: '0392 Сапоги терпимости: урон от потерянной скорости, без критов',
  unyielding: '0240 Несгибаемая броня: без критов',
  beastBoots: '0350 Звериные сапоги: аура скорости',
  beastPendant: '0349 Кулон звериной крови: аура AS ×2',
  lionheart: '0329 Доспехи Львиного Сердца: щит от силы',
  shadowMask: '0317 Теневая маска: актив',
  shatteredAxe: '0305 Сломанный топор: актив',
  viciousHorn: '0289 Рог злобного быка: актив',
  maelstrom: '0117 Вихрь: молния',
  moonShard: '0158 Осколок луны: прок',
  mjollnir: '0428 Мьёльнир: молния',
  galeStrike: '0351 Удар бури: серия',
  evernight: '0406 Меч вечной ночи: серия',
  havocHammer: '0377 ★Молот разрушения: удар щитом',
  carnageSpike: '0319 Ядовитый шип: слой яда',
  vanguard: '0225/0703 Вангард: активный щит и 0377',
  frostFang: '0296/0712 Клинок ледяного клыка: реактивный (не авто)',
  hunterChain: '0654/0881 Охотничья цепь: мана/заряды (не DPS)',
  gleamEdge: 'MT006/0887 Проблеск лезвия: после каста (не авто)',
  shadowCloak: '0168/0701 Плащ тени: лечение при промахе (не DPS)',
  frostPendant: '0175/0702 Кулон метели: холод (не DPS)',
  curseRibbon: '0379 Лента проклятий: бонус к магическому урону после магического урона',
  omniStrike: '0372 Всевдоудар: магический проп от статов на каждую атаку',
};

const PANEL_LABEL = {
  prism: 'Призма',
  crown: 'Корона',
  sageBoots: 'Сапоги',
  arcaneCloak: 'Плащ',
  nullifier: 'Nullifier',
  primalCrystal: 'Первокристалл',
  overcrit: 'Избыток крита',
  infinity: 'Бесконечность',
  usurerCodex: 'Кодекс',
};

function familyText(family) {
  if (family === undefined) return 'unique mechanic not modelled (stats still count)';
  if (family.kind === 'dps') {
    return `${family.role} (dps): base ${family.base}${family.ancestor ? `, ancestor ${family.ancestor}` : ''}`;
  }
  return `${family.key} (panel): base ${family.base}${family.ancestor ? `, ancestor ${family.ancestor}` : ''}`;
}

function nameOf(names, id) {
  return (
    names[id] ??
    names[`DOTA_Tooltip_ability_${id}`] ??
    names[`dota_tooltip_ability_${id}`] ??
    id
  );
}

function printList() {
  console.log(`DPS mechanics: ${DPS_FAMILY_COUNT} families / ${DPS_ITEM_COUNT} item ids`);
  for (const f of DPS_FAMILIES) {
    const ids = f.ancestor ? `${f.base} / ${f.ancestor}` : f.base;
    console.log(`  ${f.role.padEnd(13)} ${ids.padEnd(25)} ${ROLE_LABEL[f.role] ?? f.role}`);
  }
  console.log(`\nPanel passives: ${PANEL_FAMILY_COUNT} families / ${PANEL_ITEM_COUNT} item ids`);
  for (const f of PANEL_FAMILIES) {
    const ids = f.ancestor ? `${f.base} / ${f.ancestor}` : f.base;
    console.log(`  ${f.key.padEnd(13)} ${ids.padEnd(25)} ${PANEL_LABEL[f.key] ?? f.key}`);
  }
  console.log(`\nTotal modelled item ids: ${MODELED_ITEM_COUNT}`);
}

function printIds() {
  console.log([...DPS_FAMILIES, ...PANEL_FAMILIES].flatMap((f) => (f.ancestor ? [f.base, f.ancestor] : [f.base])).join('\n'));
}

function main() {
  const arg = process.argv[2];
  if (arg === '--list') {
    printList();
    return;
  }
  if (arg === '--ids') {
    printIds();
    return;
  }
  if (arg === undefined || arg === '--help' || arg === '-h') {
    console.log('Usage: node --experimental-strip-types scripts/dps-lookup.mjs <item_id> | --list | --ids');
    return;
  }

  const full = readJson(resolve(dataDir, 'items.full.json'));
  const names = readJson(resolve(dataDir, 'locale.ru.names.json')).names;
  const namesEn = readJson(resolve(dataDir, 'locale.en.names.json')).names;
  const byName = (text) => {
    const q = text.toLowerCase();
    const found = new Set();
    for (const [key, value] of [...Object.entries(names), ...Object.entries(namesEn)]) {
      if (String(value).toLowerCase().includes(q) || key.toLowerCase().includes(q)) {
        const match = key.match(/item_[A-Za-z0-9_]+/);
        if (match !== null && full[match[0]]?.type === 'equip') found.add(match[0]);
      }
    }
    return [...found];
  };
  let id;
  if (arg.startsWith('item_')) id = arg;
  else if (/^\d+$/.test(arg)) id = `item_${arg}`;
  else {
    const found = byName(arg);
    if (found.length === 0) {
      console.error(`No item matches "${arg}"`);
      process.exitCode = 1;
      return;
    }
    if (found.length > 1) {
      console.log(`Matches for "${arg}":`);
      for (const match of found.sort()) {
        const f = mechanicFamilyOf(match);
        console.log(`  ${match} — ${nameOf(names, match)} [${f?.kind ?? 'unmodeled'}${f?.kind === 'dps' ? `:${f.role}` : ''}]`);
      }
      return;
    }
    id = found[0];
  }
  const item = full[id];
  if (item === undefined) {
    console.error(`No item ${id} in items.full.json`);
    process.exitCode = 1;
    return;
  }
  const family = mechanicFamilyOf(id);
  console.log(`${id} — ${nameOf(names, id)}`);
  console.log(`  family: ${familyText(family)}`);
  if (family?.kind === 'dps' && family.sources.length > 0) console.log(`  sources: ${family.sources.join(', ')}`);
  console.log(`  script: ${item.scriptFile ?? '(none)'}`);
  const baseItem = family === undefined ? undefined : full[family.base];
  if (baseItem !== undefined && baseItem.id !== id) console.log(`  base script: ${baseItem.scriptFile ?? '(none)'} (${family.base})`);
  const values = Object.entries(item.values ?? {}).sort(([a], [b]) => a.localeCompare(b));
  console.log(`  values: ${values.length === 0 ? '(none)' : values.map(([k, v]) => `${k}=${v}`).join('  ')}`);
  if (family === undefined) {
    console.log('  note: only its rolled panel stats reach DPS; its unique proc is not implemented.');
  }
}

main();
