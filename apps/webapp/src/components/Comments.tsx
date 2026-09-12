import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommentDto } from 'aow5-api-contract';
import { COMMENT_EDIT_WINDOW_SECONDS, MAX_COMMENT } from 'aow5-api-contract';
import { Avatar, Badge, Button, Field, Icon, Loading, Notice, Panel, Spinner, Textarea, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { deleteComment, editComment, listComments, postComment } from '@/builds/api';
import { ApiFailure } from '@/lib/api';
import { AuthorName } from './AuthorName';
import { SignInDialog } from './SignInDialog';
import styles from './Comments.module.css';

/**
 * The thread under a build.
 *
 * Oldest first, which is how the server orders it and the only order a
 * conversation reads in. Paged by cursor rather than by offset — the opposite
 * of the browse list, and for the opposite reason: a thread is read downwards
 * and never jumped into, so keyset's guarantee that a comment posted mid-read
 * cannot push another out of sight costs nothing here.
 *
 * Every rule the server enforces is also stated here — the length cap, the
 * fifteen-minute edit window — so the field can show them rather than letting
 * somebody write four hundred words and then be told. The server is still the
 * one that decides; this only stops the round trip being the first mention.
 */
export function Comments({ slug, count }: { slug: string; count: number }) {
  const { strings, me, lang } = useApp();
  const [items, setItems] = useState<CommentDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  /*
   * A thread's timestamps are absolute rather than "3 hours ago". A relative
   * label has to be re-rendered to stay true, and a build's comments are read
   * days apart — the date is the more useful of the two anyway.
   */
  const when = useMemo(
    () => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }),
    [lang],
  );

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setCursor(null);
    setFailed(false);
    listComments(slug, null, controller.signal)
      .then((page) => {
        setItems(page.items);
        setCursor(page.cursor);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [slug]);

  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    listComments(slug, cursor)
      .then((page) => {
        // Merged by id rather than appended: a comment posted from this page
        // is already at the end of the local list, and it will be in this
        // response too once the thread has been read that far.
        setItems((prev) => {
          const seen = new Set((prev ?? []).map((c) => c.id));
          return [...(prev ?? []), ...page.items.filter((c) => !seen.has(c.id))];
        });
        setCursor(page.cursor);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoadingMore(false));
  }, [slug, cursor, loadingMore]);

  const onPosted = useCallback((comment: CommentDto) => {
    setItems((prev) => [...(prev ?? []), comment]);
  }, []);

  const onChanged = useCallback((comment: CommentDto) => {
    setItems((prev) => prev?.map((c) => (c.id === comment.id ? comment : c)) ?? null);
  }, []);

  const onRemoved = useCallback((id: number) => {
    // Blanked rather than dropped, matching what the server does: the row
    // stays so the thread keeps its shape and replies still make sense.
    setItems((prev) => prev?.map((c) => (c.id === id ? { ...c, body: null, deleted: true, canDelete: false } : c)) ?? null);
  }, []);

  return (
    <Panel
      title={strings.comments.heading}
      action={count > 0 ? <span className={styles.count}>{count}</span> : undefined}
    >
      {me == null ? (
        <p className={styles.signedOut}>
          {strings.comments.signedOut}{' '}
          {/* The same dialog the top bar opens: one place that knows what the
              doors are, rather than a Steam link here and a screen there. */}
          <Button variant="primary" size="sm" onClick={() => setSigningIn(true)}>
            {strings.auth.signIn}
          </Button>
        </p>
      ) : (
        <Composer slug={slug} onPosted={onPosted} />
      )}

      {failed && <Notice tone="error" title={strings.comments.failed} />}

      {items === null ? (
        <Loading label={strings.common.loading} />
      ) : items.length === 0 ? (
        <p className={styles.empty}>{strings.comments.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              when={when}
              onChanged={onChanged}
              onRemoved={onRemoved}
            />
          ))}
        </ul>
      )}

      <SignInDialog open={signingIn} onClose={() => setSigningIn(false)} />

      {cursor !== null && (
        <Button variant="ghost" block onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? <Spinner /> : null}
          {strings.comments.more}
        </Button>
      )}
    </Panel>
  );
}

