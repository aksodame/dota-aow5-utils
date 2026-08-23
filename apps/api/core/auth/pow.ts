/**
 * The captcha, such as it is: a proof of work.
 *
 * The server hands out a random salt and a difficulty; the browser hunts for a
 * nonce whose `sha256(salt + nonce)` starts with that many zero bits; the
 * server checks it. No third party, no key pair in the deploy, no outbound
 * request, and nothing to add to the site's Content-Security-Policy.
 *
 * ## What it does and does not do
 *
 * It makes bulk sign-up cost something — roughly a third of a CPU second each,
 * against nothing at all today — and that is enough to stop the scripted floods
 * that are the actual threat to a site this size. It does **not** stop a
 * determined attacker, a GPU, or a botnet, and it is not a bot *detector*: it
 * cannot tell a person from a patient script, and it is not trying to. Anything
 * stronger than this means sending visitors to Cloudflare or hCaptcha, which is
 * a trade this deployment has deliberately not made.
 *
 * ## Why there is no challenge table
 *
 * `signature` is an HMAC over the rest of the challenge, so the whole thing can
 * live on the client between issue and redeem and be verified by re-deriving
 * it. The one thing an HMAC cannot do is stop the same solved challenge being
 * submitted a thousand times inside its window — that genuinely needs memory,
 * and `ConsumedSalts` below is the smallest amount of it that works.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PowChallenge, PowSolution } from 'aow5-api-contract';

/**
 * How long a challenge is good for.
 *
 * Long enough to fill in a sign-up form unhurriedly, short enough that the
 * consumed-salt set stays small and a restart throws away almost nothing.
 */
export const CHALLENGE_TTL_SECONDS = 10 * 60;

/**
 * Leading zero bits required of `sha256(salt + nonce)`.
 *
 * Expected work is 2^18, about 260 000 hashes — a few hundred milliseconds in a
 * browser, which reads as a brief pause and not as a wait. It is a *mean*, not
 * a bound: the distribution is geometric, so an unlucky visitor occasionally
 * does three times that. Worth knowing before choosing anything higher.
 */
export const DEFAULT_DIFFICULTY = 18;

/** Beyond this, a forged challenge could ask a browser to hang for minutes. */
const MAX_DIFFICULTY = 24;

const SALT_BYTES = 16;

/**
 * Mints a challenge.
 *
 * `secret` never leaves the process — see `PowKeeper` for where it comes from.
 */
export function issueChallenge(
  secret: Buffer,
  now: number,
  difficulty: number = DEFAULT_DIFFICULTY,
): PowChallenge {
  const salt = randomBytes(SALT_BYTES).toString('base64url');
  const expiresAt = now + CHALLENGE_TTL_SECONDS;
  return { salt, difficulty, expiresAt, signature: sign(secret, salt, difficulty, expiresAt) };
}

export type PowFailure =
  | 'malformed'
  | 'bad-signature'
  | 'expired'
  | 'replayed'
  | 'insufficient-work';

export type PowVerdict = { ok: true } | { ok: false; reason: PowFailure };

/**
 * Checks a solved challenge, and consumes it if it holds up.
 *
 * The order matters: the signature comes first, because until it passes, every
 * other field is just something a stranger typed. The reasons are returned for
 * a log line and for tests — the controller collapses all of them into one
 * `CAPTCHA_FAILED`, because telling somebody which check they failed only helps
 * whoever is probing.
 */
export function verifySolution(
  secret: Buffer,
  consumed: ConsumedSalts,
  solution: PowSolution,
  now: number,
): PowVerdict {
  if (!isWellFormed(solution)) return { ok: false, reason: 'malformed' };

  const expected = sign(secret, solution.salt, solution.difficulty, solution.expiresAt);
  if (!equalStrings(expected, solution.signature)) return { ok: false, reason: 'bad-signature' };

  // Only now is `expiresAt` ours rather than the client's.
  if (solution.expiresAt <= now) return { ok: false, reason: 'expired' };

  if (consumed.has(solution.salt)) return { ok: false, reason: 'replayed' };

  if (!meetsDifficulty(solution.salt, solution.nonce, solution.difficulty)) {
    return { ok: false, reason: 'insufficient-work' };
  }

  consumed.add(solution.salt, solution.expiresAt);
  return { ok: true };
}

