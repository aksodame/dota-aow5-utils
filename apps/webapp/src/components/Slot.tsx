import { Plus, X } from 'lucide-react';
import type { SlotValue } from 'aow5-shared/codec';
import type { ItemSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ItemHoverCard } from './ItemHoverCard';
import { ItemIcon, qualityColor } from './ItemIcon';

interface Props {
  value: SlotValue | null;
  item: ItemSummary | undefined;
  sectionName: string;
  /** Human-readable position, e.g. "Equipment 3". */
  slotLabel: string;
  strings: Strings;
  onPick: () => void;
  onClear: () => void;
}

export function Slot({ value, item, sectionName, slotLabel, strings, onPick, onClear }: Props) {
  const label = `${sectionName}, ${slotLabel}`;
  // Null when a board is rendered outside the planner's provider; the hover
  // card then falls back to the one-line summary rather than pulling a
  // megabyte of stats somewhere that never meant to.
  const details = useItemDetailsStore();

  if (!value) {
    return (
      <Button
        variant="outline"
        onClick={onPick}
        aria-label={`${label}, ${strings.emptySlot}`}
        className="aspect-square size-auto h-auto w-full border-dashed p-0 text-muted-foreground/60 hover:text-foreground"
      >
        <Plus className="size-4" />
      </Button>
    );
  }

  // An index this build cannot resolve — from a link made with newer data, or
  // one pointing at an item that is not currently playable. Rendered rather
  // than dropped, because the codec preserves it when the link is passed on.
  if (value.k === 'unknown' || !item) {
    const idx = value.k === 'unknown' ? value.idx : -1;
    return (
      <div className="group relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={onPick}
              aria-label={`${label}, ${strings.unknownItem}`}
              className="aspect-square size-auto h-auto w-full border-dashed border-amber-500/60 p-0 text-base font-semibold text-amber-500"
            >
              ?
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {strings.unknownItem} (#{idx})
          </TooltipContent>
        </Tooltip>
        <ClearButton label={`${strings.clearSlot}: ${label}`} title={strings.clearSlot} onClear={onClear} />
      </div>
    );
  }

  return (
    // The clear control is a sibling of the slot button, not a child: nesting
    // one button inside another is invalid HTML and swallows the inner click.
    <div className="group relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            onClick={onPick}
            // The stats files are fetched on the first hover of any filled
            // slot rather than with the board, so a visitor who only reads a
            // build still pays for them — but not before they ask.
            onPointerEnter={() => details?.request()}
            onFocus={() => details?.request()}
            aria-label={`${label}, ${item.name}`}
            style={{ borderColor: qualityColor(item.quality) }}
            className="aspect-square size-auto h-auto w-full overflow-hidden border-2 p-0"
          >
            {/*
              `fill` + `cover`: the art runs to the button's inner edge with no
              gap, and every tile reads as the same size whatever the source
              aspect ratio. The button clips the corners, so the image needs no
              radius of its own.
            */}
            <ItemIcon icon={item.icon} alt="" fill fit="cover" />
          </Button>
        </TooltipTrigger>
        {details ? (
          /*
            The in-game tooltip, on a hover.

            To the side rather than above, because the card is as tall as a
            section and would otherwise bury the rows the cursor came from —
            Radix flips it to the other side at the edge of the window. No
            height cap: the card is as tall as what it has to say, and a
            tooltip you have to scroll is a panel wearing a tooltip's clothes.
          */
          <TooltipContent variant="card" side="right" align="start" sideOffset={8} collisionPadding={12}>
            <ItemHoverCard
              summary={item}
              full={details.full?.[item.id]}
              detail={details.detail?.[item.id]}
              names={details.byId}
              strings={strings}
              loading={details.loading}
            />
          </TooltipContent>
        ) : (
          <TooltipContent>
            <p className="font-medium">{item.name}</p>
            <p className="text-muted-foreground">
              {item.type} · {strings.level} {item.level} · {strings.cost} {item.cost}
            </p>
          </TooltipContent>
        )}
      </Tooltip>
      <ClearButton label={`${strings.clearSlot}: ${item.name}`} title={strings.clearSlot} onClear={onClear} />
    </div>
  );
}

function ClearButton({ label, title, onClear }: { label: string; title: string; onClear: () => void }) {
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
