import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, Hammer, Minus, Plus, X } from 'lucide-react';
import { iconUrl, qualityColor, type ItemTable } from '@core/items.ts';
import type { RecipeTarget } from '@core/ipc.ts';
import type { RequirementProgress } from '@core/recipes.ts';
import { useSession } from '@/features/session/useSession';
import { useRecipes, type RecipeGroup } from '@/features/recipes/useRecipes';
import { useItems } from '@/features/items/table';
import { useMessages, type Messages } from '@/i18n';
import { useContentSize } from '@/shell/useContentSize';
import { useOverlay } from '@/shell/useOverlay';
import { cn } from '@/lib/utils';
import { ItemPicker } from './ItemPicker';

/*
 * Tile geometry, in one place because it is one decision.
 *
 * Settled by eye over several passes: halved so a deep recipe fit on one line,
 * then grown back once it was clear how much that had cost, and the text moved
 * with it — a bigger font inside a tile that stayed put only buys a shorter
 * name. At this size the name is a caption you can actually read rather than a
 * label you squint at, and the price is a shorter line, which the window
 * absorbs by growing.
 *
 * The count is the part kept legible whatever else gives way: it is the only
 * thing on a tile that changes.
 */
const TILE_W = 'w-[4.125rem]';
const ICON = 'size-[2.625rem]';
const COUNT_TEXT = 'text-[0.75rem]';
const NAME_TEXT = 'text-[0.5rem]';

/**
 * The backing every control sits on.
 *
 * The panel behind this overlay is gone, so a bare grey glyph would be a
 * control the player has to find against whatever the game is drawing. The
 * chip is the smallest thing that fixes that, and using the same one for the
 * grip and for the buttons says they are the same kind of thing: the chrome of
 * a line, as opposed to the items on it.
 */
const CHIP = 'rounded bg-black/60';

/**
 * The crafting checklist: one line per thing you are making, at the top-right.
 *
 * No panel behind it, deliberately, and in either mode. This one is meant to
 * live on screen for a whole grind, and a slab of frosted glass parked over
 * the corner of the game for an hour is worse than the numbers it carries are
 * good. What holds it together instead is the outline on every glyph, which is
 * what makes white text on a snowfield legible. Pressing the hotkey adds a
 * grip and some buttons; it does not add a background.
 *
 * A line reads left to right as the thing being made, then what it costs,
 * deepest tier first. Tiles rather than rows because the thing being scanned is
 * the icon — you already know what a Gnarled Branch looks like — with the name
 * written into the bottom of it for the ones you do not, and the count on its
 * own line underneath, where nothing can be drawn over the only number that
 * moves.
 *
 * One level deep to begin with: the thing you asked for and the materials it
 * takes, whether or not those are themselves craftable. The hammer on a
 * craftable material opens it up into a line of its own — "I am making that
 * one too" — and the × on such a line closes it again. Expanding everything by
 * default would bury the one line you actually asked for under the recipe for
 * every ingot in it.
 *
 * Empty, it is a single plus button. That is the whole first-run state: there
 * is nothing to configure and nothing to explain, because the only thing you
 * can do is name what you are collecting.
 */
