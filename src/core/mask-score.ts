/**
 * Mask scoring with whole 32-module words at a time (ISO/IEC 18004 §7.8.3 penalties N1–N4).
 *
 * Rows (and, after one transposition, columns) become bit sets, so a run of five equal modules, a
 * 2×2 block or a finder-like pattern is found for 32 positions with a handful of shifts and ANDs.
 * It scores like the standard reading of the rules, with one difference from the run-length
 * scorer of `layout.ts`: the finder-like pattern 1:1:3:1:1 (with four light modules on one side and
 * at least one on the other) is recognised at module size 1 only; the run-length scorer also finds
 * scaled copies, which essentially never occur in a QR Code.
 * The two can therefore disagree on the best mask in rare cases; both choices are valid symbols.
 */

const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

const popcount = (value: number): number => {
  let v = value - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};

/** A mask with the lowest `bits` bits set, over `words` words. */
function lowBits(bits: number, words: number): Uint32Array {
  const mask = new Uint32Array(words);
  for (let i = 0; i < words; i++) {
    const remaining = bits - i * 32;
    mask[i] = remaining >= 32 ? 0xffffffff : remaining > 0 ? (1 << remaining) - 1 : 0;
  }
  return mask;
}

/** Scratch space for one symbol size; nothing is allocated while scoring. */
class Scratch {
  readonly size: number;
  readonly words: number;
  readonly padded: number;
  readonly rows: Uint32Array;
  readonly columns: Uint32Array;
  readonly adjacent: Uint32Array; // N1: line bit x equals line bit x + 1
  readonly adjacentMask: Uint32Array;
  readonly line: Uint32Array; // N3: guard word, then the line moved up four places (light padding)

  constructor(size: number) {
    this.size = size;
    this.words = (size + 31) >>> 5;
    this.padded = (size + 8 + 31) >>> 5;
    this.rows = new Uint32Array(size * this.words);
    this.columns = new Uint32Array(size * this.words);
    this.adjacent = new Uint32Array(this.words + 1);
    this.adjacentMask = lowBits(size - 1, this.words);
    this.line = new Uint32Array(this.padded + 2);
  }
}

const scratches = new Map<number, Scratch>();
const scratchFor = (size: number): Scratch => {
  let scratch = scratches.get(size);
  if (scratch === undefined) {
    scratch = new Scratch(size);
    scratches.set(size, scratch);
  }
  return scratch;
};

/** Word `i` of `a` moved so that bit x holds bit x + k (k from −31 to 31); `a` has a guard word each side. */
const at = (a: Uint32Array, i: number, k: number): number =>
  k === 0
    ? (a[i + 1] ?? 0)
    : k > 0
      ? ((a[i + 1] ?? 0) >>> k) | ((a[i + 2] ?? 0) << (32 - k))
      : ((a[i + 1] ?? 0) << -k) | ((a[i] ?? 0) >>> (32 + k));

