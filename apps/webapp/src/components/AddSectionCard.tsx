import { Copy, Plus } from 'lucide-react';
import { MAX_SECTIONS } from 'aow5-shared/codec';
import type { Strings } from '@/i18n/strings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** A section worth copying: its position, and the name to put on the chip. */
export interface CopySource {
  index: number;
  label: string;
}

interface Props {
  count: number;
  /** Sections that already hold something. Empty ones are nothing to copy. */
  sources: CopySource[];
  strings: Strings;
  onAdd: () => void;
  onCopy: (section: number) => void;
}

/**
 * Sits after the last section as a placeholder card, so the grid always shows
 * where the next section would go rather than hiding the action in a toolbar.
 *
 * Below the blank-section button sits one chip per filled section: most later
 * sections are a variation on an earlier one, so starting from a copy saves
 * re-picking a loadout that only changes by an item or two.
 */
export function AddSectionCard({ count, sources, strings, onAdd, onCopy }: Props) {
  return (
    <Card className="flex h-full flex-col gap-0 border-dashed bg-transparent p-0 shadow-none">
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full min-h-44 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <span className="flex size-9 items-center justify-center rounded-full border border-dashed">
          <Plus className="size-4" />
        </span>
        <span className="text-sm font-medium">{strings.addSection}</span>
        <span className="text-xs tabular-nums">{strings.sectionsUsed(count, MAX_SECTIONS)}</span>
      </button>

      {sources.length > 0 && (
        <div className="border-t border-dashed px-2 py-2">
          <div className="mb-1 px-1 text-xs text-muted-foreground">{strings.copyFrom}</div>
          <div className="flex flex-wrap gap-1">
            {sources.map((source) => (
              <Tooltip key={source.index}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 max-w-full gap-1 px-2 text-xs"
                    aria-label={strings.copySection(source.label)}
                    onClick={() => onCopy(source.index)}
                  >
                    <Copy className="size-3 shrink-0" />
                    <span className="truncate">{source.label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{strings.copySection(source.label)}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
