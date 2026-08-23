/**
 * Solving the sign-up challenge.
 *
 * The server hands out a salt and a number of leading zero bits; this hunts for
 * a nonce whose `sha256(salt + nonce)` has them. It is deliberately dull work —
 * the cost *is* the point, and it is what stops sign-up being free to script.
 *
 * JSX-free so it can be tested: `src/lib/*.test.ts` is the whole test surface
 * this app has, because Node strips types but not JSX.
 */
import { sha256 } from './sha256.ts';

const encoder = new TextEncoder();

/** Whether `sha256(salt + nonce)` opens with `bits` zero bits. */
export function meetsDifficulty(salt: string, nonce: number, bits: number): boolean {
  const digest = sha256(encoder.encode(`${salt}${nonce}`));
  let remaining = bits;
  let index = 0;
  while (remaining >= 8) {
    if (digest[index] !== 0) return false;
    index += 1;
    remaining -= 8;
  }
  if (remaining === 0) return true;
  return (digest[index]! >> (8 - remaining)) === 0;
}

export interface SolveOptions {
  /** Called every `reportEvery` attempts, for a progress bar that is not a lie. */
  onProgress?: (attempts: number) => void;
  /** Return true to give up — the dialog closed, or the person hit cancel. */
  shouldStop?: () => boolean;
  reportEvery?: number;
}

/**
 * Hunts for a nonce. Returns null only if `shouldStop` asked it to give up.
 *
 * Starting from a random offset rather than from zero: every browser solving
 * the same salt from zero would do identical work, and a shared prefix is a
 * table somebody could precompute. The salt is already random per challenge, so
 * this is belt and braces — but it costs one call and removes the question.
 */
export function solve(salt: string, bits: number, options: SolveOptions = {}): number | null {
  const { onProgress, shouldStop, reportEvery = 20_000 } = options;
  const start = Math.floor(Math.random() * 0x7fffffff);
  let attempts = 0;

  for (let i = 0; i < Number.MAX_SAFE_INTEGER; i += 1) {
    // Wrapped into a positive 31-bit range so the nonce stays a small integer
    // the server will accept, however long this runs.
    const nonce = (start + i) % 0x7fffffff;
    if (meetsDifficulty(salt, nonce, bits)) return nonce;

    attempts += 1;
    if (attempts % reportEvery === 0) {
      if (shouldStop?.() === true) return null;
      onProgress?.(attempts);
    }
  }
  return null;
}

/**
 * Roughly how many hashes a challenge of this difficulty takes.
 *
 * A mean, not a bound — the distribution is geometric, so roughly one visitor
 * in twenty does three times this much work. Used only to turn an attempt count
 * into a progress bar, which is why it does not need to be better than rough.
 */
export function expectedAttempts(bits: number): number {
  return 2 ** bits;
}
