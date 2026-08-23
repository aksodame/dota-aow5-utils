import { useState } from 'react';
import { Check, LogIn, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { BuildDetail } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import { setMe, useMe } from '@/auth/useMe';
import type { BuildDraft } from '@/builds/BuildHeader';
import { createBuild, updateBuild } from '@/builds/api';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure, signInUrl } from '@/lib/api';
import { toBuild } from '@/router';

/**
 * One button, three situations.
 *
 * The planner stays editable for everybody — a build you cannot poke at is a
 * screenshot, and trying somebody's board with one item swapped is the whole
 * reason to open it. What differs is what happens when you want to keep the
 * result:
 *
 *   your build      → save the board, title and notes back to it
 *   somebody else's → save a copy into your own builds, as a draft
 *   signed out      → say what signing in would buy, and change nothing
 *
 * It sits beside Reset because those two are the same kind of thing: what to do
 * with the board you are looking at. The copy control it used to share a row
 * with was a second Copy button on a page that already had one.
 */
export function SaveBuildButton({
  build,
  payload,
  draft,
  site,
  onSaved,
}: {
  build: BuildDetail;
  payload: string;
  draft: BuildDraft;
  site: SiteStrings;
  onSaved?: ((next: BuildDetail) => void) | undefined;
}) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const t = site.builds;

  const dirty = payload !== build.payload || draft.title !== build.title || draft.body !== build.body;

  if (me.status === 'loading') return <div className="h-8 w-24" aria-hidden />;

  if (me.user === null) {
    return (
      <Button variant="outline" asChild title={t.signInToSave}>
        <a href={signInUrl()}>
          <LogIn />
          {site.auth.signIn}
        </a>
      </Button>
    );
  }

  async function save() {
    setBusy(true);
    try {
      if (build.canEdit) {
        onSaved?.(await updateBuild(build.slug, { payload, title: draft.title, body: draft.body }));
        toast.success(t.saved);
      } else {
        // A copy, as a draft. Publishing it is a separate decision, made from
        // My builds once it is actually yours.
        const copy = await createBuild({ title: draft.title, body: draft.body, payload, status: 'draft' });
        if (me.status === 'ready' && me.user !== null) {
          setMe({ ...me.user, buildCount: me.user.buildCount + 1 });
        }
        toast.success(t.saved);
        toBuild(copy.slug);
      }
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'BUILD_LIMIT_REACHED') toast.error(t.limitReached);
      else if (error instanceof ApiFailure && error.fields?.['title'] !== undefined) toast.error(error.fields['title']);
      else toast.error(error instanceof ApiFailure ? error.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={build.canEdit && !dirty ? 'outline' : 'default'}
      disabled={busy || (build.canEdit && !dirty) || draft.title.trim() === ''}
      onClick={() => void save()}
      title={build.canEdit ? undefined : t.saveAsMineWhy}
    >
      {build.canEdit && !dirty ? <Check /> : <Save />}
      {build.canEdit ? (dirty ? t.saveChanges : t.saved) : t.saveAsMine}
    </Button>
  );
}
