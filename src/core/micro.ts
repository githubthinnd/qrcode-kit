import { InvalidInputError, UnsupportedDataError } from '../domain/errors.js';
import { QRMatrix } from '../domain/matrix.js';
import {
  MODULE_KINDS,
  type ErrorCorrectionLevel,
  type MaskPattern,
  type ModuleKind,
} from '../domain/model.js';
import {
  bchRemainder,
  bitsOf,
  blocksWithErrorCorrection,
  planCompact,
  type CompactSource,
  type CompactSpec,
} from './compact.js';
import type { Framing } from './framing.js';
import type { KanjiMapper } from './kanji.js';

/**
 * Micro QR Code (M1–M4): one finder pattern, timing patterns along the top row and left column,
 * one 15-bit format information block, four masks. See ISO/IEC 18004 §7 (Micro QR Code symbols).
 */

/** [version, level, symbol number in the format information, ecc codewords, data codewords, data bits]. */
const MICRO_LEVELS: readonly (readonly [
  number,
  ErrorCorrectionLevel,
  number,
  number,
  number,
  number,
])[] = [
  // M1 detects errors only; it is reported as level L.
  [1, 'L', 0, 2, 3, 20],
  [2, 'L', 1, 5, 5, 40],
  [2, 'M', 2, 6, 4, 32],
  [3, 'L', 3, 6, 11, 84],
  [3, 'M', 4, 8, 9, 68],
  [4, 'L', 5, 8, 16, 128],
  [4, 'M', 6, 10, 14, 112],
  [4, 'Q', 7, 14, 10, 80],
];

/** Mode indicator and count field widths per version (ISO/IEC 18004 Tables 2 and 3 for Micro QR). */
function microFraming(version: number): Framing {
  const indicatorBits = version - 1; // M1: none, M2: 1 bit, M3: 2 bits, M4: 3 bits
  const values = { numeric: 0, alphanumeric: 1, byte: 2, kanji: 3 } as const;
  const counts = {
    numeric: [3, 4, 5, 6],
    alphanumeric: [undefined, 3, 4, 5],
    byte: [undefined, undefined, 4, 5],
    kanji: [undefined, undefined, 3, 4],
  } as const;
  return {
    mode: (mode) => {
      if (mode !== 'numeric' && mode !== 'alphanumeric' && mode !== 'byte' && mode !== 'kanji') {
        return undefined;
      }
      return counts[mode][version - 1] === undefined
        ? undefined
        : { value: values[mode], bits: indicatorBits };
    },
    count: (mode) => counts[mode][version - 1],
  };
}

const specs: readonly CompactSpec[] = MICRO_LEVELS.map(
  ([version, ecc, , eccCodewords, dataCodewords, dataBits]) => ({
    version,
    ecc,
    framing: microFraming(version),
    terminatorBits: version * 2 + 1,
    dataBits,
    blocks: [[1, dataCodewords]],
    eccPerBlock: eccCodewords,
  }),
);

const symbolNumber = (version: number, ecc: ErrorCorrectionLevel): number =>
  MICRO_LEVELS.find(([v, level]) => v === version && level === ecc)?.[2] ?? 0;

export interface MicroOptions {
  readonly ecc: ErrorCorrectionLevel;
  readonly minVersion: number;
  readonly maxVersion: number;
  /** 0–3, or `undefined` for the best-scoring mask. */
  readonly mask: MaskPattern | undefined;
  readonly boostEcc: boolean;
  readonly kanji?: KanjiMapper | undefined;
}

const kindIndex = (kind: ModuleKind): number => MODULE_KINDS.indexOf(kind);

/** Mask conditions of Micro QR Code (i = row, j = column), ISO/IEC 18004 Table 10. */
function maskFlips(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return y % 2 === 0;
    case 1:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 2:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** The 15 format bits: symbol number and mask, BCH(15,5), XOR 0x4445. */
export function microFormatBits(version: number, ecc: ErrorCorrectionLevel, mask: number): number {
  const data = (symbolNumber(version, ecc) << 2) | mask;
  return ((data << 10) | bchRemainder(data, 10, 0x537)) ^ 0x4445;
}

interface Grid {
  readonly size: number;
  readonly modules: Uint8Array;
  readonly kinds: Uint8Array;
}

function drawFunctionPatterns(size: number): Grid {
  const modules = new Uint8Array(size * size);
  const kinds = new Uint8Array(size * size).fill(kindIndex('data'));
  const set = (x: number, y: number, dark: boolean, kind: ModuleKind): void => {
    modules[y * size + x] = dark ? 1 : 0;
    kinds[y * size + x] = kindIndex(kind);
  };
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      set(x, y, ring !== 2, 'finder');
    }
  }
  for (let i = 0; i < 8; i++) {
    set(7, i, false, 'separator');
    set(i, 7, false, 'separator');
  }
  for (let i = 8; i < size; i++) {
    set(i, 0, i % 2 === 0, 'timing');
    set(0, i, i % 2 === 0, 'timing');
  }
  for (let i = 1; i <= 8; i++) {
    set(i, 8, false, 'format');
    set(8, i, false, 'format');
  }
  return { size, modules, kinds };
}

