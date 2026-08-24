import type { ComponentType } from 'react';
import type { OverlayId } from '@core/ipc.ts';
import { FarmOverlay } from '@/overlays/farm/FarmOverlay';
import { HistoryOverlay } from '@/overlays/history/HistoryOverlay';
import { RecipeOverlay } from '@/overlays/recipe/RecipeOverlay';
import { SettingsOverlay } from '@/overlays/settings/SettingsOverlay';
import { I18nProvider } from '@/i18n';

/**
 * Which overlay this window is.
 *
 * Every window loads this same bundle and is told which one it is by the URL
 * main opened it with; the preload turns that into `window.tracker.overlay`.
 * A fifth is a line here, an id in `OVERLAY_IDS` and a spec in `OVERLAY_SPEC`
 * — nothing else, which is what settings becoming a window of its own cost.
 */
const OVERLAYS: Record<OverlayId, ComponentType> = {
  farm: FarmOverlay,
  recipe: RecipeOverlay,
  history: HistoryOverlay,
  settings: SettingsOverlay,
};

/**
 * The provider wraps every window rather than only the ones with prose in them.
 *
 * All four say something — the recipe panel's are all tooltips and aria labels,
 * which is exactly the text a translation is for — and a language that applied
 * to three windows out of four would be worse than none.
 */
export default function App() {
  const Overlay = OVERLAYS[window.tracker.overlay];
  return (
    <I18nProvider>
      <Overlay />
    </I18nProvider>
  );
}
