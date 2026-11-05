import type { Charset } from '../contracts/encoder.js';
import type { ErrorCorrectionLevel, MaskPattern } from '../domain/model.js';
import type { Segment } from '../domain/segment.js';

/** Options that control how data is turned into a QR Code symbol. */
export interface SymbolOptions {
  /** Error correction level. Default `'M'`. */
  readonly ecc?: ErrorCorrectionLevel;
  /** An exact version (1–40) or an allowed range. Default: 1–40, smallest that fits. */
  readonly version?: number | { readonly min?: number; readonly max?: number };
  /** Mask pattern 0–7, or `'auto'` (default) for the lowest-penalty mask. */
  readonly mask?: MaskPattern | 'auto';
  /** Raise the error correction level while the data still fits in the chosen version. Default `false`. */
  readonly boostEcc?: boolean;
  /** Character set of string data. Default `'utf-8'`. */
  readonly charset?: Charset;
  /**
   * Extended Channel Interpretation. `true` declares the charset of string data (ECI 26 for UTF-8,
   * ECI 3 for ISO-8859-1); a number declares that assignment for byte data. Default `false`: no ECI
   * header, which is what the vast majority of scanners expect for UTF-8.
   */
  readonly eci?: boolean | number;
  /** Allow Kanji mode (Shift JIS, 13 bits per character) for text it can represent. Default `false`. */
  readonly kanji?: boolean;
  /**
   * FNC1 mode. `'first'` is GS1 data. `{ applicationIndicator }` is the second-position form: two
   * digits `"00"`–`"99"` or one Latin letter (as text), or the raw 8-bit value as a number (digits
   * map to 0–99, a letter to its ASCII code + 100).
   */
  readonly fnc1?: 'first' | { readonly applicationIndicator: number | string };
}

/** Options that control how a symbol is drawn. */
export interface AppearanceOptions {
  /** Quiet zone in modules. Default 4 (the minimum the standard requires). */
  readonly quietZone?: number;
  /** Pixels per module. Mutually exclusive with `size`. */
  readonly scale?: number;
  /** Target edge length in pixels. Raster output uses the largest whole number of pixels per module that fits. */
  readonly size?: number;
  /** Dark module colour. Default `#000000`. */
  readonly dark?: string;
  /** Light module / background colour. Default `#ffffff`; `transparent` where the renderer supports it. */
  readonly light?: string;
  /** Swap dark and light. */
  readonly invert?: boolean;
}

/** Per-operation provider selection by id. */
export interface ProviderSelection {
  readonly encoder?: string;
  readonly renderer?: string;
  readonly exporter?: string;
}

export interface OutputOptions {
  /** Output format. Default `'svg'`. */
  readonly format?: string;
  /** Lossy formats: 0–1. */
  readonly quality?: number;
  /** File exporters: destination path. */
  readonly path?: string;
  /** Override the providers used for this operation. */
  readonly providers?: ProviderSelection;
}

/** Everything `generate` accepts. */
export interface GenerateRequest<F extends string = string>
  extends SymbolOptions, AppearanceOptions, OutputOptions {
  readonly data: string | Uint8Array | readonly Segment[];
  readonly format?: F;
}

/** Request for a structured-append sequence (data split across 2–16 linked symbols). */
export interface StructuredAppendGenerateRequest<F extends string = string>
  extends Omit<SymbolOptions, 'eci' | 'kanji' | 'fnc1'>, AppearanceOptions, OutputOptions {
  readonly data: string | Uint8Array;
  readonly format?: F;
  /** Number of symbols (2–16). Default: the smallest number whose parts all fit. */
  readonly symbols?: number;
}

export const SYMBOL_OPTION_KEYS: readonly string[] = [
  'data',
  'ecc',
  'version',
  'mask',
  'boostEcc',
  'charset',
  'eci',
  'kanji',
  'fnc1',
];
export const APPEARANCE_OPTION_KEYS: readonly string[] = [
  'quietZone',
  'scale',
  'size',
  'dark',
  'light',
  'invert',
];
export const OUTPUT_OPTION_KEYS: readonly string[] = ['format', 'quality', 'path', 'providers'];
