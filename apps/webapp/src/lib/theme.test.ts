import assert from 'node:assert/strict';
import test from 'node:test';
import { THEME_COLOR, THEME_KEY, THEMES, detectTheme, isTheme, otherTheme, storeTheme } from './theme.ts';

/** A localStorage stand-in, or one that refuses — private mode's behaviour. */
function fakeWindow(initial: string | null, { blocked = false } = {}) {
  const store = new Map<string, string>();
  if (initial !== null) store.set(THEME_KEY, initial);
  return {
    store,
    localStorage: {
      getItem(key: string) {
        if (blocked) throw new Error('blocked');
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (blocked) throw new Error('blocked');
        store.set(key, value);
      },
    },
  };
}

function withWindow<T>(value: unknown, run: () => T): T {
  const had = 'window' in globalThis;
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = value;
  try {
    return run();
  } finally {
    if (had) (globalThis as { window?: unknown }).window = previous;
    else delete (globalThis as { window?: unknown }).window;
  }
}

test('only the two themes are themes', () => {
  assert.ok(isTheme('dark'));
  assert.ok(isTheme('light'));
  // Anything else is data drift — an old key, a hand-edited storage entry — and
  // has to fall through to the default rather than reach the attribute.
  assert.ok(!isTheme('system'));
  assert.ok(!isTheme(''));
  assert.ok(!isTheme(undefined));
});

test('a stored choice is what the page opens in', () => {
  for (const theme of THEMES) {
    assert.equal(withWindow(fakeWindow(theme), detectTheme), theme);
  }
});

test('no stored choice, or an unreadable one, is dark', () => {
  // Dark rather than the system preference: it is the palette the site is
  // designed in, so it is also the right answer when nothing is known.
  assert.equal(withWindow(fakeWindow(null), detectTheme), 'dark');
  assert.equal(withWindow(fakeWindow('sepia'), detectTheme), 'dark');
});

test('storage being blocked costs the choice, not the render', () => {
  const win = fakeWindow('light', { blocked: true });
  assert.equal(withWindow(win, detectTheme), 'dark');
  // And writing one throws nowhere: the theme holds for this page and is simply
  // not there on the next load.
  withWindow(win, () => storeTheme('light'));
});

test('a stored theme is read back by the same key the snippet uses', () => {
  const win = fakeWindow(null);
  withWindow(win, () => storeTheme('light'));
  assert.equal(win.store.get(THEME_KEY), 'light');
  assert.equal(withWindow(win, detectTheme), 'light');
});

test('the switch is a pair', () => {
  assert.equal(otherTheme('dark'), 'light');
  assert.equal(otherTheme('light'), 'dark');
});

test('every theme has a chrome tint', () => {
  // The `theme-color` meta tag has to match the page background in both, or a
  // phone paints a bar in the other theme above it.
  for (const theme of THEMES) {
    assert.match(THEME_COLOR[theme], /^#[0-9a-f]{6}$/);
  }
  assert.notEqual(THEME_COLOR.dark, THEME_COLOR.light);
});
