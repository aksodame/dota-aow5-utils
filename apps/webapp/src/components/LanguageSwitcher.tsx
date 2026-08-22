import type { Lang } from '@/i18n/strings';
import { LANGUAGE_LABELS } from '@/i18n/strings';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LanguageFlag } from './LanguageFlag';

interface Props {
  languages: Lang[];
  active: Lang;
  label: string;
  onSelect: (lang: Lang) => void;
}

/**
 * Both languages shown side by side rather than behind a dropdown — with only
 * two options, a menu costs an extra click to see what is even available.
 *
 * The flags are decorative SVG (see LanguageFlag), so each button carries the
 * language name as its accessible name, and `aria-pressed` conveys the active
 * one to assistive tech rather than relying on the outline alone.
 */
export function LanguageSwitcher({ languages, active, label, onSelect }: Props) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {languages.map((lang) => {
        const selected = lang === active;
        return (
          <Tooltip key={lang}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelect(lang)}
                aria-pressed={selected}
                aria-label={LANGUAGE_LABELS[lang]}
                className={cn(
                  'flex size-8 cursor-pointer items-center justify-center rounded-md border transition-all',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  selected
                    ? 'border-primary ring-2 ring-primary/40'
                    : 'border-transparent opacity-55 hover:border-border hover:opacity-100',
                )}
              >
                <LanguageFlag lang={lang} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{LANGUAGE_LABELS[lang]}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
