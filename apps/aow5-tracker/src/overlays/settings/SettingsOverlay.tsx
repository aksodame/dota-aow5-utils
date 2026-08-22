import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { UI_SCALE, type SessionSnapshot, type TrackerStatus } from '@core/ipc.ts';
import { Button } from '@/components/ui/button';
import { pricing } from '@/features/items/prices';
import { OverlayShell } from '@/shell/OverlayShell';
import { useOverlay, useScaleShortcuts } from '@/shell/useOverlay';
import { Settings } from './Settings';

/**
 * Settings, in a window of its own.
 *
 * It used to be a second view inside the farm HUD, which put it in the worst
 * possible place: changing the overlay's size or opacity resized and repainted
 * the panel the controls were sitting in, and reading the per-room table meant
 * covering the game with the thing that is supposed to sit quietly over it.
 *
 * Like history it is a window you ask for, never click-through, and a
 * singleton — so the HUD's settings button opens it or brings it forward.
 */

/**
 * How often the session numbers are re-read from main, in ms.
 *
 * They only change when a run ends, which is minutes apart, so this is about
 * not looking stale rather than about keeping up. A poll rather than a
 * subscription because it costs one small array and saves a channel.
 */
const REFRESH = 2000;

export function SettingsOverlay() {
  const { config, interactive, setScale, setOpacity, setTransparentBackground } = useOverlay();
  const [session, setSession] = useState<SessionSnapshot>({ rooms: [], skipped: [] });
  /**
   * Whether the feed is actually reading anything.
   *
   * It used to be a chip in the HUD's title bar, which put a diagnostic in the
   * one place that is meant to be nothing but numbers. It belongs here, beside
   * the log path it is a fact about.
   */
  const [status, setStatus] = useState<TrackerStatus | null>(null);

  const scale = config?.uiScale ?? UI_SCALE.default;
  useScaleShortcuts(scale, setScale);

  const prices = useMemo(() => pricing(config?.prices, config?.halvePrices), [config?.prices, config?.halvePrices]);

  useEffect(() => window.tracker.onStatus(setStatus), []);

  useEffect(() => {
    let live = true;
    const read = () => void window.tracker.getSession().then((next) => live && setSession(next));
    read();
    const timer = setInterval(read, REFRESH);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const close = useCallback(() => void window.tracker.close(), []);

  return (
    <OverlayShell
      title={
        <span className="font-semibold tracking-wide uppercase">
          AOW5 <span className="text-muted-foreground">settings</span>
        </span>
      }
      // A page of controls, not a readout: there is no one-line version of it,
      // and the height is whatever the user dragged the window to.
      collapsed={false}
      fitsContent={false}
      interactive={interactive}
      hotkey={config?.hotkey ?? 'Ctrl+Alt+T'}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-destructive"
          onClick={close}
          aria-label="Close settings"
          title="Close"
        >
          <X className="size-3.5" />
        </Button>
      }
    >
      <Settings
        config={config}
        status={status}
        rooms={session.rooms}
        skipped={session.skipped}
        pricing={prices}
        onScale={setScale}
        onOpacity={setOpacity}
        onTransparentBackground={setTransparentBackground}
      />
    </OverlayShell>
  );
}