/** The box at the top of the thread. Signed-in visitors only. */
function Composer({ slug, onPosted }: { slug: string; onPosted: (comment: CommentDto) => void }) {
  const { strings } = useApp();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = useCallback(() => {
    const body = draft.trim();
    if (body === '' || busy) return;
    setBusy(true);
    setError(undefined);
    postComment(slug, body)
      .then((comment) => {
        onPosted(comment);
        setDraft('');
      })
      .catch((failure: unknown) => setError(describe(failure, strings)))
      .finally(() => setBusy(false));
  }, [slug, draft, busy, onPosted, strings]);

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field error={error} value={draft} max={MAX_COMMENT}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            className={styles.box}
            rows={3}
            value={draft}
            maxLength={MAX_COMMENT}
            placeholder={strings.comments.placeholder}
            aria-label={strings.comments.placeholder}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
      </Field>
      <div className={styles.composerActions}>
        <Button type="submit" variant="primary" size="sm" disabled={busy || draft.trim() === ''}>
          {busy ? strings.comments.posting : strings.comments.post}
        </Button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  when,
  onChanged,
  onRemoved,
}: {
  comment: CommentDto;
  when: Intl.DateTimeFormat;
  onChanged: (comment: CommentDto) => void;
  onRemoved: (id: number) => void;
}) {
  const { strings, me } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /*
   * Derived rather than sent: the DTO carries `canDelete` but nothing about
   * editing, and the rule is a pure function of who you are and how old the
   * comment is. `canDelete` is deliberately not reused — it is also true for
   * an admin, and editing somebody's words in their own name is not moderation.
   */
  const mine = me != null && me.id === comment.author.id;
  const canEdit =
    mine && !comment.deleted && Date.now() / 1000 - comment.createdAt < COMMENT_EDIT_WINDOW_SECONDS;

  const save = useCallback(() => {
    const body = draft.trim();
    if (body === '' || busy) return;
    setBusy(true);
    setError(undefined);
    editComment(comment.id, body)
      .then((updated) => {
        onChanged(updated);
        setEditing(false);
      })
      .catch((failure: unknown) => setError(describe(failure, strings)))
      .finally(() => setBusy(false));
  }, [comment.id, draft, busy, onChanged, strings]);

  const remove = useCallback(() => {
    if (!window.confirm(strings.comments.removeConfirm)) return;
    deleteComment(comment.id)
      .then(() => onRemoved(comment.id))
      .catch((failure: unknown) => setError(describe(failure, strings)));
  }, [comment.id, onRemoved, strings]);

  return (
    <li className={cx(styles.item, comment.deleted && styles.itemGone, comment.pending && styles.itemPending)}>
      <Avatar src={comment.author.avatar} name={comment.author.nickname} size={32} />

      <div className={styles.itemBody}>
        <div className={styles.meta}>
          <AuthorName user={comment.author} className={styles.nickname} />
          <time dateTime={new Date(comment.createdAt * 1000).toISOString()}>
            {when.format(comment.createdAt * 1000)}
          </time>
          {comment.editedAt !== null && <span className={styles.edited}>({strings.comments.edited})</span>}
          {/* Only ever on a comment the viewer may see at all — their own, or
              a moderator's view of the queue — so this labels rather than
              leaks. The hint says how to stop it happening again. */}
          {comment.pending && (
            <Badge small title={strings.comments.pendingHint}>
              {strings.comments.pending}
            </Badge>
          )}
        </div>

        {comment.deleted ? (
          <p className={styles.gone}>{strings.comments.deleted}</p>
        ) : editing ? (
          <div className={styles.editor}>
            <Field error={error} value={draft} max={MAX_COMMENT}>
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  className={styles.box}
                  rows={3}
                  value={draft}
                  maxLength={MAX_COMMENT}
                  onChange={(event) => setDraft(event.target.value)}
                />
              )}
            </Field>
            <div className={styles.actions}>
              <Button size="sm" variant="primary" onClick={save} disabled={busy || draft.trim() === ''}>
                {strings.comments.save}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.body ?? '');
                  setError(undefined);
                }}
              >
                {strings.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.text}>{comment.body}</p>
            {error !== undefined && <p className={styles.error}>{error}</p>}
            {(canEdit || comment.canDelete) && (
              <div className={styles.actions}>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                    <Icon.Pencil size={14} />
                    {strings.comments.edit}
                  </Button>
                )}
                {comment.canDelete && (
                  <Button size="sm" variant="ghost" onClick={remove}>
                    <Icon.Trash size={14} />
                    {strings.comments.remove}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The server's refusal, in the reader's language.
 *
 * Only the two rules a person can actually walk into get their own sentence —
 * the fifteen-second gap and the no-duplicates rule — because those read as
 * bugs otherwise. Anything else is shown as the server phrased it, which is at
 * least accurate, rather than flattened into "something went wrong".
 */
function describe(failure: unknown, strings: { comments: { tooSoon: string; duplicate: string; failed: string } }): string {
  if (!(failure instanceof ApiFailure)) return strings.comments.failed;
  if (failure.code === 'RATE_LIMITED') return strings.comments.tooSoon;
  if (failure.code === 'DUPLICATE_COMMENT') return strings.comments.duplicate;
  return failure.fields?.body ?? failure.message;
}
