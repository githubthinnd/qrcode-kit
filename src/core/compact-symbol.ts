import { InvalidInputError } from '../domain/errors.js';
import type { QRMatrix } from '../domain/matrix.js';
import type { ErrorCorrectionLevel, MaskPattern } from '../domain/model.js';
import type { Segment } from '../domain/segment.js';
import type { CompactSource } from './compact.js';
import type { KanjiMapper } from './kanji.js';
import { encodeMicroSymbol } from './micro.js';
import { encodeRmqrSymbol } from './rmqr.js';
import { segmentTextWith } from './segmentation.js';
import type { Charset } from './text.js';

export type CompactSymbol = 'micro' | 'rmqr';

/** What to encode in a Micro QR Code or rMQR symbol. */
export type CompactInput =
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly charset: Charset;
      /** Declare the charset with an ECI header (rMQR only). */
      readonly eci: boolean;
      readonly kanji: KanjiMapper | undefined;
    }
  | {
      readonly kind: 'bytes';
      readonly bytes: Uint8Array;
      /** ECI assignment number to declare first (rMQR only). */
      readonly eci: number | undefined;
    }
  | {
      readonly kind: 'segments';
      readonly segments: readonly Segment[];
      readonly kanji: KanjiMapper | undefined;
    };

export interface CompactOptions {
  readonly ecc: ErrorCorrectionLevel;
  readonly minVersion: number;
  readonly maxVersion: number;
  readonly mask: MaskPattern | undefined;
  readonly boostEcc: boolean;
  readonly fnc1:
    | { readonly position: 'first' }
    | { readonly position: 'second'; readonly applicationIndicator: number }
    | undefined;
}

const ECI_ASSIGNMENT: Record<Charset, number> = { 'iso-8859-1': 3, 'utf-8': 26 };

function toSource(input: CompactInput, options: CompactOptions): CompactSource {
  const lead: Segment[] = [];
  const fnc1 = options.fnc1;
  if (fnc1?.position === 'first') lead.push({ mode: 'fnc1-first' });
  else if (fnc1?.position === 'second') {
    lead.push({ mode: 'fnc1-second', applicationIndicator: fnc1.applicationIndicator });
  }
  switch (input.kind) {
    case 'text':
      if (input.eci) lead.push({ mode: 'eci', assignment: ECI_ASSIGNMENT[input.charset] });
      return {
        lead,
        body: (framing) =>
          segmentTextWith(input.text, framing, { charset: input.charset, kanji: input.kanji }),
      };
    case 'bytes':
      if (input.eci !== undefined) lead.push({ mode: 'eci', assignment: input.eci });
      return { lead, body: () => [{ mode: 'byte', bytes: input.bytes }] };
    case 'segments':
      return { lead, body: () => input.segments };
  }
}

/** Encode one Micro QR Code or rMQR symbol. */
export function encodeCompactSymbol(
  symbol: CompactSymbol,
  input: CompactInput,
  options: CompactOptions,
): QRMatrix {
  const source = toSource(input, options);
  const kanji = input.kind === 'bytes' ? undefined : input.kanji;
  if (symbol === 'micro') {
    if (source.lead.length > 0) {
      throw new InvalidInputError(
        'Micro QR Code cannot carry ECI or FNC1; use rMQR or QR Code for that.',
      );
    }
    return encodeMicroSymbol(source, { ...options, kanji });
  }
  return encodeRmqrSymbol(source, { ...options, kanji });
}
