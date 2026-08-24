import type { ComponentType } from 'react';
import type { CardId } from '@core/cards.ts';
import { DEFAULT_STYLE, type TrackerStyle } from '@core/style.ts';
import type { ReadoutInput } from '../readout';
import { MinimalHud } from './MinimalHud';
import { TorchlightHud } from './TorchlightHud';

/**
 * The layout registry — the one place a style becomes a component.
 *
 * This is the extension point, and it is meant to be the only one. A third
 * theme is a file beside these two, an id in `TRACKER_STYLES`, a token block in
 * `styles.css` and a line in the record below; nothing else in the app branches
 * on which style is on, and nothing outside this directory imports a layout by
 * name.
 *
 * Every layout takes the same props and derives its numbers from the same
 * `useReadout`, so what a layout is free to decide is arrangement and nothing
 * else. That boundary is what keeps two skins from disagreeing about what the
 * session is worth — see `readout.tsx`.
 */

export interface HudLayoutProps extends ReadoutInput {
  /** Collapsed: the summary alone, sized to itself, with no loot list. */
  cardsOnly: boolean;
  /** Which cards the player has on. Never empty — see `core/cards.ts`. */
  cards: CardId[];
}

export type HudLayout = ComponentType<HudLayoutProps>;

export const HUD_LAYOUTS: Record<TrackerStyle, HudLayout> = {
  minimal: MinimalHud,
  torchlight: TorchlightHud,
};

/**
 * The layout for a style, falling back rather than failing.
 *
 * A style id can reach the renderer from a config file written by a newer
 * build. `readStyle` already turns an unknown one into the default on the way
 * in, so this is the second of the two guards — and the cheap one to keep,
 * because the failure it prevents is a farm overlay that renders nothing at all
 * over a live game.
 */
export const layoutFor = (style: TrackerStyle): HudLayout => HUD_LAYOUTS[style] ?? HUD_LAYOUTS[DEFAULT_STYLE];
