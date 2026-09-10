import { useCallback, useEffect, useState } from 'react';
import type { AuthProvider } from 'aow5-api-contract';
import { MAX_NICKNAME, MAX_PASSWORD, MIN_NICKNAME, MIN_PASSWORD } from 'aow5-api-contract';
import { Button, ButtonLink, Dialog, Field, Icon, Input, Spinner, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { authChallenge, authProviders, signIn, signUp } from '@/builds/api';
import { ApiFailure } from '@/lib/api';
import { solveChallenge } from '@/lib/pow';
import styles from './SignInDialog.module.css';

/**
 * The three doors, on one screen.
 *
 * Local is the default and comes first, because it is the only one that works
 * without leaving the site and the only one available to somebody who plays
 * this game without a Steam account of their own. The providers are underneath,
 * and only the ones the deployment actually has — `GET /auth/providers` answers
 * that, so a deploy with no Discord application does not draw a button that can
 * only fail.
 *
 * Sign-in and sign-up are one dialog with a toggle rather than two routes. They
 * differ by one field's worth of rules and a proof of work; two screens would
 * be two layouts to keep in step for a form of two inputs.
 */
export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { strings, refreshMe } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'signing' | 'working'>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState<AuthProvider[]>(['local']);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    authProviders(controller.signal)
      .then((answer) => setAvailable(answer.available))
      // A failure leaves the local form, which is the one that always exists.
      .catch(() => undefined);
    return () => controller.abort();
  }, [open]);

  /* A fresh dialog each time it is opened, rather than yesterday's error. */
  useEffect(() => {
    if (open) return;
    setErrors({});
    setPassword('');
    setBusy(null);
  }, [open]);

  const submit = useCallback(async () => {
    if (busy !== null) return;
    setErrors({});

    try {
      if (mode === 'in') {
        setBusy('signing');
        await signIn(nickname, password);
      } else {
        /*
         * The proof of work is fetched and solved *before* the account is
         * asked for, so the wait is visible as its own step rather than as a
         * sign-up that seems to hang. It is also why this is the slow path:
         * about a third of a CPU second, which is the whole point.
         */
        setBusy('working');
        const solution = await solveChallenge(await authChallenge());
        setBusy('signing');
        await signUp(nickname, password, solution);
      }

      refreshMe();
      onClose();
    } catch (error) {
      if (error instanceof ApiFailure) {
        setErrors(error.fields ?? { form: error.message });
      } else {
        setErrors({ form: strings.auth.powFailed });
      }
    } finally {
      setBusy(null);
    }
  }, [busy, mode, nickname, password, refreshMe, onClose, strings]);

  const signingUp = mode === 'up';

  return (
    <Dialog open={open} onClose={onClose} title={signingUp ? strings.auth.signUp : strings.auth.signIn}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label={strings.auth.nickname}
          {...(signingUp ? { hint: strings.auth.nicknameHint } : {})}
          {...(errors['nickname'] !== undefined ? { error: errors['nickname'] } : {})}
          {...(signingUp ? { value: nickname, max: MAX_NICKNAME } : {})}
        >
          {({ id, invalid }) => (
            <Input
              id={id}
              invalid={invalid}
              value={nickname}
              autoComplete="username"
              minLength={MIN_NICKNAME}
              maxLength={MAX_NICKNAME}
              onChange={(event) => setNickname(event.target.value)}
            />
          )}
        </Field>

        <Field
          label={strings.auth.password}
          {...(signingUp ? { hint: strings.auth.passwordHint } : {})}
          {...(errors['password'] !== undefined ? { error: errors['password'] } : {})}
        >
          {({ id, invalid }) => (
            <Input
              id={id}
              type="password"
              invalid={invalid}
              value={password}
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              minLength={signingUp ? MIN_PASSWORD : undefined}
              maxLength={MAX_PASSWORD}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        {/* Whatever had no field of its own: a wrong password, a spent proof. */}
        {errors['form'] !== undefined && <p className={styles.error}>{errors['form']}</p>}
        {errors['pow'] !== undefined && <p className={styles.error}>{strings.auth.powFailed}</p>}

        <Button
          type="submit"
          variant="primary"
          block
          disabled={busy !== null || nickname.trim() === '' || password === ''}
        >
          {busy === 'working' ? (
            <>
              <Spinner />
              {strings.auth.working}
            </>
          ) : busy === 'signing' ? (
            strings.common.loading
          ) : signingUp ? (
            strings.auth.signUp
          ) : (
            strings.auth.signIn
          )}
        </Button>

        <p className={styles.switch}>
          {signingUp ? strings.auth.haveAccount : strings.auth.noAccount}{' '}
          <button
            type="button"
            className={styles.switchLink}
            onClick={() => {
              setMode(signingUp ? 'in' : 'up');
              setErrors({});
            }}
          >
            {signingUp ? strings.auth.signIn : strings.auth.signUp}
          </button>
        </p>
      </form>

      {available.length > 1 && (
        <>
          <div className={styles.or}>
            <span>{strings.auth.or}</span>
          </div>

          {/*
            Real links, not buttons with an onClick. `/api/auth/<provider>`
            answers with a 302, so this has to be a navigation the browser
            performs — which also means it needs no CORS and survives being
            middle-clicked.
          */}
          <div className={styles.providers}>
            {available.includes('steam') && (
              <ButtonLink href="/api/auth/steam" block className={cx(styles.provider, styles.steam)}>
                <Icon.SteamMark size={18} />
                {strings.auth.withSteam}
              </ButtonLink>
            )}
            {available.includes('discord') && (
              <ButtonLink href="/api/auth/discord" block className={cx(styles.provider, styles.discord)}>
                <Icon.DiscordMark size={18} />
                {strings.auth.withDiscord}
              </ButtonLink>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
