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
  | 'feather'
  | 'armorPen';

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
 * The DPS mechanics: 11 families, base + ancestor = 22 item ids. Sorrow is
 * included because its armour penetration is read in `dpsInput.ts`, not
 * because it has a proc.
 */
export const DPS_FAMILIES: readonly DpsFamily[] = [
  { kind: 'dps', role: 'talons', base: 'item_0665', ancestor: 'item_0894', sources: ['talonsLight', 'talonsHeavy'] },
  { kind: 'dps', role: 'bag', base: 'item_0659', ancestor: 'item_0888', sources: ['burn'] },
  { kind: 'dps', role: 'bloodEcho', base: 'item_0504', ancestor: 'item_0868', sources: ['bloodEcho'] },
  { kind: 'dps', role: 'bleedCrit', base: 'item_0398', ancestor: 'item_0810', sources: ['bleed'] },
  { kind: 'dps', role: 'bleedProc', base: 'item_0467', ancestor: 'item_0841', sources: ['bleed'] },
  { kind: 'dps', role: 'flatProc', base: 'item_0129', sources: ['flatProc'] },
  { kind: 'dps', role: 'flatProc', base: 'item_0131', sources: ['flatProc'] },
  { kind: 'dps', role: 'mkb', base: 'item_0217', ancestor: 'item_0853', sources: [] },
  { kind: 'dps', role: 'cobra', base: 'item_0365', ancestor: 'item_0719', sources: ['poison', 'poisonBurst'] },
  { kind: 'dps', role: 'gloom', base: 'item_0238', ancestor: 'item_0704', sources: ['poison'] },
  { kind: 'dps', role: 'witch', base: 'item_0209', ancestor: 'item_0831', sources: ['witchBlade'] },
  { kind: 'dps', role: 'pendant', base: 'item_0402', ancestor: 'item_0836', sources: ['poison'] },
  { kind: 'dps', role: 'feather', base: 'item_0646', ancestor: 'item_0827', sources: ['feather'] },
  { kind: 'dps', role: 'armorPen', base: 'item_0444', ancestor: 'item_0723', sources: [] },
];

/**
 * Passives that move the panel itself and therefore every DPS figure built
 * from it: 9 families, 16 item ids.
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
export const ACTIVE_ITEM_IDS: ReadonlySet<string> = new Set(dpsItemIds('feather'));
export const PANEL_ITEM_IDS: ReadonlySet<string> = new Set(PANEL_FAMILIES.flatMap(ids));
export const MODELED_ITEM_IDS: ReadonlySet<string> = new Set([...DPS_ITEM_IDS, ...PANEL_ITEM_IDS]);

export const DPS_FAMILY_COUNT = DPS_FAMILIES.length;
export const DPS_ITEM_COUNT = DPS_ITEM_IDS.size;
export const PANEL_FAMILY_COUNT = PANEL_FAMILIES.length;
export const PANEL_ITEM_COUNT = PANEL_ITEM_IDS.size;
export const MODELED_ITEM_COUNT = MODELED_ITEM_IDS.size;
