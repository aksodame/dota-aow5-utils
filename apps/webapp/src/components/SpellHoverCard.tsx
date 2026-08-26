import { Crosshair, Droplet, Hourglass } from 'lucide-react';
import { abilityIconUrl, type SpellSummary } from 'aow5-shared/data';
import type { AbilitySlotKey } from 'aow5-shared/types';
import type { Strings } from '@/i18n/strings';
import { affectsFrom, behaviorFromFlags } from '@/lib/itemStats';
import { splitDescription } from '@/lib/richDesc';
import { GameCard, GameCardBody, GameCardHeader, GameDescription, GameFact } from './GameTooltip';

interface Props {
  spell: SpellSummary;
  /** The key it is bound to on this card, shown as a chip beside the name. */
  slot: AbilitySlotKey;
  strings: Strings;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The radius an ability works over, when it has no cast range.
 *
 * Stifling Dagger throws at everything within 750 units and declares no range
 * at all — the game shows that radius in the same place a targeted spell shows
 * its range, so the card looks for one under the names the data uses.
 */
function reachOf(spell: SpellSummary): number | null {
  if (spell.castRange) return spell.castRange;
  for (const key of ['search_radius', 'ability_radius', 'radius']) {
    const value = spell.values[key];
    if (typeof value === 'number' && value > 0) return value;
  }
  return null;
}

/** An ability drawn the way the game draws it. Sibling of `ItemHoverCard`. */
export function SpellHoverCard({ spell, slot, strings }: Props) {
  const behavior = behaviorFromFlags(spell.behavior);
  const affects = affectsFrom(spell.targetTeam, spell.targetType);
  const sections = splitDescription(spell.text?.desc);
  const reach = reachOf(spell);

  // The game's own line is the tag list — "Active / Damage" — and falls back to
  // what the behaviour flags say for an ability the data left untagged.
  const kind =
    spell.tags && spell.tags.length > 0
      ? spell.tags.map(capitalize).join(' / ')
      : behavior
        ? strings.behavior[behavior]
        : null;

  return (
    <GameCard>
      <GameCardHeader>
        {/* A fixed square the art fills — see the item card's frame. */}
        <div className="size-[46px] shrink-0 overflow-hidden rounded border-2 border-[#4d5b7a] bg-black/40">
          <img
            src={abilityIconUrl(spell.icon)}
            alt=""
            loading="lazy"
            decoding="async"
            className="block size-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] leading-tight font-bold tracking-wide text-white uppercase">
              {spell.name}
            </h3>
            <span className="shrink-0 font-mono text-[10px] leading-tight text-[#8fa0bb]">{spell.id}</span>
          </div>
          <span className="mt-1.5 inline-block rounded-sm bg-white/10 px-1.5 py-px text-[10px] font-semibold text-[#c3cddf] uppercase">
            {strings.spellSlot[slot]}
          </span>
        </div>
      </GameCardHeader>

      <GameCardBody>
        {(kind || affects) && (
          <div className="space-y-0.5">
            {kind && <GameFact label={`${strings.skill}${strings.colon}`}>{kind}</GameFact>}
            {affects && (
              <GameFact label={`${strings.affects}${strings.colon}`}>{strings.affectsLabel(affects.team, affects.scope)}</GameFact>
            )}
          </div>
        )}

        {sections.length > 0 && <GameDescription sections={sections} />}

        {(spell.cooldown || spell.manaCost || reach) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-2 text-[12px] font-semibold text-[#dbe3f0] tabular-nums">
            {spell.cooldown ? (
              <span className="flex items-center gap-1.5" title={strings.cooldown}>
                <Hourglass className="size-3.5 text-[#9fb0c8]" aria-hidden />
                {spell.cooldown}
              </span>
            ) : null}
            {spell.manaCost ? (
              <span className="flex items-center gap-1.5" title={strings.manaCost}>
                <Droplet className="size-3.5 text-[#4aa8e0]" aria-hidden />
                {spell.manaCost}
              </span>
            ) : null}
            {reach !== null && (
              <span className="flex items-center gap-1.5" title={strings.castRange}>
                <Crosshair className="size-3.5 text-[#6cc24a]" aria-hidden />
                {reach}
              </span>
            )}
          </div>
        )}
      </GameCardBody>
    </GameCard>
  );
}
