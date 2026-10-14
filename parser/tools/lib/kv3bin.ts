/**
 * Reader for Source 2's *binary* KeyValues3, version 5, as compiled into the
 * `DATA` block of a resource such as a map's entity lump (`*.vents_c`).
 *
 * Written for step 08a, which needs the spawn points the addon's level
 * designers placed in each room. Those live nowhere but in the compiled maps:
 * every room is a nested `maps/<map>.vpk` inside the workshop pak, and its
 * `entities/default_ents.vents_c` is a plain (unencrypted) KV3 document listing
 * every entity with its keyvalues. Nothing here touches the addon's encrypted
 * Lua.
 *
 * Only what the AOW5 pak actually contains is implemented — LZ4 or Zstandard
 * (Node's own `zlib.zstdDecompressSync`), no binary
 * blob payloads, no 16-bit values — and anything else throws, naming what it
 * found. The layout was worked out against the pak and is verified on every
 * read: each of the eight value streams must be consumed exactly to its end,
 * so a misread field cannot produce plausible garbage silently.
 *
 *   header      magic `\x05 3VK`, format GUID, compression, then the counts
 *   buffer 1    strings (null-terminated; their count is the first int),
 *               then ints, then doubles — the "auxiliary" values that typed
 *               arrays such as `origin` point into
 *   buffer 2    one member count per object, bytes, ints, doubles, then one
 *               type byte per value, then one size per binary blob, then the
 *               trailer `00 DD EE FF`
 */

import zlib from 'node:zlib';

const MAGIC_V5 = 0x4b563305; // "\x05" "3VK"
const TRAILER = 0xffeedd00;

/** LZ4 block decompression (no frame header), to an exactly known size. */
export function lz4Block(src: Buffer, outSize: number): Buffer {
  const out = Buffer.alloc(outSize);
  let s = 0;
  let d = 0;
  while (s < src.length) {
    const token = src[s++]!;
    let literals = token >> 4;
    if (literals === 15) {
      let b: number;
      do {
        b = src[s++]!;
        literals += b;
      } while (b === 255);
    }
    if (d + literals > outSize) throw new Error('lz4: literal run overflows the output');
    src.copy(out, d, s, s + literals);
    s += literals;
    d += literals;
    if (s >= src.length) break;

    const offset = src[s]! | (src[s + 1]! << 8);
    s += 2;
    if (offset === 0 || offset > d) throw new Error(`lz4: bad match offset ${offset} at ${d}`);
    let match = token & 15;
    if (match === 15) {
      let b: number;
      do {
        b = src[s++]!;
        match += b;
      } while (b === 255);
    }
    match += 4;
    if (d + match > outSize) throw new Error('lz4: match overflows the output');
    // Byte by byte on purpose: a match may overlap the bytes it is copying.
    for (let i = 0; i < match; i++, d++) out[d] = out[d - offset]!;
  }
  if (d !== outSize) throw new Error(`lz4: produced ${d} bytes, expected ${outSize}`);
  return out;
}

/** The payload of one named block (`DATA`, `RED2`, …) of a compiled Source 2 resource. */
export function resourceBlock(buf: Buffer, name: string): Buffer {
  const blockOffset = buf.readUInt32LE(8);
  const blockCount = buf.readUInt32LE(12);
  for (let i = 0; i < blockCount; i++) {
    const at = 8 + blockOffset + i * 12;
    if (buf.toString('latin1', at, at + 4) !== name) continue;
    const offset = at + 4 + buf.readUInt32LE(at + 4);
    const size = buf.readUInt32LE(at + 8);
    return buf.subarray(offset, offset + size);
  }
  throw new Error(`resource has no ${name} block`);
}

/** A decoded KV3 value. Typed arrays come back as plain arrays. */
export type Kv3Value = null | boolean | number | string | Kv3Value[] | { [key: string]: Kv3Value } | Kv3Blob;
/** A binary blob. Only empty blobs exist in the paks this reads. */
export interface Kv3Blob {
  blob: number;
}

/** A read cursor over one region of a buffer, which must be consumed exactly. */
class Stream {
  readonly buf: Buffer;
  readonly name: string;
  readonly end: number;
  pos: number;
  constructor(buf: Buffer, name: string, start: number, end: number) {
    this.buf = buf;
    this.name = name;
    this.pos = start;
    this.end = end;
  }
  private need(n: number): number {
    const at = this.pos;
    if (at + n > this.end) throw new Error(`kv3: ${this.name} stream overrun`);
    this.pos += n;
    return at;
  }
  u8(): number {
    return this.buf[this.need(1)]!;
  }
  i32(): number {
    return this.buf.readInt32LE(this.need(4));
  }
  u32(): number {
    return this.buf.readUInt32LE(this.need(4));
  }
  f32(): number {
    return this.buf.readFloatLE(this.need(4));
  }
  f64(): number {
    return this.buf.readDoubleLE(this.need(8));
  }
  i64(): number {
    return Number(this.buf.readBigInt64LE(this.need(8)));
  }
  u64(): number {
    return Number(this.buf.readBigUInt64LE(this.need(8)));
  }
  done(): void {
    if (this.pos !== this.end) {
      throw new Error(`kv3: ${this.name} stream has ${this.end - this.pos} unread byte(s) — the layout is not understood`);
    }
  }
}

