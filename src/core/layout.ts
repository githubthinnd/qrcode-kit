import type { ErrorCorrectionLevel, MaskPattern, MaskScoring } from '../domain/model.js';
import { MASK_PATTERNS, MODULE_KINDS, type ModuleKind } from '../domain/model.js';
import { fastPenaltyScore } from './mask-score.js';
import { alignmentPatternPositions, eccFormatBits, maskInverts, symbolSize } from './tables.js';

const KIND = Object.fromEntries(MODULE_KINDS.map((k, i) => [k, i])) as Record<ModuleKind, number>;

export interface Layout {
  readonly modules: Uint8Array;
  readonly kinds: Uint8Array;
  readonly mask: MaskPattern;
}

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

class Canvas {
  readonly version: number;
  readonly size: number;
  readonly modules: Uint8Array;
  readonly kinds: Uint8Array;

  constructor(version: number) {
    this.version = version;
    this.size = symbolSize(version);
    this.modules = new Uint8Array(this.size * this.size);
    this.kinds = new Uint8Array(this.size * this.size);
  }

  setFunction(x: number, y: number, dark: boolean, kind: ModuleKind): void {
    const i = y * this.size + x;
    this.modules[i] = dark ? 1 : 0;
    this.kinds[i] = KIND[kind];
  }

  isFunction(x: number, y: number): boolean {
    return this.kinds[y * this.size + x] !== 0;
  }

  drawFunctionPatterns(): void {
    const size = this.size;
    for (let i = 0; i < size; i++) {
      this.setFunction(6, i, i % 2 === 0, 'timing');
      this.setFunction(i, 6, i % 2 === 0, 'timing');
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);

    const positions = alignmentPatternPositions(this.version);
    const last = positions.length - 1;
    for (let i = 0; i <= last; i++) {
      for (let j = 0; j <= last; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
        this.drawAlignment(positions[i] ?? 0, positions[j] ?? 0);
      }
    }
    this.drawFormat(0, 'M'); // reserve the format areas; real bits are drawn later
    this.drawVersion();
  }

  private drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(x, y, dist !== 2 && dist !== 4, dist === 4 ? 'separator' : 'finder');
      }
    }
  }

  private drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, 'alignment');
      }
    }
  }

  /** Draw both copies of the 15-bit format information, plus the always-dark module. */
  drawFormat(mask: number, ecc: ErrorCorrectionLevel): void {
    const data = (eccFormatBits(ecc) << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const bits = ((data << 10) | remainder) ^ 0x5412;
    const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;
    const size = this.size;

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i), 'format');
    this.setFunction(8, 7, bit(6), 'format');
    this.setFunction(8, 8, bit(7), 'format');
    this.setFunction(7, 8, bit(8), 'format');
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i), 'format');

    for (let i = 0; i < 8; i++) this.setFunction(size - 1 - i, 8, bit(i), 'format');
    for (let i = 8; i < 15; i++) this.setFunction(8, size - 15 + i, bit(i), 'format');
    this.setFunction(8, size - 8, true, 'dark');
  }

  /** Draw the two 18-bit version information blocks (versions 7 and up). */
  private drawVersion(): void {
    if (this.version < 7) return;
    let remainder = this.version;
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (this.version << 12) | remainder;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark, 'version');
      this.setFunction(b, a, dark, 'version');
    }
  }

  /** Place codeword bits in the zigzag order, skipping function modules. */
  drawCodewords(data: Uint8Array): void {
    const size = this.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction(x, y) && i < data.length * 8) {
            this.modules[y * size + x] = ((data[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1;
            i++;
          }
          // remainder bits (if any) stay light
        }
      }
    }
  }

  /** XOR the mask onto data modules. Applying twice restores the original. */
  applyMask(mask: MaskPattern): void {
    const size = this.size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!this.isFunction(x, y) && maskInverts(mask, x, y)) {
          this.modules[y * size + x] = (this.modules[y * size + x] ?? 0) ^ 1;
        }
      }
    }
  }

  penaltyScore(limit: number, scoring: MaskScoring): number {
    return scoring === 'fast'
      ? fastPenaltyScore(this.modules, this.size, limit)
      : penaltyScore(this.modules, this.size, limit);
  }
}

