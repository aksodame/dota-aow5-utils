import { useState } from 'react';
import { toast } from 'sonner';
import { MAX_TITLE, type BuildDetail } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import { CopyBlock } from '@/components/CopyBlock';
import { createBuild } from '@/builds/api';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure } from '@/lib/api';
import { setMe, useMe } from '@/auth/useMe';
import { buildPath } from '@/lib/routes';

/**
 * Publishing the board you are looking at.
 *
 * Deliberately beside `ShareBar` rather than folded into it. Copying a link is
 * instant, needs no account and changes nothing; publishing puts your name on
 * something other people will search for and uses one of five slots. Making
 * them one control would make the cheap thing feel like the expensive one.
 *
 * The share link keeps working for everyone, signed in or not. That is the
 * point of the copy under the sign-in prompt: an account adds an option, it
 * does not gate what already worked.
 */
export function PublishDialog({
  payload,
  referral,
  site,
  onClose,
}: {
  payload: string;
  /**
   * The code in the planner's field, saved with the build.
   *
   * It goes up here rather than in a second request, because a build published
   * without one and corrected afterwards is a build somebody has already opened
   * with the wrong code on it.
   */
  referral: string;
  site: SiteStrings;
  onClose: () => void;
}) {
  const me = useMe();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<BuildDetail | null>(null);

  const t = site.builds;

  async function submit(status: 'draft' | 'published') {
    setBusy(true);
    try {
      const build = await createBuild({ title, body, payload, referral, status });
      setPublished(build);
      // The header shows "n of 5"; leaving it stale the moment somebody
      // publishes is exactly the kind of small wrongness that reads as a bug.
      if (me.status === 'ready' && me.user !== null) {
        setMe({ ...me.user, buildCount: me.user.buildCount + 1 });
      }
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'BUILD_LIMIT_REACHED') toast.error(t.limitReached);
      else if (error instanceof ApiFailure && error.fields?.['title'] !== undefined) toast.error(error.fields['title']);
      else if (error instanceof ApiFailure) toast.error(error.message);
      else toast.error(t.failed);
    } finally {
      setBusy(false);
    }
  }

  if (published !== null) {
    const url = `${window.location.origin}${buildPath(published.slug)}`;
    return (
      <Panel title={t.published} lead={t.publishedLead} onClose={onClose}>
        <CopyBlock site={site}>{url}</CopyBlock>
      </Panel>
    );
  }

  return (
    <Panel title={t.publishTitle} lead={t.publishLead} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t.fieldTitle} count={`${[...title].length}/${MAX_TITLE}`}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.fieldTitlePlaceholder}
            maxLength={MAX_TITLE}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field label={t.fieldBody}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t.fieldBodyPlaceholder}
            rows={5}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.cancel}
          </Button>
          <Button variant="outline" onClick={() => void submit('draft')} disabled={busy || title.trim() === ''}>
            {t.saveDraft}
          </Button>
          <Button onClick={() => void submit('published')} disabled={busy || title.trim() === ''}>
            {t.publishAction}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, count, children }: { label: string; count?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between text-sm font-medium">
        {label}
        {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
      </span>
      {children}
    </label>
  );
}

function Panel({
  title,
  lead,
  onClose,
  children,
}: {
  title: string;
  lead: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{lead}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          ×
        </Button>
      </div>
      {children}
    </div>
  );
}
