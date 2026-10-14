import type { WikiPageFacts, WikiSection } from 'aow5-shared/seo';
import { useApp } from '@/data/AppData';
import { dataVersion, useDocumentMeta } from '@/lib/meta';

/**
 * A wiki page's own `<head>`: its title, its description and its card.
 *
 * Called by a section's page once it knows which record it is showing. `facts`
 * must be built by the same function the server's source for that section
 * uses (see `apps/api/core/seo/wiki-sources.ts`), so the tab a reader sees and
 * the preview a scraper sees say the same sentence.
 *
 * `null` facts mean "the section itself" — the list with nothing picked — and
 * `missing` is a well-formed address whose record is not in the data.
 */
export function useWikiPageMeta(
  section: WikiSection,
  path: readonly string[],
  facts: Omit<WikiPageFacts, 'section' | 'path'> | null,
  missing = false,
): void {
  const { core, lang } = useApp();
  const version = core === null ? undefined : dataVersion(core.meta);

  useDocumentMeta(
    missing
      ? { kind: 'missingWiki', section, path }
      : facts === null || path.length === 0
        ? { kind: 'wiki', section }
        : {
            kind: 'wikiPage',
            page: { section, path, ...facts },
            ...(version !== undefined ? { version } : {}),
          },
    lang,
  );
}
