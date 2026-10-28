import type { ItemFull, LocaleDetail, RichNode, RollTables } from 'aow5-shared/types';
import { statSpan } from 'aow5-shared/data';
// Explicit extension: this module is exercised by `node --test`, which does not
// do Vite's extensionless resolution. Every tested file in the repo does the same.
import { splitDescription } from './richDesc.ts';

/** One line of an item's stat block, already labelled and formatted. */
export interface StatRow {
  /** The raw `values` key, unique within an item — good enough as a React key. */
  key: string;
  label: string;
  /** Signed, and suffixed with `%` where the key says so: `+25%`, `-4`. */
  value: string;
  /**
   * Everything the stat could be on some other copy of the item: `+96 – +145`.
   *
   * Present only when the roll tables were supplied and the stat actually rolls.
   * The number beside it is the *centre* of that span rather than the value any
   * particular copy has — which is the single most misleading thing about an
   * item card without this, because it reads as the stat.
   */
  span?: string;
}

/**
 * Keys that are the description's numbers rather than stats of their own.
 *
 * `ability_value_bonus_damage_multiplier: 200` is the "200 times the mana
 * spent" already written into the passive's text — the game does not list it
 * above, and repeating it as a stat line reads like a second, separate bonus.
 * The picker's pane still shows them, under the ability heading where they
 * belong; the hover card leaves them to the sentence that uses them.
 */
export function isTuningKey(key: string): boolean {
  return key.startsWith('ability_');
}

/**
 * Turns `bonus_attack_damage` into `Attack damage` when the game has no label.
 *
 * Which, for a passive's own numbers, is **always**: the addon ships no
 * `AK_Attr_` token for a single `ability_value_*` key, so `ability_value_
 * item_0102_damage` has nothing behind it but itself. Hence the three prefixes
 * stripped below — the family name, the `c` that marks a reversed key, and the
 * item id some of them carry, which is the id of the item you are already
 * looking at.
 */
