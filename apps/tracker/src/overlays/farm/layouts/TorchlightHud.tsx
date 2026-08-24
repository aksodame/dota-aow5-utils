import { CARD_IDS, type CardId } from '@core/cards.ts';
import { qualityColor } from '@core/items.ts';
import { useItems } from '@/features/items/table';
import { cn } from '@/lib/utils';
import type { CardView } from '../readout';
import { useReadout } from '../readout';
import { LootList } from '../LootList';
import type { HudLayoutProps } from './index';

/**
 * One number, then everything else — the ARPG loot-tracker arrangement.
 *
 * A single headline figure owning the top-left, two small readings beside it,
 * a band of totals under them, and whatever is left inlined on one thin line.
 * Then the loot, when the panel is expanded.
 *
 * The argument for it is that a farm session has one question in it — was that
 * drop worth the room — and the minimal layout answers it in the same
 * two-centimetre card it answers seven other questions in. Here the answer is
 * the panel, and the other seven are context around it.
 *
 * **The headline is the best drop.** Not the session total, not gold per hour:
 * the one item that carried the evening, with its own art at a size you
 * actually look at, its name beside the heading in its rarity colour, and how
 * many of it you have.
 *
 * Two things about the shape, both taken from the reference and both easy to
 * get wrong. The cells are a *grid*, not a row of cards: they run edge to edge
 * with hairline rules between them and no gaps, which is what makes the block
 * read as one instrument rather than as five widgets. And it is dense — the
 * whole readout above the loot list is a handful of lines, because every pixel
 * it spends is one the loot list wanted.
 *
 * Nothing here adds a control. The reference has its own toolbar — a bin, a
 * couple of toggles — and none of it is drawn, because the buttons this overlay
 * has are the ones the shell already puts in the header, and a second set of
 * unfamiliar glyphs is not a feature.
 */
