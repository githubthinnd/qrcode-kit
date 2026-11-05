import { InvalidInputError, UnsupportedDataError } from '../domain/errors.js';
import { QRMatrix } from '../domain/matrix.js';
import {
  MODULE_KINDS,
  RMQR_SIZES,
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
import { RMQR_COUNT_BITS, RMQR_VERSIONS } from './rmqr-tables.js';

/**
 * rMQR, the rectangular Micro QR Code (ISO/IEC 23941): 32 sizes from R7x43 to R17x139, one finder
 * pattern with a sub-finder in the opposite corner, timing patterns on all four edges, one mask,
 * two copies of an 18-bit format information block. Levels: M and H.
 */

/** Mode indicators are 3 bits wide. */
const MODE_VALUE = {
  numeric: 1,
  alphanumeric: 2,
  byte: 3,
  kanji: 4,
  'fnc1-first': 5,
  'fnc1-second': 6,
  eci: 7,
} as const;

function rmqrFraming(version: number): Framing {
  return {
    mode: (mode) => {
      const value: number | undefined = (MODE_VALUE as Partial<Record<string, number>>)[mode];
      return value === undefined ? undefined : { value, bits: 3 };
    },
    count: (mode) => RMQR_COUNT_BITS[mode].at(version - 1),
  };
}

const kindIndex = (kind: ModuleKind): number => MODULE_KINDS.indexOf(kind);

/** All specs: every version with levels M and H, in version order. */
const specs: readonly CompactSpec[] = RMQR_VERSIONS.flatMap((data, index) => {
  const version = index + 1;
  const framing = rmqrFraming(version);
  return (['M', 'H'] as const).map((ecc): CompactSpec => {
    const level = data[ecc];
    return {
      version,
      ecc,
      framing,
      terminatorBits: 3,
      dataBits: level.blocks.reduce((sum, [count, size]) => sum + count * size, 0) * 8,
      blocks: level.blocks,
      eccPerBlock: level.eccPerBlock,
    };
  });
});

const area = (version: number): number => {
  const size = RMQR_SIZES.at(version - 1);
  return size === undefined ? Infinity : size[0] * size[1];
};

export interface RmqrOptions {
  readonly ecc: ErrorCorrectionLevel;
  /** Version indices 1–32 (see `RMQR_SIZES`). */
  readonly minVersion: number;
  readonly maxVersion: number;
  /** rMQR has a single mask pattern; anything but `undefined` is rejected. */
  readonly mask: MaskPattern | undefined;
  readonly boostEcc: boolean;
  readonly kanji?: KanjiMapper | undefined;
}

/** The only mask of rMQR: ((row ÷ 2) + (column ÷ 3)) mod 2 = 0, the same as QR Code mask 4. */
const flips = (x: number, y: number): boolean => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;

/** The 18 format bits before masking: level (M = 0, H = 1), version, BCH(18,6). */
export function rmqrFormatBits(version: number, ecc: ErrorCorrectionLevel): number {
  const data = ((ecc === 'H' ? 1 : 0) << 5) | (version - 1);
  return (data << 12) | bchRemainder(data, 12, 0x1f25);
}

const FORMAT_MASK_FINDER_SIDE = 0x1fab2;
const FORMAT_MASK_SUBFINDER_SIDE = 0x20a7b;

interface Grid {
  readonly width: number;
  readonly height: number;
  readonly modules: Uint8Array;
  readonly kinds: Uint8Array;
}

function drawFunctionPatterns(version: number): Grid {
  const size = RMQR_SIZES.at(version - 1);
  if (size === undefined)
    throw new InvalidInputError('An rMQR version must be an integer from 1 to 32.');
  const [width, height] = size;
  const centers = RMQR_VERSIONS.at(version - 1)?.centers ?? [];
  const modules = new Uint8Array(width * height);
  const kinds = new Uint8Array(width * height).fill(kindIndex('data'));
  const set = (x: number, y: number, dark: boolean, kind: ModuleKind): void => {
    modules[y * width + x] = dark ? 1 : 0;
    kinds[y * width + x] = kindIndex(kind);
  };

  // timing patterns along the four edges
  for (let x = 0; x < width; x++) {
    set(x, 0, x % 2 === 0, 'timing');
    set(x, height - 1, x % 2 === 0, 'timing');
  }
  for (let y = 0; y < height; y++) {
    set(0, y, y % 2 === 0, 'timing');
    set(width - 1, y, y % 2 === 0, 'timing');
  }

  // alignment patterns (3×3 rings) at both edges, joined by a vertical timing pattern
  for (const cx of centers) {
    for (const top of [0, height - 3]) {
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = -1; dx <= 1; dx++) set(cx + dx, top + dy, dy !== 1 || dx !== 0, 'alignment');
      }
    }
    for (let y = 3; y < height - 3; y++) set(cx, y, y % 2 === 0, 'timing');
  }

  // finder pattern 7×7 and its separator (the finder fills the whole height of R7 symbols)
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++)
      set(x, y, Math.max(Math.abs(x - 3), Math.abs(y - 3)) !== 2, 'finder');
  }
  for (let y = 0; y < (height === 7 ? 7 : 8); y++) set(7, y, false, 'separator');
  if (height > 7) for (let x = 0; x < 7; x++) set(x, 7, false, 'separator');

  // sub-finder 5×5 in the opposite corner
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const ring = Math.max(Math.abs(x - 2), Math.abs(y - 2));
      set(width - 5 + x, height - 5 + y, ring !== 1, 'alignment');
    }
  }

  // corner patterns: three dark modules along each of the two edges, one light module inside
  set(width - 3, 0, true, 'alignment');
  set(width - 2, 0, true, 'alignment');
  set(width - 1, 0, true, 'alignment');
  set(width - 1, 1, true, 'alignment');
  set(width - 1, 2, true, 'alignment');
  set(width - 2, 1, false, 'alignment');
  if (height > 7) {
    set(0, height - 1, true, 'alignment');
    set(1, height - 1, true, 'alignment');
    set(2, height - 1, true, 'alignment');
  }
  if (height > 9) {
    set(0, height - 3, true, 'alignment');
    set(0, height - 2, true, 'alignment');
    set(1, height - 2, false, 'alignment');
  }

  // format information areas
  const positions = formatPositions(width, height);
  for (const [x, y] of [...positions.finderSide, ...positions.subSide]) set(x, y, false, 'format');
  return { width, height, modules, kinds };
}

