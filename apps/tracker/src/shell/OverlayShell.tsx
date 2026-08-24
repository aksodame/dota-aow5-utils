import { useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useMessages } from '@/i18n';
import { cn } from '@/lib/utils';
import { ChromeButton } from './ChromeButton';
import { ResizeGrip } from './ResizeGrip';
import { useContentSize } from './useContentSize';

/**
 * The frame every overlay window draws inside.
 *
 * It owns the four things that are true of any panel floating over the game and
 * have nothing to do with what the panel is about: the drag region, the
 * collapse toggle, the resize grip, and the hint that says which key makes the
 * whole thing clickable. The farm HUD passes its own title, chips and body; the
 * recipe panel passes its own and gets identical behaviour for free.
 *
 * The header is chrome, and chrome is only *shown* once the hotkey has made the
 * window clickable — while playing, the panel is the numbers and nothing else.
 * Its first row is held open regardless, with `invisible` rather than by not
 * rendering it: a title bar that appeared on a keypress would push the readout
 * down the screen every time, and a HUD you have to re-find after every glance
 * at the settings is worse than one with a blank strip along its top.
 *
 * The buttons are the exception, and knowingly so. They sit on a second row
 * that exists only while the window is interactive, so pressing the hotkey does
 * move the body down by a row — which is the price of giving seven icons enough
 * room to be hit accurately in a 340px window. The alternative was reserving
 * that row while playing too, and a permanently blank strip is a worse deal for
 * a panel whose whole job is to be small enough to leave up all evening.
 *
 * Collapsing is the body's business, not the shell's: what a collapsed farm HUD
 * shows is its cards, and what a collapsed recipe panel shows is its own
 * business too. All the shell does is pass the flag down and stop reserving
 * room for chrome that a collapsed panel does not want. When the body says it
 * fits its content the shell measures itself and the window follows, so a
 * shrunken panel really is a shorter window rather than a transparent
 * rectangle that still swallows hover.
 */

interface Props {
  /** Shown in the header, beside the chrome. */
  title: ReactNode;
  /** Buttons, drawn to the right of the collapse toggle. */
  actions?: ReactNode;
  /**
   * What the header row shows while the window is click-through.
   *
   * The chrome is invisible then and its row is empty, which is a strip of
   * panel paid for and not spent. A body with something worth one line — the
   * farm HUD's room — puts it here rather than taking a row of its own, and
   * loses it again the moment the chrome comes back, which is the moment the
   * player stopped looking at the readout.
   *
   * Omitted, the row stays blank and keeps its height, as before.
   */
  idle?: ReactNode;
  collapsed: boolean;
  /** Omitted by the windows that have nothing to collapse to, which hides the chevron. */
  onToggleCollapsed?: () => void;
  /**
   * The body is a fixed few rows, so the window should be exactly as tall.
   *
   * False for anything that scrolls — the loot list, settings, history — which
   * wants the height the user dragged the window to and a grip that can change
   * it.
   */
  fitsContent: boolean;
  interactive: boolean;
  /** Key combination that turns click-through off, for the footer hint. */
  hotkey: string;
  children: ReactNode;
}

export function OverlayShell({
  title,
  actions,
  idle,
  collapsed,
  onToggleCollapsed,
  fitsContent,
  interactive,
  hotkey,
  children,
}: Props) {
  const m = useMessages();
  const panel = useRef<HTMLDivElement | null>(null);

  // Only meaningful because the panel stops being `h-screen` below when it is
  // the one deciding — see the hook. The width stays the user's either way:
  // these panels are pages, and a page that resized itself sideways as its
  // contents changed would never sit still.
  useContentSize(panel, fitsContent ? 'height' : 'none');

  const toggle = onToggleCollapsed && (
    <ChromeButton
      label={collapsed ? m.shell.expand : m.shell.collapse}
      onClick={onToggleCollapsed}
    >
      {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
    </ChromeButton>
  );

  return (
    // Every overlay gets one, so a tooltip works wherever a ChromeButton is —
    // including the ones each window passes in as `actions`, which render
    // inside this tree rather than their own. Slow enough not to fire on a
    // pointer merely crossing the row on its way to the resize grip.
    <TooltipProvider delayDuration={400}>
    <div
      ref={panel}
      className={cn(
        'hud-panel relative flex flex-col gap-2 p-2 text-sm transition-shadow',
        // Sized by its content, or stretched to a window the user sized. See
        // the measuring effect above: which one it is decides whether the
        // measurement means anything.
        fitsContent ? 'h-fit' : 'h-screen',
        collapsed && 'gap-0 py-1',
        interactive && 'ring-2 ring-primary/60',
        // The window already stops forwarding the cursor while click-through,
        // so this is the belt to that pair of braces: it also drops whatever
        // hover the pointer was resting on at the moment the hotkey turned
        // interaction off, which would otherwise stay lit with no way to
        // clear it.
        !interactive && 'pointer-events-none',
      )}
    >
      {/* The title row has two occupants and never both: the chrome while the
          hotkey has made the window clickable, and the body's own one-liner
          while it has not. Either way it is one row of the same height, so
          nothing below it moves as they trade places — which is the whole
          reason the chrome is drawn-but-invisible rather than absent.

          The button row underneath is the part that does come and go. See the
          note at the top of this file for why that trade was worth making.

          `hud-drag` only when the chrome is really there: a drag region nobody
          can see is a window that moves by accident. */}
      {interactive || idle === undefined ? (
        <header className={cn('flex shrink-0 flex-col gap-1', interactive ? 'hud-drag' : 'invisible')}>
          <div className="flex items-center gap-1">
            <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[0.6875rem]">{title}</span>
          </div>

          {/* A row of their own, under the title rather than crowded against
              it. Seven icons and a name do not fit a 340px window side by
              side, and the ones that lost the argument were the buttons —
              squeezed to where the skull sat against the quit cross and a
              mis-aimed click cost you the session.

              Right-aligned so the gesture is the same one as before: the
              chrome lives in that corner, it has just moved down a line. */}
          <div className="hud-no-drag flex shrink-0 items-center justify-end gap-0.5">
            {toggle}
            {actions}
          </div>
        </header>
      ) : (
        <div className="flex shrink-0 items-center gap-1">{idle}</div>
      )}

      {children}

      {/* Outlined, because this is the one line that may end up drawn straight
          onto the game: the panel behind it goes as transparent as the user
          wants, and the hint has to stay readable when it does. Collapsed is
          meant to be the smallest thing that answers the question, so it does
          without — the key is on the expanded panel and in the tray.

          The same key, both ways round. It used to go blank once the panel was
          interactive, on the grounds that a hint about the hotkey has nothing
          to say to somebody who has just pressed it — which had it backwards.
          The way *out* is the part that is not obvious: the panel is clickable,
          the buttons work, and nothing on screen says how to hand the mouse
          back to the game. So the line stays, and answers whichever question is
          the live one. */}
      {!collapsed && (
        <footer className="hud-text-outline shrink-0 text-center text-[0.625rem] text-muted-foreground">
          {interactive ? m.shell.pinHint(hotkey) : m.shell.configureHint(hotkey)}
        </footer>
      )}

      {/* Resizing is a configuration gesture, so it appears with the rest of
          them — a grip while click-through is on could not be grabbed anyway.
          It drags width only while the window owns its own height: offering a
          vertical drag that the next measurement would undo is worse than not
          offering one. */}
      {interactive && <ResizeGrip axis={fitsContent ? 'x' : 'both'} />}
    </div>
    </TooltipProvider>
  );
}