/** Whether `sha256(salt + nonce)` opens with `bits` zero bits. */
export function meetsDifficulty(salt: string, nonce: number, bits: number): boolean {
  const digest = createHash('sha256').update(`${salt}${nonce}`).digest();
  let remaining = bits;
  let index = 0;
  while (remaining >= 8) {
    if (digest[index] !== 0) return false;
    index++;
    remaining -= 8;
  }
  if (remaining === 0) return true;
  // The partial byte: the top `remaining` bits of it have to be clear.
  return (digest[index]! >> (8 - remaining)) === 0;
}

function sign(secret: Buffer, salt: string, difficulty: number, expiresAt: number): string {
  return createHmac('sha256', secret).update(`${salt}.${difficulty}.${expiresAt}`).digest('base64url');
}

function isWellFormed(solution: PowSolution): boolean {
  if (typeof solution !== 'object' || solution === null) return false;
  const { salt, difficulty, expiresAt, signature, nonce } = solution;
  if (typeof salt !== 'string' || salt === '' || salt.length > 64) return false;
  if (typeof signature !== 'string' || signature === '') return false;
  if (!Number.isSafeInteger(nonce) || nonce < 0) return false;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return false;
  // A difficulty out of range cannot have been signed by us, so this is only
  // ever reached by something forged — but bounding it before it is used means
  // `meetsDifficulty` can never be asked to read past the end of a digest.
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > MAX_DIFFICULTY) return false;
  return true;
}

/** Constant-time where it can be, and length-safe where it cannot. */
function equalStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The salts that have already been spent.
 *
 * In memory, and correct in memory for the same reason the throttler's storage
 * is: this is one process on one box. If it ever becomes two, this and the rate
 * limiter both need somewhere shared to live, and that is the moment a Redis
 * earns its place — not before.
 *
 * Bounded by the rate limit on the challenge endpoint times the TTL, so it
 * cannot grow without someone first getting past the throttler. Swept on write
 * rather than on a timer, so an idle server has nothing scheduled.
 */
export class ConsumedSalts {
  readonly #expiryBySalt = new Map<string, number>();
  #lastSweep = 0;

  /** How often to walk the map, in seconds of wall clock. */
  static readonly SWEEP_INTERVAL_SECONDS = 60;

  has(salt: string): boolean {
    return this.#expiryBySalt.has(salt);
  }

  add(salt: string, expiresAt: number): void {
    this.#expiryBySalt.set(salt, expiresAt);
    this.sweep(expiresAt - CHALLENGE_TTL_SECONDS);
  }

  /** Drops everything that has expired. Public for the test, cheap enough to call. */
  sweep(now: number): void {
    if (now - this.#lastSweep < ConsumedSalts.SWEEP_INTERVAL_SECONDS) return;
    this.#lastSweep = now;
    for (const [salt, expiresAt] of this.#expiryBySalt) {
      if (expiresAt <= now) this.#expiryBySalt.delete(salt);
    }
  }

  get size(): number {
    return this.#expiryBySalt.size;
  }
}

/**
 * The signing key, and the argument for where it comes from.
 *
 * Generated at boot and never written down. That means a restart invalidates
 * every outstanding challenge — but a challenge lives ten minutes and a restart
 * is a deploy, so the worst case is that somebody mid-sign-up presses the
 * button again. The alternative is another secret in `/srv/aow5/.env`, another
 * line in `bootstrap-deploy.ts` and another thing to rotate, all bought for a
 * ten-minute window. That trade is not worth making.
 */
export class PowKeeper {
  readonly #secret = randomBytes(32);
  readonly #consumed = new ConsumedSalts();

  issue(now: number): PowChallenge {
    return issueChallenge(this.#secret, now);
  }

  verify(solution: PowSolution, now: number): PowVerdict {
    return verifySolution(this.#secret, this.#consumed, solution, now);
  }
}
