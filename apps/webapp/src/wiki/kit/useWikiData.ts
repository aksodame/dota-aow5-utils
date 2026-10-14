import { useEffect, useState } from 'react';
import { loadWikiFile } from 'aow5-shared/wiki';
import { useApp } from '@/data/AppData';

/**
 * A section's data files, fetched once and shared.
 *
 * `files` are names under `data/wiki/`; `{lang}` in a name is replaced by the
 * reader's language, so a section asks for `['monsters.json',
 * 'locale.{lang}.monsters.json']` and gets the right locale after a language
 * switch without asking again for the structure. The loader memoises by name,
 * so two sections that read the same file fetch it once.
 *
 * `data` is null until every file has arrived, and the array is in the order
 * asked for. No suspense: a section draws its own loading state inside its own
 * layout, so the second row of the top bar never jumps.
 */
export function useWikiData<T extends unknown[]>(files: readonly string[]): { data: T | null; error: string | null } {
  const { lang } = useApp();
  const names = files.map((file) => file.replace('{lang}', lang));
  const key = names.join('|');

  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: '',
    data: null,
    error: null,
  });

  useEffect(() => {
    let live = true;
    Promise.all(names.map((name) => loadWikiFile<unknown>(name))).then(
      (loaded) => {
        if (live) setState({ key, data: loaded as T, error: null });
      },
      (error: unknown) => {
        if (live) setState({ key, data: null, error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      live = false;
    };
    // `names` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A language switch keeps showing the previous locale until the new one
  // lands, rather than blanking the page for a round trip.
  return { data: state.data, error: state.key === key ? state.error : null };
}
