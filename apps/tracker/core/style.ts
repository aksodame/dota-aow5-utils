/**
 * How the readout is drawn — which is a layout, not a colour scheme.
 *
 * The first cut of this treated a style as a block of CSS tokens over one fixed
 * arrangement. That was too small a hinge. The two styles do not agree about
 * what the panel *is*: the minimal one is a grid of six equal cards, where the
 * Torchlight one is a single headline number with everything else demoted to
 * pairs, boxes and one inline strip beneath it. No amount of recolouring gets
 * from one to the other.
 *
 * So a style names two things, and `src/overlays/farm/layouts/` is where they
 * are paired up:
 *
 *   1. **A layout component.** Registered in `HUD_LAYOUTS`, taking the same
 *      props every layout takes. Adding a third theme is a component and a line
 *      in that record — the registry is the whole extension point, and nothing
 *      outside it branches on the style.
 *   2. **A token block.** `:root[data-style='…']` in `src/styles.css`, which the
 *      shell selects by writing one attribute on the root element. Layouts are
 *      written against the tokens rather than against literal colours, so a
 *      theme that only wants to repaint an existing layout can still be exactly
 *      that: a token block and a reused component.
 *
 * What a style may *not* change is the numbers, the item rarity colours, or
 * which cards the player has turned on. A skin that recoloured rarity would be
 * a skin that lies about the loot, and a skin that ignored the card list would
 * make that setting mean different things in different themes.
 *
 * In `core/` for the same reason `locale.ts` is: `electron/config.ts` has to
 * sanitise a saved value without importing anything from the React tree.
 */

export const TRACKER_STYLES = ['minimal', 'torchlight'] as const;

export type TrackerStyle = (typeof TRACKER_STYLES)[number];

/**
 * The overlay this tracker started as, and still the default.
 *
 * A frosted slab and nothing on it but the numbers. It is the quieter of the
 * two over a live game, which is what a HUD meant to stay up all evening should
 * be handed on a first launch — the other one is a choice.
 */
export const DEFAULT_STYLE: TrackerStyle = 'minimal';

const KNOWN = new Set<string>(TRACKER_STYLES);

export const isTrackerStyle = (value: unknown): value is TrackerStyle =>
  typeof value === 'string' && KNOWN.has(value);

/** Reads the saved style, and never fails. A name this build has never heard of is the default. */
export function readStyle(raw: unknown): TrackerStyle {
  return isTrackerStyle(raw) ? raw : DEFAULT_STYLE;
}
