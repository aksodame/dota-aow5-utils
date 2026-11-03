/**
 * What the DPS tab models, as one list: a base item and its ancestor share a
 * mechanic, and the engine and the lookup script read the same table.
 *
 * `DpsSourceId` lives in `dps.ts`; this module stays dependency-free so it can
 * be imported by a plain Node script without pulling the simulator in.
 */

export type DpsRole =
  | 'talons'
  | 'bag'
  | 'bloodEcho'
  | 'bleedCrit'
  | 'bleedProc'
  | 'flatProc'
  | 'mkb'
  | 'cobra'
  | 'gloom'
  | 'witch'
  | 'pendant'
  | 'chaosPoison'
  | 'inertia'
  | 'fearless'
  | 'pollen'
  | 'soulBlade'
  | 'shatter'
  | 'defenderHammer'
  | 'lionheartHammer'
  | 'bloodRite'
  | 'legionShield'
  | 'reaperSlash'
  | 'feather'
  | 'armorPen'
  | 'brokenArmor'
  | 'poisonOrb'
  | 'phase'
  | 'viper'
  | 'madness'
  | 'sharpAxe'
  | 'corrosiveSpike'
  | 'valor'
  | 'gaze'
  | 'skullcrusher'
  | 'feast'
  | 'vortex'
  | 'ruinHammer'
  | 'moveHunt'
  | 'tolerance'
  | 'unyielding'
  | 'beastBoots'
  | 'beastPendant'
  | 'lionheart'
  | 'shadowMask'
  | 'shatteredAxe'
  | 'viciousHorn'
  | 'maelstrom'
  | 'moonShard'
  | 'mjollnir'
  | 'galeStrike'
  | 'evernight'
  | 'havocHammer'
  | 'carnageSpike'
  | 'vanguard'
  | 'frostFang'
  | 'hunterChain'
  | 'gleamEdge'
  | 'shadowCloak'
  | 'frostPendant'
  | 'curseRibbon'
  | 'omniStrike';

export interface DpsFamily {
  kind: 'dps';
  role: DpsRole;
  base: string;
  ancestor?: string;
  /** The source ids this mechanic contributes to. */
  sources: readonly string[];
}

export interface PanelFamily {
  kind: 'panel';
  key: string;
  base: string;
  ancestor?: string;
}

export type MechanicFamily = DpsFamily | PanelFamily;

/**
 * The DPS mechanics: 60 families, base + ancestor = 96 item ids. Sorrow is
 * included because its armour penetration is read in `dpsInput.ts`, not
 * because it has a proc.
 */