export function TorchlightHud(props: HudLayoutProps) {
  const { cardsOnly, cards, pricing, tracked } = props;
  const { cards: views, rows, sort, onSort, currentMapGold, best } = useReadout(props);
  const itemTable = useItems();

  const slots = arrange(cards);
  const headline = views[slots.headline];
  const named = slots.headline === 'sessionBest' && best !== null ? best : null;

  return (
    <div className={cn('flex flex-col gap-1.5', !cardsOnly && 'min-h-0 flex-1')}>
      {/* One frame around the whole readout, with every division inside it a
          hairline. `overflow-hidden` so the cells square off against the
          rounded corner instead of poking through it. */}
      <div className="hud-tl-grid overflow-hidden">
        <div className="flex items-stretch">
          <div className="min-w-0 flex-1 px-2 py-1">
            <div className="flex min-w-0 items-baseline gap-2">
              {/* The dot is the reference's, and it earns its pixel: it marks
                  which of the labels on the panel is the one belonging to the
                  headline, in a skin where every label is the same size. */}
              <span className="hud-tl-heading flex min-w-0 items-center gap-1 truncate" title={headline.title}>
                <span className="hud-tl-dot" aria-hidden="true" />
                {headline.label}
              </span>
              {/* The item, on the heading's line rather than under the number.
                  A third line here would make this cell taller than the band
                  below it, and the whole point of the arrangement is that it is
                  short. */}
              {named !== null && (
                <span
                  className="ms-auto min-w-0 truncate text-[0.5625rem] font-semibold"
                  style={{ color: qualityColor(itemTable.get(named.id).quality) }}
                  title={named.name}
                >
                  {named.name}
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Three times a card's icon. For the best drop this is the
                  item's own art, and at this size it is the fastest thing on
                  the panel to read — you know what dropped before you have read
                  the number beside it. */}
              <span className="hud-tl-headline-icon flex shrink-0 items-center justify-center overflow-hidden text-muted-foreground">
                {headline.icon}
              </span>
              <span className="hud-tl-headline min-w-0 truncate tabular-nums" title={headline.title}>
                {headline.value}
              </span>
              {headline.trailing !== undefined && (
                <span className="hud-tl-trailing shrink-0 self-end tabular-nums">{headline.trailing}</span>
              )}
            </div>
          </div>

          {slots.pairs.length > 0 && (
            <div className="hud-tl-rule-s flex shrink-0 flex-col justify-center">
              {slots.pairs.map((id) => (
                <Pair key={id} view={views[id]} />
              ))}
            </div>
          )}
        </div>

        {slots.boxes.length > 0 && (
          <div className="hud-tl-rule-t flex items-stretch">
            {slots.boxes.map((id, index) => (
              <Cell key={id} view={views[id]} first={index === 0} />
            ))}
          </div>
        )}

        {/* One thin band for the leftovers, which is the point of it: a card
            that did not make the top five is still a number you asked for, and
            the honest place for it is inline rather than gone. Empty with the
            default six cards on, and drawn only when it has something to say. */}
        {slots.strip.length > 0 && (
          <div className="hud-tl-strip hud-tl-rule-t flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-0.5">
            {slots.strip.map((id) => (
              <span key={id} className="flex items-center gap-1.5" title={views[id].title}>
                <span className="text-muted-foreground">{views[id].label}</span>
                <span className="font-semibold tabular-nums text-foreground">{views[id].value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded still shows the whole list — the headline says what carried
          the session, this says what actually fell in this room. The room's
          worth rides on the heading here, where the minimal layout leaves it to
          a card of its own. */}
      {!cardsOnly && (
        <LootList rows={rows} sort={sort} onSort={onSort} pricing={pricing} tracked={tracked} total={currentMapGold} />
      )}
    </div>
  );
}

/**
 * One of the two small readings beside the headline.
 *
 * Label left, value right, on one line — the opposite of every other figure in
 * this layout, which stacks them. Deliberate: these two sit in a column narrow
 * enough that stacking would make the block taller than the headline it is
 * meant to sit quietly next to.
 */
function Pair({ view }: { view: CardView }) {
  return (
    <span className="flex items-center gap-2 px-2 py-0.5" title={view.title}>
      <span className="hud-tl-label truncate">{view.label}</span>
      <span className="ms-auto w-14 shrink-0 text-right text-[0.6875rem] font-semibold tabular-nums text-foreground">
        {view.value}
      </span>
    </span>
  );
}

/** One cell of the totals band. Equal width, because none of them outranks the others. */
function Cell({ view, first }: { view: CardView; first: boolean }) {
  return (
    <div
      className={cn('flex min-w-0 flex-1 flex-col gap-px px-2 py-1', !first && 'hud-tl-rule-s')}
      title={view.title}
    >
      <span className="hud-tl-label truncate">{view.label}</span>
      <span className="flex min-w-0 items-baseline gap-1">
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold tabular-nums text-gold">{view.value}</span>
        {view.trailing !== undefined && (
          <span className="ms-auto shrink-0 text-[0.5rem] tabular-nums text-muted-foreground">{view.trailing}</span>
        )}
      </span>
    </div>
  );
}

interface Slots {
  headline: CardId;
  /** Beside the headline. At most two — a third would start competing with it. */
  pairs: CardId[];
  /** The totals band. Three, because that is what fits at the default width. */
  boxes: CardId[];
  /** Everything after that, on one line. */
  strip: CardId[];
}

/**
 * Which of the player's cards goes where.
 *
 * This layout has four kinds of place and the player has between one and eight
 * cards, so something has to decide. Two rules, and they are in this order:
 *
 *   1. The best drop takes the headline whenever it is on, because that is what
 *      this layout is *for*. With the default cards it always is.
 *   2. Everything else flows in `CARD_IDS` order — two into the pairs, three
 *      into the band, the rest onto the strip.
 *
 * The fallback in rule 1 matters more than it looks: someone who turns the best
 * drop off has not asked for a headless panel, they have asked for one fewer
 * card. So the first card they *did* keep is promoted, and the layout is never
 * missing its top half. `cards` is never empty — `readCards` guarantees it.
 *
 * The alternative was pinning each slot to a particular card and leaving holes
 * where one was turned off, which makes the HUD-cards setting mean "blank out a
 * corner" in this style and "close the gap" in the other one.
 */
function arrange(cards: CardId[]): Slots {
  const ordered = CARD_IDS.filter((id) => cards.includes(id));
  const headline = ordered.includes('sessionBest') ? 'sessionBest' : (ordered[0] ?? 'sessionBest');
  const rest = ordered.filter((id) => id !== headline);
  return { headline, pairs: rest.slice(0, 2), boxes: rest.slice(2, 5), strip: rest.slice(5) };
}
