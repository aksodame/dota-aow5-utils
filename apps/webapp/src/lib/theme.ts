/**
 * Which palette the site paints in.
 *
 * Two themes, and the split of work between this file and `index.html` is the
 * whole design: the snippet in the head applies the stored choice **before the
 * first paint**, and this is what changes it afterwards and what the settings
 * screen reads. If the two ever disagree about the attribute or the storage key,
 * the visible symptom is a white flash on every load for somebody who chose
 * light — so both names live here as exported constants and the snippet is
 * written against them.
 *
 * Dark is the default rather than the system preference's business: the game is
 * dark and the artwork is dark, so a visitor whose laptop is in light mode is
 * still better served by the palette the screenshots were taken in. The system
 * preference is honoured only as far as `color-scheme` goes — see `styles.css` —
 * and the choice here is an explicit one somebody makes on `/settings`.
 */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** The attribute the palette hangs off, on `<html>`. */
export const THEME_ATTR = 'data-theme';

/** Where the choice survives a reload. Also read by the snippet in `index.html`. */
export const THEME_KEY = 'aow5.theme';

/**
 * The browser-chrome tint per theme, which has to match the page's own
 * background or a phone draws a dark bar over a white page.
 *
 * These are `--surface` for each theme, written out because a `<meta>` tag
 * cannot hold a custom property. They are the one place a colour is duplicated
 * out of `styles.css`; change one and change the other.
 */
export const THEME_COLOR: Record<Theme, string> = {
  dark: '#050a18',
  light: '#eef2fa',
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** The other one. The switch is a pair, so a toggle needs no table. */
export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * The theme to open in: what they chose last, else dark.
 *
 * No `?theme=` counterpart to `?lang=`. A language travels with a link because
 * the reader of a shared build has to be able to read it; a palette is a
 * property of the person looking rather than of the thing being looked at, and
 * a link that silently repainted somebody's site would be a worse surprise than
 * a helpful one.
 */
export function detectTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Storage blocked. Dark, as for a first visit.
  }
  return 'dark';
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice holds for this page and does not survive a reload.
  }
}

/**
 * Put a theme on the document.
 *
 * Dark writes the attribute too rather than removing it, so the DOM always
 * states which theme is in force — "no attribute" is the pre-paint state and
 * should not be something the app can go back to. The meta tag moves with it
 * because the address bar is part of the page on a phone.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute(THEME_ATTR, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta !== null) meta.setAttribute('content', THEME_COLOR[theme]);
}
