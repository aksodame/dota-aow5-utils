import { useCallback, useEffect, useState } from 'react';
import { OPACITY, UI_SCALE, type OverlayId, type TrackerConfig } from '@core/ipc.ts';
import { accelerator, DEFAULT_SHORTCUTS, shortcutLabel, type Shortcuts } from '@core/shortcuts.ts';
import { DEFAULT_STYLE, type TrackerStyle } from '@core/style.ts';

/**
 * Everything about the window this renderer is drawing into.
 *
 * The window's own state — its config, whether the mouse can reach it, whether
 * it is collapsed — as opposed to the session it happens to be showing. Both
 * overlays get exactly this, which is why it is a hook and not part of the farm
 * HUD's code.
 */

/**
 * Root font size at scale 1.
 *
 * Everything in the overlay is sized in rem — Tailwind's spacing, text and
 * radius scales all are — so this one number, times `uiScale`, is the size of
 * the entire UI. 24px is 1.5x the browser default, which is the size the
 * overlay is meant to be read at from across a desk with a game behind it.
 */
export const BASE_FONT_PX = 24;

/**
 * How much of its fill `.hud-panel` paints at the top of the slider.
 *
 * The frosted slab is never quite solid even at 100% — the value is the one in
 * `styles.css`, and the slider scales it rather than replacing it, so the top
 * of the range still looks like the design. Turning transparency off is the
 * one thing that goes past it, all the way to opaque.
 */
const PANEL_ALPHA = 82;

export interface OverlayChrome {
  id: OverlayId;
  /** Null until the first config arrives, which is within a frame of load. */
  config: TrackerConfig | null;
  /** The mouse can reach the window: the hotkey has been pressed. */
  interactive: boolean;
  collapsed: boolean;
  toggleCollapsed: () => void;
  setScale: (next: number) => void;
  setOpacity: (next: number) => void;
  setTransparentBackground: (next: boolean) => void;
  setStyle: (next: TrackerStyle) => void;
}

export function useOverlay(): OverlayChrome {
  const id = window.tracker.overlay;
  const [config, setConfig] = useState<TrackerConfig | null>(null);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const api = window.tracker;
    const offConfig = api.onConfig(setConfig);
    const offInteractive = api.onInteractive(setInteractive);
    void api.getConfig().then(setConfig);
    return () => {
      offConfig();
      offInteractive();
    };
  }, []);

  const scale = config?.uiScale ?? UI_SCALE.default;

  /*
   * Applied to the document element rather than to a wrapper div, because the
   * rem unit resolves against the root and nothing else. A scale on a container
   * would move its padding and leave every child's type behind.
   */
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(scale));
  }, [scale]);

  /*
   * Transparency, in full.
   *
   * Nothing in main touches the window's own opacity any more, so this is the
   * only place the setting is applied: an alpha on the slab the readout sits
   * on. Off, the slab is painted solid and the game stops showing through it
   * entirely; on, it thins out to whatever the slider says while the numbers
   * above it stay at full contrast.
   */
  const opacity = config?.opacity ?? OPACITY.default;
  const panelAlpha = config?.transparentBackground === false ? 100 : PANEL_ALPHA * opacity;

  useEffect(() => {
    document.documentElement.style.setProperty('--hud-panel-alpha', `${panelAlpha.toFixed(2)}%`);
  }, [panelAlpha]);

  /*
   * The skin, as an attribute on the root element.
   *
   * `styles.css` defines the palette once on `:root` and overrides it under
   * `[data-style='torchlight']`, so switching is one attribute write and no
   * remount — the same trick `--ui-scale` and `--hud-panel-alpha` above use,
   * and for the same reason: these are settings the player judges by looking at
   * the result, so the result has to keep up with the click.
   */
  const style = config?.style ?? DEFAULT_STYLE;

  useEffect(() => {
    document.documentElement.dataset['style'] = style;
  }, [style]);

  const collapsed = config?.overlays[id]?.collapsed ?? false;

  const toggleCollapsed = useCallback(() => {
    void window.tracker.setCollapsed(!collapsed);
  }, [collapsed]);

  const setScale = useCallback((next: number) => void window.tracker.setConfig({ uiScale: next }), []);
  const setOpacity = useCallback((next: number) => void window.tracker.setConfig({ opacity: next }), []);
  const setTransparentBackground = useCallback(
    (next: boolean) => void window.tracker.setConfig({ transparentBackground: next }),
    [],
  );
  const setStyle = useCallback((next: TrackerStyle) => void window.tracker.setConfig({ style: next }), []);

  return {
    id,
    config,
    interactive,
    collapsed,
    toggleCollapsed,
    setScale,
    setOpacity,
    setTransparentBackground,
    setStyle,
  };
}

/**
 * Ctrl +/-/0 while the overlay has focus.
 *
 * A convenience duplicating the Ctrl+Alt+ global bindings main registers: those
 * work whether or not the window is focused, these are what a person actually
 * reaches for once they have clicked into the panel to configure it.
 */
export function useScaleShortcuts(scale: number, setScale: (next: number) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === '=' || event.key === '+') setScale(scale + UI_SCALE.step);
      else if (event.key === '-' || event.key === '_') setScale(scale - UI_SCALE.step);
      else if (event.key === '0') setScale(UI_SCALE.default);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scale, setScale]);
}

/**
 * What to call the focus chord in the hint at the bottom of every overlay.
 *
 * One place, because there are four windows drawing that line and the whole
 * point of a rebindable key is that the hint follows it — a panel still saying
 * `Ctrl+Alt+T` after somebody moved it to `Alt+G` is worse than no hint, since
 * it is a wrong instruction rather than a missing one.
 *
 * `DEFAULT_SHORTCUTS` for the frame before the config arrives over IPC: that is
 * what a fresh profile will turn out to have, and it is the least surprising
 * thing to show for the one frame it is on screen.
 */
export function focusHotkey(config: { shortcuts?: Shortcuts } | null): string {
  return shortcutLabel(accelerator(config?.shortcuts ?? DEFAULT_SHORTCUTS, 'focus'));
}
