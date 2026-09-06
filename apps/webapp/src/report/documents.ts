/**
 * The report itself, fetched only when somebody opens it.
 *
 * The three documents are about 80 KB of text together, which is a third of
 * the whole app bundle — carried by every visitor to the planner for a page
 * most of them never open. A dynamic import per language turns that into one
 * ~10 KB chunk, loaded on demand, in the reader's language only.
 *
 * A static record of three thunks rather than a template literal, because
 * Rollup has to see all three specifiers to emit chunks for them. Parsed
 * results are cached: the reader can switch language and come back without
 * paying for the parse twice.
 *
 * JSX-free, so this stays importable from anywhere.
 */
import { parseMarkdown, type Block } from '@/lib/markdown';
import { rewriteCitations } from '@/lib/citations';
import type { Lang } from '@/i18n/strings';

const LOADERS: Record<Lang, () => Promise<{ default: string }>> = {
  en: () => import('@/content/report.en.md?raw'),
  ru: () => import('@/content/report.ru.md?raw'),
  zh: () => import('@/content/report.zh.md?raw'),
};

const cache = new Map<Lang, Block[]>();

export async function loadReport(lang: Lang): Promise<Block[]> {
  const cached = cache.get(lang);
  if (cached !== undefined) return cached;

  const module = await LOADERS[lang]();
  // Cited on the site means "open it in the archive": the source keeps the
  // Discord permalinks, which most readers cannot follow.
  const blocks = rewriteCitations(parseMarkdown(module.default));
  cache.set(lang, blocks);
  return blocks;
}
