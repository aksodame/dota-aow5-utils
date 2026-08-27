import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { SessionHistory } from '@core/history.ts';
import { pricing } from '@/features/items/prices';
import { ChromeButton } from '@/shell/ChromeButton';
import { OverlayShell } from '@/shell/OverlayShell';
import { focusHotkey, useOverlay, useScaleShortcuts } from '@/shell/useOverlay';
import { useMessages } from '@/i18n';
import { UI_SCALE } from '@core/ipc.ts';
import { HistoryView } from './HistoryView';

/**
 * The archive, in a window of its own.
 *
 * Split out of the farm HUD because it is not the same kind of thing: the HUD
 * is glanced at over a live game and the archive is read with the game paused
 * or closed, at a size the HUD would never want. Main keeps it a singleton, so
 * the button that opens it also brings it forward.
 *
 * Unlike the panels over the game this one is never click-through — a window
 * you opened on purpose and cannot click would be a bug — which `OVERLAY_SPEC`
 * arranges by leaving it out of the hotkey's reach.
 */
export function HistoryOverlay() {
  const m = useMessages();
  const { config, interactive, setScale } = useOverlay();
  const [sessions, setSessions] = useState<SessionHistory[] | null>(null);

  const scale = config?.uiScale ?? UI_SCALE.default;
  useScaleShortcuts(scale, setScale);

  // The archive stores ids and quantities, so it reprices itself every time it
  // is opened — including against prices the player set after the run.
  const prices = useMemo(() => pricing(config?.prices, config?.halvePrices), [config?.prices, config?.halvePrices]);

  const load = useCallback(() => {
    void window.tracker.getHistory().then(setSessions);
  }, []);

  // Read once on open, and again when asked. It only changes when a run ends,
  // and a window being read is not a window that needs to change under you.
  useEffect(load, [load]);

  const close = useCallback(() => void window.tracker.close(), []);

  return (
    <OverlayShell
      title={
        <span className="font-semibold tracking-wide uppercase">
          {m.window.brand} <span className="text-muted-foreground">{m.window.history}</span>
        </span>
      }
      // Nothing to collapse to: this window is the list, and a one-line version
      // of "everything you have ever farmed" is not a thing.
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
      <HistoryView sessions={sessions} pricing={prices} onRefresh={load} />
    </OverlayShell>
  );
}
