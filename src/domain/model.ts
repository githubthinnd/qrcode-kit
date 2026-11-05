/** Error correction level: L ≈ 7 %, M ≈ 15 %, Q ≈ 25 %, H ≈ 30 % recoverable codewords. */
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export const ERROR_CORRECTION_LEVELS: readonly ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

/** QR Code Model 2 mask pattern reference. */
export type MaskPattern = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MASK_PATTERNS: readonly MaskPattern[] = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * How the best mask is found. `'standard'` scores each of the eight masks with the run-length rules
 * (the same choice as the reference implementations); `'fast'` scores them 32 modules at a time,
 * which is quicker and, in rare cases, picks another equally valid mask.
 */
export type MaskScoring = 'standard' | 'fast';

export const MASK_SCORINGS: readonly MaskScoring[] = ['standard', 'fast'];

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/** Role of a module in the symbol. Lets renderers style data and function patterns differently. */
export type ModuleKind =
  'data' | 'finder' | 'separator' | 'timing' | 'alignment' | 'format' | 'version' | 'dark';

export const MODULE_KINDS: readonly ModuleKind[] = [
  'data',
  'finder',
  'separator',
  'timing',
  'alignment',
  'format',
  'version',
  'dark',
];

/** Segment modes that can appear in a symbol's bit stream. */
export type SegmentMode =
  'numeric' | 'alphanumeric' | 'byte' | 'kanji' | 'eci' | 'fnc1-first' | 'fnc1-second';

/** Description of one segment as written into the symbol (metadata only). */
export interface SegmentInfo {
  readonly mode: SegmentMode;
  /** Characters (numeric/alphanumeric/kanji), bytes (byte) or 0 for markers. */
  readonly count: number;
  /** Bits the segment occupies in the symbol at the chosen version, header included. */
  readonly bits: number;
}

/** Position of a symbol inside a structured-append sequence (both 1-based for humans). */
export interface StructuredAppendInfo {
  /** 0-based index of this symbol. */
  readonly index: number;
  /** Total number of symbols in the sequence (2–16). */
  readonly total: number;
  /** Parity byte shared by all symbols of the sequence. */
  readonly parity: number;
}

/** The family of a symbol: QR Code Model 2, Micro QR Code (M1–M4) or rectangular Micro QR (rMQR). */
export type SymbolType = 'qr' | 'micro' | 'rmqr';

export const SYMBOL_TYPES: readonly SymbolType[] = ['qr', 'micro', 'rmqr'];

/** Highest version of each family (Micro QR: M1–M4; rMQR: the 32 sizes below). */
export const MAX_MICRO_VERSION = 4;
export const MAX_RMQR_VERSION = 32;

/** Width × height in modules of the 32 rMQR versions, in version order (ISO/IEC 23941 Table 1). */
export const RMQR_SIZES: readonly (readonly [width: number, height: number])[] = [
  [43, 7],
  [59, 7],
  [77, 7],
  [99, 7],
  [139, 7],
  [43, 9],
  [59, 9],
  [77, 9],
  [99, 9],
  [139, 9],
  [27, 11],
  [43, 11],
  [59, 11],
  [77, 11],
  [99, 11],
  [139, 11],
  [27, 13],
  [43, 13],
  [59, 13],
  [77, 13],
  [99, 13],
  [139, 13],
  [43, 15],
  [59, 15],
  [77, 15],
  [99, 15],
  [139, 15],
  [43, 17],
  [59, 17],
  [77, 17],
  [99, 17],
  [139, 17],
];

/** `M3`, `R9x59` or the number of a QR version, as people name the symbol. */
export function designationOf(symbol: SymbolType, version: number): string {
  if (symbol === 'micro') return `M${String(version)}`;
  if (symbol === 'rmqr') {
    const size = RMQR_SIZES.at(version - 1);
    return size === undefined ? `R?${String(version)}` : `R${String(size[1])}x${String(size[0])}`;
  }
  return String(version);
}
