import { Check } from 'lucide-react';
import { abilityIconUrl, type SpellSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import type { AbilityId, AbilitySlotKey } from 'aow5-shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RichText } from './RichText';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  /** The key being filled, or null when nothing is being edited. */
  slot: AbilitySlotKey | null;
  /** The hero's abilities for that key. Empty only for a slot they cannot fill. */
  candidates: SpellSummary[];
  currentId: AbilityId | null;
  /** True when the slot holds anything at all, including an unresolved index. */
  canClear: boolean;
  heroName: string;
  strings: Strings;
  onSelect: (id: AbilityId) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Picks one ability for one key.
 *
 * Deliberately not the item picker: the choice is between two and four
 * candidates, so there is nothing to search and every option can show its full
 * description at once — which is exactly what the decision turns on.
 */
export function SpellPicker({
  open,
  slot,
  candidates,
  currentId,
  canClear,
  heroName,
  strings,
  onSelect,
  onClear,
  onClose,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {strings.pickSpell}
            {slot && <Badge className="ms-2 align-middle">{strings.spellSlot[slot]}</Badge>}
          </DialogTitle>
          <DialogDescription>{heroName}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60svh] pe-3">
          {/*
            Reachable when a slot holds a spell the current hero cannot offer —
            an unknown index from a newer build. Clearing must still be possible,
            so the dialog opens with an explanation rather than not at all.
          */}
          {candidates.length === 0 && <p className="py-2 text-sm text-muted-foreground">{strings.noSpellsInSlot}</p>}
          <ul className="space-y-2">
            {candidates.map((spell) => {
              const active = spell.id === currentId;
              return (
                <li key={spell.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(spell.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-2 text-start transition-colors',
                      'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      active ? 'border-primary bg-accent/60' : 'hover:bg-accent/40',
                    )}
                  >
                    <img
                      src={abilityIconUrl(spell.icon)}
                      alt=""
                      width={56}
                      height={56}
                      loading="lazy"
                      decoding="async"
                      className="size-14 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{spell.name}</span>
                        {active && <Check className="size-4 text-primary" />}
                      </div>
                      {spell.text?.desc && (
                        <p className="text-sm leading-snug text-muted-foreground">
                          <RichText nodes={spell.text.desc} />
                        </p>
                      )}
                      <SpellFacts spell={spell} strings={strings} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={onClear} disabled={!canClear}>
            {strings.clearSpell}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {strings.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Cooldown, cost and the ability's own stat labels, when the data has them. */
function SpellFacts({ spell, strings }: { spell: SpellSummary; strings: Strings }) {
  const facts: string[] = [];
  if (spell.cooldown !== undefined && spell.cooldown > 0) facts.push(`${strings.cooldown} ${spell.cooldown}`);
  if (spell.manaCost !== undefined && spell.manaCost > 0) facts.push(`${strings.manaCost} ${spell.manaCost}`);
  if (spell.castRange !== undefined && spell.castRange > 0) facts.push(`${strings.castRange} ${spell.castRange}`);

  const labels = spell.text?.values ?? {};
  const stats = Object.entries(spell.values)
    .filter(([key]) => labels[key] !== undefined)
    .map(([key, value]) => `${labels[key]}: ${value}`);

  if (facts.length === 0 && stats.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {facts.map((f) => (
        <Badge key={f} variant="secondary" className="text-[11px] font-normal tabular-nums">
          {f}
        </Badge>
      ))}
      {stats.map((s) => (
        <Badge key={s} variant="outline" className="text-[11px] font-normal tabular-nums">
          {s}
        </Badge>
      ))}
    </div>
  );
}
