import { useCallback, useMemo } from 'react';
import { History as HistoryIcon, RotateCcw, Settings2, X } from 'lucide-react';
import { UI_SCALE } from '@core/ipc.ts';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { pricing } from '@/features/items/prices';
import { useSession } from '@/features/session/useSession';
import { OverlayShell } from '@/shell/OverlayShell';
import { useOverlay, useScaleShortcuts } from '@/shell/useOverlay';
import { cn } from '@/lib/utils';
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
  const { state, rates, items, status, clearSession } = useSession(prices.value);

  const scale = config?.uiScale ?? UI_SCALE.default;
  useScaleShortcuts(scale, setScale);

  /** Restart: a fresh session on screen and a fresh one in the archive. */
  const restart = useCallback(() => {
    clearSession();
    void window.tracker.newSession();
  }, [clearSession]);

  const badges = (
    <>
      {/*
        Which feed is running, but only when that is news.
        `mock` is scaffolding until the game emits events, so it belongs in a
        development build; a failing console tail is worth saying in any build,
        because an overlay showing zeros looks identical to a broken one.
      */}
      {import.meta.env.DEV ? (
        <button
          type="button"
          onClick={() => void window.tracker.setConfig({ source: status.source === 'mock' ? 'console' : 'mock' })}
          title={`${status.detail} — click to switch source`}
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[0.625rem]',
            status.error
              ? 'bg-destructive/25 text-destructive'
              : status.source === 'mock'
                ? 'bg-primary/25 text-primary'
                : 'bg-white/10 text-muted-foreground',
          )}
        >
          {status.source}
        </button>
      ) : (
        status.error && (
          <span className="shrink-0 rounded bg-destructive/25 px-1.5 py-0.5 text-[0.625rem] text-destructive" title={status.detail}>
            {status.source}
          </span>
        )
      )}
    </>
  );

  const actions = (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={restart}
        aria-label="Restart session"
        title="Restart session"
      >
        <RotateCcw className="size-3.5" />
      </Button>
      {/* A window of its own, and a singleton: pressing this while it is
          already up brings that one forward rather than opening a second. */}
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={() => void window.tracker.open('history')}
        aria-label="History"
        title="History"
      >
        <HistoryIcon className="size-3.5" />
      </Button>
      {/* A window like history, and a singleton for the same reason: two copies
          of the settings would be two answers to the same question. */}
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={() => void window.tracker.open('settings')}
        aria-label="Settings"
        title="Settings"
      >
        <Settings2 className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-destructive"
        onClick={() => void window.tracker.quit()}
        aria-label="Quit"
        title="Quit"
      >
        <X className="size-3.5" />
      </Button>
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <OverlayShell
        title={
          <span className="font-semibold tracking-wide uppercase">
            AOW5 <span className="text-muted-foreground">tracker</span>
          </span>
        }
        badges={badges}
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
          items={items}
          pricing={prices}
          tracked={config?.tracked ?? []}
          cardsOnly={collapsed}
        />
      </OverlayShell>
    </TooltipProvider>
  );
}
