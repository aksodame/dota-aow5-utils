/**
 * SHA-256, synchronously, over an ASCII string.
 *
 * `crypto.subtle.digest` is the right way to hash in a browser and is useless
 * here: it is a promise per call, and the sign-up proof of work needs a quarter
 * of a million hashes. Awaiting each one would spend the whole budget on
 * microtask scheduling rather than on the work the challenge is asking for.
 *
 * ASCII only, which is all this is ever fed — a base64url salt and a decimal
 * nonce. A code point past 127 would be truncated rather than encoded, so the
 * one caller keeps it to that and this stays fifty lines instead of also being
 * a UTF-8 encoder.
 *
 * Runs in a worker, so a slow phone spends its second of hashing without
 * freezing the form the answer belongs to.
 */

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

const W = new Uint32Array(64);

/**
 * The first four bytes of `sha256(ascii)`, as a big-endian number.
 *
 * Four bytes rather than the whole digest because the only question asked of it
 * is how many leading zero *bits* it has, and the answer can never exceed 32
 * before the caller has already stopped. Returning a number instead of a
 * `Uint8Array` avoids an allocation per attempt, which at this call count is
 * the difference between a second and several.
 */
export function sha256Prefix32(ascii: string): number {
  const length = ascii.length;
  // One 64-byte block per 56 bytes of input, plus the length field.
  const blocks = ((length + 8) >> 6) + 1;
  const bytes = new Uint8Array(blocks << 6);
  for (let i = 0; i < length; i += 1) bytes[i] = ascii.charCodeAt(i) & 0xff;
  bytes[length] = 0x80;

  // The bit length, big-endian, in the last eight bytes. Inputs here are tens
  // of bytes, so the high word is always zero.
  const bits = length * 8;
  const tail = bytes.length - 4;
  bytes[tail] = (bits >>> 24) & 0xff;
  bytes[tail + 1] = (bits >>> 16) & 0xff;
  bytes[tail + 2] = (bits >>> 8) & 0xff;
  bytes[tail + 3] = bits & 0xff;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let block = 0; block < blocks; block += 1) {
    const at = block << 6;
    for (let i = 0; i < 16; i += 1) {
      const j = at + (i << 2);
      W[i] = (bytes[j]! << 24) | (bytes[j + 1]! << 16) | (bytes[j + 2]! << 8) | bytes[j + 3]!;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = W[i - 15]!;
      const w2 = W[i - 2]!;
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + W[i]!) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return h0 >>> 0;
}

/** Whether `sha256(salt + nonce)` opens with `bits` zero bits. Mirrors the server. */
export function meetsDifficulty(salt: string, nonce: number, bits: number): boolean {
  // Only the first 32 bits are computed, so a challenge asking for more than
  // that would always be refused. The server's default is 18; this is the
  // guard that makes the limitation explicit rather than silent.
  if (bits > 32) return false;
  // `>>> 32` is `>>> 0` in JavaScript — the shift count is taken mod 32 — so
  // zero bits would ask "is the whole prefix zero" rather than "is nothing
  // required". Handled before the shift rather than inside it.
  if (bits <= 0) return true;
  return sha256Prefix32(`${salt}${nonce}`) >>> (32 - bits) === 0;
}
