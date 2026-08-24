import { useState } from 'react';
import { Check, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { BuildDetail } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import { useMe } from '@/auth/useMe';
import type { BuildDraft } from '@/builds/BuildHeader';
import { updateBuild } from '@/builds/api';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure } from '@/lib/api';

/**
 * Saving a build back to itself. The author's button, and nobody else's.
 *
 * The board underneath stays editable for everyone — a build you cannot poke at
 * is a screenshot, and trying somebody's setup with one item swapped is half
 * the reason to open it. What is gone is anywhere to *put* the result unless it
 * is already yours: on somebody else's build this renders nothing at all, and
 * so does a signed-out view.
 *
 * That is the rule for the whole builds section. A page you are only reading
 * shows you what it is, a vote and a comment box — not a row of controls that
 * turn out to be an account prompt.
 */
export function SaveBuildButton({
  build,
  payload,
  referral,
  draft,
  site,
  onSaved,
}: {
  build: BuildDetail;
  payload: string;
  /** The author's code as the field currently has it; `''` erases the stored one. */
  referral: string;
  draft: BuildDraft;
  site: SiteStrings;
  onSaved?: ((next: BuildDetail) => void) | undefined;
}) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const t = site.builds;

  const dirty =
    payload !== build.payload ||
    referral !== build.referral ||
    draft.title !== build.title ||
    draft.body !== build.body;

  // `canEdit` is the server's answer, so this does not have to reason about
  // ownership or about admins — and the same check guards the PATCH behind it.
  if (me.status === 'loading') return <div className="h-8 w-24" aria-hidden />;
  if (me.user === null || !build.canEdit) return null;

  async function save() {
    setBusy(true);
    try {
      onSaved?.(await updateBuild(build.slug, { payload, referral, title: draft.title, body: draft.body }));
      toast.success(t.saved);
    } catch (error) {
      if (error instanceof ApiFailure && error.fields?.['title'] !== undefined) toast.error(error.fields['title']);
      else toast.error(error instanceof ApiFailure ? error.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={dirty ? 'default' : 'outline'}
      disabled={busy || !dirty || draft.title.trim() === ''}
      onClick={() => void save()}
    >
      {dirty ? <Save /> : <Check />}
      {dirty ? t.saveChanges : t.saved}
    </Button>
  );
}
