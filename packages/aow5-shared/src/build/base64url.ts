/**
 * base64url for the URL payload.
 *
 * Built on btoa/atob rather than `Uint8Array.toBase64()`, whose browser support
 * is still too recent to rely on. Works unchanged under Node, which is what
 * lets the codec be tested with `node --test` and no DOM shim.
 */

const PAD = /=+$/;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked so a large payload cannot blow the argument limit of String.fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(PAD, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64UrlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url: illegal character');
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
