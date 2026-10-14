import { useApp } from '@/data/AppData';
import type { Lang } from '@/i18n/strings';

/**
 * The wiki's own strings: one table per section, each in the three languages.
 *
 * **Not in `i18n/strings.ts`**, which is the builder's and is already two
 * thousand lines. A section's words — its labels and, more than anything, the
 * explanations of game mechanics the wiki's author wrote — are loaded with the
 * section's chunk, so a reader who never opens the calculator never downloads
 * its prose in three languages.
 *
 * A table is a plain `Record<Lang, T>`; `useWikiStrings` picks the reader's.
 */
export type Localised<T> = Record<Lang, T>;

export function useWikiStrings<T>(table: Localised<T>): T {
  const { lang } = useApp();
  return table[lang];
}
