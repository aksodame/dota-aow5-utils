import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import type { SiteStrings } from '@/i18n/site';
import type { Lang } from '@/i18n/strings';
import { plainText, type Block } from '@/lib/markdown';
import { loadReport } from '@/report/documents';
import { cn } from '@/lib/utils';

/** Roughly the sticky header: the report strip plus the 56px bar, plus air. */
const HEADER_OFFSET = 108;

/**
 * The report, in the reader's language, with a section list beside it.
 *
 * The document carries its own title and dateline, so the page adds only the
 * publication date above it — the letter was written on one date and put here
 * on another, and conflating the two would be the first inaccuracy on a page
 * whose whole claim is accuracy.
 *
 * The text arrives through a dynamic import, so switching language fetches a
 * different chunk. `attempt` exists to let the retry button re-run the effect
 * after a failed load.
 */
export function ReportPage({ site, lang }: { site: SiteStrings; lang: Lang }) {
  const t = site.report;
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(0);
  const article = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setBlocks(null);
    setFailed(false);

    loadReport(lang)
      .then((loaded) => {
        if (!cancelled) setBlocks(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lang, attempt]);

  // The list is built from the same headings the document renders, so the two
  // cannot drift apart. `important` comes from a `## !` marker in the source,
  // which the parser strips — the flag lives with the text it describes rather
  // than in a list of indices here that the next edit would silently break.
  const sections = (blocks ?? [])
    .flatMap((block) =>
      block.kind === 'heading' && block.level === 2
        ? [{ title: plainText(block.children), important: block.important }]
        : [],
    );

  /**
   * The rendered `h2` elements, in order.
   *
   * Matched to `sections` by position rather than by an `id`, because an `id`
   * invites a `#fragment` link — and on this site the fragment belongs to the
   * planner, which decodes it as a board. Nothing else in the document renders
   * an `h2`, so the correspondence holds.
   */
  const headings = useCallback(
    () => Array.from(article.current?.querySelectorAll('h2') ?? []),
    [],
  );

  const goTo = (index: number) => {
    const target = headings()[index];
    if (target === undefined) return;
    // Scroll by offset rather than `scrollIntoView`, so the sticky header does
    // not cover the heading we just jumped to.
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, behavior: 'smooth' });
  };

  // Which section is on screen: the last heading whose top has passed under
  // the header. Cheap enough at this size to just recompute on scroll.
  useEffect(() => {
    if (blocks === null) return undefined;

    let queued = false;
    const update = () => {
      queued = false;
      const tops = headings().map((el) => el.getBoundingClientRect().top);
      let current = 0;
      tops.forEach((top, i) => {
        if (top <= HEADER_OFFSET + 8) current = i;
      });
      setActive(current);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [blocks, headings]);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div ref={article} className="flex min-w-0 flex-col gap-6">
        <p className="text-xs text-muted-foreground">{t.updated}</p>

        {blocks !== null && <Markdown blocks={blocks} videoTitle={t.video} />}

        {blocks === null && !failed && <p className="text-sm text-muted-foreground">{t.loading}</p>}

        {failed && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-destructive" role="alert">
              {t.loadFailed}
            </p>
            <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              {t.retry}
            </Button>
          </div>
        )}
      </div>

      {/* Hidden below `lg`: a sticky column has nowhere to sit on a phone, and
          the document is long enough that a collapsed list at the top would be
          one more thing to scroll past. */}
      {sections.length > 0 && (
        <aside className="hidden lg:block">
          <nav
            aria-label={t.contents}
            className="sticky top-27 max-h-[calc(100svh-9rem)] overflow-y-auto border-l pl-4"
          >
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.contents}</p>
            <ul className="flex flex-col gap-1.5">
              {sections.map((section, i) => (
                <li key={`${i}-${section.title}`}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={i === active ? 'true' : undefined}
                    className={cn(
                      'cursor-pointer text-left text-xs leading-snug text-balance transition-colors hover:text-foreground',
                      i === active ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {section.important && (
                      <span
                        title={t.important}
                        aria-label={t.important}
                        className="mr-1.5 inline-flex size-4 shrink-0 translate-y-px items-center justify-center rounded-full bg-destructive text-[10px] leading-none font-bold text-white"
                      >
                        !
                      </span>
                    )}
                    {section.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}
