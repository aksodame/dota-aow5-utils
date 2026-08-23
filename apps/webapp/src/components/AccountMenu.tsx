import { LogOut, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { forgetMe, useMe } from '@/auth/useMe';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure, api } from '@/lib/api';
import { openSignIn } from '@/auth/signInStore';

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

  // Both doors, and this is the only place on the site that offers either. The
  // pages themselves show less when signed out rather than asking.
  if (state.user === null) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => openSignIn('signIn')} title={site.auth.signInWhy}>
          {site.auth.signIn}
        </Button>
        <Button variant="outline" size="sm" onClick={() => openSignIn('signUp')}>
          {site.auth.signUp}
        </Button>
      </div>
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
      <span className="flex items-center gap-2 text-sm" title={`${user.nickname} — ${count}`}>
        <User className="size-6 rounded-full border p-1" aria-hidden />
        <span className="hidden max-w-28 truncate lg:inline">{user.nickname}</span>
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
