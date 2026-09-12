import type { PowChallenge, PowSolution } from 'aow5-api-contract';

/**
 * Solves a challenge in a worker, and gives up rather than hanging.
 *
 * The timeout is not a defence — it is an admission that the search is
 * probabilistic. At 18 bits the expected work is about 262,000 hashes, but the
 * distribution has a long tail, and an unlucky run on a slow phone should end
 * in "try again" rather than in a spinner nobody can escape.
 *
 * The worker is created per solve and terminated either way. One challenge is
 * one sign-up attempt, so there is nothing to keep warm.
 */
export function solveChallenge(challenge: PowChallenge, timeoutMs = 60_000): Promise<PowSolution> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });

    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('proof of work timed out'));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<PowSolution>) => {
      window.clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };

    worker.onerror = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message || 'proof of work failed'));
    };

    worker.postMessage(challenge);
  });
}