/** Record a finished run in the 7-run history used to spot finder-like patterns. */
function addHistory(h: Int32Array, runLength: number, size: number): void {
  h[6] = h[5];
  h[5] = h[4];
  h[4] = h[3];
  h[3] = h[2];
  h[2] = h[1];
  h[1] = h[0];
  // The edge of the symbol counts as an unbounded light run.
  h[0] = h[1] === 0 ? runLength + size : runLength;
}

/** Occurrences (0–2) of the 1:1:3:1:1 finder-like pattern flanked by ≥ 4 light modules. */
function countPatterns(h: Int32Array): number {
  const n = h[1];
  if (n === 0 || h[2] !== n || h[3] !== n * 3 || h[4] !== n || h[5] !== n) return 0;
  const first = h[0];
  const last = h[6];
  return (first >= n * 4 && last >= n ? 1 : 0) + (last >= n * 4 && first >= n ? 1 : 0);
}

/**
 * Mask evaluation score (ISO 18004 §7.8.3): runs of 5+ same-coloured modules,
 * 2×2 blocks, finder-like patterns, and dark/light balance.
 */
export function penaltyScore(m: Uint8Array, size: number, limit?: number): number {
  let result = 0;
  const h = new Int32Array(7);

  for (let pass = 0; pass < 2; pass++) {
    const outerStep = pass === 0 ? size : 1;
    const innerStep = pass === 0 ? 1 : size;
    for (let a = 0; a < size; a++) {
      h.fill(0);
      let runColor = 0;
      let runLength = 0;
      let index = a * outerStep;
      for (let b = 0; b < size; b++, index += innerStep) {
        const color = m[index] ?? 0;
        if (color === runColor) {
          runLength++;
          if (runLength === 5) result += PENALTY_N1;
          else if (runLength > 5) result++;
        } else {
          addHistory(h, runLength, size);
          if (runColor === 0) result += countPatterns(h) * PENALTY_N3;
          runColor = color;
          runLength = 1;
        }
      }
      let length = runLength;
      if (runColor === 1) {
        addHistory(h, length, size);
        length = 0;
      }
      addHistory(h, length + size, size);
      result += countPatterns(h) * PENALTY_N3;
      // Scores only grow, so a candidate that already reaches the best known score cannot win.
      if (limit !== undefined && result >= limit) return result;
    }
  }

  for (let y = 0; y < size - 1; y++) {
    const row = y * size;
    for (let x = 0; x < size - 1; x++) {
      const c = m[row + x];
      if (c === m[row + x + 1] && c === m[row + size + x] && c === m[row + size + x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  let dark = 0;
  for (const v of m) dark += v;
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY_N4;
  return result;
}

/**
 * Build the final module grid for a symbol from its interleaved codewords.
 * `mask` undefined selects the mask with the lowest penalty score.
 */
export function buildLayout(
  version: number,
  ecc: ErrorCorrectionLevel,
  codewords: Uint8Array,
  mask: MaskPattern | undefined,
  scoring: MaskScoring = 'standard',
): Layout {
  const canvas = new Canvas(version);
  canvas.drawFunctionPatterns();
  canvas.drawCodewords(codewords);

  let chosen: MaskPattern = mask ?? 0;
  if (mask === undefined) {
    let minPenalty = Infinity;
    for (const candidate of MASK_PATTERNS) {
      canvas.applyMask(candidate);
      canvas.drawFormat(candidate, ecc);
      const penalty = canvas.penaltyScore(minPenalty, scoring);
      if (penalty < minPenalty) {
        chosen = candidate;
        minPenalty = penalty;
      }
      canvas.applyMask(candidate);
    }
  }
  canvas.applyMask(chosen);
  canvas.drawFormat(chosen, ecc);
  return { modules: canvas.modules, kinds: canvas.kinds, mask: chosen };
}