const align = (n: number, a: number): number => Math.ceil(n / a) * a;

/** Decodes a KV3 v5 document (the whole `DATA` block, magic included). */
export function decodeKv3(data: Buffer): Kv3Value {
  const magic = data.readUInt32LE(0);
  if (magic !== MAGIC_V5) {
    throw new Error(`kv3: magic 0x${magic.toString(16)} is not binary KV3 v5; only v5 is implemented`);
  }
  let p = 20; // magic + format GUID
  const u32 = (): number => {
    const v = data.readUInt32LE(p);
    p += 4;
    return v;
  };
  const u16 = (): number => {
    const v = data.readUInt16LE(p);
    p += 2;
    return v;
  };

  const compression = u32();
  u16(); // dictionary id
  u16(); // frame size
  const bytes1 = u32();
  const ints1 = u32();
  const doubles1 = u32();
  const typesSize = u32();
  const objectCount = u16();
  u16(); // array count; unused, the arrays carry their own lengths
  const totalUncompressed = u32();
  const totalCompressed = u32();
  const blobCount = u32();
  const blobBytes = u32();
  const shorts1 = u32();
  u32(); // unknown, zero in every file seen
  const buf1Size = u32();
  const buf1Compressed = u32();
  const buf2Size = u32();
  const buf2Compressed = u32();
  const bytes2 = u32();
  const shorts2 = u32();
  const ints2 = u32();
  const doubles2 = u32();
  u32(); // unknown
  const objectCount2 = u32();
  u32(); // unknown
  u32(); // unknown
  const headerEnd = p;

  if (compression !== 1 && compression !== 2) {
    throw new Error(`kv3: compression method ${compression} (only LZ4 = 1 and Zstandard = 2 are implemented)`);
  }
  if (shorts1 !== 0 || shorts2 !== 0) throw new Error('kv3: 16-bit value streams are not implemented');
  if (blobBytes !== 0) throw new Error(`kv3: ${blobBytes} bytes of binary blobs; blob payloads are not implemented`);
  if (objectCount !== objectCount2) throw new Error(`kv3: object counts disagree (${objectCount} vs ${objectCount2})`);
  // The compressed total is only exact for LZ4; Zstandard files carry a few
  // bytes more than the two frames, which the frames themselves delimit.
  if (buf1Size + buf2Size !== totalUncompressed || (compression === 1 && buf1Compressed + buf2Compressed !== totalCompressed)) {
    throw new Error('kv3: buffer sizes do not add up to the totals');
  }

  const inflate = (from: number, length: number, size: number): Buffer => {
    const src = data.subarray(from, from + length);
    if (compression === 1) return lz4Block(src, size);
    const out = zlib.zstdDecompressSync(src);
    if (out.length !== size) throw new Error(`kv3: zstd produced ${out.length} bytes, expected ${size}`);
    return out;
  };
  const b1 = inflate(headerEnd, buf1Compressed, buf1Size);
  const b2 = inflate(headerEnd + buf1Compressed, buf2Compressed, buf2Size);

  // Buffer 1: strings, ints, doubles.
  const ints1At = align(bytes1, 4);
  const doubles1At = align(ints1At + ints1 * 4, 8);
  if (doubles1At + doubles1 * 8 !== buf1Size) throw new Error('kv3: buffer 1 size does not match its counts');
  const auxInts = new Stream(b1, 'buffer-1 ints', ints1At, ints1At + ints1 * 4);
  const auxDoubles = new Stream(b1, 'buffer-1 doubles', doubles1At, doubles1At + doubles1 * 8);
  const stringCount = auxInts.i32();
  const strings: string[] = [];
  {
    let at = 0;
    for (let i = 0; i < stringCount; i++) {
      const end = b1.indexOf(0, at);
      if (end < 0 || end >= bytes1) throw new Error('kv3: string table overruns its region');
      strings.push(b1.toString('utf8', at, end));
      at = end + 1;
    }
    if (at !== bytes1) throw new Error(`kv3: string table is ${at} bytes, header says ${bytes1}`);
  }

  // Buffer 2: object sizes, bytes, ints, doubles, types, blob sizes, trailer.
  const bytes2At = objectCount * 4;
  const ints2At = align(bytes2At + bytes2, 4);
  const doubles2At = align(ints2At + ints2 * 4, 8);
  const typesAt = doubles2At + doubles2 * 8;
  const blobsAt = typesAt + typesSize;
  const trailerAt = blobsAt + blobCount * 4;
  if (trailerAt + 4 !== buf2Size) throw new Error('kv3: buffer 2 size does not match its counts');
  if (b2.readUInt32LE(trailerAt) !== TRAILER) throw new Error('kv3: buffer 2 trailer missing');

  const sizes = new Stream(b2, 'object sizes', 0, bytes2At);
  const bytes = new Stream(b2, 'bytes', bytes2At, bytes2At + bytes2);
  const ints = new Stream(b2, 'ints', ints2At, ints2At + ints2 * 4);
  const doubles = new Stream(b2, 'doubles', doubles2At, doubles2At + doubles2 * 8);
  const types = new Stream(b2, 'types', typesAt, blobsAt);
  const blobs = new Stream(b2, 'blob sizes', blobsAt, trailerAt);

  const str = (): string => {
    const id = ints.i32();
    if (id === -1) return '';
    const s = strings[id];
    if (s === undefined) throw new Error(`kv3: string index ${id} out of range`);
    return s;
  };
  const type = (): number => {
    const t = types.u8();
    if (t & 0x80) {
      types.u8(); // flag byte (resource reference, subclass, …); irrelevant to the value
      return t & 0x7f;
    }
    return t;
  };

  /** One scalar from the auxiliary buffer, for typed arrays that point into it. */
  const auxValue = (t: number): Kv3Value => {
    switch (t) {
      case 5:
        return auxDoubles.f64();
      case 11:
        return auxInts.i32();
      case 12:
        return auxInts.u32();
      case 19:
        return auxInts.f32();
      default:
        throw new Error(`kv3: auxiliary typed array of type ${t} is not implemented`);
    }
  };

  const value = (t: number): Kv3Value => {
    switch (t) {
      case 1:
        return null;
      case 2:
        return bytes.u8() === 1;
      case 3:
        return doubles.i64();
      case 4:
        return doubles.u64();
      case 5:
        return doubles.f64();
      case 6:
        return str();
      case 7:
        return { blob: blobs.u32() };
      case 8: {
        const n = ints.i32();
        const out: Kv3Value[] = [];
        for (let i = 0; i < n; i++) out.push(value(type()));
        return out;
      }
      case 9: {
        const n = sizes.i32();
        const out: Record<string, Kv3Value> = {};
        for (let i = 0; i < n; i++) {
          const key = str();
          out[key] = value(type());
        }
        return out;
      }
      case 10: {
        const n = ints.i32();
        const sub = type();
        const out: Kv3Value[] = [];
        for (let i = 0; i < n; i++) out.push(value(sub));
        return out;
      }
      case 11:
        return ints.i32();
      case 12:
        return ints.u32();
      case 13:
        return true;
      case 14:
        return false;
      case 15:
        return 0;
      case 16:
        return 1;
      case 17:
        return 0;
      case 18:
        return 1;
      case 19:
        return ints.f32();
      case 24: {
        const n = bytes.u8();
        const sub = type();
        const out: Kv3Value[] = [];
        for (let i = 0; i < n; i++) out.push(value(sub));
        return out;
      }
      case 25: {
        const n = bytes.u8();
        const sub = type();
        const out: Kv3Value[] = [];
        for (let i = 0; i < n; i++) out.push(auxValue(sub));
        return out;
      }
      default:
        throw new Error(`kv3: value type ${t} is not implemented`);
    }
  };

  const root = value(type());
  for (const s of [sizes, bytes, ints, doubles, types, blobs, auxInts, auxDoubles]) s.done();
  return root;
}

/** One entity of a compiled map: its keyvalues and its designer-set attributes. */
export interface MapEntity {
  values: Record<string, Kv3Value>;
  attributes: Record<string, Kv3Value>;
}

/** Every entity in a compiled entity lump (`entities/default_ents.vents_c`). */
export function readEntityLump(vents: Buffer): MapEntity[] {
  const root = decodeKv3(resourceBlock(vents, 'DATA')) as Record<string, Kv3Value>;
  const list = root['m_entityKeyValues'];
  if (!Array.isArray(list)) throw new Error('entity lump has no m_entityKeyValues array');
  if (Array.isArray(root['m_childLumps']) && root['m_childLumps'].length > 0) {
    throw new Error('entity lump has child lumps; they are not followed');
  }
  return list.map((raw, i) => {
    const kv = (raw as Record<string, Kv3Value>)['keyValues3Data'] as Record<string, Kv3Value> | undefined;
    if (!kv || typeof kv['values'] !== 'object') throw new Error(`entity ${i} has no keyValues3Data.values`);
    return {
      values: kv['values'] as Record<string, Kv3Value>,
      attributes: (kv['attributes'] ?? {}) as Record<string, Kv3Value>,
    };
  });
}