export function RecipeOverlay() {
  const m = useMessages();
  const items = useItems();
  const { config, interactive } = useOverlay();
  const { state } = useSession();
  const targets = useMemo(() => config?.recipe ?? [], [config]);
  const ticked = useMemo(() => new Set(config?.recipeDone ?? []), [config]);
  const expanded = useMemo(() => new Set(config?.recipeExpand ?? []), [config]);
  const { groups, craftable, graph } = useRecipes(targets, state.items, ticked, expanded);
  const [picking, setPicking] = useState(false);
  const column = useRef<HTMLDivElement | null>(null);

  // The picker is a panel the size of a dialog; leaving it open behind the game
  // would park it there until the hotkey came back.
  useEffect(() => {
    if (!interactive) setPicking(false);
  }, [interactive]);

  /*
   * This window is its content, in both directions.
   *
   * The height, because an empty panel then measures to nothing and the window
   * disappears with it — the right amount of screen for a panel with nothing
   * to say. The width, because a recipe keeps its ingredients on one line: it
   * is the line that decides how wide the window is, not the other way round,
   * and the alternative is wrapping the one ingredient you are still missing
   * onto a row you have stopped looking at.
   */
  useContentSize(column, 'both');

  const save = useCallback((next: RecipeTarget[]) => void window.tracker.setConfig({ recipe: next }), []);

  const add = useCallback(
    (id: string) => {
      setPicking(false);
      // Picking something already on the list means another one of it, which is
      // what the plus at the end of its line does too.
      const existing = targets.find((t) => t.id === id);
      save(
        existing
          ? targets.map((t) => (t.id === id ? { ...t, count: t.count + 1 } : t))
          : [...targets, { id, count: 1 }],
      );
    },
    [targets, save],
  );

  const adjust = useCallback(
    (id: string, by: number) => {
      save(targets.map((t) => (t.id === id ? { ...t, count: t.count + by } : t)).filter((t) => t.count > 0));
    },
    [targets, save],
  );

/**
   * Make this ingredient too, or stop making it.
   *
   * Never a deletion either way: the thing is needed regardless, and this only
   * decides whether the panel treats it as a job with materials underneath or
   * as one more material to go and find.
   */
  const toggleExpanded = useCallback(
    (id: string) => {
      const next = new Set(expanded);
      if (!next.delete(id)) next.add(id);
      void window.tracker.setConfig({ recipeExpand: [...next] });
    },
    [expanded],
  );

  /** Ticking is per ingredient id and outranks the counter. */
  const toggleTicked = useCallback(
    (id: string) => {
      const next = new Set(ticked);
      if (!next.delete(id)) next.add(id);
      void window.tracker.setConfig({ recipeDone: [...next] });
    },
    [ticked],
  );

  return (
    <div ref={column} className="flex h-fit w-fit flex-col gap-1 p-1">
      {/*
        Nothing here is a title bar, so dragging needs somewhere to live. Every
        line below is a drag region and every control inside it opts out
        (`.hud-drag button`), which leaves the gaps between the tiles as the
        handle — plus an explicit grip, because a handle nobody can see is not
        one.

        All of that chrome is drawn in both modes and merely hidden in one, so
        that pressing the hotkey does not slide the tiles sideways underneath a
        mouse that is on its way to one of them.
      */}
      {groups.map((group) => (
        <Line
          key={group.id}
          group={group}
          interactive={interactive}
          craftable={craftable}
          items={items}
          m={m}
          onAdjust={adjust}
          onToggle={toggleTicked}
          onExpand={toggleExpanded}
        />
      ))}

      {picking ? (
        <ItemPicker craftable={craftable} loading={graph === null} onPick={add} onCancel={() => setPicking(false)} />
      ) : (
        <div className={cn('flex items-center gap-1', interactive ? 'hud-drag' : 'invisible')}>
          <Grip />
          <button
            type="button"
            onClick={() => setPicking(true)}
            title={m.recipe.add}
            aria-label={m.recipe.add}
            className={cn(
              CHIP,
              'flex flex-1 items-center justify-center gap-1 px-2 py-0.5 text-[0.625rem] text-muted-foreground hover:text-foreground',
            )}
          >
            <Plus className="size-4" />
            {targets.length === 0 && m.recipe.addLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One crafting step and its materials, on a line.
 *
 * The controls at the end differ by where the line came from, because the two
 * mean different things. A step the player asked for takes a count: `−`/`+`,
 * and down to zero removes it. A step that arrived on its own has a count
 * decided by whatever needs it, so the only thing to say about it is whether
 * to make it at all — which is the ×.
 */
function Line({
  group,
  interactive,
  craftable,
  items,
  m,
  onAdjust,
  onToggle,
  onExpand,
}: {
  group: RecipeGroup;
  interactive: boolean;
  craftable: (id: string) => boolean;
  /** Passed down rather than hooked, as in `HistoryView` and for the same reason. */
  items: ItemTable;
  m: Messages;
  onAdjust: (id: string, by: number) => void;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
}) {
  const { id, count, derived, rows, complete } = group;
  const info = items.get(id);

  return (
    <div
      className={cn(
        // No wrapping: one recipe is one line, and the window grows to hold it.
        // The outline lives on the tile text itself now, since the names moved
        // onto the icons and a name over a bright icon needs it as much as one
        // over a bright game.
        'flex items-start gap-0.5',
        // The line is the drag handle while the mouse can reach it, and that is
        // the only thing being interactive changes. No panel appears behind it:
        // this overlay is a line of icons over the game in both modes, and a
        // slab that materialised under them every time the hotkey was pressed
        // would make the thing you are aiming at jump.
        interactive && 'hud-drag',
      )}
    >
      <Grip hidden={!interactive} />
      {/* The target leads the line and is ringed rather than counted: it is
          what the line is *for*, not one of the things to collect. */}
      <Tile
        icon={info.icon}
        name={info.name}
        quality={info.quality}
        // Dashed for a step nobody asked for, so a line that appeared by itself
        // looks like one rather than like something the player forgot adding.
        className={cn(
          'rounded ring-1',
          complete ? 'ring-primary' : 'ring-border',
          derived && 'ring-dashed opacity-90',
        )}
        badge={<span className="text-foreground">×{count}</span>}
      />

      {rows.map((row) => (
        <IngredientTile
          key={row.id}
          row={row}
          interactive={interactive}
          craftable={craftable(row.id)}
          items={items}
          m={m}
          onToggle={onToggle}
          onExpand={onExpand}
        />
      ))}

      <span
        className={cn(
          CHIP,
          'ms-1 flex shrink-0 items-center gap-1 self-center px-1 py-0.5',
          !interactive && 'invisible',
        )}
      >
        {derived ? (
          <button
            type="button"
            onClick={() => onExpand(id)}
            aria-label={m.recipe.stopCrafting(info.name)}
            title={m.recipe.stopCraftingHint}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onAdjust(id, -1)}
              aria-label={count > 1 ? m.recipe.oneFewer(info.name) : m.recipe.removeTarget(info.name)}
              title={count > 1 ? m.recipe.oneFewerHint : m.recipe.removeTargetHint}
              className="text-muted-foreground hover:text-destructive"
            >
              <Minus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAdjust(id, 1)}
              aria-label={m.recipe.oneMore(info.name)}
              title={m.recipe.oneMoreHint}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * The visible half of the drag region.
 *
 * There is no panel to grab any more, so this is the whole affordance — and
 * the reason it and the buttons share `CHIP`: they are the parts of a line you
 * reach for, as opposed to the parts you read.
 */
function Grip({ hidden }: { hidden?: boolean }) {
  return (
    <span className={cn(CHIP, 'flex shrink-0 self-center py-0.5', hidden && 'invisible')}>
      <GripVertical className="size-3 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

/**
 * One ingredient: icon, `have/needed`, name.
 *
 * Clicking ticks it off. The counter only sees what dropped while the tracker
 * was watching, so there has to be a way to say "I already have these" that
 * does not involve lying to the count — hence a strike-through the player owns
 * rather than a number the panel invents.
 */
function IngredientTile({
  row,
  interactive,
  craftable,
  items,
  m,
  onToggle,
  onExpand,
}: {
  row: RequirementProgress;
  interactive: boolean;
  /** It has a recipe, so it is only a material here because the player said so. */
  craftable: boolean;
  items: ItemTable;
  m: Messages;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
}) {
  const info = items.get(row.id);
  const shown = Math.min(row.have, row.count);

  return (
    <span className="relative">
      {/* The way back from an omitted step: a material that *could* be crafted
          offers to become a line again. Only while the mouse can reach it —
          over the game it would be one more thing in the way. */}
      {interactive && craftable && (
        <button
          type="button"
          onClick={() => onExpand(row.id)}
          aria-label={m.recipe.craftInstead(info.name)}
          title={m.recipe.craftInsteadHint}
          className={cn(CHIP, 'absolute -start-1 -top-1 z-10 p-0.5 text-muted-foreground hover:text-foreground')}
        >
          <Hammer className="size-4" />
        </button>
      )}
    <button
      type="button"
      onClick={() => onToggle(row.id)}
      // Not disabled while click-through: the window itself is transparent to
      // the mouse, and a disabled button would only dim the text as well.
      title={interactive ? m.recipe.tickHint(info.name, row.have, row.count) : info.name}
      aria-label={m.recipe.ingredient(info.name, row.have, row.count)}
      aria-pressed={row.done}
      className={cn('rounded', interactive && 'hover:bg-white/10')}
    >
      <Tile
        icon={info.icon}
        name={info.name}
        quality={info.quality}
        struck={row.done}
        badge={
          <>
            {/* Held is the half that moves and the half that is grey; the
                target is the constant you stop reading. */}
            <span className="text-muted-foreground">{shown}</span>
            <span className={row.done ? 'text-primary' : 'text-gold'}>/{row.count}</span>
          </>
        }
      />
    </button>
    </span>
  );
}

/**
 * The shape every tile shares: icon, a badge over its corner, name beneath.
 *
 * Fixed width, because a row of tiles that each size to their own name is a
 * ragged line the eye cannot scan — and the name is the part that may be
 * clipped, since the icon above it has already said which item this is.
 */
function Tile({
  icon,
  name,
  quality,
  badge,
  struck,
  className,
}: {
  icon: string;
  name: string;
  quality: number;
  badge: React.ReactNode;
  struck?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        `flex ${TILE_W} shrink-0 flex-col items-center gap-px p-px`,
        struck && 'opacity-45',
        className,
      )}
    >
      <span className={`relative ${ICON}`}>
        <img src={iconUrl(icon)} alt="" className="size-full rounded-sm object-cover" loading="lazy" />
        {struck && (
          // Drawn across the icon as well as the name: at a glance the icon is
          // the thing being read, so it is the thing that has to look done.
          <span className="absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-foreground/70" />
        )}
        <Name name={name} quality={quality} struck={struck} />
      </span>

      {/* Under the picture, not in its corner: the count is the one thing on a
          tile that changes, so it gets a line to itself where nothing can end
          up drawn over it. */}
      <span className={`hud-text-outline ${COUNT_TEXT} font-bold leading-none tabular-nums`}>{badge}</span>
    </span>
  );
}

/**
 * An item's name, sitting in the bottom of its own icon.
 *
 * Inside the picture rather than beneath it, because a caption below would add
 * its height to every tile on the line — and the icon has already been
 * recognised by the time anyone reads the words on it.
 *
 * One word to a line and never truncated: an ellipsis on a tile this narrow
 * eats most of the name, and "Frostproof…" and "Frostbloom…" are the same
 * string. The stack is clipped to the icon rather than allowed to grow out of
 * it, so a five-word name costs its own top line instead of everyone else's
 * layout.
 */
function Name({ name, quality, struck }: { name: string; quality: number; struck?: boolean }) {
  return (
    <span className="absolute inset-0 flex flex-col justify-end overflow-hidden rounded-sm">
      <span
        className={cn(
          `hud-text-outline flex flex-col items-center px-px text-center ${NAME_TEXT} leading-none font-semibold`,
          struck && 'line-through',
        )}
        style={{ color: qualityColor(quality) }}
      >
        {name
          .split(/\s+/)
          .filter(Boolean)
          .map((word, index) => (
            <span key={`${word}-${index}`} className="max-w-full break-words">
              {word}
            </span>
          ))}
      </span>
    </span>
  );
}
