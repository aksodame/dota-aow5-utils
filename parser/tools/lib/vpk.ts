import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * Minimal reader for Valve Pak v2 archives.
 *
 * Only the directory tree (~788 KB for the AOW5 pak) is held in memory; entry
 * bodies are read on demand with positioned reads, so an 878 MB archive costs
 * roughly nothing until you actually ask for a file.
 */

export const VPK_SIGNATURE = 0x55aa1234;
/** Marks an entry as living in this same file rather than a split _NNN.vpk. */
export const ARCHIVE_INDEX_SELF = 0x7fff;

export interface VpkEntry {
  /** Lowercased `dir/name.ext`, forward slashes. */
  path: string;
  crc: number;
  preload: Buffer;
  archiveIndex: number;
  entryOffset: number;
  entryLength: number;
}

export interface VpkHeader {
  version: number;
  treeSize: number;
  fileDataSectionSize: number;
  dataStart: number;
}

export class Vpk {
  readonly filePath: string;
  readonly header: VpkHeader;
  readonly entries: Map<string, VpkEntry>;
  #fd: number;

  private constructor(filePath: string, fd: number, header: VpkHeader, entries: Map<string, VpkEntry>) {
    this.filePath = filePath;
    this.#fd = fd;
    this.header = header;
    this.entries = entries;
  }

  static open(filePath: string): Vpk {
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.alloc(28);
      readExact(fd, head, 0);
      const signature = head.readUInt32LE(0);
      if (signature !== VPK_SIGNATURE) {
        throw new Error(`not a VPK: signature 0x${signature.toString(16)} at ${filePath}`);
      }
      const version = head.readUInt32LE(4);
      if (version !== 2) throw new Error(`unsupported VPK version ${version} (expected 2)`);
      const treeSize = head.readUInt32LE(8);
      const fileDataSectionSize = head.readUInt32LE(12);

      const tree = Buffer.alloc(treeSize);
      readExact(fd, tree, 28);

      const header: VpkHeader = { version, treeSize, fileDataSectionSize, dataStart: 28 + treeSize };
      return new Vpk(filePath, fd, header, parseTree(tree));
    } catch (err) {
      fs.closeSync(fd);
      throw err;
    }
  }

  get(path: string): VpkEntry | undefined {
    return this.entries.get(path.toLowerCase());
  }

  /** Like `get`, but throws with a useful message instead of returning undefined. */
  require(path: string): VpkEntry {
    const entry = this.get(path);
    if (!entry) throw new Error(`VPK entry not found: ${path}`);
    return entry;
  }

  /**
   * Reads an entry's full contents. Verifies CRC32 unless explicitly skipped —
   * this is the cheapest possible proof that the tree parser is byte-exact.
   */
  read(entry: VpkEntry, opts: { verifyCrc?: boolean } = {}): Buffer {
    if (entry.archiveIndex !== ARCHIVE_INDEX_SELF) {
      throw new Error(
        `entry ${entry.path} lives in split archive _${String(entry.archiveIndex).padStart(3, '0')}.vpk, which is not present`,
      );
    }
    let out: Buffer;
    if (entry.entryLength === 0) {
      out = Buffer.from(entry.preload);
    } else {
      const body = Buffer.alloc(entry.entryLength);
      readExact(this.#fd, body, this.header.dataStart + entry.entryOffset);
      out = entry.preload.length > 0 ? Buffer.concat([entry.preload, body]) : body;
    }
    if (opts.verifyCrc !== false) {
      const actual = zlib.crc32(out) >>> 0;
      if (actual !== entry.crc) {
        throw new Error(
          `CRC mismatch for ${entry.path}: expected 0x${entry.crc.toString(16)}, got 0x${actual.toString(16)}`,
        );
      }
    }
    return out;
  }

  readPath(path: string, opts?: { verifyCrc?: boolean }): Buffer {
    return this.read(this.require(path), opts);
  }

  /** All entries directly inside `dir` (non-recursive) with the given extension. */
  listDir(dir: string, ext?: string): VpkEntry[] {
    const prefix = `${dir.toLowerCase().replace(/\/+$/, '')}/`;
    const suffix = ext ? `.${ext.toLowerCase()}` : '';
    const out: VpkEntry[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.path.startsWith(prefix)) continue;
      if (entry.path.indexOf('/', prefix.length) !== -1) continue;
      if (suffix && !entry.path.endsWith(suffix)) continue;
      out.push(entry);
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  close(): void {
    if (this.#fd >= 0) {
      fs.closeSync(this.#fd);
      this.#fd = -1;
    }
  }
}

/**
 * Walks the three-level `ext / dir / name` tree. Each level is a run of
 * NUL-terminated strings ended by an empty string; every filename is followed
 * by a fixed 18-byte record plus its inline preload bytes.
 */
function parseTree(tree: Buffer): Map<string, VpkEntry> {
  const entries = new Map<string, VpkEntry>();
  let cursor = 0;

  const readCString = (): string => {
    const nul = tree.indexOf(0, cursor);
    if (nul === -1) throw new Error(`unterminated string in VPK tree at ${cursor}`);
    const str = tree.toString('utf8', cursor, nul);
    cursor = nul + 1;
    return str;
  };

  for (;;) {
    const ext = readCString();
    if (ext === '') break;
    for (;;) {
      const dir = readCString();
      if (dir === '') break;
      for (;;) {
        const name = readCString();
        if (name === '') break;

        if (cursor + 18 > tree.length) throw new Error('truncated VPK tree record');
        const crc = tree.readUInt32LE(cursor);
        const preloadBytes = tree.readUInt16LE(cursor + 4);
        const archiveIndex = tree.readUInt16LE(cursor + 6);
        const entryOffset = tree.readUInt32LE(cursor + 8);
        const entryLength = tree.readUInt32LE(cursor + 12);
        const terminator = tree.readUInt16LE(cursor + 16);
        cursor += 18;
        if (terminator !== 0xffff) {
          throw new Error(`bad VPK entry terminator 0x${terminator.toString(16)} for ${dir}/${name}.${ext}`);
        }

        const preload = preloadBytes > 0 ? Buffer.from(tree.subarray(cursor, cursor + preloadBytes)) : EMPTY;
        cursor += preloadBytes;

        // A lone space is Valve's placeholder for "no directory" / "no extension".
        const dirPart = dir === ' ' ? '' : `${dir}/`;
        const extPart = ext === ' ' ? '' : `.${ext}`;
        const path = `${dirPart}${name}${extPart}`.toLowerCase();

        entries.set(path, { path, crc, preload, archiveIndex, entryOffset, entryLength });
      }
    }
  }

  return entries;
}

const EMPTY = Buffer.alloc(0);

function readExact(fd: number, buf: Buffer, position: number): void {
  let read = 0;
  while (read < buf.length) {
    const n = fs.readSync(fd, buf, read, buf.length - read, position + read);
    if (n === 0) throw new Error(`unexpected EOF reading ${buf.length} bytes at ${position}`);
    read += n;
  }
}

/**
 * Deterministic PRNG so the "verify a random sample of entries" check picks the
 * same sample on every run and stays reproducible in CI logs.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
