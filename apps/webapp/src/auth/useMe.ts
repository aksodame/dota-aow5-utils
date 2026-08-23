import { useEffect, useState } from 'react';
import type { MeResponse, MeUser } from 'aow5-api-contract';
import { api } from '@/lib/api';

/**
 * Who the viewer is.
 *
 * Asked once for the whole page and cached at module scope, the same shape as
 * `lib/release.ts`: several components want the answer and none of them should
 * cost another request. **Only the answer is cached** — a failure is not, so a
 * visitor whose first request lost the network is not stuck signed out until
 * they reload.
 *
 * The API answers 200 with a null user when nobody is signed in, so there is no
 * error state to distinguish here: not signed in and could not ask both render
 * a sign-in button, which is the correct thing to offer in either case.
 */

export type MeState = { status: 'loading' } | { status: 'ready'; user: MeUser | null };

let cached: MeUser | null | undefined;
let inFlight: Promise<MeUser | null> | null = null;
const listeners = new Set<(user: MeUser | null) => void>();

async function load(): Promise<MeUser | null> {
  if (cached !== undefined) return cached;
  inFlight ??= api<MeResponse>('/me')
    .then((response) => {
      cached = response.user;
      return response.user;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Replaces the cached answer and tells every mounted consumer.
 *
 * Called after signing out, and after anything that changes `buildCount` — the
 * header shows "n of 5", and it going stale the moment somebody publishes is
 * exactly the kind of small wrongness that reads as a bug.
 */
export function setMe(user: MeUser | null): void {
  cached = user;
  for (const listener of listeners) listener(user);
}

/** Drops the cache so the next mount asks again. */
export function forgetMe(): void {
  cached = undefined;
  setMe(null);
}

export function useMe(): MeState {
  const [state, setState] = useState<MeState>(
    cached === undefined ? { status: 'loading' } : { status: 'ready', user: cached },
  );

  useEffect(() => {
    let live = true;
    const listener = (user: MeUser | null) => {
      if (live) setState({ status: 'ready', user });
    };
    listeners.add(listener);

    void load().then((user) => {
      if (live) setState({ status: 'ready', user });
    });

    return () => {
      live = false;
      listeners.delete(listener);
    };
  }, []);

  return state;
}
