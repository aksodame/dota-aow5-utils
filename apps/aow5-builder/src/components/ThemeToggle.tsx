import { Moon, Sun } from 'lucide-react';
import type { Theme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  theme: Theme;
  label: string;
  onToggle: () => void;
}

/**
 * Sun/moon toggle. Both icons are always mounted and cross-fade by rotating
 * and scaling, which reads better than swapping elements — and collapses to a
 * plain swap under `prefers-reduced-motion`.
 */
export function ThemeToggle({ theme, label, onToggle }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" onClick={onToggle} aria-label={label} aria-pressed={theme === 'dark'}>
          <Sun className="size-4 scale-100 rotate-0 transition-transform duration-300 motion-reduce:transition-none dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-transform duration-300 motion-reduce:transition-none dark:scale-100 dark:rotate-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
