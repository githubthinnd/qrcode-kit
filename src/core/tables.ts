import type { ErrorCorrectionLevel, MaskPattern } from '../domain/model.js';

/** Index of a level in the tables below (L, M, Q, H). */
export const eccOrdinal = (ecc: ErrorCorrectionLevel): 0 | 1 | 2 | 3 =>
  ecc === 'L' ? 0 : ecc === 'M' ? 1 : ecc === 'Q' ? 2 : 3;

/** The two format-information bits identifying each level (note: L=01, M=00, Q=11, H=10). */
export const eccFormatBits = (ecc: ErrorCorrectionLevel): number =>
  ecc === 'L' ? 1 : ecc === 'M' ? 0 : ecc === 'Q' ? 3 : 2;

/** Error correction codewords per block, indexed [level][version] (index 0 unused). */
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  // prettier-ignore
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // prettier-ignore
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // prettier-ignore
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // prettier-ignore
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

/** Number of error correction blocks, indexed [level][version] (index 0 unused). */
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  // prettier-ignore
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // prettier-ignore
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // prettier-ignore
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // prettier-ignore
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

export const eccCodewordsPerBlock = (version: number, ecc: ErrorCorrectionLevel): number =>
  ECC_CODEWORDS_PER_BLOCK[eccOrdinal(ecc)]?.[version] ?? -1;

export const numErrorCorrectionBlocks = (version: number, ecc: ErrorCorrectionLevel): number =>
  NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal(ecc)]?.[version] ?? -1;

/** Side length in modules. */
export const symbolSize = (version: number): number => version * 4 + 17;

/**
 * Alignment pattern centre coordinates for a version (empty for version 1).
 * Derived from the geometry rather than looked up.
 */
export function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = symbolSize(version) - 7; result.length < count; position -= step) {
    result.splice(1, 0, position);
  }
  return result;
}

/**
 * Number of modules that can hold data or error correction bits (everything
 * that is not a function pattern, format or version information).
 */
export function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    result -= (25 * count - 10) * count - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords (excluding error correction) available at a version and level. */
export function numDataCodewords(version: number, ecc: ErrorCorrectionLevel): number {
  return (
    Math.floor(numRawDataModules(version) / 8) -
    eccCodewordsPerBlock(version, ecc) * numErrorCorrectionBlocks(version, ecc)
  );
}

/** Mode indicators (4 bits). */
export const MODE_BITS = {
  numeric: 0b0001,
  alphanumeric: 0b0010,
  byte: 0b0100,
  kanji: 0b1000,
  eci: 0b0111,
  structuredAppend: 0b0011,
  fnc1First: 0b0101,
  fnc1Second: 0b1001,
} as const;

/** Character count indicator width for a mode at a version. */
export function charCountBits(
  mode: 'numeric' | 'alphanumeric' | 'byte' | 'kanji',
  version: number,
): number {
  const range = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  const widths = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
    kanji: [8, 10, 12],
  } as const;
  return widths[mode][range];
}

export const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Whether mask pattern `mask` inverts the module at (x, y). */
export function maskInverts(mask: MaskPattern, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}
