import { InvalidInputError, UnsupportedDataError } from '../domain/errors.js';
import type { QRMatrix } from '../domain/matrix.js';
import type { Segment } from '../domain/segment.js';
import { encodeSymbol, type EncodeOptions } from './encoder.js';
import { segmentText } from './segmentation.js';
import { encodeText, pushUtf8, toCodePoints, type Charset } from './text.js';

/** Markers placed before the data of a symbol. */
export interface LeadOptions {
  /** Emit an ECI header declaring the charset of text input. */
  readonly eci?: boolean | undefined;
  /** FNC1 mode (GS1 / application indicator). */
  readonly fnc1?:
    | { readonly position: 'first' }
    | { readonly position: 'second'; readonly applicationIndicator: number }
    | undefined;
}

export interface TextOptions extends EncodeOptions, LeadOptions {
  readonly charset: Charset;
}

const ECI_ASSIGNMENT: Record<Charset, number> = { 'iso-8859-1': 3, 'utf-8': 26 };

function leadSegments(options: LeadOptions, charset: Charset | undefined): Segment[] {
  const lead: Segment[] = [];
  const fnc1 = options.fnc1;
  if (fnc1?.position === 'first') lead.push({ mode: 'fnc1-first' });
  else if (fnc1?.position === 'second') {
    lead.push({ mode: 'fnc1-second', applicationIndicator: fnc1.applicationIndicator });
  }
  if (options.eci === true && charset !== undefined) {
    lead.push({ mode: 'eci', assignment: ECI_ASSIGNMENT[charset] });
  }
  return lead;
}

/** Encode text with automatic, size-optimal segmentation. */
export function encodeTextSymbol(text: string, options: TextOptions): QRMatrix {
  return encodeSymbol(
    {
      lead: leadSegments(options, options.charset),
      body: (range) => segmentText(text, range, { charset: options.charset, kanji: options.kanji }),
    },
    options,
  );
}

/** Encode raw bytes as one byte segment. `eci` (an assignment number) is emitted first when given. */
export function encodeBytesSymbol(
  bytes: Uint8Array,
  options: EncodeOptions & Pick<LeadOptions, 'fnc1'> & { readonly eci?: number | undefined },
): QRMatrix {
  const lead = leadSegments({ fnc1: options.fnc1 }, undefined);
  if (options.eci !== undefined) lead.push({ mode: 'eci', assignment: options.eci });
  return encodeSymbol({ lead, body: () => [{ mode: 'byte', bytes }] }, options);
}

/** Encode explicit segments exactly as given. */
export function encodeSegmentsSymbol(
  segments: readonly Segment[],
  options: EncodeOptions,
): QRMatrix {
  return encodeSymbol({ lead: [], body: () => segments }, options);
}

export interface StructuredAppendOptions extends EncodeOptions {
  readonly charset: Charset;
  /** Number of symbols (2–16). Omitted: the smallest count whose parts all fit. */
  readonly symbols?: number | undefined;
}

interface Plan {
  readonly parity: number;
  readonly parts: readonly (string | Uint8Array)[];
}

function parityOf(bytes: ArrayLike<number>): number {
  let parity = 0;
  for (const byte of Array.from(bytes)) parity ^= byte;
  return parity;
}

/** Split data into `symbols` parts and compute the sequence parity (XOR of all data bytes). */
export function planStructuredAppend(
  data: string | Uint8Array,
  symbols: number,
  charset: Charset,
): Plan {
  if (typeof data !== 'string') {
    if (data.length < symbols)
      throw new InvalidInputError('There is less data than symbols to split it into.');
    const parts: Uint8Array[] = [];
    for (let i = 0; i < symbols; i++) {
      parts.push(
        data.slice(
          Math.floor((i * data.length) / symbols),
          Math.floor(((i + 1) * data.length) / symbols),
        ),
      );
    }
    return { parity: parityOf(data), parts };
  }
  const codePoints = toCodePoints(data);
  if (codePoints.length < symbols) {
    throw new InvalidInputError('There is less data than symbols to split it into.');
  }
  const bytes = encodeText(data, charset);
  const sizes = codePoints.map((cp) => {
    const out: number[] = [];
    if (charset === 'utf-8') pushUtf8(cp, out);
    else out.push(cp);
    return out.length;
  });
  const total = sizes.reduce((a, b) => a + b, 0);
  const parts: string[] = [];
  let start = 0;
  let consumed = 0;
  for (let p = 0; p < symbols; p++) {
    const target = Math.round(((p + 1) * total) / symbols);
    let end = start;
    const mustLeave = symbols - p - 1;
    while (end < codePoints.length - mustLeave && (end === start || consumed < target)) {
      consumed += sizes[end] ?? 0;
      end++;
    }
    parts.push(
      String.fromCodePoint(...codePoints.slice(start, p === symbols - 1 ? codePoints.length : end)),
    );
    start = p === symbols - 1 ? codePoints.length : end;
  }
  return { parity: parityOf(bytes), parts };
}

/**
 * Encode data across several linked symbols (structured append). The smallest
 * number of symbols whose parts each fit the version range is used unless
 * `symbols` is given.
 */
export function encodeStructuredAppendSequence(
  data: string | Uint8Array,
  options: StructuredAppendOptions,
): QRMatrix[] {
  const encodeWith = (symbols: number): QRMatrix[] => {
    const { parity, parts } = planStructuredAppend(data, symbols, options.charset);
    return parts.map((part, index) =>
      encodeSymbol(
        {
          lead: [],
          body:
            typeof part === 'string'
              ? (range) => segmentText(part, range, { charset: options.charset })
              : () => [{ mode: 'byte', bytes: part }],
          structuredAppend: { index, total: symbols, parity },
        },
        { ...options, kanji: undefined },
      ),
    );
  };

  if (options.symbols !== undefined) {
    if (!Number.isInteger(options.symbols) || options.symbols < 2 || options.symbols > 16) {
      throw new InvalidInputError('Structured append needs between 2 and 16 symbols.');
    }
    return encodeWith(options.symbols);
  }
  for (let symbols = 2; symbols <= 16; symbols++) {
    try {
      return encodeWith(symbols);
    } catch (error) {
      if (!(error instanceof UnsupportedDataError)) throw error;
    }
  }
  throw new UnsupportedDataError('The data does not fit in 16 structured-append symbols.');
}
