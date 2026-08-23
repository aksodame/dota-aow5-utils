import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MAX_COMMENT, type CommentDto } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import { useMe } from '@/auth/useMe';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure, api } from '@/lib/api';

/**
 * The conversation under a build.
 *
 * Bodies are rendered as **plain text**, in a `<p>`, with no markdown and no
 * HTML. That is not a limitation to work around later: it is what makes the
 * whole comment path free of an injection surface, and item descriptions —
 * which really are HTML from the game data — go through a different component
 * for exactly that reason.
 */
export function CommentThread({ slug, site }: { slug: string; site: SiteStrings }) {
  const me = useMe();
  const t = site.builds;
  const [items, setItems] = useState<CommentDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (after: string | null) => {
      api<{ items: CommentDto[]; cursor: string | null }>(
        `/builds/${encodeURIComponent(slug)}/comments${after === null ? '' : `?cursor=${after}`}`,
      )
        .then((page) => {
          setItems((previous) => (after === null ? page.items : [...previous, ...page.items]));
          setCursor(page.cursor);
          setStatus('ready');
        })
        .catch(() => setStatus('error'));
    },
    [slug],
  );

  useEffect(() => {
    setItems([]);
    setStatus('loading');
    load(null);
  }, [load]);

  async function post() {
    setBusy(true);
    try {
      const comment = await api<CommentDto>(`/builds/${encodeURIComponent(slug)}/comments`, {
        method: 'POST',
        body: { body: draft },
      });
      setItems((previous) => [...previous, comment]);
      setDraft('');
    } catch (error) {
      toast.error(error instanceof ApiFailure ? (error.fields?.['body'] ?? error.message) : t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await api<void>(`/comments/${id}`, { method: 'DELETE' });
      // Marked rather than dropped, so the thread does not reshuffle under the
      // reader's cursor — the same reason the server soft-deletes.
      setItems((previous) =>
        previous.map((comment) =>
          comment.id === id ? { ...comment, body: null, deleted: true, canDelete: false } : comment,
        ),
      );
    } catch (error) {
      toast.error(error instanceof ApiFailure ? error.message : t.failed);
    }
  }

  return (
    <section className="mt-10 max-w-3xl">
      <h2 className="text-lg font-semibold">{site.builds.commentsTitle}</h2>

      {status === 'error' && <p className="mt-3 text-sm text-muted-foreground">{t.failed}</p>}

      <ul className="mt-4 space-y-4">
        {items.map((comment) => (
          <li key={comment.id} className="flex gap-3">
            <span className="size-8 shrink-0 rounded-full border" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{comment.author.nickname}</p>
              {comment.deleted ? (
                <p className="text-sm text-muted-foreground italic">{t.commentDeleted}</p>
              ) : (
                // Plain text in a paragraph. No markdown, no HTML, nothing to
                // sanitise and keep sanitised.
                <p className="text-sm whitespace-pre-wrap break-words">{comment.body}</p>
              )}
            </div>
            {comment.canDelete && (
              <Button variant="ghost" size="sm" onClick={() => void remove(comment.id)}>
                {t.delete}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {cursor !== null && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => load(cursor)}>
          {t.more}
        </Button>
      )}

      {/* The box appears for somebody who can actually post. A signed-out
          reader gets the thread and no prompt — see the header. */}
      {me.status === 'ready' && me.user !== null && (
        <div className="mt-6 space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.commentPlaceholder}
            maxLength={MAX_COMMENT}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <Button onClick={() => void post()} disabled={busy || draft.trim() === ''}>
              {t.postComment}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
