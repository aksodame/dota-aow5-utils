import { critDamageTotal, type DpsBuild, type DpsItemStats } from 'aow5-shared/wiki';
import { GROUPS, baseVal, rowTotal, type CalcInput, type RowDef } from './model';

/**
 * Turns the panel the page already computed into the DPS engine's input.
 * Rows go through `rowTotal`, so the DPS window sees exactly the numbers the
 * stats tab shows — attributes, item effects and the permanent buffs included.
 */
export function buildDpsInput(
  input: CalcInput,
  sums: Record<string, number>,
  buffs: Record<string, number>,
  items: DpsItemStats[],
  baseAttackTime: number,
): DpsBuild {
  const rows = new Map<string, RowDef>();
  for (const group of GROUPS) for (const row of group.rows) rows.set(row.key, row);

  const panel = (key: string): number => {
    const row = rows.get(key);
    if (row) return rowTotal(input, row, sums, buffs).sum;
    return baseVal(input, key) + (sums[key] ?? 0) + (buffs[key] ?? 0);
  };
  const extra = (key: string): number => baseVal(input, key) + (sums[key] ?? 0) + (buffs[key] ?? 0);

  const outgoingKeys = new Set<string>();
  for (const key of Object.keys(sums)) if (/^outgoing_damage_pct(_\d+)?$/.test(key)) outgoingKeys.add(key);
  for (const key of Object.keys(buffs)) if (/^outgoing_damage_pct(_\d+)?$/.test(key)) outgoingKeys.add(key);
  // The hero's trees are the "Base" column, not the item pool: `outgoing_damage_pct`
  // comes from there on a stock build, so the product must read the base too.
  for (const key of Object.keys(input.level?.rest ?? {})) {
    if (/^outgoing_damage_pct(_\d+)?$/.test(key)) outgoingKeys.add(key);
  }
  let outgoingMultiplier = 1;
  for (const key of outgoingKeys) {
    outgoingMultiplier *= 1 + (baseVal(input, key) + (sums[key] ?? 0) + (buffs[key] ?? 0)) / 100;
  }

  // 0723 (base 0444) grants armor penetration through a passive attribute
  // bonus, not a panel row; it belongs in the DPS pool all the same.
  const itemArmorPen = items.reduce(
    (sum, item) => sum + (item.stats.ability_value_physical_armor_penetration_pct ?? 0),
    0,
  );

  return {
    attackDamage: panel('bonus_attack_damage'),
    allAttackDamagePct: panel('all_attack_damage_percent'),
    attackSpeed: panel('attack_speed'),
    attackSpeedPct: panel('attack_speed_pct'),
    baseAttackTime: baseAttackTime > 0 ? baseAttackTime : 1.7,
    critChancePct: 5 + extra('crit_chance_pct'),
    abilityCritChancePct: extra('ability_crit_chance_pct'),
    physicalCritChancePct: panel('physical_crit_chance_pct'),
    omniCritChancePct: panel('omni_crit_chance_pct'),
    critDamagePct: critDamageTotal(panel('crit_damage_pct')),
    physicalDamageAddPct: panel('physical_damage_add_pct'),
    totalArmor: panel('bonus_armor'),
    outgoingMultiplier,
    spellAmplifyPct: panel('spell_amplify_pct'),
    normalAttackAmpPct: extra('normal_attack_damage_amp_pct'),
    armorPenetrationPct: panel('physical_armor_penetration_pct') + itemArmorPen,
    bleedOutgoingPct: panel('bleed_outgoing_damage_pct'),
    dotOutgoingPct: panel('dot_outgoing_damage_pct'),
    extraDamagePct: {
      normal: extra('extra_damage_pct_1'),
      elite: extra('extra_damage_pct_2'),
      miniboss: extra('extra_damage_pct_4'),
      boss: extra('extra_damage_pct_3'),
    },
    seasonDamagePct: (panel('season_contribution') + panel('season_world')) * 2,
    totalAttributes: panel('bonus_strength') + panel('bonus_agility') + panel('bonus_intelligence'),
    maxHealth: panel('bonus_health'),
    totalAgility: panel('bonus_agility'),
    agilityPct: extra('all_agility_pct') + extra('all_all_stats_pct'),
    totalIntelligence: panel('bonus_intelligence'),
    baseMoveSpeed: panel('bonus_movespeed'),
    primaryAttr: input.primary,
    attackDamagePerAgi:
      input.primary === 'agi'
        ? input.file.attrBonus.primary_attr_attack_damage
        : input.primary === 'uni'
          ? input.file.attrBonus.universal_attr_attack_damage
          : 0,
    attackDamagePerStr:
      input.primary === 'str'
        ? input.file.attrBonus.primary_attr_attack_damage
        : input.primary === 'uni'
          ? input.file.attrBonus.universal_attr_attack_damage
          : 0,
    energyShield:
      extra('base_energy_shield') +
      panel('bonus_strength') *
        (items.find((item) => item.id === 'item_0329' || item.id === 'item_0714')?.stats.ability_shield_per_strength ?? 0),
    noCrit: false,
    agilityAttackSpeedCap: input.file.attrBonus.agility_attack_speed_cap,
    agilityAttackSpeedDecay: input.file.attrBonus.agility_attack_speed_decay,
    magicalDamageAddPct: panel('magical_damage_add_pct'),
    magicalCritChancePct: panel('magical_crit_chance_pct'),
    poisonOutgoingPct: panel('poison_outgoing_damage_pct'),
    poisonFasterPct: extra('poison_damage_faster_pct'),
    cooldownReductionPct: extra('cooldown_reduction_pct'),
    items,
  };
}