/** Penalty N1 and N3 of one row or column; `source[base …]` holds its modules as bits. */
function lineScore(s: Scratch, source: Uint32Array, base: number): number {
  const { words, padded, adjacent, adjacentMask, line } = s;

  // N1: a run of L ≥ 5 equal modules is L − 1 equal neighbours in a row, i.e. L − 4 quads of four.
  // `adjacent` keeps one guard word at the end so the shifted reads below need no bounds checks.
  for (let i = 0; i < words; i++) {
    const a = source[base + i] ?? 0;
    const next = i + 1 < words ? (source[base + i + 1] ?? 0) : 0;
    adjacent[i] = ~(a ^ ((a >>> 1) | (next << 31))) & (adjacentMask[i] ?? 0);
  }
  adjacent[words] = 0;
  let quads = 0;
  let runs = 0;
  let carry = 0;
  for (let i = 0; i < words; i++) {
    const a0 = adjacent[i] ?? 0;
    const a1 = adjacent[i + 1] ?? 0;
    // adjacent[x] & adjacent[x+1] & adjacent[x+2] & adjacent[x+3], by doubling
    const pair = a0 & ((a0 >>> 1) | (a1 << 31));
    const pairNext =
      (a1 & ((a1 >>> 1) | (i + 2 <= words ? (adjacent[i + 2] ?? 0) << 31 : 0))) >>> 0;
    const quad = pair & ((pair >>> 2) | (pairNext << 30));
    if (quad !== 0 || carry !== 0) {
      quads += popcount(quad);
      runs += popcount(quad & ~((quad << 1) | carry));
    }
    carry = quad >>> 31;
  }
  let score = quads + (N1 - 1) * runs;

  // N3: the line moved up four places, so that a pattern at the border still has light modules
  // around it. A finder-like 1011101 at position p counts when it has four light modules after it
  // and a light one before it, or four light before it and a light one after it.
  line[0] = 0;
  let spill = 0;
  for (let i = 0; i < padded; i++) {
    const word = i < words ? (source[base + i] ?? 0) : 0;
    line[i + 1] = (word << 4) | spill;
    spill = word >>> 28;
  }
  line[padded + 1] = spill;
  let patterns = 0;
  for (let i = 0; i < padded; i++) {
    const core =
      at(line, i, 0) &
      ~at(line, i, 1) &
      at(line, i, 2) &
      at(line, i, 3) &
      at(line, i, 4) &
      ~at(line, i, 5) &
      at(line, i, 6);
    if (core === 0) continue;
    const before1 = at(line, i, -1);
    const lightAfter = ~(at(line, i, 7) | at(line, i, 8) | at(line, i, 9) | at(line, i, 10));
    const lightBefore = ~(at(line, i, -4) | at(line, i, -3) | at(line, i, -2) | before1);
    const light7 = ~at(line, i, 7);
    patterns += popcount(core & lightAfter & ~before1);
    patterns += popcount(core & lightBefore & light7);
  }
  score += patterns * N3;
  return score;
}

/**
 * Penalty score of a module grid (1 = dark). `limit` stops early once the score reaches it, as the
 * run-length scorer does: a candidate that cannot win need not be finished.
 */
export function fastPenaltyScore(modules: Uint8Array, size: number, limit?: number): number {
  const s = scratchFor(size);
  const { words, rows, columns } = s;
  rows.fill(0);
  columns.fill(0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y * size + x] === 1) {
        rows[y * words + (x >>> 5)] = (rows[y * words + (x >>> 5)] ?? 0) | (1 << (x & 31));
        columns[x * words + (y >>> 5)] = (columns[x * words + (y >>> 5)] ?? 0) | (1 << (y & 31));
      }
    }
  }

  let score = 0;
  for (let y = 0; y < size; y++) score += lineScore(s, rows, y * words);
  if (limit !== undefined && score >= limit) return score;
  for (let x = 0; x < size; x++) score += lineScore(s, columns, x * words);
  if (limit !== undefined && score >= limit) return score;

  // N2: 2×2 blocks of one colour
  for (let y = 0; y + 1 < size; y++) {
    const upper = y * words;
    const lower = upper + words;
    for (let i = 0; i < words; i++) {
      const a = rows[upper + i] ?? 0;
      const b = rows[lower + i] ?? 0;
      const aNext = (a >>> 1) | ((i + 1 < words ? (rows[upper + i + 1] ?? 0) : 0) << 31);
      const bNext = (b >>> 1) | ((i + 1 < words ? (rows[lower + i + 1] ?? 0) : 0) << 31);
      score += popcount(~(a ^ aNext) & ~(b ^ bNext) & ~(a ^ b) & (s.adjacentMask[i] ?? 0)) * N2;
    }
  }

  // N4: balance of dark and light modules
  let dark = 0;
  for (const module of modules) dark += module;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * N4;
  return score;
}
