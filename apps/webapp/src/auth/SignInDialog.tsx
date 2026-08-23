import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AuthResponse, PowChallenge, PowSolution } from 'aow5-api-contract';
import { MAX_NICKNAME, MIN_NICKNAME, MIN_PASSWORD } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setMe } from '@/auth/useMe';
import { closeSignIn, useSignInDialog, type SignInMode } from '@/auth/signInStore';
import { expectedAttempts } from '@/lib/pow';
import { ApiFailure, api } from '@/lib/api';
import type { SiteStrings } from '@/i18n/site';
import type { SolveMessage } from './pow.worker.ts';

/**
 * Signing in and signing up, in one dialog.
 *
 * Mounted once, near the Toaster, and opened by the header through
 * `openSignIn()` — which is the only place on the site that offers it.
 *
 * A dialog and not a page because the planner keeps the whole board in
 * `location.hash`: navigating away to sign in would mean carrying that board
 * out and putting it back, and this way it simply never leaves.
 */
export function SignInDialog({ site }: { site: SiteStrings }) {
  const { open, mode } = useSignInDialog();
  const [tab, setTab] = useState<SignInMode>(mode);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  const t = site.auth;

  // Reopening starts clean. Leaving a typed password in a closed dialog is both
  // a small surprise and a thing sitting in memory for no reason.
  useEffect(() => {
    if (open) {
      setTab(mode);
      setNickname('');
      setPassword('');
      setError(null);
      setProgress(null);
      setBusy(false);
    }
  }, [open, mode]);

  // The worker outlives a single solve but not the dialog: keeping it alive
  // while signed in would hold a thread for a form nobody is looking at.
  useEffect(() => {
    if (!open) {
      worker.current?.terminate();
      worker.current = null;
    }
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, [open]);

  /**
   * Fetches a challenge and solves it off the main thread.
   *
   * The whole reason this is a worker: at difficulty 18 this is a few hundred
   * thousand hashes, which on the main thread would freeze the tab for a second
   * or two — including the spinner that is supposed to be reassuring.
   */
  const solveChallenge = useCallback(async (): Promise<PowSolution> => {
    const challenge = await api<PowChallenge>('/auth/challenge');
    const total = expectedAttempts(challenge.difficulty);
    setProgress(0);

    const instance = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;

    try {
      const nonce = await new Promise<number>((resolve, reject) => {
        instance.addEventListener('message', (event: MessageEvent<SolveMessage>) => {
          const message = event.data;
          if (message.type === 'progress') setProgress(Math.min(0.99, message.attempts / total));
          else if (message.type === 'solved') resolve(message.nonce);
          else reject(new Error('the challenge was abandoned'));
        });
        instance.addEventListener('error', () => reject(new Error('the solver failed to start')));
        instance.postMessage({ salt: challenge.salt, bits: challenge.difficulty });
      });
      return { ...challenge, nonce };
    } finally {
      instance.terminate();
      if (worker.current === instance) worker.current = null;
      setProgress(null);
    }
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response =
        tab === 'signUp'
          ? await api<AuthResponse>('/auth/register', {
              method: 'POST',
              body: { nickname, password, pow: await solveChallenge() },
            })
          : await api<AuthResponse>('/auth/login', { method: 'POST', body: { nickname, password } });

      // Straight into the cache the header reads, so nothing refetches.
      setMe(response.user);
      closeSignIn();
    } catch (failure) {
      setError(messageFor(failure, t));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy && nickname.trim().length >= MIN_NICKNAME && [...password].length >= MIN_PASSWORD;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeSignIn()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tab === 'signUp' ? t.dialogTitleSignUp : t.dialogTitleSignIn}</DialogTitle>
          <DialogDescription>{tab === 'signUp' ? t.dialogLeadSignUp : t.dialogLeadSignIn}</DialogDescription>
        </DialogHeader>

        {/* A real form, so Enter submits — which no other form on this site
            manages, and which is the first thing anyone tries in a login box. */}
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="auth-nickname">{t.nickname}</Label>
            <Input
              id="auth-nickname"
              autoFocus
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={MAX_NICKNAME}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
            />
            {tab === 'signUp' && <p className="text-xs text-muted-foreground">{t.nicknameHint}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="auth-password">{t.password}</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={tab === 'signUp' ? 'new-password' : 'current-password'}
              disabled={busy}
            />
            {tab === 'signUp' && <p className="text-xs text-muted-foreground">{t.passwordHint}</p>}
          </div>

          {/* Said before they commit, not after they lose an account. */}
          {tab === 'signUp' && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">{t.noRecovery}</p>
          )}

          {error !== null && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {progress !== null && (
            <div className="grid gap-1.5" aria-live="polite">
              <p className="text-xs text-muted-foreground">{t.solving}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
            <Button type="submit" disabled={!canSubmit}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? (progress !== null ? t.solving : t.working) : tab === 'signUp' ? t.signUp : t.signIn}
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={busy}
              onClick={() => {
                setTab(tab === 'signUp' ? 'signIn' : 'signUp');
                setError(null);
              }}
            >
              {tab === 'signUp' ? t.switchToSignIn : t.switchToSignUp}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The server's code, in the visitor's language.
 *
 * Switching on `code` rather than showing `message`: the messages are for a
 * network tab and are deliberately not translated.
 */
function messageFor(failure: unknown, t: SiteStrings['auth']): string {
  if (!(failure instanceof ApiFailure)) return t.errorGeneric;
  switch (failure.code) {
    case 'INVALID_CREDENTIALS':
      return t.errorCredentials;
    case 'NICKNAME_TAKEN':
      return t.errorTaken;
    case 'CAPTCHA_FAILED':
      return t.errorCaptcha;
    case 'RATE_LIMITED':
      return t.errorRateLimited;
    case 'FORBIDDEN':
      return t.errorBanned;
    case 'VALIDATION_FAILED':
      return failure.fields?.['nickname'] !== undefined ? t.errorNickname : t.errorPassword;
    default:
      return t.errorGeneric;
  }
}
