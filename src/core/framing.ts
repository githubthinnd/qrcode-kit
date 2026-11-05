import type { SegmentMode } from '../domain/model.js';
import { MODE_BITS, charCountBits } from './tables.js';

export type DataMode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';

/**
 * How one symbol version frames its segments: the mode indicator of every mode it can carry and
 * the width of the character count field. QR Code, Micro QR and rMQR differ only here, so the
 * segment writer and the segmentation work for all three.
 */
export interface Framing {
  /** The mode indicator, or `undefined` when this symbol cannot carry the mode. */
  readonly mode: (
    mode: SegmentMode,
  ) => { readonly value: number; readonly bits: number } | undefined;
  /** Width of the character count field, or `undefined` when the mode is not available. */
  readonly count: (mode: DataMode) => number | undefined;
}

const QR_MODE_VALUE: Partial<Record<SegmentMode, number>> = {
  numeric: MODE_BITS.numeric,
  alphanumeric: MODE_BITS.alphanumeric,
  byte: MODE_BITS.byte,
  kanji: MODE_BITS.kanji,
  eci: MODE_BITS.eci,
  'fnc1-first': MODE_BITS.fnc1First,
  'fnc1-second': MODE_BITS.fnc1Second,
};

const qrFramings = new Map<number, Framing>();

/** Framing of QR Code Model 2 at `version` (4-bit mode indicators). */
export function qrFraming(version: number): Framing {
  let framing = qrFramings.get(version);
  if (framing === undefined) {
    framing = {
      mode: (mode) => {
        const value = QR_MODE_VALUE[mode];
        return value === undefined ? undefined : { value, bits: 4 };
      },
      count: (mode) => charCountBits(mode, version),
    };
    qrFramings.set(version, framing);
  }
  return framing;
}
