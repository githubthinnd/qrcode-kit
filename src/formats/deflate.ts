/**
 * Minimal zlib/DEFLATE writer (RFC 1950 / RFC 1951): greedy LZ77 with hash
 * chains and the fixed Huffman code. Output is valid for any inflater. It is
 * tuned for QR images (long runs, repeated scanlines), not for general data.
 */

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

class BitWriter {
  readonly bytes: number[] = [];
  #bitBuffer = 0;
  #bitCount = 0;

  /** Write `count` bits of `value`, least significant bit first (DEFLATE packing). */
  bits(value: number, count: number): void {
    this.#bitBuffer |= value << this.#bitCount;
    this.#bitCount += count;
    while (this.#bitCount >= 8) {
      this.bytes.push(this.#bitBuffer & 0xff);
      this.#bitBuffer >>>= 8;
      this.#bitCount -= 8;
    }
  }

  /** Write a Huffman code (defined most-significant-bit first). */
  code(value: number, length: number): void {
    let reversed = 0;
    for (let i = 0; i < length; i++) reversed |= ((value >> i) & 1) << (length - 1 - i);
    this.bits(reversed, length);
  }

  finish(): void {
    if (this.#bitCount > 0) this.bytes.push(this.#bitBuffer & 0xff);
    this.#bitBuffer = 0;
    this.#bitCount = 0;
  }
}

function writeLiteralLength(out: BitWriter, symbol: number): void {
  if (symbol <= 143) out.code(0x30 + symbol, 8);
  else if (symbol <= 255) out.code(0x190 + (symbol - 144), 9);
  else if (symbol <= 279) out.code(symbol - 256, 7);
  else out.code(0xc0 + (symbol - 280), 8);
}

function lengthSymbol(length: number): number {
  let i = LENGTH_BASE.length - 1;
  while ((LENGTH_BASE[i] ?? 0) > length) i--;
  return i;
}

function distanceSymbol(distance: number): number {
  let i = DIST_BASE.length - 1;
  while ((DIST_BASE[i] ?? 0) > distance) i--;
  return i;
}

const WINDOW = 32768;
const MAX_MATCH = 258;
const MAX_CHAIN = 32;
const HASH_SIZE = 1 << 15;

/** Raw DEFLATE stream using one fixed-Huffman block. */
export function deflateFixed(data: Uint8Array): Uint8Array {
  const out = new BitWriter();
  out.bits(1, 1); // BFINAL
  out.bits(1, 2); // BTYPE = 01 (fixed Huffman)

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(data.length).fill(-1);
  const hash = (i: number): number =>
    (((data[i] ?? 0) << 10) ^ ((data[i + 1] ?? 0) << 5) ^ (data[i + 2] ?? 0)) & (HASH_SIZE - 1);
  const insert = (i: number): void => {
    if (i + 2 >= data.length) return;
    const h = hash(i);
    prev[i] = head[h] ?? -1;
    head[h] = i;
  };

  let i = 0;
  while (i < data.length) {
    let bestLength = 0;
    let bestDistance = 0;
    if (i + 2 < data.length) {
      let candidate = head[hash(i)] ?? -1;
      let chain = 0;
      const maxLength = Math.min(MAX_MATCH, data.length - i);
      while (candidate >= 0 && i - candidate <= WINDOW && chain++ < MAX_CHAIN) {
        let length = 0;
        while (length < maxLength && data[candidate + length] === data[i + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = i - candidate;
          if (length === maxLength) break;
        }
        candidate = prev[candidate] ?? -1;
      }
    }
    if (bestLength >= 3) {
      const ls = lengthSymbol(bestLength);
      writeLiteralLength(out, 257 + ls);
      out.bits(bestLength - (LENGTH_BASE[ls] ?? 0), LENGTH_EXTRA[ls] ?? 0);
      const ds = distanceSymbol(bestDistance);
      out.code(ds, 5);
      out.bits(bestDistance - (DIST_BASE[ds] ?? 0), DIST_EXTRA[ds] ?? 0);
      for (let k = 0; k < bestLength; k++) insert(i + k);
      i += bestLength;
    } else {
      writeLiteralLength(out, data[i] ?? 0);
      insert(i);
      i++;
    }
  }
  writeLiteralLength(out, 256); // end of block
  out.finish();
  return Uint8Array.from(out.bytes);
}

/** Adler-32 checksum (RFC 1950). */
export function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 5552) {
    const end = Math.min(i + 5552, data.length);
    for (let j = i; j < end; j++) {
      a += data[j] ?? 0;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib container (RFC 1950) around a fixed-Huffman DEFLATE stream. */
export function zlibCompress(data: Uint8Array): Uint8Array {
  const body = deflateFixed(data);
  const out = new Uint8Array(2 + body.length + 4);
  out[0] = 0x78;
  out[1] = 0x01; // CMF/FLG: deflate, 32K window, fastest; (0x7801 % 31 == 0)
  out.set(body, 2);
  const checksum = adler32(data);
  out[out.length - 4] = checksum >>> 24;
  out[out.length - 3] = (checksum >>> 16) & 0xff;
  out[out.length - 2] = (checksum >>> 8) & 0xff;
  out[out.length - 1] = checksum & 0xff;
  return out;
}