export const DPS_FAMILIES: readonly DpsFamily[] = [
  { kind: 'dps', role: 'talons', base: 'item_0665', ancestor: 'item_0894', sources: ['talonsLight', 'talonsHeavy'] },
  { kind: 'dps', role: 'bag', base: 'item_0659', ancestor: 'item_0888', sources: ['burn'] },
  { kind: 'dps', role: 'bloodEcho', base: 'item_0504', ancestor: 'item_0868', sources: ['bloodEcho'] },
  { kind: 'dps', role: 'bleedCrit', base: 'item_0398', ancestor: 'item_0810', sources: ['bleed'] },
  { kind: 'dps', role: 'bleedProc', base: 'item_0467', ancestor: 'item_0841', sources: ['bleed'] },
  { kind: 'dps', role: 'bleedProc', base: 'item_0243', sources: ['bleed'] },
  { kind: 'dps', role: 'flatProc', base: 'item_0129', sources: ['dartProc'] },
  { kind: 'dps', role: 'flatProc', base: 'item_0131', sources: ['crystalProc'] },
  { kind: 'dps', role: 'mkb', base: 'item_0217', ancestor: 'item_0853', sources: [] },
  { kind: 'dps', role: 'cobra', base: 'item_0365', ancestor: 'item_0719', sources: ['poison', 'poisonBurst'] },
  { kind: 'dps', role: 'gloom', base: 'item_0238', ancestor: 'item_0704', sources: ['poison'] },
  { kind: 'dps', role: 'witch', base: 'item_0209', ancestor: 'item_0831', sources: ['witchBlade'] },
  { kind: 'dps', role: 'pendant', base: 'item_0402', ancestor: 'item_0836', sources: ['poison'] },
  { kind: 'dps', role: 'chaosPoison', base: 'item_0382', ancestor: 'item_0780', sources: ['poison'] },
  { kind: 'dps', role: 'inertia', base: 'item_0211', sources: [] },
  { kind: 'dps', role: 'fearless', base: 'item_0461', ancestor: 'item_0727', sources: [] },
  { kind: 'dps', role: 'pollen', base: 'item_0270', ancestor: 'item_0708', sources: ['poison'] },
  { kind: 'dps', role: 'soulBlade', base: 'item_0165', sources: ['soulBlade'] },
  { kind: 'dps', role: 'shatter', base: 'item_0206', sources: ['shatterProc'] },
  { kind: 'dps', role: 'defenderHammer', base: 'item_0331', sources: ['defenderHammer'] },
  { kind: 'dps', role: 'lionheartHammer', base: 'item_0460', ancestor: 'item_0726', sources: ['lionheartHammer'] },
  { kind: 'dps', role: 'bloodRite', base: 'item_0332', ancestor: 'item_0715', sources: [] },
  { kind: 'dps', role: 'legionShield', base: 'item_0255', ancestor: 'item_0707', sources: [] },
  { kind: 'dps', role: 'reaperSlash', base: 'item_0362', ancestor: 'item_0778', sources: ['reaperSlash'] },
  { kind: 'dps', role: 'feather', base: 'item_0646', ancestor: 'item_0827', sources: ['feather'] },
  { kind: 'dps', role: 'armorPen', base: 'item_0444', ancestor: 'item_0723', sources: [] },
  { kind: 'dps', role: 'brokenArmor', base: 'item_0124', sources: [] },
  { kind: 'dps', role: 'poisonOrb', base: 'item_0166', sources: ['poison'] },
  { kind: 'dps', role: 'phase', base: 'item_0152', sources: [] },
  { kind: 'dps', role: 'viper', base: 'item_0303', sources: ['poison'] },
  { kind: 'dps', role: 'madness', base: 'item_0155', sources: [] },
  { kind: 'dps', role: 'sharpAxe', base: 'item_0121', sources: ['sharpAxe'] },
  { kind: 'dps', role: 'corrosiveSpike', base: 'item_0234', sources: ['corrosiveSpike'] },
  { kind: 'dps', role: 'valor', base: 'item_0457', sources: ['valorSword'] },
  { kind: 'dps', role: 'gaze', base: 'item_0161', sources: ['gaze'] },
  { kind: 'dps', role: 'skullcrusher', base: 'item_0210', ancestor: 'item_0729', sources: ['skullcrusher'] },
  { kind: 'dps', role: 'feast', base: 'item_0300', ancestor: 'item_0730', sources: ['feast'] },
  { kind: 'dps', role: 'vortex', base: 'item_0307', ancestor: 'item_0731', sources: ['vortex', 'vortexDot'] },
  { kind: 'dps', role: 'ruinHammer', base: 'item_0340', ancestor: 'item_0728', sources: ['ruinHammer'] },
  { kind: 'dps', role: 'moveHunt', base: 'item_0360', ancestor: 'item_0718', sources: [] },
  { kind: 'dps', role: 'moveHunt', base: 'item_0205', sources: [] },
  { kind: 'dps', role: 'tolerance', base: 'item_0392', sources: [] },
  { kind: 'dps', role: 'unyielding', base: 'item_0240', ancestor: 'item_0705', sources: [] },
  { kind: 'dps', role: 'unyielding', base: 'item_0447', sources: [] },
  { kind: 'dps', role: 'curseRibbon', base: 'item_0379', sources: ['curseRibbon'] },
  { kind: 'dps', role: 'omniStrike', base: 'item_0372', sources: ['omniStrike'] },
  { kind: 'dps', role: 'beastBoots', base: 'item_0350', sources: [] },
  { kind: 'dps', role: 'beastPendant', base: 'item_0349', sources: [] },
  { kind: 'dps', role: 'lionheart', base: 'item_0329', ancestor: 'item_0714', sources: [] },
  { kind: 'dps', role: 'shadowMask', base: 'item_0317', sources: [] },
  { kind: 'dps', role: 'shatteredAxe', base: 'item_0305', ancestor: 'item_0425', sources: [] },
  { kind: 'dps', role: 'viciousHorn', base: 'item_0289', ancestor: 'item_0711', sources: [] },
  { kind: 'dps', role: 'maelstrom', base: 'item_0117', sources: ['maelstrom'] },
  { kind: 'dps', role: 'moonShard', base: 'item_0158', sources: ['moonShard'] },
  { kind: 'dps', role: 'mjollnir', base: 'item_0428', ancestor: 'item_0722', sources: ['mjollnir'] },
  { kind: 'dps', role: 'galeStrike', base: 'item_0351', sources: ['galeStrike'] },
  { kind: 'dps', role: 'evernight', base: 'item_0406', ancestor: 'item_0721', sources: ['evernight'] },
  { kind: 'dps', role: 'havocHammer', base: 'item_0377', sources: ['havocHammer'] },
  { kind: 'dps', role: 'carnageSpike', base: 'item_0319', sources: ['poison'] },
  { kind: 'dps', role: 'vanguard', base: 'item_0225', ancestor: 'item_0703', sources: [] },
  { kind: 'dps', role: 'frostFang', base: 'item_0296', ancestor: 'item_0712', sources: [] },
  { kind: 'dps', role: 'hunterChain', base: 'item_0654', ancestor: 'item_0881', sources: [] },
  { kind: 'dps', role: 'gleamEdge', base: 'item_MT006', ancestor: 'item_0887', sources: [] },
  { kind: 'dps', role: 'shadowCloak', base: 'item_0168', ancestor: 'item_0701', sources: [] },
  { kind: 'dps', role: 'frostPendant', base: 'item_0175', ancestor: 'item_0702', sources: [] },
];

