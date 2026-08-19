/** MSB-first bit packing, used to squeeze 12-bit item indices into the URL. */

export class BitWriter {
  #bytes: number[] = [];
  #current = 0;
  #filled = 0;

  writeBits(value: number, count: number): void {
    if (count < 0 || count > 32) throw new RangeError(`writeBits: count ${count} out of range`);
    for (let i = count - 1; i >= 0; i--) {
      const bit = (value >>> i) & 1;
      this.#current = (this.#current << 1) | bit;
      this.#filled++;
      if (this.#filled === 8) {
        this.#bytes.push(this.#current & 0xff);
        this.#current = 0;
        this.#filled = 0;
      }
    }
  }

  /** Pads the final byte with zero bits. */
  toBytes(): Uint8Array {
    const out = this.#bytes.slice();
    if (this.#filled > 0) out.push((this.#current << (8 - this.#filled)) & 0xff);
    return Uint8Array.from(out);
  }
}

export class BitReader {
  #bytes: Uint8Array;
  #pos = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  get bitsRemaining(): number {
    return this.#bytes.length * 8 - this.#pos;
  }

  readBits(count: number): number {
    if (count < 0 || count > 32) throw new RangeError(`readBits: count ${count} out of range`);
    if (count > this.bitsRemaining) throw new RangeError('readBits: out of data');
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.#bytes[this.#pos >> 3] ?? 0;
      const bit = (byte >> (7 - (this.#pos & 7))) & 1;
      value = (value << 1) | bit;
      this.#pos++;
    }
    return value >>> 0;
  }
}
