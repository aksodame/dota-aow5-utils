import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { SiteStrings } from '@/i18n/site';
import { cn } from '@/lib/utils';

/**
 * A path or a command, in a box, with a button that copies it.
 *
 * Every one of these is something the reader has to reproduce exactly somewhere
 * else — a launch option pasted into Steam, a file path typed into a Save
 * dialog — and typing them by hand is where setup goes wrong. A flag with a
 * transposed letter does not fail loudly; Dota accepts it, writes nothing, and
 * the overlay sits at zero looking like a bad download.
 *
 * `select-all` on the text as well as the button, because a copy button that is
 * the *only* way to take the text is worse than no button on a machine where
 * the clipboard API is blocked — over plain HTTP, for instance, where
 * `navigator.clipboard` does not exist at all. The toast says which happened.
 */

interface Props {
  /** The literal text, copied verbatim. Never translated. */
  children: string;
  site: SiteStrings;
  className?: string;
  /**
   * A whole file rather than a single line.
   *
   * Keeps the line breaks, and caps the height so a 178-line config does not
   * push the rest of the page off the screen — the reader is going to press
   * the button, not read all of it, and the few visible lines are there to
   * show what kind of thing they are about to copy.
   */
  file?: boolean;
}

export function CopyBlock({ children, site, className, file = false }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      toast.success(site.copy.done, { icon: <Check className="size-4" /> });
      // Long enough to notice, short enough that the button is not still
      // claiming success by the time they come back from Steam.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(site.copy.failed);
    }
  };

  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <code
        className={cn(
          'min-w-0 flex-1 rounded-md bg-background/70 px-3 py-2 font-mono text-sm text-foreground select-all',
          file
            ? 'block max-h-48 overflow-auto text-xs leading-relaxed whitespace-pre'
            : 'break-all',
        )}
      >
        {children}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-auto shrink-0 self-stretch"
        onClick={() => void copy()}
        aria-label={site.copy.label}
        title={site.copy.label}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}
