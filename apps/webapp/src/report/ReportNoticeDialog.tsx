import { useEffect, useId, useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SiteStrings } from '@/i18n/site';
import type { Lang } from '@/i18n/strings';
import { pathOf } from '@/router';
import { REPORT_NOTICE_DELAY_SECONDS } from '@/lib/reportNotice';
import { acknowledgeReport, useReportNotice } from '@/report/reportNoticeStore';

/**
 * The notice everyone meets before the site, and again every few minutes.
 *
 * It blocks: no close button, Escape and outside clicks do nothing, and there
 * is no `onOpenChange` for Radix to close it through. The only way past is the
 * button, and the button needs both acknowledgements.
 *
 * The first checkbox is pointed rather than procedural: it asks the visitor to
 * agree that administrators may behave this way. Nobody agrees with that, which
 * is the point — ticking it is what makes the reader notice what they just
 * read, and it is the site's own position stated in the reader's voice. The
 * second is plain fact: that this site is not run by that staff. The document
 * itself still argues its case with dated quotes and links; the checkbox is
 * rhetoric, not evidence.
 *
 * Two details here are load-bearing rather than decorative, and both are about
 * not trapping anybody:
 *
 * - The content scrolls and is capped to the viewport. This dialog cannot be
 *   dismissed, so a Continue button pushed off the bottom of a short landscape
 *   phone screen would lock a visitor out of the entire site.
 * - The link to the document opens in a new tab. Navigating under the dialog
 *   would leave the reader looking at a page they cannot see, and dismissing
 *   the dialog for them would record an acknowledgement nobody made.
 */
export function ReportNoticeDialog({
  site,
  lang,
  languages,
  onLang,
}: {
  site: SiteStrings;
  lang: Lang;
  languages: Lang[];
  onLang: (lang: Lang) => void;
}) {
  const open = useReportNotice();
  const t = site.report.notice;

  const [agree, setAgree] = useState(false);
  const [unaffiliated, setUnaffiliated] = useState(false);
  const [left, setLeft] = useState(REPORT_NOTICE_DELAY_SECONDS);
  const agreeId = useId();
  const unaffiliatedId = useId();
  const hintId = useId();

  const ticked = agree && unaffiliated;
  const ready = ticked && left === 0;

  // The notice comes back every few minutes, and it comes back blank: an
  // acknowledgement is for the moment it was given, so the boxes from last time
  // are not still ticked when it reappears.
  useEffect(() => {
    if (!open) return;
    setAgree(false);
    setUnaffiliated(false);
    setLeft(REPORT_NOTICE_DELAY_SECONDS);
  }, [open]);

  /*
   * A pause between ticking the boxes and being allowed past.
   *
   * Without it the whole thing is two clicks and a reflex, which is worth
   * nothing to anybody — least of all to a reader who then says they had no
   * idea what they confirmed. The countdown restarts if a box is unticked.
   */
  useEffect(() => {
    if (!open || !ticked) {
      setLeft(REPORT_NOTICE_DELAY_SECONDS);
      return undefined;
    }
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [open, ticked]);

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[calc(100svh-2rem)] gap-4 overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.lead}</DialogDescription>
        </DialogHeader>

        {/* A point prefixed with `!` is the one to lead with — the same
            convention the document uses for its headings. The marker is
            stripped here and never reaches the page. */}
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-foreground/90">
          {t.points.map((point) => {
            const leading = point.startsWith('! ');
            return (
              <li key={point} className={leading ? 'font-medium text-destructive' : undefined}>
                {leading ? point.slice(2) : point}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-3 border-t pt-4">
          <div className="flex items-start gap-2">
            <input
              id={agreeId}
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <label htmlFor={agreeId} className="text-sm leading-snug">
              {t.ackAgree}
            </label>
          </div>

          <div className="flex items-start gap-2">
            <input
              id={unaffiliatedId}
              type="checkbox"
              checked={unaffiliated}
              onChange={(e) => setUnaffiliated(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <label htmlFor={unaffiliatedId} className="text-sm leading-snug">
              {t.ackUnaffiliated}
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {languages.length > 1 && (
            <LanguageSwitcher languages={languages} active={lang} label={site.language} onSelect={onLang} />
          )}
          <a
            href={pathOf('report')}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-semibold text-destructive underline underline-offset-2 hover:no-underline"
          >
            {t.readReport}
          </a>
        </div>

        <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
          <Button disabled={!ready} aria-describedby={ready ? undefined : hintId} onClick={acknowledgeReport}>
            {ticked && left > 0 ? t.continueIn(left) : t.continue}
          </Button>
          <p id={hintId} aria-live="polite" className="text-center text-xs text-muted-foreground">
            {ready ? '' : ticked ? t.continueWait : t.continueHint}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
