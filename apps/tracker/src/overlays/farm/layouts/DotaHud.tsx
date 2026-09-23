import { Fragment, type CSSProperties } from 'react';
import { CARD_IDS, type CardId } from '@core/cards.ts';
import { qualityColor } from '@core/items.ts';
import { useItems } from '@/features/items/table';
import { cn } from '@/lib/utils';
import type { CardView } from '../readout';
import { useReadout } from '../readout';
import { LootList } from '../LootList';
import type { HudLayoutProps } from './index';

/**
 * The readout in Dota's own panel idiom — the warehouse and the item tooltip.
 *
 * This style is a skin first and an arrangement second. The grid is the minimal
 * layout's, card for card, because the point of it was never a new place for
 * the numbers: it is that the overlay stops looking like a web app floated over
 * the game and starts looking like one more of the game's own panels.
 *
 * What makes it Dota is in the blocks. The cards sit in a well the way the
 * warehouse's slots do — near-black cells with a grey hairline each, one pixel
 * apart — and every icon is in an item slot. Rarity is the game's mark for it:
 * not a frame but a two-pixel bar along the slot's top edge, in the tier's
 * colour. The rest of the look is tokens in `styles.css`.
 */

/*
 * The cards that are an amount of gold. Dota prints a price in coin yellow and
 * everything else — counts, clocks — in plain white, so the colour says which
 * kind of number it is before you read it.
 */
const GOLD_CARDS = new Set<CardId>(['sessionGold', 'sessionBest', 'mapGold', 'mapGoldAverage', 'goldPerHour']);

export function DotaHud(props: HudLayoutProps) {
  const { cardsOnly, cards, pricing, tracked } = props;
  const { cards: views, rows, sort, onSort, best, currentMapGold } = useReadout(props);
  const itemTable = useItems();

  const shown = new Set(cards);
  // Only the best drop has a rarity; every other slot is a plain one.
  const quality = (id: CardId) => (id === 'sessionBest' && best !== null ? itemTable.get(best.id).quality : null);

  return (
    <div className={cn('flex flex-col gap-2', !cardsOnly && 'min-h-0 flex-1')}>
      {/* The minimal layout's grid, and for the same reasons — see `MinimalHud`.
          The gap is the well showing between cells, as between warehouse slots. */}
      <div className="hud-dota-well grid grid-cols-3 gap-px">
        {CARD_IDS.filter((id) => shown.has(id)).map((id) => (
          <Fragment key={id}>
            <Card view={views[id]} quality={quality(id)} gold={GOLD_CARDS.has(id)} />
          </Fragment>
        ))}
      </div>

      {/* A panel of its own, as the backpack is under the warehouse: in this
          skin the HUD has no slab, so each section brings its own ground and
          the game shows in the gaps between them. The room's worth rides on
          the heading, as the backpack's "Value 1400" does. */}
      {!cardsOnly && (
        <div className="hud-dota-section flex min-h-0 flex-1 flex-col gap-1 p-1">
          <LootList rows={rows} sort={sort} onSort={onSort} pricing={pricing} tracked={tracked} total={currentMapGold} />
        </div>
      )}
    </div>
  );
}

/*
 * The slot on the left, then the label over the figure.
 *
 * Side by side rather than the minimal card's icon-in-the-value-row: an item
 * slot is the thing this skin is made of, and one shrunk to the height of a
 * line of text stops reading as a slot.
 */
function Card({ view, quality, gold }: { view: CardView; quality: number | null; gold: boolean }) {
  const bar = quality === null ? undefined : ({ '--item-quality': qualityColor(quality) } as CSSProperties);
  return (
    <div className="hud-dota-cell flex min-w-0 items-center gap-1.5 px-1.5 py-1" title={view.title}>
      <span
        className={cn('hud-dota-slot flex shrink-0 items-center justify-center overflow-hidden', bar && 'hud-dota-slot-rarity')}
        style={bar}
      >
        {view.icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="hud-dota-label truncate">{view.label}</span>
        <span className="flex min-w-0 items-baseline gap-1">
          <span className={cn('hud-dota-value min-w-0 truncate tabular-nums', gold && 'hud-dota-value-gold')}>
            {view.value}
          </span>
          {view.trailing !== undefined && (
            <span className="hud-dota-trailing ms-auto shrink-0 tabular-nums">{view.trailing}</span>
          )}
        </span>
      </span>
    </div>
  );
}