/** Where the 18 format bits go, most significant bit first: [finder side, sub-finder side]. */
function formatPositions(
  width: number,
  height: number,
): { finderSide: [number, number][]; subSide: [number, number][] } {
  const finderSide: [number, number][] = [];
  for (let y = 3; y >= 1; y--) finderSide.push([11, y]);
  for (let x = 10; x >= 8; x--) for (let y = 5; y >= 1; y--) finderSide.push([x, y]);
  const subSide: [number, number][] = [];
  for (let x = 3; x <= 5; x++) subSide.push([width - x, height - 6]);
  for (let x = 6; x <= 8; x++) for (let y = 2; y <= 6; y++) subSide.push([width - x, height - y]);
  return { finderSide, subSide };
}

function writeFormat(modules: Uint8Array, width: number, height: number, bits: number): void {
  const { finderSide, subSide } = formatPositions(width, height);
  const put = (positions: [number, number][], word: number): void => {
    positions.forEach(([x, y], index) => {
      modules[y * width + x] = (word >>> (positions.length - 1 - index)) & 1;
    });
  };
  put(finderSide, bits ^ FORMAT_MASK_FINDER_SIDE);
  put(subSide, bits ^ FORMAT_MASK_SUBFINDER_SIDE);
}

/** Two columns at a time from the right (the right edge is timing), up first, skipping function modules. */
function placeData(grid: Grid, bits: Uint8Array): void {
  const { width, height, modules, kinds } = grid;
  const data = kindIndex('data');
  let index = 0;
  let upward = true;
  for (let right = width - 2; right > 0; right -= 2) {
    for (let row = 0; row < height; row++) {
      const y = upward ? height - 1 - row : row;
      for (let column = 0; column < 2; column++) {
        const x = right - column;
        if (kinds[y * width + x] === data) {
          // modules after the last codeword (remainder bits) stay light
          if (index < bits.length) modules[y * width + x] = bits[index] ?? 0;
          index++;
        }
      }
    }
    upward = !upward;
  }
  if (index < bits.length) {
    throw new InvalidInputError('The codewords do not fit the data modules of this rMQR symbol.');
  }
}

/** Encode one rMQR symbol. */
export function encodeRmqrSymbol(source: CompactSource, options: RmqrOptions): QRMatrix {
  if (options.ecc !== 'M' && options.ecc !== 'H') {
    throw new InvalidInputError('rMQR has the error correction levels M and H.');
  }
  if (options.mask !== undefined) {
    throw new InvalidInputError('rMQR has a single mask pattern, so no mask can be chosen.');
  }
  // smallest area first; equal areas keep the lower version
  const candidates = specs
    .filter(
      (spec) =>
        spec.ecc === options.ecc &&
        spec.version >= options.minVersion &&
        spec.version <= options.maxVersion,
    )
    .sort((a, b) => area(a.version) - area(b.version) || a.version - b.version);
  if (candidates.length === 0) {
    throw new UnsupportedDataError('No rMQR version matches the requested range.', {
      details: { minVersion: options.minVersion, maxVersion: options.maxVersion },
    });
  }
  const plan = planCompact(
    source,
    candidates,
    (spec) => specs.filter((other) => other.version === spec.version && other !== spec),
    options.kanji,
    options.boostEcc,
  );
  const { spec } = plan;

  const codewords = blocksWithErrorCorrection(plan.data.toBytes(), spec);
  const grid = drawFunctionPatterns(spec.version);
  placeData(grid, bitsOf(codewords, codewords.length * 8));
  const { width, height, modules, kinds } = grid;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (kinds[y * width + x] === kindIndex('data') && flips(x, y)) modules[y * width + x] ^= 1;
    }
  }
  writeFormat(modules, width, height, rmqrFormatBits(spec.version, spec.ecc));

  return new QRMatrix({
    symbol: 'rmqr',
    version: spec.version,
    ecc: spec.ecc,
    mask: 4,
    modules,
    kinds,
    segments: plan.segments,
  });
}
