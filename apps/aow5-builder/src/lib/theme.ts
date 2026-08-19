export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'aow5.theme';

/**
 * The stored choice, or the system preference when there isn't one.
 *
 * Kept in sync with the inline script in index.html, which applies the same
 * rule before first paint so the page never flashes the wrong theme. If this
 * logic changes, change it there too.
 */
export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage can be blocked; fall through to the system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode; the choice just will not persist.
  }
}
