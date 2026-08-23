/**
 * Storing and checking passwords.
 *
 * scrypt out of `node:crypto`, so this costs no dependency at all — which is
 * the whole argument for it here. argon2id is the better primitive on paper,
 * but every implementation of it is a native module, and a native module is a
 * compiler on the build host and a prebuild that has to match the runtime. That
 * is a real price for a difference this deployment cannot measure.
 *
 * The stored value is self-describing:
 *
 *     scrypt$N=16384,r=8,p=1$<salt>$<hash>
 *
 * so the parameters can be raised later without a migration and without
 * invalidating a single existing password: `verify` reads the cost out of the
 * row it was given rather than assuming today's constants, and `hash` writes
 * whatever is current. An old row keeps verifying at its old cost until its
 * owner next signs in — which is when a rehash could happen, if it is ever
 * worth doing.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptParams & { maxmem: number },
) => Promise<Buffer>;

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/**
 * How much memory to let scrypt have, derived rather than fixed.
 *
 * Node's default `maxmem` is 32 MB and scrypt's core array is `128·N·r`, so the
 * parameters below fit — but a *hardcoded* ceiling would turn the first raise of
 * N into a thrown `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` from inside `verify`, on
 * rows that were written perfectly correctly. That is a sign-in that fails for
 * one cohort of accounts and nobody else, which is a horrible thing to debug.
 *
 * Deriving it from the parameters actually in use makes that unrepresentable,
 * which is the whole point of storing them.
 */
function maxmemFor({ N, r }: ScryptParams): number {
  return 128 * N * r * 2 + (1 << 20);
}

/**
 * The cost, and why it is this and not more.
 *
 * scrypt's memory is `128 * N * r` bytes, so N=16384 with r=8 needs 16 MB —
 * which fits under Node's **default 32 MB `maxmem`**. N=32768 needs 32 MB and
 * throws `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` unless `maxmem` is raised
 * explicitly. This is the largest power of two that works with the defaults,
 * and it measures around 20 ms on a desktop and under 100 ms on the two-vCPU
 * machine this runs on.
 *
 * Raising it later means passing `maxmem` as well, and is free to do: the
 * format above carries the parameters, so old rows keep working.
 */
export const DEFAULT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const ALGORITHM = 'scrypt';

/**
 * Hashes a password for storage. Never logs, never returns the input.
 *
 * The async form on purpose. `scryptSync` would put ~50 ms of CPU on the event
 * loop of a single-process server, so a burst of sign-ins would serialise
 * behind it and every unrelated request would wait too. The async form runs on
 * libuv's threadpool instead — four threads by default, which also puts a
 * natural ceiling on how much hashing can be in flight at once.
 */
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: maxmemFor(params) });
  return [
    ALGORITHM,
    `N=${params.N},r=${params.r},p=${params.p}`,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/**
 * Whether `password` is the one behind `stored`.
 *
 * Returns false for anything it cannot make sense of rather than throwing: a
 * row that was corrupted, truncated or written by some future format is a
 * failed sign-in, not a 500 on a page that has nothing to do with it.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (parsed === null) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, parsed.salt, parsed.hash.length, {
      ...parsed.params,
      maxmem: maxmemFor(parsed.params),
    });
  } catch {
    // Parameters this Node will not run at all. Unverifiable is not the same as
    // wrong, but from here there is nothing else to answer.
    return false;
  }

  // Both are ours and both are `parsed.hash.length` by construction, so the
  // guard is belt and braces — but timingSafeEqual *throws* on a length
  // mismatch, and a throw here would be a 500 where a false belongs.
  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/**
 * A hash of nothing anybody knows, for the sign-in that has no account behind it.
 *
 * Returning `INVALID_CREDENTIALS` for both "no such nickname" and "wrong
 * password" is only half the job: if the first costs one indexed read and the
 * second costs 100 ms of scrypt, the *clock* answers the question the error
 * code refuses to. So a missed lookup verifies against this instead, and the
 * two paths take the same time.
 *
 * Built from random bytes at module load, so it is a genuinely valid hash that
 * no password on earth matches.
 */
export const DUMMY_HASH_PROMISE: Promise<string> = hashPassword(randomBytes(32).toString('hex'));

/** Burns the same scrypt work a real verification would, and always fails. */
export async function verifyAgainstNobody(password: string): Promise<false> {
  await verifyPassword(password, await DUMMY_HASH_PROMISE);
  return false;
}

interface Parsed {
  params: ScryptParams;
  salt: Buffer;
  hash: Buffer;
}

function parseStored(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 4) return null;
  const [algorithm, cost, salt, hash] = parts as [string, string, string, string];
  if (algorithm !== ALGORITHM) return null;

  const params = parseParams(cost);
  if (params === null) return null;

  const saltBytes = Buffer.from(salt, 'base64url');
  const hashBytes = Buffer.from(hash, 'base64url');

  /*
   * Lengths are checked, and the hash one is not cosmetic.
   *
   * `verify` derives a key the same length as the stored hash so that a future
   * longer key still works. That makes the stored length an *input* to the
   * comparison — so a row truncated to one byte would have every password match
   * it one time in 256. Refusing anything shorter than what we write today is
   * what keeps that length from being pushed downwards; longer is still fine,
   * which is the growth this leaves room for.
   *
   * `Buffer.from` is lenient — it decodes what it can and returns empty for
   * rubbish rather than complaining — so these are also the syntax check.
   */
  if (saltBytes.length < SALT_LENGTH) return null;
  if (hashBytes.length < KEY_LENGTH) return null;

  return { params, salt: saltBytes, hash: hashBytes };
}

function parseParams(cost: string): ScryptParams | null {
  const found: Record<string, number> = {};
  for (const pair of cost.split(',')) {
    const [key, value] = pair.split('=');
    if (key === undefined || value === undefined) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    found[key] = n;
  }
  const { N, r, p } = found;
  if (N === undefined || r === undefined || p === undefined) return null;
  // N has to be a power of two or scrypt rejects it; catching that here means
  // a malformed row fails as an unreadable row rather than as a thrown error.
  if ((N & (N - 1)) !== 0) return null;
  /*
   * Bounded, and this is not decoration.
   *
   * `maxmemFor` derives the memory ceiling from these numbers, so an `N=2^30`
   * in a corrupted or tampered row would have this process cheerfully ask the
   * allocator for 128 GB. The column is only ever written by this server, so
   * this is defence in depth — but "the database is trusted" is the last
   * assumption that should be load-bearing in the password path.
   */
  if (N < 1024 || N > 1 << 17) return null;
  if (r < 1 || r > 16) return null;
  if (p < 1 || p > 4) return null;
  return { N, r, p };
}
