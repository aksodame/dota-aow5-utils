import { useCallback, useMemo } from 'react';
import { History as HistoryIcon, Pause, Play, RotateCcw, Settings2, Skull, X } from 'lucide-react';
import { UI_SCALE } from '@core/ipc.ts';
import { pricing } from '@/features/items/prices';
import { useSession } from '@/features/session/useSession';
import { useDropSounds } from '@/features/sounds/useDropSounds';
import { ChromeButton } from '@/shell/ChromeButton';
import { OverlayShell } from '@/shell/OverlayShell';
import { useOverlay, useScaleShortcuts } from '@/shell/useOverlay';
import { Hud } from './Hud';
import { StateLine } from './StateLine';

/**
 * The farm HUD.
 *
 * Two modes, driven from the main process: click-through while playing, and
 * interactive when the hotkey is pressed. The chrome (drag handle, collapse,
 * settings, quit) only does anything in interactive mode — while playing it is
 * just numbers.
 *
 * The shell owns the window: the panel, the collapse toggle, the resize grip.
 * What is left here is what the farm overlay is actually about — which is now
 * only the readout: settings and history are both windows you ask for.
 */

export function FarmOverlay() {
  const { config, interactive, collapsed, toggleCollapsed, setScale } = useOverlay();
  const prices = useMemo(() => pricing(config?.prices, config?.halvePrices), [config?.prices, config?.halvePrices]);
  const { state, rates, items, runItems, elapsed, paused, lastRunDead, clearSession, togglePaused, toggleLastRunDied } =
    useSession(prices.value);

  const scale = config?.uiScale ?? UI_SCALE.default;
  useScaleShortcuts(scale, setScale);

  // Here rather than in the shell: this is the window that watches the feed,
  // and a second window ringing the same drop would be an echo.
  useDropSounds(config?.sounds ?? null);

  /** Restart: a fresh session on screen and a fresh one in the archive. */
  const restart = useCallback(() => {
    clearSession();
    void window.tracker.newSession();
  }, [clearSession]);

  const actions = (
    <>
      {/* Only the clock stops. Loot still counts while it is paused — the
          button says "this stretch was not farming", not "stop tracking". */}
      <ChromeButton
        label={paused ? 'Start the session clock' : 'Pause the session clock — loot still counts'}
        onClick={togglePaused}
        className={paused ? 'text-primary hover:text-primary' : undefined}
      >
        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      </ChromeButton>
      <ChromeButton label="Start a new session — the numbers go back to zero" onClick={restart}>
        <RotateCcw className="size-3.5" />
      </ChromeButton>
      {/* The one thing the game does not tell the tracker. A room you died in
          reports the same loot lines as one you cleared, so without this the
          session counts a wipe as a good run. Lit while the mark is on, and
          pressing it again takes the loot back. */}
      <ChromeButton
        label={
          lastRunDead
            ? 'Undo — count the last room again'
            : 'Died here — drop this room’s loot from the session, keep the time'
        }
        onClick={toggleLastRunDied}
        className={lastRunDead ? 'text-destructive hover:text-destructive' : 'hover:text-destructive'}
      >
        <Skull className="size-3.5" />
      </ChromeButton>
      {/* A window of its own, and a singleton: pressing this while it is
          already up brings that one forward rather than opening a second. */}
      <ChromeButton label="History" onClick={() => void window.tracker.open('history')}>
        <HistoryIcon className="size-3.5" />
      </ChromeButton>
      {/* A window like history, and a singleton for the same reason: two copies
          of the settings would be two answers to the same question. */}
      <ChromeButton label="Settings" onClick={() => void window.tracker.open('settings')}>
        <Settings2 className="size-3.5" />
      </ChromeButton>
      <ChromeButton
        label="Quit the tracker"
        onClick={() => void window.tracker.quit()}
        className="hover:text-destructive"
      >
        <X className="size-3.5" />
      </ChromeButton>
    </>
  );

  return (
    <OverlayShell
      title={
        <span className="font-semibold tracking-wide uppercase">
          AOW5 <span className="text-muted-foreground">tracker</span>
        </span>
      }
      actions={actions}
      // The room, on the row the chrome leaves empty while you are playing.
      idle={<StateLine room={state.current?.room ?? null} runs={rates.completedRuns} />}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      // Only the collapsed cards are a fixed height. The loot list scrolls,
      // and wants the height the window was dragged to.
      fitsContent={collapsed}
      interactive={interactive}
      hotkey={config?.hotkey ?? 'Ctrl+Alt+T'}
    >
      <Hud
        rates={rates}
        items={runItems}
        sessionItems={items}
        elapsed={elapsed}
        pricing={prices}
        tracked={config?.tracked ?? []}
        cardsOnly={collapsed}
      />
    </OverlayShell>
  );
}
