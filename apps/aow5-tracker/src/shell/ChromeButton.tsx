import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * One icon in an overlay's title bar, with a tooltip that says what it does.
 *
 * The chrome is seven unlabelled glyphs in a row, and two of them — restart and
 * the skull — throw away numbers you have been collecting all evening. Guessing
 * from a shape is not good enough for that, and the native `title` attribute
 * was not either: Windows takes about a second to show one, draws it in the
 * system font at the system size, and ignores the UI scale entirely, so on a
 * panel scaled to 140% it arrives late and looks like it belongs to another
 * application. A real tooltip appears where the eye already is, in the panel's
 * own type.
 *
 * `aria-label` stays alongside it. The tooltip is for the pointer; the label is
 * what the button is called, and a portal that only exists while hovered is no
 * substitute for that.
 */

interface Props {
  /** What the button does, on hover and to a screen reader. */
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** Tone, for the buttons that are not merely muted — destructive, or lit. */
  className?: string;
}

export function ChromeButton({ label, onClick, children, className }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-6 text-muted-foreground hover:text-foreground', className)}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      {/* Below, always: the chrome sits at the top of the panel, and a tooltip
          above it would be drawn outside the window and clipped away. */}
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
