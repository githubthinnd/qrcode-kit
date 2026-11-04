import type { QRMatrix } from '../domain/matrix.js';
import type { ErrorCorrectionLevel, MaskPattern, SegmentMode } from '../domain/model.js';
import type { Segment } from '../domain/segment.js';
import type { MaybePromise, ProviderBase } from './common.js';

export type Charset = 'utf-8' | 'iso-8859-1';

/** What the encoder is asked to encode. */
export type EncodeInput =
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly charset: Charset;
      /** Emit an ECI header for the charset. */
      readonly eci: boolean;
      /** Allow Kanji mode for characters it can represent. */
      readonly kanji: boolean;
    }
  | {
      readonly kind: 'bytes';
      readonly bytes: Uint8Array;
      /** ECI assignment number to declare first, if any. */
      readonly eci: number | undefined;
    }
  | { readonly kind: 'segments'; readonly segments: readonly Segment[] };

/** Fully resolved encoder request: every field has a value, no defaults are applied downstream. */
export interface EncodeRequest {
  readonly input: EncodeInput;
  readonly ecc: ErrorCorrectionLevel;
  readonly minVersion: number;
  readonly maxVersion: number;
  /** `undefined` = choose automatically. */
  readonly mask: MaskPattern | undefined;
  readonly boostEcc: boolean;
  readonly fnc1:
    | { readonly position: 'first' }
    | { readonly position: 'second'; readonly applicationIndicator: number }
    | undefined;
}

export interface StructuredAppendRequest {
  readonly data: string | Uint8Array;
  readonly charset: Charset;
  /** `undefined` = the smallest number of symbols that fits. */
  readonly symbols: number | undefined;
  readonly ecc: ErrorCorrectionLevel;
  readonly minVersion: number;
  readonly maxVersion: number;
  readonly mask: MaskPattern | undefined;
  readonly boostEcc: boolean;
}

export interface EncoderCapabilities {
  readonly modes: readonly Extract<SegmentMode, 'numeric' | 'alphanumeric' | 'byte' | 'kanji'>[];
  readonly charsets: readonly Charset[];
  readonly eci: boolean;
  readonly fnc1: boolean;
  readonly structuredAppend: boolean;
  /** Can honour an explicit mask pattern. */
  readonly maskControl: boolean;
  readonly boostEcc: boolean;
  /** Never returns a promise. */
  readonly sync: boolean;
}

/**
 * Turns input into a QR Code matrix. Must be pure: the same request always
 * yields the same matrix, with no I/O and no retained state.
 */
export interface EncoderProvider extends ProviderBase<EncoderCapabilities> {
  encode(request: EncodeRequest): MaybePromise<QRMatrix>;
  /** Present when `capabilities.structuredAppend` is true. */
  encodeStructuredAppend?(request: StructuredAppendRequest): MaybePromise<readonly QRMatrix[]>;
}
