import { LogOut, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { forgetMe, useMe } from '@/auth/useMe';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure, api, signInUrl } from '@/lib/api';

/**
 * Sign in, or who you are signed in as.
 *
 * A plain `<a>` and not a fetch: sign-in is a full-page navigation to Steam and
 * back, so the browser has to own it — which is also what lets the session
 * cookie be set on a top-level response rather than an XHR one.
 *
 * Renders a fixed-size blank while the answer is loading. A control that
 * appears and then swaps to an avatar moves everything beside it, and the
 * header is the last place that should twitch on every page load.
 */
export function AccountMenu({ site }: { site: SiteStrings }) {
  const state = useMe();

  if (state.status === 'loading') return <div className="size-8" aria-hidden />;

  if (state.user === null) {
    return (
      <Button variant="outline" size="sm" asChild title={site.auth.signInWhy}>
        <a href={signInUrl()}>{site.auth.signIn}</a>
      </Button>
    );
  }

  const user = state.user;
  const count = site.auth.buildCount
    .replace('{n}', String(user.buildCount))
    .replace('{max}', String(user.buildLimit));

  async function signOut() {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (error instanceof ApiFailure) toast.error(error.message);
    } finally {
      // Whatever the server said, this browser is done with that session — and
      // a failed sign-out that leaves the avatar in place looks like nothing
      // happened.
      forgetMe();
    }
  }

  return (
    <div className="flex items-center gap-1">
      <span className="flex items-center gap-2 text-sm" title={`${user.persona} — ${count}`}>
        {user.avatarUrl === '' ? (
          <User className="size-6 rounded-full border p-1" aria-hidden />
        ) : (
          <img src={user.avatarUrl} alt="" width={24} height={24} className="size-6 rounded-full border" />
        )}
        <span className="hidden max-w-28 truncate lg:inline">{user.persona}</span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void signOut()}
        aria-label={site.auth.signOut}
        title={site.auth.signOut}
      >
        <LogOut />
      </Button>
    </div>
  );
}
