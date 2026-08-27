import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { UI_SCALE, type SessionSnapshot, type TrackerStatus, type UpdateState } from '@core/ipc.ts';
import { pricing } from '@/features/items/prices';
import { ChromeButton } from '@/shell/ChromeButton';
import { OverlayShell } from '@/shell/OverlayShell';
import { focusHotkey, useOverlay, useScaleShortcuts } from '@/shell/useOverlay';
import { useMessages } from '@/i18n';
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
  const m = useMessages();
  const { config, interactive, setScale, setOpacity, setTransparentBackground, setStyle } = useOverlay();
  const [session, setSession] = useState<SessionSnapshot>({ rooms: [], skipped: [] });
  /**
   * Whether the feed is actually reading anything.
   *
   * It used to be a chip in the HUD's title bar, which put a diagnostic in the
   * one place that is meant to be nothing but numbers. It belongs here, beside
   * the log path it is a fact about.
   */
  const [status, setStatus] = useState<TrackerStatus | null>(null);
  /**
   * Where the updater is.
   *
   * Pushed rather than polled: the steps are a check, a download and a
   * restart, and the middle one reports a percentage several times a second.
   * Main sends the current state to every window as it loads, so this is null
   * only for the instant before the first message arrives.
   */
  const [update, setUpdate] = useState<UpdateState | null>(null);

  const scale = config?.uiScale ?? UI_SCALE.default;
  useScaleShortcuts(scale, setScale);

  const prices = useMemo(() => pricing(config?.prices, config?.halvePrices), [config?.prices, config?.halvePrices]);

  useEffect(() => window.tracker.onStatus(setStatus), []);

  // Subscribe first, then ask: a window reloaded mid-download would otherwise
  // sit empty until the next progress event — and once the update is staged
  // there are no more of those.
  useEffect(() => {
    const off = window.tracker.onUpdate(setUpdate);
    void window.tracker.getUpdate().then(setUpdate);
    return off;
  }, []);

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
          {m.window.brand} <span className="text-muted-foreground">{m.window.settings}</span>
        </span>
      }
      // A page of controls, not a readout: there is no one-line version of it,
      // and the height is whatever the user dragged the window to.
      collapsed={false}
      fitsContent={false}
      interactive={interactive}
      hotkey={focusHotkey(config)}
      actions={
        <ChromeButton label={m.common.close} onClick={close} className="hover:text-destructive">
          <X className="size-3.5" />
        </ChromeButton>
      }
    >
      <Settings
        config={config}
        status={status}
        rooms={session.rooms}
        skipped={session.skipped}
        update={update}
        pricing={prices}
        onScale={setScale}
        onOpacity={setOpacity}
        onTransparentBackground={setTransparentBackground}
        onStyle={setStyle}
      />
    </OverlayShell>
  );
}
