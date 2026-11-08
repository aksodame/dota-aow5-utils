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
  options: {
    potionKinds?: number;
    harmonizerDefensive?: boolean;
    crownBuffs?: number;
  } = {},
): DpsBuild {
  const rows = new Map<string, RowDef>();
  for (const group of GROUPS) for (const row of group.rows) rows.set(row.key, row);

  const panel = (key: string): number => {
    const row = rows.get(key);
    if (row) return rowTotal(input, row, sums, buffs).sum;
    return baseVal(input, key) + (sums[key] ?? 0) + (buffs[key] ?? 0);
  };
  const extra = (key: string): number => baseVal(input, key) + (sums[key] ?? 0) + (buffs[key] ?? 0);
  const item = (id: string): DpsItemStats | undefined => items.find((x) => x.id === id);
  const hasItem = (...ids: string[]): boolean => ids.some((id) => item(id) !== undefined);
  const itemStat = (x: DpsItemStats | undefined, key: string): number => {
    const v = x?.stats[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  // 0294's mode toggle is the one panel conversion that stays here: the
  // stats tab has no mode input. Everything else level-8 lives in itemeffects.
  const harmonizerExtra = hasItem('item_0294', 'item_0803')
    ? options.harmonizerDefensive === true
      ? -15
      : 20
    : 0;
  // 0611 counts visible non-debuff buffs with more than three stacks. The
  // permanent-buff column already knows those uses; potions are excluded.
  // Cast-driven stacks (0670) wait for the cast-rate input.
  const crownCount = Math.max(0, Math.floor(options.crownBuffs ?? 0));
  const crown = item('item_0611') ?? item('item_0821');
  const crownExtra = crown
    ? crownCount * Math.max(0, itemStat(crown, 'ability_value_dmg_per_buff') || 12)
    : 0;
  const outgoingKeys = new Set<string>();
  for (const key of Object.keys(sums)) if (/^outgoing_damage_pct(_\d+)?$/.test(key)) outgoingKeys.add(key);
  for (const key of Object.keys(buffs)) if (/^outgoing_damage_pct(_\d+)?$/.test(key)) outgoingKeys.add(key);
  // The hero's trees are the "Base" column, not the item pool: `outgoing_damage_pct`
  // comes from there on a stock build, so the product must read the base too.
  for (const key of Object.keys(input.level?.rest ?? {})) {
    if (/^outgoing_damage_pct(_\d+)?$/.test(key)) outgoingKeys.add(key);
  }
  if (harmonizerExtra !== 0 || crownExtra !== 0) outgoingKeys.add('outgoing_damage_pct');
  const outgoingExtra = (key: string): number =>
    key === 'outgoing_damage_pct' ? harmonizerExtra + crownExtra : 0;
  let outgoingMultiplier = 1;
  for (const key of outgoingKeys) {
    outgoingMultiplier *=
      1 + (baseVal(input, key) + (sums[key] ?? 0) + (buffs[key] ?? 0) + outgoingExtra(key)) / 100;
  }

  // 0723 (base 0444) grants armor penetration through a passive attribute
  // bonus, not a panel row; it belongs in the DPS pool all the same.
  const itemArmorPen = items.reduce(
    (sum, item) => sum + (item.stats.ability_value_physical_armor_penetration_pct ?? 0),
    0,
  );

  // 0205 / 0360 / 0718 need no special case here: their agility is already in
  // the panel's agility row (buildPool adds it from moveHuntAgility), so
  // `panel('bonus_agility')` and the derived attack damage and attack speed
  // carry it the same way the game's attribute panel does.
  const attackDamagePerAgiVal =
    input.primary === 'agi'
      ? input.file.attrBonus.primary_attr_attack_damage
      : input.primary === 'uni'
        ? input.file.attrBonus.universal_attr_attack_damage
        : 0;

  // 0609 / 0634 and the other level-8 conversions reach this pool through
  // `itemeffects`, so the panel already carries the cut health and the shield.
  const maxHealth = panel('bonus_health');
  const shieldFlat =
    extra('base_energy_shield') +
    extra('bonus_energy_shield') +
    panel('bonus_strength') *
      (items.find((x) => x.id === 'item_0329' || x.id === 'item_0714')?.stats
        .ability_shield_per_strength ?? 0);
  const energyShield = shieldFlat * (1 + extra('bonus_energy_shield_pct') / 100);

  return {
    attackDamage: panel('bonus_attack_damage'),
    allAttackDamagePct: panel('all_attack_damage_percent'),
    // `panel('attack_speed')` is already scaled by `attack_speed_pct` (the
    // panel row folds the percent in, as the game's total AS does), so the
    // engine must not apply the percent a second time.
    attackSpeed: panel('attack_speed'),
    attackSpeedPct: 0,
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
    maxHealth,
    totalAgility: panel('bonus_agility'),
    agilityPct: extra('all_agility_pct') + extra('all_all_stats_pct'),
    totalIntelligence: panel('bonus_intelligence'),
    baseMoveSpeed: panel('bonus_movespeed'),
    primaryAttr: input.primary,
    attackDamagePerAgi: attackDamagePerAgiVal,
    attackDamagePerStr:
      input.primary === 'str'
        ? input.file.attrBonus.primary_attr_attack_damage
        : input.primary === 'uni'
          ? input.file.attrBonus.universal_attr_attack_damage
          : 0,
    // The game's total shield is every flat source (base + bonus + 0329's
    // strength scaling) scaled by `bonus_energy_shield_pct`; 0380 / 0396 turn
    // that total into damage, so the percent cannot be dropped. 0609 / 0634
    // add the shield made from the health they cut.
    energyShield,
    maxMana: panel('bonus_mana'),
    anyLifestealPct:
      extra('attack_lifesteal_pct') +
      extra('spell_lifesteal_pct') +
      extra('physical_lifesteal_pct') +
      extra('magical_lifesteal_pct') +
      extra('omni_lifesteal_pct'),
    lifestealAmpPct: extra('lifesteal_amp_pct'),
    // 0241 listens to the game's attack/spell heal events; omni heals both.
    attackHealPct:
      extra('attack_lifesteal_pct') + extra('physical_lifesteal_pct') + extra('omni_lifesteal_pct'),
    spellHealPct:
      extra('spell_lifesteal_pct') + extra('magical_lifesteal_pct') + extra('omni_lifesteal_pct'),
    noCrit: false,
    agilityAttackSpeedCap: input.file.attrBonus.agility_attack_speed_cap,
    agilityAttackSpeedDecay: input.file.attrBonus.agility_attack_speed_decay,
    magicalDamageAddPct: panel('magical_damage_add_pct'),
    magicalCritChancePct: panel('magical_crit_chance_pct'),
    poisonOutgoingPct: panel('poison_outgoing_damage_pct'),
    poisonFasterPct: extra('poison_damage_faster_pct'),
    cooldownReductionPct: extra('cooldown_reduction_pct'),
    potionKinds: options.potionKinds,
    harmonizerDefensive: options.harmonizerDefensive,
    crownBuffs: options.crownBuffs,
    items,
  };
}
