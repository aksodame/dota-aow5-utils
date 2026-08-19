import type { BuildSection } from 'aow5-shared/codec';
import type { SpellSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import { ABILITY_SLOTS, ABILITY_SLOT_ORDER, type HeroInfo } from 'aow5-shared/types';
import { SlotRowLabel } from './SlotRowLabel';
import { SpellSlot } from './SpellSlot';

interface Props {
  section: BuildSection;
  sectionName: string;
  hero: HeroInfo | null;
  spells: Map<string, SpellSummary>;
  strings: Strings;
  onPickSpell: (spell: number) => void;
  onClearSpell: (spell: number) => void;
}

/**
 * The ability row on a card.
 *
 * Only keys the chosen hero actually has a finished ability for are drawn —
 * Drow Ranger has three, Axe has six — with the same exception the item groups
 * make: a key that already holds something is always shown, so nothing arriving
 * through a shared link can silently disappear.
 */
export function SpellRow({ section, sectionName, hero, spells, strings, onPickSpell, onClearSpell }: Props) {
  if (!hero) {
    return (
      <div className="space-y-0.5">
        <SlotRowLabel>{strings.spells}</SlotRowLabel>
        <p className="text-sm text-muted-foreground/70">{strings.pickHeroFirst}</p>
      </div>
    );
  }

  // Drawn in reading order, which is not the wire order — `i` stays the frozen
  // position a shared link encodes.
  const visible = ABILITY_SLOT_ORDER.map((slot) => ({ slot, i: ABILITY_SLOTS.indexOf(slot) })).filter(
    ({ slot, i }) => (hero.bySlot[slot]?.length ?? 0) > 0 || section.spells[i] != null,
  );

  if (visible.length === 0) {
    return (
      <div className="space-y-0.5">
        <SlotRowLabel>{strings.spells}</SlotRowLabel>
        <p className="text-sm text-muted-foreground/70">{strings.noSpellsForHero}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <SlotRowLabel>{strings.spells}</SlotRowLabel>
      {/*
        Wraps rather than holding one fixed row. Seven tiles are ~414px wide,
        which overflows a card at the narrow end of the three-column board — so
        the row flows onto a second line and the card grows taller instead.
        `auto-fill` keeps the tiles the same size as the item slots either way.
      */}
      <div
        className="grid w-full gap-1.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, var(--slot-size))' }}
      >
        {visible.map(({ slot, i }) => {
          const value = section.spells[i] ?? null;
          return (
            <SpellSlot
              key={slot}
              slot={slot}
              value={value}
              spell={value?.k === 'id' ? spells.get(value.id) : undefined}
              sectionName={sectionName}
              strings={strings}
              selectable={(hero.bySlot[slot]?.length ?? 0) > 0}
              onPick={() => onPickSpell(i)}
              onClear={() => onClearSpell(i)}
            />
          );
        })}
      </div>
    </div>
  );
}
