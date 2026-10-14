import { useEffect, useState } from 'react';
import { useApp } from '@/data/AppData';
import type { Lang } from '@/i18n/strings';

/**
 * The wiki's authored content — its FAQ and its patch notes — in the reader's
 * language.
 *
 * Written by the wiki's author in Russian and translated, so it is content
 * rather than game data: one JSON file per document and language, bundled
 * rather than fetched, and each is its own chunk. A language a document has
 * not been translated into yet falls back to Russian, which is the original.
 *
 * The files are in `aow5-shared/content/`, not here, because the API reads
 * them too: a FAQ answer's link preview quotes its first paragraph, and the
 * prerenderer lists every topic. The shared package is what both apps import
 * from; a server reaching into the webapp's source would not be.
 */

const FILES = import.meta.glob<{ default: unknown }>('../../../../../packages/aow5-shared/content/*.json');
const fileOf = (name: string) => FILES[`../../../../../packages/aow5-shared/content/${name}`];

export type ContentDoc = 'faq' | 'patchnotes';

async function load<T>(doc: ContentDoc, lang: Lang): Promise<T> {
  const own = fileOf(`${doc}.${lang}.json`) ?? fileOf(`${doc}.ru.json`);
  if (own === undefined) throw new Error(`no content for ${doc}`);
  return (await own()).default as T;
}

/** One document in the reader's language; null until it arrives. */
export function useContent<T>(doc: ContentDoc): { data: T | null; error: string | null } {
  const { lang } = useApp();
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: '',
    data: null,
    error: null,
  });
  const key = `${doc}.${lang}`;

  useEffect(() => {
    let live = true;
    load<T>(doc, lang).then(
      (data) => live && setState({ key, data, error: null }),
      (error: unknown) => live && setState({ key, data: null, error: String(error) }),
    );
    return () => {
      live = false;
    };
  }, [doc, lang, key]);

  return { data: state.data, error: state.key === key ? state.error : null };
}

/** The FAQ's shape lives with the logic the server shares; see `aow5-shared/wiki`'s `faq.ts`. */
export type { FaqBlock, FaqDoc, FaqSection, FaqSub } from 'aow5-shared/wiki';

export interface PatchnotesDoc {
  notes: Array<{ version: string; date: string; game: string[]; wiki: string[] }>;
}
