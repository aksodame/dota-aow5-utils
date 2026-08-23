/**
 * The proof-of-work solver, off the main thread.
 *
 * A worker rather than a loop in the component, and not as a nicety: half a
 * second to a couple of seconds of solid hashing on the main thread freezes the
 * tab — the spinner stops spinning, the cancel button stops responding, and
 * Chrome eventually offers to kill the page. All of which look like the site
 * has crashed, at the exact moment somebody is deciding whether to sign up.
 *
 * Loaded with `new URL(..., import.meta.url)` so Vite emits it as a real
 * same-origin file. That matters for more than tidiness: the site's CSP is
 * `default-src 'self'` with `script-src 'self'`, which a `blob:` worker would
 * violate and this does not.
 */
import { solve } from '@/lib/pow';

export interface SolveRequest {
  salt: string;
  bits: number;
}

export type SolveMessage =
  | { type: 'progress'; attempts: number }
  | { type: 'solved'; nonce: number }
  | { type: 'failed' };

self.addEventListener('message', (event: MessageEvent<SolveRequest>) => {
  const { salt, bits } = event.data;
  const nonce = solve(salt, bits, {
    onProgress: (attempts) => {
      const message: SolveMessage = { type: 'progress', attempts };
      self.postMessage(message);
    },
  });
  const done: SolveMessage = nonce === null ? { type: 'failed' } : { type: 'solved', nonce };
  self.postMessage(done);
});
