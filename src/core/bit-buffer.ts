/** Append-only sequence of bits, most significant bit first. */
export class BitBuffer {
  readonly #bits: number[] = [];

  get length(): number {
    return this.#bits.length;
  }

  /** Append the low `count` bits of `value` (0 ≤ count ≤ 31), MSB first. */
  append(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.#bits.push((value >>> i) & 1);
  }

  /** Append every bit of another buffer. */
  appendBuffer(other: BitBuffer): void {
    for (const bit of other.#bits) this.#bits.push(bit);
  }

  /** The bits packed into bytes; a final partial byte is padded with zeros. */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.#bits.length / 8));
    for (let i = 0; i < this.#bits.length; i++) {
      bytes[i >>> 3] = (bytes[i >>> 3] ?? 0) | ((this.#bits[i] ?? 0) << (7 - (i & 7)));
    }
    return bytes;
  }
}
