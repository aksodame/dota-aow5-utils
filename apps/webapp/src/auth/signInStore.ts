/**
 * Whether the sign-in dialog is open, and which tab it opened on.
 *
 * A module-scope store with a listener set, the same shape as `useMe` and
 * `lib/release` — not a context, which is why this app still has exactly one
 * provider in its tree.
 *
 * Only the header opens it. That is deliberate: a control whose sole purpose is
 * to ask for an account reads as a demand on a tool that has never needed one,
 * so the pages show less when signed out instead of asking. The store stays
 * because the header is not where the dialog is *mounted*.
 *
 * JSX-free so it stays importable from anywhere, including a test.
 */
import { useSyncExternalStore } from 'react';

export type SignInMode = 'signIn' | 'signUp';

export interface SignInState {
  open: boolean;
  mode: SignInMode;
}

let state: SignInState = { open: false, mode: 'signIn' };
const listeners = new Set<() => void>();

function set(next: SignInState): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Opens the dialog.
 *
 * This replaces what used to be a full-page navigation to Steam and back. The
 * planner keeps the entire board in `location.hash`, so a sign-in that
 * navigated away had to carry a return path and put it back; a dialog never
 * leaves the page, and the board is simply still there when it closes.
 */
export function openSignIn(mode: SignInMode = 'signIn'): void {
  set({ open: true, mode });
}

export function closeSignIn(): void {
  if (state.open) set({ ...state, open: false });
}

export function useSignInDialog(): SignInState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}
