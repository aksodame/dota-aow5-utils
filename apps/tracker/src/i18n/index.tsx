import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resolveLocale, type LanguageSetting, type Locale } from '@core/locale.ts';
import { en, type Messages } from './en';
import { ru } from './ru';
import { zh } from './zh';

/**
 * The language this window is drawing in, and the words that come with it.
 *
 * A context rather than a module-level `t()` because the language is a setting:
 * it changes while the app is running, from a window that is not the one being
 * repainted, and every overlay has to follow within the same broadcast that
 * every other setting does. A module singleton would need a re-render pushed to
 * it by hand, which is the bug this exists to not have.
 *
 * The provider subscribes to config itself rather than being handed it. That is
 * a second `onConfig` listener per window — `useOverlay` has the other — and
 * knowingly so: threading a locale through every component between `App` and
 * the leaf that says a word is a worse trade than one extra IPC listener, which
 * costs a function call per broadcast.
 *
 * Resolution happens here and nowhere else. `config.language` is what the
 * player chose, which is usually `auto`; `window.tracker.systemLocale` is what
 * Windows is set to. Everything downstream sees a `Locale` that is one of three
 * real catalogs, so no component has to know that `auto` exists.
 */

const CATALOGS: Record<Locale, Messages> = { en, ru, zh };

interface I18n {
  locale: Locale;
  m: Messages;
}

/**
 * English until the first config arrives, which is within a frame of load.
 *
 * A default rather than `null`: every component here says a word, so a nullable
 * context would put a `?? ''` on each of them for the one frame before the
 * answer lands. The system locale is known synchronously — it rides in on the
 * preload — so the very first paint is already in the right language whenever
 * the setting is `auto`, which is the default.
 */
const FALLBACK: I18n = { locale: 'en', m: en };

const I18nContext = createContext<I18n>(FALLBACK);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Locale>(() => resolveLocale('auto', window.tracker.systemLocale));

  useEffect(() => {
    const api = window.tracker;
    const apply = (setting: LanguageSetting) => setLanguage(resolveLocale(setting, api.systemLocale));
    const off = api.onConfig((config) => apply(config.language));
    void api.getConfig().then((config) => apply(config.language));
    return off;
  }, []);

  const value = useMemo<I18n>(() => ({ locale: language, m: CATALOGS[language] }), [language]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

/** The catalog. The one hook nearly every component here wants. */
export function useMessages(): Messages {
  return useContext(I18nContext).m;
}

/**
 * The resolved language, for the things that are not words.
 *
 * The item and room tables, and the one date the app formats — see
 * `lib/format.ts`. Nothing else should need it: a component that wants to say
 * something should reach for `useMessages`.
 */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export type { Messages };
