import { Fragment } from 'react';
import { CARD_IDS } from '@core/cards.ts';
import type { CardView } from '../readout';
import { useReadout } from '../readout';
import { LootList } from '../LootList';
import { cn } from '@/lib/utils';
import type { HudLayoutProps } from './index';

/**
 * The readout this tracker started as: two rows of stat cards, and — expanded —
 * what you picked up.
 *
 * The two states answer different questions. Collapsed is "how is this going",
 * which is six numbers and nothing else, small enough to leave over the game
 * all session — and it is the state the overlay spends the evening in, so
 * anything answerable in a number that moves belongs there. Expanded is "what
 * did I actually get", which is the only thing that needs a list, and the only
 * thing worth the height.
 *
 * Every card is equal here, and that is the layout's whole opinion: it does not
 * know which of your numbers matters tonight, so it gives them the same width
 * and lets you read the one you came for. The Torchlight layout beside it takes
 * the opposite position — see `TorchlightHud`.
 *
 * Where you are is not a number and is not here: it is one line of prose, and
 * it lives on the shell's header row while the chrome is away. See `StateLine`.
 */
export function MinimalHud(props: HudLayoutProps) {
  const { cardsOnly, cards, pricing, tracked } = props;
  const { cards: views, rows, sort, onSort } = useReadout(props);

  const shown = new Set(cards);

  return (
    // `flex-1` only when there is a list to give the leftover height to;
    // collapsed, the cards are the whole panel and it is as tall as they are.
    <div className={cn('flex flex-col gap-2', !cardsOnly && 'min-h-0 flex-1')}>
      {/*
        The chosen cards on a three-column grid, collapsed as well as expanded.

        Two rows of three by default, and the two rows are two questions. The
        top row is the sitting: how long you have been at it, what it has paid,
        and the one item that carried it. The bottom row is a room: how long
        this one has taken, what a room is worth on average, and what this one
        has dropped.

        A grid rather than the flex row it grew out of, so the second row's
        cards line up under the first's instead of sizing themselves to their
        own contents. Turning a card off closes the space rather than leaving a
        hole — the ones after it move up — but every card keeps a third of the
        width, so a short last row is three cards' worth of column with one or
        two in it, not two cards stretched across the panel.

        Drawn from `cards` in `CARD_IDS` order rather than from the saved order:
        the arrangement is not the player's, only which of them appear is.
      */}
      <div className="grid grid-cols-3 gap-1.5">
        {CARD_IDS.filter((id) => shown.has(id)).map((id) => (
          <Fragment key={id}>
            <Card view={views[id]} />
          </Fragment>
        ))}
      </div>

      {!cardsOnly && <LootList rows={rows} sort={sort} onSort={onSort} pricing={pricing} tracked={tracked} />}
    </div>
  );
}

/*
 * Two lines: what it is, then what it says.
 *
 * Stacking them gives the value the card's whole width, so the numbers no
 * longer share a line with their own label and start truncating each other
 * when the window is narrow or the UI scale is large. The label goes on top
 * because it is the half you stop reading once you know the layout.
 *
 * Every card is a number, in gold, in tabular figures. The one card that held
 * prose needed an exception to each of those three, which is what made it the
 * wrong shape for the row rather than merely a tight fit — see `StateLine`.
 */
function Card({ view }: { view: CardView }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-black/25 px-2 py-1" title={view.title}>
      {/* A pixel under the 0.625rem the other small labels use, and the one
          place in the app that is: these are the longest of them — "session
          gold", not "val" — on the narrowest thing that holds any, a card a
          third of the panel wide. The extra pixel is what keeps them off
          `truncate` at the default window size. */}
      <span className="truncate text-[0.5625rem] tracking-wide text-muted-foreground uppercase">{view.label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">{view.icon}</span>
        <span className="min-w-0 truncate font-semibold tabular-nums text-gold">{view.value}</span>
        {view.trailing !== undefined && (
          <span className="ms-auto shrink-0 text-[0.5rem] tabular-nums text-muted-foreground">{view.trailing}</span>
        )}
      </span>
    </div>
  );
}
