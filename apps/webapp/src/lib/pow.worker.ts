import type { PowChallenge, PowSolution } from 'aow5-api-contract';
import { meetsDifficulty } from './sha256.ts';

/**
 * Hunts for the nonce, off the main thread.
 *
 * A worker rather than a chunked loop on the UI thread: the search is about a
 * quarter of a million hashes at the server's default of 18 bits, which is
 * roughly a third of a second on a laptop and several on a phone. Doing that
 * between paints means a form that stops responding while somebody watches it.
 *
 * Vite emits this as a real file because it is referenced by `new URL(…,
 * import.meta.url)`, which is what keeps `script-src 'self'` sufficient — a
 * `blob:` worker would need the policy widened.
 */
self.onmessage = (event: MessageEvent<PowChallenge>) => {
  const challenge = event.data;
  for (let nonce = 0; nonce < Number.MAX_SAFE_INTEGER; nonce += 1) {
    if (meetsDifficulty(challenge.salt, nonce, challenge.difficulty)) {
      (self as unknown as Worker).postMessage({ ...challenge, nonce } satisfies PowSolution);
      return;
    }
  }
};
