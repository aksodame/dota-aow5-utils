import { Eraser } from 'lucide-react';
import { heroIconUrl, type HeroData } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import type { HeroId } from 'aow5-shared/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  heroes: HeroData;
  /** Hero names come from the game data, keyed by hero id. */
  nameOf: (id: HeroId) => string;
  selected: HeroId | null;
  /** Set when the link named a roster position this build cannot resolve. */
  unknown: number | null;
  strings: Strings;
  onSelect: (hero: HeroId | null) => void;
}

/**
 * The roster, above the board.
 *
 * One hero per guide: a build is advice for playing a hero, and every ability
 * belongs to exactly one of them. Selecting is a toggle — clicking the current
 * hero clears it — so there is no separate "none" tile competing for attention.
 */
export function HeroPicker({ heroes, nameOf, selected, unknown, strings, onSelect }: Props) {
  return (
    // Stacked, not side by side: the hint runs long enough that sharing a row
    // with the portraits squeezes them, and the roster reads better as its own
    // band under the label.
    <div className="mb-4 flex flex-col items-start gap-2 rounded-lg border bg-card/50 px-3 py-2">
      <div className="flex flex-col">
        <span className="text-[13.5px] leading-none font-medium tracking-wide text-muted-foreground/70 uppercase">
          {strings.hero}
        </span>
        <span className="mt-1 text-sm text-muted-foreground">
          {selected === null && unknown === null ? strings.heroHint : nameOfSelected(selected, unknown, nameOf, strings)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {heroes.heroes.map((hero) => {
          const active = hero.id === selected;
          const name = nameOf(hero.id);
          // A hero whose abilities are all unfinished upstream can still be the
          // subject of an item guide, so they stay selectable — the spell row
          // explains itself once chosen.
          const note = hero.abilities.length === 0 ? strings.noSpellsForHero : null;

          return (
            <Tooltip key={hero.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={name}
                  onClick={() => onSelect(active ? null : hero.id)}
                  className={cn(
                    'relative overflow-hidden rounded-md border-2 transition-all',
                    'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    active
                      ? 'border-primary shadow-sm'
                      : 'border-transparent opacity-70 hover:opacity-100 grayscale hover:grayscale-0',
                  )}
                >
                  <img
                    src={heroIconUrl(hero.icon)}
                    alt=""
                    width={96}
                    height={54}
                    loading="lazy"
                    decoding="async"
                    className="block h-[54px] w-[96px] object-cover"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{name}</p>
                {note && <p className="max-w-56 text-muted-foreground">{note}</p>}
                {hero.abilities.length > 0 && hero.unfinished > 0 && (
                  <p className="max-w-56 text-muted-foreground">{strings.unfinishedAbilities(hero.unfinished)}</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {(selected !== null || unknown !== null) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.noHero}
                onClick={() => onSelect(null)}
                className="size-10 text-muted-foreground hover:text-foreground"
              >
                <Eraser className="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{strings.noHero}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function nameOfSelected(
  selected: HeroId | null,
  unknown: number | null,
  nameOf: (id: HeroId) => string,
  strings: Strings,
): string {
  if (selected !== null) return nameOf(selected);
  if (unknown !== null) return `${strings.unknownHero} (#${unknown})`;
  return '';
}