/** Place `bits` in the zigzag order, two columns at a time from the right, skipping function modules. */
function placeData(grid: Grid, bits: Uint8Array): void {
  const { size, modules, kinds } = grid;
  const data = kindIndex('data');
  let index = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    for (let row = 0; row < size; row++) {
      const y = upward ? size - 1 - row : row;
      for (let column = 0; column < 2; column++) {
        const x = right - column;
        if (kinds[y * size + x] === data && index < bits.length) {
          modules[y * size + x] = bits[index++] ?? 0;
        }
      }
    }
    upward = !upward;
  }
  if (index !== bits.length) {
    throw new InvalidInputError(
      'The codewords do not fit the data modules of this Micro QR symbol.',
    );
  }
}

/** Score of a masked symbol: the dark modules on the right and bottom edges (the larger count counts more). */
function score(grid: Grid): number {
  const { size, modules } = grid;
  let right = 0;
  let bottom = 0;
  for (let i = 1; i < size; i++) {
    right += modules[i * size + size - 1] ?? 0;
    bottom += modules[(size - 1) * size + i] ?? 0;
  }
  return right <= bottom ? right * 16 + bottom : bottom * 16 + right;
}

function applyMask(grid: Grid, mask: number): Uint8Array {
  const { size, modules, kinds } = grid;
  const data = kindIndex('data');
  const out = modules.slice();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (kinds[y * size + x] === data && maskFlips(mask, x, y)) out[y * size + x] ^= 1;
    }
  }
  return out;
}

function writeFormat(modules: Uint8Array, size: number, bits: number): void {
  for (let i = 0; i < 8; i++) modules[8 * size + 1 + i] = (bits >>> (14 - i)) & 1;
  for (let i = 0; i < 7; i++) modules[(7 - i) * size + 8] = (bits >>> (6 - i)) & 1;
}

/** Encode one Micro QR Code symbol (M1–M4). */
export function encodeMicroSymbol(source: CompactSource, options: MicroOptions): QRMatrix {
  if (options.ecc === 'H') {
    throw new InvalidInputError('Micro QR Code has no error correction level H; use L, M or Q.');
  }
  const candidates = specs.filter(
    (spec) =>
      spec.ecc === options.ecc &&
      spec.version >= options.minVersion &&
      spec.version <= options.maxVersion,
  );
  if (candidates.length === 0) {
    throw new UnsupportedDataError(
      `Micro QR Code has no version in the requested range with error correction level ${options.ecc}.`,
      {
        details: {
          ecc: options.ecc,
          minVersion: options.minVersion,
          maxVersion: options.maxVersion,
        },
      },
    );
  }
  const plan = planCompact(
    source,
    candidates,
    (spec) =>
      specs.filter(
        (other) => other.version === spec.version && other !== spec && other.ecc !== 'H',
      ),
    options.kanji,
    options.boostEcc,
  );
  const { spec } = plan;

  // data bits, then the error correction codewords
  const dataBytes = plan.data.toBytes();
  const codewords = blocksWithErrorCorrection(dataBytes, spec);
  const eccBytes = codewords.subarray(dataBytes.length);
  const stream = new Uint8Array(spec.dataBits + eccBytes.length * 8);
  stream.set(bitsOf(dataBytes, spec.dataBits), 0);
  stream.set(bitsOf(eccBytes, eccBytes.length * 8), spec.dataBits);

  const size = spec.version * 2 + 9;
  const grid = drawFunctionPatterns(size);
  placeData(grid, stream);

  let best: { mask: number; modules: Uint8Array } | undefined;
  let bestScore = -1;
  const masks = options.mask === undefined ? [0, 1, 2, 3] : [options.mask];
  for (const mask of masks) {
    if (mask > 3) throw new InvalidInputError('Micro QR Code masks are numbered 0 to 3.');
    const candidate = applyMask(grid, mask);
    const candidateGrid = { ...grid, modules: candidate };
    const candidateScore = score(candidateGrid);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      best = { mask, modules: candidate };
    }
  }
  if (best === undefined) throw new InvalidInputError('No mask could be chosen.');
  writeFormat(best.modules, size, microFormatBits(spec.version, spec.ecc, best.mask));

  return new QRMatrix({
    symbol: 'micro',
    version: spec.version,
    ecc: spec.ecc,
    mask: best.mask as MaskPattern,
    modules: best.modules,
    kinds: grid.kinds,
    segments: plan.segments,
  });
}
