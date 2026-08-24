/**
 * Which language the tracker speaks, and how it decides.
 *
 * In `core/` rather than in `src/` because both processes need it: the renderer
 * picks its strings and its item names with it, and `electron/config.ts` has to
 * be able to sanitise a saved value without importing anything from the React
 * tree. Browser-safe, like everything else here — no `node:` imports and no I/O.
 *
 * Three languages, and they are the three the *game* has an opinion about. The
 * addon ships tokens in every Steam language, but the extracted tables carry
 * English, Russian and Simplified Chinese, and a half-translated overlay —
 * chrome in one language, item names in another — is worse than an English one.
 * So the list here and `meta.languages` in `aow5-shared` are meant to move
 * together: adding a fourth is a line here, a catalog in `src/i18n/`, and a
 * language in the extraction config.
 */

export const LOCALES = ['en', 'ru', 'zh'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * What the player chose, which is not the same as what they get.
 *
 * `auto` is the default and means "whatever Windows is set to", resolved once
 * per window against `app.getLocale()`. It is a stored value rather than a
 * resolution written into the file at first launch, so a machine whose display
 * language changes follows it instead of staying on whatever it was the day the
 * tracker was installed.
 */
export type LanguageSetting = 'auto' | Locale;

const KNOWN = new Set<string>(LOCALES);

export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && KNOWN.has(value);

/**
 * Reads the saved setting, and never fails.
 *
 * Same contract as every other reader in `electron/config.ts`: an older build's
 * value, a hand edit and a language that no longer exists all have to end in a
 * running app rather than in a validation error.
 */
export function readLanguage(raw: unknown): LanguageSetting {
  return raw === 'auto' || isLocale(raw) ? raw : 'auto';
}

/**
 * The language to actually draw in.
 *
 * `system` is a BCP 47 tag as Electron reports it — `ru`, `ru-RU`, `zh-CN`,
 * `zh-Hans-CN`. Only the primary subtag is consulted, because the difference
 * between `ru` and `ru-RU` is not a difference this app has strings for.
 *
 * Chinese is the one that needs care: the extracted names are Simplified, so
 * `zh-CN` and `zh-Hans` are exactly right, while `zh-TW` and `zh-Hant` would
 * get Simplified text under a Traditional locale. That is still better than
 * English for a reader of either script — the addon is a Chinese map and its
 * item names are what they would see in game — so every `zh-*` resolves here,
 * and Traditional is a fourth entry in `LOCALES` on the day the extraction
 * emits `tchinese`.
 */
export function resolveLocale(setting: LanguageSetting, system: string): Locale {
  if (setting !== 'auto') return setting;
  const primary = system.toLowerCase().split(/[-_]/)[0] ?? '';
  return isLocale(primary) ? primary : 'en';
}