export function prettifyKey(key: string): string {
  // The `+` in front of every value already says "bonus", and `%` already says
  // "pct"; carrying both in the label is noise the game itself does not print.
  // `tag_gem_` is the prefix every glyph value carries, inside a block already
  // headed "Glyph".
  const trimmed = key
    .replace(/^tag_gem_/, '')
    .replace(/^ability_value_c_/, '')
    .replace(/^ability_value_/, '')
    .replace(/^item_\d+_/, '')
    .replace(/^bonus_/, '')
    .replace(/_(pct|percent)$/, '');
  const spaced = trimmed.replace(/_/g, ' ').trim();
  // `ability_value` on its own strips to nothing, and a blank label is worse
  // than the raw key it came from.
  if (spaced === '') return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Keys whose unit the suffix does not tell.
 *
 * A trailing `_pct` normally means the number is a percentage, but two shapes
 * break that: a name that counts a resource *per one percent* (Sage's Boots:
 * mana per 1% of magic damage), and a percentage whose qualifier follows the
 * `_pct` (`…_pct_max`, `…_pct_per_step`). Listed explicitly rather than
 * inferred, so one misread key does not quietly change every number on a card.
 */
const UNIT_OVERRIDES: Record<string, boolean> = {
  ability_value_c_mana_per_magic_damage_pct: false,
  ability_value_bonus_magic_damage_pct_max: true,
  ability_bonus_magic_damage_pct_per_step: true,
};

/** Whether the number under `key` is a percentage. Exported so the stat namer
 * (which prints its own values in the calculator) answers the same way. */
export function isPercentKey(key: string): boolean {
  const override = UNIT_OVERRIDES[key];
  if (override !== undefined) return override;
  return /_(pct|percent)(_\d+)?$/.test(key);
}

export function formatValue(key: string, value: number | string): string {
  if (typeof value === 'string') return value;
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  // Negative numbers bring their own sign; everything else is a bonus.
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}${isPercentKey(key) ? '%' : ''}`;
}

/**
 * The game's own name for a stat, or a readable one made from the key.
 *
 * `names` is the wiki's own table for the current language. It goes first, as
 * it does in the calculator's namer: the game's labels live inside whichever
 * tooltip grants the stat and read as sentence fragments, while the table is
 * one word per stat — the same word on every card. Most items carry no labels
 * of their own at all, so without the table a Russian card would name every
 * stat in English.
 *
 * Exported because the priority panel names stats one at a time — it ranks them
 * rather than printing the block — and a second copy of this lookup there would
 * be a second place for a stat to be called something else.
 */
export function statLabel(key: string, detail: LocaleDetail | undefined, names?: Record<string, string>): string {
  const raw = names?.[key] ?? detail?.values?.[key];
  // The labels come as `+All Stats Bonus` or `%Attack Speed`; the sign belongs
  // to the number here, so it is dropped rather than printed twice.
  if (raw) return raw.replace(/^[\s%+]+/, '').trim() || prettifyKey(key);
  return prettifyKey(key);
}

/** A stat's span, in the same shape both places that draw one use. */
export function formatSpan(key: string, min: number, max: number): string {
  return min === max ? formatValue(key, min) : `${formatValue(key, min)} – ${formatValue(key, max)}`;
}

/**
 * An item's stat lines.
 *
 * `which: 'tuning'` returns the mirror set — the `ability_*` numbers — so a
 * view that wants them can show them somewhere of its own.
 *
 * `tables` is optional and adds the span each stat can roll to. It is optional
 * because it arrives with the heavy files: a card drawn before they land still
 * shows its stats, and gains the ranges a moment later rather than waiting.
 */
export function statRows(
  full: ItemFull | undefined,
  detail: LocaleDetail | undefined,
  which: 'stats' | 'tuning' = 'stats',
  tables?: RollTables | null,
  names?: Record<string, string>,
): StatRow[] {
  if (!full) return [];
  return Object.entries(full.values)
    .filter(([key]) => isTuningKey(key) === (which === 'tuning'))
    .map(([key, value]) => {
      const row: StatRow = { key, label: statLabel(key, detail, names), value: formatValue(key, value) };
      // A string value is one item's oddity in the data, and nothing rolls it.
      const span = tables != null && typeof value === 'number' ? statSpan(tables, key, value) : null;
      return span === null ? row : { ...row, span: formatSpan(key, span.min, span.max) };
    });
}

/** The glyph an item carries, formatted like its own stats. */
export function gemRows(full: ItemFull | undefined): StatRow[] {
  if (!full?.gem) return [];
  return Object.entries(full.gem.values).map(([key, value]) => ({
    key,
    label: prettifyKey(key),
    value: formatValue(key, value),
  }));
}

export type Behavior = 'passive' | 'active' | 'toggle';
export type AffectsTeam = 'enemy' | 'friendly' | 'both';
export type AffectsScope = 'units' | 'heroes' | 'creeps';

/**
 * What kind of skill an item's ability is, if it has one worth naming.
 *
 * Every second item in the data carries an `ability` block, most of them empty
 * shells around a stat bonus, so an unrecognised or missing behaviour is null
 * rather than a made-up "Active".
 */
export function behaviorFromFlags(flags: string[] | undefined): Behavior | null {
  if (!flags || flags.length === 0) return null;
  const has = (name: string) => flags.includes(`DOTA_ABILITY_BEHAVIOR_${name}`);
  if (has('PASSIVE')) return 'passive';
  if (has('TOGGLE')) return 'toggle';
  if (has('NO_TARGET') || has('UNIT_TARGET') || has('POINT') || has('AOE') || has('IMMEDIATE')) return 'active';
  return null;
}

export function behaviorOf(full: ItemFull | undefined): Behavior | null {
  return behaviorFromFlags(full?.ability?.behavior);
}

/** Who an ability reaches — `null` when the data says nobody in particular. */
export function affectsFrom(
  targetTeam: string | undefined,
  targetType: string[] | undefined,
): { team: AffectsTeam; scope: AffectsScope } | null {
  const team: AffectsTeam | null =
    targetTeam === 'DOTA_UNIT_TARGET_TEAM_ENEMY'
      ? 'enemy'
      : targetTeam === 'DOTA_UNIT_TARGET_TEAM_FRIENDLY'
        ? 'friendly'
        : targetTeam === 'DOTA_UNIT_TARGET_TEAM_BOTH'
          ? 'both'
          : null;
  if (!team) return null;

  const types = targetType ?? [];
  const hero = types.includes('DOTA_UNIT_TARGET_HERO');
  const basic = types.includes('DOTA_UNIT_TARGET_BASIC');
  if (!hero && !basic) return null;

  return { team, scope: hero && basic ? 'units' : hero ? 'heroes' : 'creeps' };
}

export function affectsOf(full: ItemFull | undefined): { team: AffectsTeam; scope: AffectsScope } | null {
  return affectsFrom(full?.ability?.targetTeam, full?.ability?.targetType);
}

/**
 * The description's own heading — "Passive: Soul Scatter" — when it opens with
 * one. That heading is the game's marker for "this item has a named skill".
 */
export function skillHeading(detail: LocaleDetail | undefined): RichNode[] | null {
  return splitDescription(detail?.desc)[0]?.heading ?? null;
}

/**
 * Whether an item's `ability` block describes a skill worth announcing.
 *
 * Almost every item in the data carries one, most of them an empty shell that
 * exists to hang a stat bonus on — a stack of essence is "Skill: Passive,
 * affects enemy units" as far as the raw fields are concerned. A named heading
 * or a real cost is what separates a skill from that bookkeeping.
 */
export function hasNamedSkill(full: ItemFull | undefined, detail: LocaleDetail | undefined): boolean {
  if (skillHeading(detail)) return true;
  const ability = full?.ability;
  return Boolean(ability?.cooldown || ability?.manaCost || ability?.castRange);
}
