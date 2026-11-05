import type { Charset } from '../contracts/encoder.js';
import type { ModuleShape } from '../contracts/renderer.js';
import type {
  ErrorCorrectionLevel,
  MaskPattern,
  MaskScoring,
  SymbolType,
} from '../domain/model.js';
import type { Segment } from '../domain/segment.js';

/** Options that control how data is turned into a QR Code symbol. */
export interface SymbolOptions {
  /**
   * `'qr'` (default), `'micro'` (Micro QR Code M1–M4, tiny and square) or `'rmqr'` (rectangular
   * Micro QR, R7x43 … R17x139). Micro QR and rMQR hold less data in less space, use a 2-module quiet
   * zone, and have their own levels: L/M/Q (default L) and M/H (default M).
   */
  readonly symbol?: SymbolType;
  /** Error correction level. Default `'M'`. */
  readonly ecc?: ErrorCorrectionLevel;
  /**
   * An exact version or an allowed range; default: all, smallest that fits. QR Code: 1–40. Micro QR:
   * 1–4 or `'M1'`–`'M4'`. rMQR: 1–32 or a name such as `'R9x59'` (height × width), smallest area first.
   */
  readonly version?:
    number | string | { readonly min?: number | string; readonly max?: number | string };
  /** Mask pattern 0–7, or `'auto'` (default) for the lowest-penalty mask. */
  readonly mask?: MaskPattern | 'auto';
  /**
   * How the best mask is found when `mask` is `'auto'` (QR Code only): `'standard'` (default) scores
   * the eight masks with the run-length rules and picks what the reference implementations pick;
   * `'fast'` scores them 32 modules at a time, quicker, and in rare cases chooses another equally
   * valid mask.
   */
  readonly maskScoring?: MaskScoring;
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
  /** Quiet zone in modules. Default: 4 for QR Code, 2 for Micro QR and rMQR (the minimum their standards require). */
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
  /**
   * Shape of the modules: `'square'` (default), `'rounded'` or `'dots'`. Styling options
   * (`moduleShape`, `gradient`, `logo`) need a renderer that supports them; the built-in SVG
   * renderer does, raster renderers reject them.
   */
  readonly moduleShape?: ModuleShape;
  /** A gradient instead of the flat `dark` colour. Cannot be combined with `dark` or `invert`. */
  readonly gradient?: {
    readonly from: string;
    readonly to: string;
    /** Default `'linear'`. */
    readonly type?: 'linear' | 'radial';
    /** Degrees for a linear gradient, 0–360. Default 45. */
    readonly angle?: number;
  };
  /**
   * A logo in the centre: `href` must be a base64 `data:image/png|jpeg|webp|gif|svg+xml` URL.
   * `size` is its width as a fraction of the symbol (0.05–0.3, default 0.2) and `margin` the
   * modules cleared around it (0–4, default 1). The cleared area must stay within what the error
   * correction level can recover; when `ecc` is not set, level `'H'` is used.
   */
  readonly logo?: {
    readonly href: string;
    readonly size?: number;
    readonly margin?: number;
  };
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
  extends
    Omit<SymbolOptions, 'eci' | 'kanji' | 'fnc1' | 'symbol'>,
    AppearanceOptions,
    OutputOptions {
  readonly data: string | Uint8Array;
  readonly format?: F;
  /** Number of symbols (2–16). Default: the smallest number whose parts all fit. */
  readonly symbols?: number;
}

export const SYMBOL_OPTION_KEYS: readonly string[] = [
  'data',
  'symbol',
  'maskScoring',
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
  'moduleShape',
  'gradient',
  'logo',
];
export const OUTPUT_OPTION_KEYS: readonly string[] = ['format', 'quality', 'path', 'providers'];
