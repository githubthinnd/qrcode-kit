/**
 * Input segments. Callers normally pass a string or bytes and let the encoder
 * segment automatically; explicit segments give full control (ISO 18004 §7.4).
 */

/** Digits `0-9`. */
export interface NumericSegment {
  readonly mode: 'numeric';
  readonly text: string;
}

/** `0-9 A-Z space $ % * + - . / :` */
export interface AlphanumericSegment {
  readonly mode: 'alphanumeric';
  readonly text: string;
}

/** Raw 8-bit data. Interpretation is decided by the reader (or by a preceding ECI segment). */
export interface ByteSegment {
  readonly mode: 'byte';
  readonly bytes: Uint8Array;
}

/** Characters of JIS X 0208 packed as 13 bits each. */
export interface KanjiSegment {
  readonly mode: 'kanji';
  readonly text: string;
}

/** Extended Channel Interpretation switch (assignment number 0 – 999999). */
export interface EciSegment {
  readonly mode: 'eci';
  readonly assignment: number;
}

/** FNC1 in first position (GS1 formatted data). */
export interface Fnc1FirstSegment {
  readonly mode: 'fnc1-first';
}

/** FNC1 in second position with an application indicator (0–255). */
export interface Fnc1SecondSegment {
  readonly mode: 'fnc1-second';
  readonly applicationIndicator: number;
}

export type Segment =
  | NumericSegment
  | AlphanumericSegment
  | ByteSegment
  | KanjiSegment
  | EciSegment
  | Fnc1FirstSegment
  | Fnc1SecondSegment;

/** Convenience constructors. */
export const segment: {
  readonly numeric: (text: string) => NumericSegment;
  readonly alphanumeric: (text: string) => AlphanumericSegment;
  readonly byte: (bytes: Uint8Array) => ByteSegment;
  readonly kanji: (text: string) => KanjiSegment;
  readonly eci: (assignment: number) => EciSegment;
  readonly fnc1First: () => Fnc1FirstSegment;
  readonly fnc1Second: (applicationIndicator: number) => Fnc1SecondSegment;
} = {
  numeric: (text) => ({ mode: 'numeric', text }),
  alphanumeric: (text) => ({ mode: 'alphanumeric', text }),
  byte: (bytes) => ({ mode: 'byte', bytes }),
  kanji: (text) => ({ mode: 'kanji', text }),
  eci: (assignment) => ({ mode: 'eci', assignment }),
  fnc1First: () => ({ mode: 'fnc1-first' }),
  fnc1Second: (applicationIndicator) => ({ mode: 'fnc1-second', applicationIndicator }),
};
