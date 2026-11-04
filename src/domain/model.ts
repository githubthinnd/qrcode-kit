/** Error correction level: L ≈ 7 %, M ≈ 15 %, Q ≈ 25 %, H ≈ 30 % recoverable codewords. */
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export const ERROR_CORRECTION_LEVELS: readonly ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

/** QR Code Model 2 mask pattern reference. */
export type MaskPattern = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MASK_PATTERNS: readonly MaskPattern[] = [0, 1, 2, 3, 4, 5, 6, 7];

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
