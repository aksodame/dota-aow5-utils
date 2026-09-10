import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthProvider } from 'aow5-api-contract';
import { Avatar, Badge, Button, ButtonLink, Icon, Loading, Notice, Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import type { PendingCommentDto } from 'aow5-api-contract';
import { approveComment, authProviders, linkUrl, pendingComments } from '@/builds/api';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { buildPath, Link } from '@/router';
import styles from './SettingsPage.module.css';

type External = 'steam' | 'discord';
const EXTERNAL: External[] = ['steam', 'discord'];

/**
 * The account: which providers vouch for you, and the language.
 *
 * Linking is the whole feature. An account with no provider linked can do
 * everything else on the site — write builds, publish them, comment — and the
 * one thing it changes is that its comments wait for a moderator, which is what
 * the "unverified" badge beside a nickname is telling people.
 *
 * **Signed out, this page does not exist**, exactly as My Creations does not:
 * settings for an account you do not have is a screen with nothing on it.
 */
export function SettingsPage() {
  const { strings, me, lang, setLang } = useApp();

  const [available, setAvailable] = useState<AuthProvider[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    authProviders(controller.signal)
      .then((response) => setAvailable(response.available))
      .catch(() => {
        // Steam is always there; only Discord is ever in doubt. Assuming the
        // pair is a worse guess than assuming the one that cannot be missing.
        if (!controller.signal.aborted) setAvailable(['local', 'steam']);
      });
    return () => controller.abort();
  }, []);


  /*
   * How a round trip to a provider reports itself.
   *
   * The callback is a redirect, so there is no response body to read — the
   * server puts the outcome in the query and this turns it into a sentence.
   *
   * Read **once, at mount**, and held in state rather than derived from the
   * live query string. The effect below spends `?link=` immediately, and
   * anything that makes the router re-read the address after that — a
   * navigation, a language change — would otherwise take the sentence off the
   * screen a moment after it appeared, which is indistinguishable from never
   * having shown it.
   */
  const [status] = useState<string | null>(() => new URLSearchParams(window.location.search).get('link'));

  const outcome = useMemo(() => {
    const value = status;
    if (value === null) return null;
    if (value === 'linked') return { tone: 'success' as const, text: strings.account.linkOk };
    if (value === 'taken') return { tone: 'error' as const, text: strings.account.linkTaken };
    if (value === 'already-linked') return { tone: 'default' as const, text: strings.account.linkAlready };
    if (value === 'unavailable') return { tone: 'error' as const, text: strings.account.discordUnavailable };
    return { tone: 'error' as const, text: strings.account.linkFailed };
  }, [status, strings]);

  /*
   * `?link=` is spent once it has been shown.
   *
   * The alternative is a URL that keeps announcing a link that happened five
   * minutes ago every time somebody returns to this page — the same argument as
   * `?auth=` on the shell.
   */
  useEffect(() => {
    if (outcome === null) return;
    const next = new URLSearchParams(window.location.search);
    next.delete('link');
    const encoded = next.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${encoded === '' ? '' : `?${encoded}`}`);
  }, [outcome]);

  /*
   * `undefined` is "not known yet", `null` is "nobody" — and nobody is a
   * perfectly good visitor here.
   *
   * This page is where the language lives now that the top bar is tabs only,
   * so it cannot be an account-only screen: somebody who has never signed in
   * still has a language to set. What they do not get is an account panel for
   * an account they do not have.
   */
  if (me === undefined) return <Loading label={strings.common.loading} />;

  /*
   * Signed out, this page is the language and nothing else.
   *
   * No sign-in panel: the top bar carries that button, and a second one here
   * would be the same decision offered twice on the same screen.
   */
  if (me === null) {
    return (
      <div className={styles.page}>
        <Panel title={strings.common.language}>
          <LanguageSwitcher active={lang} onSelect={setLang} label={strings.common.language} />
        </Panel>
      </div>
    );
  }

  const linked = new Set(me.providers);
  const verified = EXTERNAL.some((provider) => linked.has(provider));

  return (
    <div className={styles.page}>
      {/*
        Who you are, at the head of the page about you.
        
        The bar carries the same three things — see `TopBar` — and this is the
        larger copy: a 44px portrait and the name as the page's heading, with
        the badge that says what is still missing. Signing out is up there
        rather than repeated here, because one page with two of the same red
        button is a page where neither is obviously the one that works.
      */}
      <header className={styles.head}>
        <Avatar src={me.avatar} name={me.nickname} size={44} />
        <div className={styles.who}>
          <h1 className={styles.heading}>
            {me.nickname}
            {!verified && (
              <Badge small title={strings.account.unverifiedHint}>
                {strings.account.unverified}
              </Badge>
            )}
          </h1>
        </div>
      </header>

      {outcome !== null && <Notice tone={outcome.tone} title={outcome.text} />}

      <Panel title={strings.account.providers}>
        <div className={styles.status}>
          <Badge tone={verified ? 'tier' : 'default'}>
            {verified ? strings.account.verified : strings.account.unverified}
          </Badge>
          {!verified && <p className={styles.why}>{strings.account.whyVerify}</p>}
        </div>

        <ul className={styles.providers}>
          {EXTERNAL.map((provider) => {
            const on = linked.has(provider);
            const offered = available === null || available.includes(provider);
            return (
              <li key={provider} className={styles.provider}>
                <span className={cx(styles.mark, styles[provider])}>
                  {provider === 'steam' ? <Icon.SteamMark size={20} /> : <Icon.DiscordMark size={20} />}
                </span>
                <span className={styles.providerName}>{strings.account[provider]}</span>
                {/* One state per row: "not linked" and "not available here"
                    are the same fact told twice. */}
                <span className={cx(styles.state, on && styles.stateOn)}>
                  {on ? strings.account.linked : offered ? strings.account.notLinked : ''}
                </span>

                {on ? (
                  /*
                   * Nothing to press. A link is one-way — see `UNLINKING_ENABLED`
                   * in the API: the badge it grants is what lets a comment skip
                   * the queue, so a provider account that could be detached
                   * could be spent again on the next profile. The state beside
                   * this says "Linked", which is the whole of what there is to
                   * report.
                   */
                  <span className={styles.locked} title={strings.account.bindPermanent}>
                    <Icon.Check size={14} />
                  </span>
                ) : offered ? (
                  /*
                   * A real link, like the sign-in buttons: `/api/auth/<p>/link`
                   * answers with a 302 to the provider, so the browser has to
                   * perform the navigation. A fetch would follow the redirect
                   * to Steam and get nowhere.
                   */
                  <ButtonLink href={linkUrl(provider)} variant="primary" size="sm">
                    {strings.account.bind}
                  </ButtonLink>
                ) : (
                  <span className={styles.unavailable}>{strings.account.discordUnavailable}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      {me.isAdmin && <ModerationQueue />}

      <Panel title={strings.common.language}>
        {/* The same control as the top bar's, because it is the same
            preference — this is where somebody goes looking for it. */}
        <LanguageSwitcher active={lang} onSelect={setLang} label={strings.common.language} />
      </Panel>
    </div>
  );
}

/**
 * The queue, for whoever is moderating.
 *
 * On this page rather than behind a route of its own: it is a handful of rows
 * that only one account ever sees, and a `/moderation` page would be a fifth
 * route in a four-route router for the sake of it.
 *
 * Approving is the only verdict here. Deleting somebody's comment is already a
 * button on the comment itself — a moderator sees held comments in the thread
 * they belong to, which is the only place there is enough context to judge one.
 */
function ModerationQueue() {
  const { strings } = useApp();
  const [queue, setQueue] = useState<PendingCommentDto[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    pendingComments(controller.signal)
      .then(setQueue)
      .catch(() => {
        if (!controller.signal.aborted) setQueue([]);
      });
    return () => controller.abort();
  }, []);

  const approve = useCallback((id: number) => {
    setBusy(id);
    void approveComment(id)
      // Dropped from the list rather than re-fetched: the row is done, and a
      // second request would only tell us what we already know.
      .then(() => setQueue((prev) => prev?.filter((row) => row.id !== id) ?? null))
      .finally(() => setBusy(null));
  }, []);

  return (
    <Panel title={strings.account.queue}>
      {queue === null ? (
        <Loading label={strings.common.loading} />
      ) : queue.length === 0 ? (
        <p className={styles.empty}>{strings.account.queueEmpty}</p>
      ) : (
        <ul className={styles.queue}>
          {queue.map((comment) => (
            <li key={comment.id} className={styles.held}>
              <div className={styles.heldMeta}>
                <strong>{comment.author.nickname}</strong>
                <span className={styles.state}>
                  {strings.account.queueOn}{' '}
                  <Link to={{ href: buildPath(comment.buildSlug) }}>{comment.buildTitle}</Link>
                </span>
              </div>
              <p className={styles.heldBody}>{comment.body}</p>
              <div className={styles.heldActions}>
                <Button size="sm" variant="primary" disabled={busy === comment.id} onClick={() => approve(comment.id)}>
                  <Icon.Check size={14} />
                  {strings.account.approve}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
