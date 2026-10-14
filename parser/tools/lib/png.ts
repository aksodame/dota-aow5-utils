const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngInfo {
  width: number;
  height: number;
}

export function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(MAGIC);
}

/**
 * Reads dimensions from the IHDR chunk, which the spec requires to be first.
 * Returns null for anything that is not a PNG — used to reject CDN error pages
 * that come back with a 200 status.
 */
export function readPngInfo(buf: Buffer): PngInfo | null {
  if (!isPng(buf) || buf.length < 24) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * The PNG without its text chunks (`tEXt`, `zTXt`, `iTXt`).
 *
 * Valve's CDN ships a couple of item icons — `disperser`, `phylactery` — with
 * two megabytes of editor metadata riding in text chunks behind a picture of a
 * few kilobytes. Nothing renders them, and the shared package's icon test
 * refuses them. Every other chunk is copied as it was, CRCs included, so the
 * image itself is byte-identical.
 */
export function stripTextChunks(buf: Buffer): Buffer {
  if (!isPng(buf)) return buf;
  const parts: Buffer[] = [buf.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const end = at + 12 + length;
    if (end > buf.length) return buf; // truncated: leave it for verify to refuse
    const kind = buf.toString('ascii', at + 4, at + 8);
    if (kind !== 'tEXt' && kind !== 'zTXt' && kind !== 'iTXt') parts.push(buf.subarray(at, end));
    at = end;
    if (kind === 'IEND') break;
  }
  return Buffer.concat(parts);
}
