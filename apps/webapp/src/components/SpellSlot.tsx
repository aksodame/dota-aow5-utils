import { X } from 'lucide-react';
import type { SpellValue } from 'aow5-shared/codec';
import { abilityIconUrl, type SpellSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import type { AbilitySlotKey } from 'aow5-shared/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SpellHoverCard } from './SpellHoverCard';

interface Props {
  slot: AbilitySlotKey;
  value: SpellValue | null;
  spell: SpellSummary | undefined;
  sectionName: string;
  strings: Strings;
  /** False when the hero has no finished ability for this key. */
  selectable: boolean;
  onPick: () => void;
  onClear: () => void;
}

/**
 * One ability key on a card.
 *
 * An empty slot shows the key it stands for rather than a plus, because which
 * key a spell binds to is the thing being chosen — Q and W are not
 * interchangeable the way two equipment slots are.
 */
export function SpellSlot({ slot, value, spell, sectionName, strings, selectable, onPick, onClear }: Props) {
  const keyLabel = strings.spellSlot[slot];
  const label = `${sectionName}, ${keyLabel}`;

  if (!value) {
    return (
      <Button
        variant="outline"
        onClick={onPick}
        disabled={!selectable}
        aria-label={`${label}, ${selectable ? strings.emptySpell : strings.noSpellsInSlot}`}
        title={selectable ? undefined : strings.noSpellsInSlot}
        className="aspect-square size-auto h-auto w-full border-dashed p-0 text-[13px] leading-none font-semibold text-muted-foreground/60 hover:text-foreground disabled:opacity-40"
      >
        {keyLabel}
      </Button>
    );
  }

  // An ability index this build cannot resolve — a build made against newer
  // data. Kept rather than dropped, because the codec re-emits it unchanged.
  if (value.k === 'unknown' || !spell) {
    const idx = value.k === 'unknown' ? value.idx : -1;
    return (
      <div className="group relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={onPick}
              aria-label={`${label}, ${strings.unknownSpell}`}
              className="aspect-square size-auto h-auto w-full border-dashed border-amber-500/60 p-0 text-base font-semibold text-amber-500"
            >
              ?
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {strings.unknownSpell} (#{idx})
          </TooltipContent>
        </Tooltip>
        <ClearSpellButton label={`${strings.clearSpell}: ${label}`} title={strings.clearSpell} onClear={onClear} />
      </div>
    );
  }

  return (
    <div className="group relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            onClick={onPick}
            aria-label={`${label}, ${spell.name}`}
            className="aspect-square size-auto h-auto w-full overflow-hidden border-2 border-primary/50 p-0"
          >
            <img
              src={abilityIconUrl(spell.icon)}
              alt=""
              loading="lazy"
              decoding="async"
              className="block size-full object-cover"
            />
          </Button>
        </TooltipTrigger>
        {/* To the side, and no height cap — see the item slot's card. The
            ability's own text is small enough to load with the board, so this
            one needs nothing fetched to be complete. */}
        <TooltipContent variant="card" side="right" align="start" sideOffset={8} collisionPadding={12}>
          <SpellHoverCard spell={spell} slot={slot} strings={strings} />
        </TooltipContent>
      </Tooltip>
      <ClearSpellButton label={`${strings.clearSpell}: ${spell.name}`} title={strings.clearSpell} onClear={onClear} />
    </div>
  );
}

function ClearSpellButton({ label, title, onClear }: { label: string; title: string; onClear: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClear}
      title={title}
      aria-label={label}
      className="absolute end-0 top-0 size-4 rounded-sm bg-background/85 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
    >
      <X className="size-2.5" />
    </Button>
  );
}
