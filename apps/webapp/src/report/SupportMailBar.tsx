import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Mail, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { CopyBlock } from '@/components/CopyBlock';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SiteStrings } from '@/i18n/site';
import { LANGUAGES, LANGUAGE_LABELS, type Lang } from '@/i18n/strings';
import { ARCHIVE_URL } from '@/lib/links';
import {
  LETTERS,
  PREFERRED_LETTER_LANG,
  SUPPORT_EMAIL,
  composeHref,
  letterText,
  type LetterLinks,
} from '@/lib/mail';
import { pathOf } from '@/router';

/**
 * The bar along the bottom of every page: one address, and the letter for it.
 *
 * The report ends with a list of things the developer was asked for and no
 * answer to any of them. This is the only thing on the site a reader can
 * actually *do* about that, so it is not left at the foot of a 600-line
 * document where most people never arrive — it follows them.
 *
 * Three decisions worth keeping:
 *
 * - **It does not close.** There is no dismiss button and nothing is
 *   remembered, so every visitor meets it on every page. That is the point of
 *   putting it here rather than in the footer.
 * - **It is a solid red band, unlike the strip in the header.** That one is
 *   deliberately a tint, because a permanent full-bleed red band across the top
 *   of every page reads as a site error. This one is not a notice, it is the
 *   one action on the site, and it is the last thing on every screen — the two
 *   are allowed to look different, and they should.
 * - **It sits above modal dialogs.** `z-60` clears the dialog layer, and
 *   `pointer-events-auto` undoes what Radix does to the body while a modal is
 *   open — otherwise the notice everybody meets on arrival would hide the
 *   letter behind itself for the whole time it is up. The letter's own dialog
 *   is lifted above the bar in turn, or the bar would float over its own text.
 *
 * Copy is the primary button and the mail app is the fallback: the body runs to
 * a couple of thousand characters, and a `mailto:` that long is truncated by
 * some clients and ignored by machines with no mail client at all.
 */
export function SupportMailBar({ site, lang }: { site: SiteStrings; lang: Lang }) {
  const t = site.report.mail;

  const [open, setOpen] = useState(false);
  const [letterLang, setLetterLang] = useState<Lang>(lang);
  const [copied, setCopied] = useState(false);

  // The letter opens in the language the site is being read in; an explicit
  // choice inside the dialog then holds until the site's language changes
  // under it, which only happens deliberately.
  useEffect(() => {
    setLetterLang(lang);
  }, [lang]);

  /*
   * Where the report actually lives, worked out at runtime.
   *
   * The letter points a stranger at this page, so the link has to be absolute
   * and it has to be right on whatever host this is deployed to — the site
   * runs at a domain root and under a project Pages base, and `pathOf`
   * already knows which.
   */
  const links: LetterLinks = useMemo(
    () => ({
      report: new URL(pathOf('report'), window.location.origin).toString(),
      archive: ARCHIVE_URL,
    }),
    [],
  );

  const letter = LETTERS[letterLang];
  const body = letter.body(links);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(letterText(letter, links));
      setCopied(true);
      toast.success(site.copy.done, { icon: <Check className="size-4" /> });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(site.copy.failed);
    }
  };

  /*
   * A spacer in the normal flow, exactly as tall as the fixed bar.
   *
   * Without it the bar sits on top of the end of every page — the footer's
   * attribution, the last section of the report, the planner's bottom row.
   * Measured rather than hard-coded because it is two lines of text that wrap
   * differently in every language and at every width.
   */
  const bar = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    const el = bar.current;
    if (el === null) return undefined;

    const observer = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    observer.observe(el);
    setBarHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, [t.bar]);

  return (
    <>
      <div aria-hidden className="shrink-0" style={{ height: barHeight }} />

      <div
        ref={bar}
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-60 border-t-4 border-white/20 bg-destructive text-white shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.55)]"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-5">
          <TriangleAlert className="hidden size-8 shrink-0 sm:block" aria-hidden />

          <div className="min-w-0 flex-1">
            <p className="text-base leading-tight font-bold text-balance sm:text-lg">{t.barTitle}</p>
            <p className="mt-1 text-sm leading-snug text-pretty text-white/90">{t.bar}</p>
            <p className="mt-1.5 font-mono text-sm font-semibold tracking-wide select-all">
              {SUPPORT_EMAIL}
            </p>
          </div>

          <Button
            size="lg"
            onClick={() => setOpen(true)}
            className="w-full shrink-0 bg-white text-base font-bold text-destructive shadow-md hover:bg-white/90 sm:h-12 sm:w-auto sm:px-8"
          >
            <Mail className="size-5" />
            {t.open}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Above the bar, which is itself above the dialog layer. */}
        <DialogContent className="z-70 max-h-[calc(100svh-2rem)] gap-4 overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.lead}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t.to}</p>
            <CopyBlock site={site}>{SUPPORT_EMAIL}</CopyBlock>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t.subject}</p>
            <CopyBlock site={site}>{letter.subject}</CopyBlock>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t.language}</p>
              <div className="flex gap-1">
                {LANGUAGES.map((l) => (
                  <Button
                    key={l}
                    type="button"
                    size="sm"
                    variant={l === letterLang ? 'secondary' : 'ghost'}
                    aria-pressed={l === letterLang}
                    className="h-7 px-2 text-xs"
                    onClick={() => setLetterLang(l)}
                  >
                    {LANGUAGE_LABELS[l]}
                  </Button>
                ))}
              </div>
              {letterLang !== PREFERRED_LETTER_LANG && (
                <p className="text-xs text-muted-foreground">{t.languageHint}</p>
              )}
            </div>

            {/* `lang` on the box so a screen reader pronounces the letter as
                what it is, which is not necessarily the page's language. */}
            <div
              lang={letterLang}
              className="max-h-64 overflow-y-auto rounded-md border bg-background/70 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap select-all"
            >
              {body}
            </div>
          </div>

          <p className="text-xs text-pretty text-muted-foreground">{t.note}</p>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {t.copy}
            </Button>
            <Button variant="outline" asChild>
              <a href={composeHref(letter, links)}>{t.compose}</a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
