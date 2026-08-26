import { BUILTIN_PREFIX } from '@core/sounds.ts';

/**
 * The sounds that ship in the box.
 *
 * A glob rather than a list of imports, so adding one is dropping an mp3 into
 * `assets/sounds/` — no registry to remember, and the settings menu grows a row
 * on its own. The file's name without the extension is its `builtin:` name, so
 * `coins.mp3` is `builtin:coins` and renaming a file breaks the bindings that
 * point at it. Keep them short and stable.
 *
 * Inlined as data URLs rather than emitted as files, and this is the one place
 * that decision is worth restating: a packaged renderer is loaded with
 * `loadFile`, its origin is `file:`, and Chromium refuses `fetch` there
 * whatever the CSP says — which `decodeAudioData` needs bytes from. The icons
 * beside them can be plain files because an `<img>` is not a fetch. Base64
 * costs a third on top of the file, so this is for short notification sounds
 * and not for music.
 */
const files = import.meta.glob('../../../assets/sounds/*.mp3', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>;

const named = Object.entries(files).map(([path, url]) => {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return [file.slice(0, file.lastIndexOf('.')), url] as const;
});

/** `name` -> `data:audio/mpeg;base64,…`. Keyed without the `builtin:` prefix. */
export const BUILTIN_URLS: Record<string, string> = Object.fromEntries(named);

/**
 * Every built-in reference, sorted, for the menus that offer them.
 *
 * Sorted by name rather than left in whatever order the glob returned: this is
 * a list somebody reads down, and a build that reshuffles it is a menu whose
 * items move.
 */
export const BUILTIN_REFS: string[] = named
  .map(([name]) => `${BUILTIN_PREFIX}${name}`)
  .sort((a, b) => a.localeCompare(b));
