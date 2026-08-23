import { MAX_BODY, MAX_TITLE, type BuildDetail } from 'aow5-api-contract';
import { VoteButtons } from '@/builds/VoteButtons';
import type { SiteStrings } from '@/i18n/site';
import { cn } from '@/lib/utils';

export interface BuildDraft {
  title: string;
  body: string;
}

/**
 * Whose build this is, and what it says about itself.
 *
 * Takes the place of the planner's own title when the board on screen belongs
 * to somebody: the page is still the planner, but it is no longer *your* blank
 * one, and saying so is the difference between reading and starting over.
 *
 * For the author it is also where the title and notes are edited. Not behind a
 * dialog, and not on a separate page — the board is already editable in place,
 * and having the words that describe it work differently from the thing they
 * describe is a seam with nothing on the other side of it. Both are saved by
 * the one button next to Reset.
 */
export function BuildHeader({
  build,
  site,
  draft,
  onDraft,
}: {
  build: BuildDetail;
  site: SiteStrings;
  /** Present only when the viewer may edit; absent makes this read-only. */
  draft?: BuildDraft | undefined;
  onDraft?: ((next: BuildDraft) => void) | undefined;
}) {
  const editable = draft !== undefined && onDraft !== undefined;
  const t = site.builds;

  return (
    <div className="min-w-0 flex-1 space-y-1">
      {editable ? (
        <input
          value={draft.title}
          onChange={(event) => onDraft({ ...draft, title: event.target.value })}
          maxLength={MAX_TITLE}
          aria-label={t.fieldTitle}
          placeholder={t.fieldTitlePlaceholder}
          /* Styled as the heading it replaces rather than as a form control:
             the border only appears on hover or focus, so the page reads the
             same whether or not it happens to be yours. */
          className={cn(
            'w-full max-w-prose truncate rounded-md border border-transparent bg-transparent',
            'text-2xl font-extrabold tracking-tight',
            'hover:border-border focus:border-border focus:outline-none',
            '-mx-2 px-2',
          )}
        />
      ) : (
        <h1 className="text-2xl font-extrabold tracking-tight break-words">{build.title}</h1>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-sm text-muted-foreground">
        <span>
          {t.by} {build.author.nickname}
        </span>

        {build.status === 'draft' && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {t.draft}
          </span>
        )}

        <VoteButtons build={build} site={site} />
      </div>

      {editable ? (
        <textarea
          value={draft.body}
          onChange={(event) => onDraft({ ...draft, body: event.target.value })}
          maxLength={MAX_BODY}
          rows={draft.body === '' ? 2 : 4}
          aria-label={t.fieldBody}
          placeholder={t.fieldBodyPlaceholder}
          className={cn(
            'mt-2 w-full max-w-prose resize-y rounded-md border border-transparent bg-transparent',
            'text-sm hover:border-border focus:border-border focus:outline-none',
            '-mx-2 px-2 py-1',
          )}
        />
      ) : (
        build.body !== '' && <p className="max-w-prose pt-2 text-sm whitespace-pre-wrap">{build.body}</p>
      )}
    </div>
  );
}