/**
 * Passives that move the panel itself and therefore every DPS figure built
 * from it: 11 families, 18 item ids.
 */
export const PANEL_FAMILIES: readonly PanelFamily[] = [
  { kind: 'panel', key: 'prism', base: 'item_0541', ancestor: 'item_0876' },
  { kind: 'panel', key: 'crown', base: 'item_0608', ancestor: 'item_0737' },
  { kind: 'panel', key: 'sageBoots', base: 'item_0336', ancestor: 'item_0716' },
  { kind: 'panel', key: 'arcaneCloak', base: 'item_0335' },
  { kind: 'panel', key: 'nullifier', base: 'item_0208', ancestor: 'item_0830' },
  { kind: 'panel', key: 'primalCrystal', base: 'item_0658', ancestor: 'item_0884' },
  { kind: 'panel', key: 'overcrit', base: 'item_0610', ancestor: 'item_0820' },
  { kind: 'panel', key: 'infinity', base: 'item_0368', ancestor: 'item_0779' },
  { kind: 'panel', key: 'usurerCodex', base: 'item_0615' },
  { kind: 'panel', key: 'emperorCrown', base: 'item_0314' },
  { kind: 'panel', key: 'kingBackpack', base: 'item_0315' },
];

const ids = (f: MechanicFamily): string[] => (f.ancestor === undefined ? [f.base] : [f.base, f.ancestor]);

/** Every item id a DPS role covers, base first. */
export function dpsItemIds(role: DpsRole): readonly string[] {
  return DPS_FAMILIES.filter((f) => f.role === role).flatMap(ids);
}

/** The family an item belongs to, or undefined when only its raw stats are used. */
export function mechanicFamilyOf(itemId: string): MechanicFamily | undefined {
  return [...DPS_FAMILIES, ...PANEL_FAMILIES].find((f) => f.base === itemId || f.ancestor === itemId);
}

export const DPS_ITEM_IDS: ReadonlySet<string> = new Set(DPS_FAMILIES.flatMap(ids));
export const ACTIVE_ITEM_IDS: ReadonlySet<string> = new Set([
  ...dpsItemIds('feather'),
  ...dpsItemIds('phase'),
  ...dpsItemIds('madness'),
  ...dpsItemIds('shadowMask'),
  ...dpsItemIds('shatteredAxe'),
  ...dpsItemIds('viciousHorn'),
  ...dpsItemIds('vanguard'),
  ...dpsItemIds('bloodRite'),
  ...dpsItemIds('legionShield'),
]);
export const PANEL_ITEM_IDS: ReadonlySet<string> = new Set(PANEL_FAMILIES.flatMap(ids));
export const MODELED_ITEM_IDS: ReadonlySet<string> = new Set([...DPS_ITEM_IDS, ...PANEL_ITEM_IDS]);

export const DPS_FAMILY_COUNT = DPS_FAMILIES.length;
export const DPS_ITEM_COUNT = DPS_ITEM_IDS.size;
export const PANEL_FAMILY_COUNT = PANEL_FAMILIES.length;
export const PANEL_ITEM_COUNT = PANEL_ITEM_IDS.size;
export const MODELED_ITEM_COUNT = MODELED_ITEM_IDS.size;

// 65 families / 101 item ids / 119 modelled (after level-5 additions: 0205, 0447, 0379, 0372, 0243)
