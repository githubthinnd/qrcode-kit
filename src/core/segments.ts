import { InvalidInputError, UnsupportedDataError } from '../domain/errors.js';
import type { SegmentInfo, SegmentMode } from '../domain/model.js';
import type { Segment } from '../domain/segment.js';
import type { BitBuffer } from './bit-buffer.js';
import { kanjiValue, type KanjiMapper } from './kanji.js';
import { qrFraming, type Framing } from './framing.js';
import { alphanumericValue, isDigit, toCodePoints } from './text.js';

/** A segment validated and converted to the values that go into the bit stream. */
export interface PreparedSegment {
  readonly mode: SegmentMode;
  /** Characters / bytes for data modes, 0 for markers. */
  readonly count: number;
  /** Digit values, alphanumeric indices, bytes, or 13-bit Kanji values. */
  readonly values: ArrayLike<number>;
  /** ECI assignment number or FNC1 application indicator. */
  readonly parameter: number;
}

const NO_VALUES: ArrayLike<number> = [];

/** Validate a segment and convert it. Throws on malformed input. */
export function prepareSegment(segment: Segment, kanji: KanjiMapper | undefined): PreparedSegment {
  switch (segment.mode) {
    case 'numeric': {
      const values: number[] = [];
      for (const cp of toCodePoints(segment.text)) {
        if (!isDigit(cp)) {
          throw new InvalidInputError('A numeric segment may only contain the digits 0-9.');
        }
        values.push(cp - 0x30);
      }
      return { mode: 'numeric', count: values.length, values, parameter: 0 };
    }
    case 'alphanumeric': {
      const values: number[] = [];
      for (const cp of toCodePoints(segment.text)) {
        const value = alphanumericValue(cp);
        if (value < 0) {
          throw new InvalidInputError(
            'An alphanumeric segment may only contain 0-9, A-Z, space and $ % * + - . / :',
          );
        }
        values.push(value);
      }
      return { mode: 'alphanumeric', count: values.length, values, parameter: 0 };
    }
    case 'byte':
      return { mode: 'byte', count: segment.bytes.length, values: segment.bytes, parameter: 0 };
    case 'kanji': {
      if (kanji === undefined) {
        throw new UnsupportedDataError(
          'Kanji mode needs a Shift JIS mapper; none is available in this encoder.',
        );
      }
      const values: number[] = [];
      for (const cp of toCodePoints(segment.text)) {
        const code = kanji.shiftJisCode(cp);
        const value = code === undefined ? undefined : kanjiValue(code);
        if (value === undefined) {
          throw new UnsupportedDataError(
            'Text contains a character that Kanji mode cannot represent.',
            {
              details: { codePoint: cp },
            },
          );
        }
        values.push(value);
      }
      return { mode: 'kanji', count: values.length, values, parameter: 0 };
    }
    case 'eci': {
      if (
        !Number.isInteger(segment.assignment) ||
        segment.assignment < 0 ||
        segment.assignment > 999_999
      ) {
        throw new InvalidInputError(
          'An ECI assignment number must be an integer from 0 to 999999.',
        );
      }
      return { mode: 'eci', count: 0, values: NO_VALUES, parameter: segment.assignment };
    }
    case 'fnc1-first':
      return { mode: 'fnc1-first', count: 0, values: NO_VALUES, parameter: 0 };
    case 'fnc1-second': {
      const indicator = segment.applicationIndicator;
      if (!Number.isInteger(indicator) || indicator < 0 || indicator > 255) {
        throw new InvalidInputError(
          'An FNC1 application indicator must be an integer from 0 to 255.',
        );
      }
      return { mode: 'fnc1-second', count: 0, values: NO_VALUES, parameter: indicator };
    }
  }
}

/** Bits a prepared segment occupies under `framing`, or `Infinity` if it cannot be carried. */
export function segmentBitsIn(segment: PreparedSegment, framing: Framing): number {
  const indicator = framing.mode(segment.mode);
  if (indicator === undefined) return Infinity;
  switch (segment.mode) {
    case 'numeric':
    case 'alphanumeric':
    case 'byte':
    case 'kanji': {
      const width = framing.count(segment.mode);
      if (width === undefined || segment.count >= 1 << width) return Infinity;
      const n = segment.count;
      const payload =
        segment.mode === 'numeric'
          ? Math.floor(n / 3) * 10 + (n % 3 === 2 ? 7 : n % 3 === 1 ? 4 : 0)
          : segment.mode === 'alphanumeric'
            ? Math.floor(n / 2) * 11 + (n % 2) * 6
            : segment.mode === 'byte'
              ? n * 8
              : n * 13;
      return indicator.bits + width + payload;
    }
    case 'eci':
      return indicator.bits + (segment.parameter < 128 ? 8 : segment.parameter < 16384 ? 16 : 24);
    case 'fnc1-first':
      return indicator.bits;
    case 'fnc1-second':
      return indicator.bits + 8;
  }
}

/** Bits a prepared segment occupies at QR `version`, or `Infinity` if its count does not fit. */
export function segmentBits(segment: PreparedSegment, version: number): number {
  return segmentBitsIn(segment, qrFraming(version));
}

/** Append a prepared segment to the bit stream under `framing`. */
export function writeSegmentIn(segment: PreparedSegment, framing: Framing, out: BitBuffer): void {
  const indicator = framing.mode(segment.mode);
  if (indicator === undefined) {
    throw new InvalidInputError(`This symbol cannot carry ${segment.mode} segments.`);
  }
  out.append(indicator.value, indicator.bits);
  switch (segment.mode) {
    case 'numeric': {
      out.append(segment.count, framing.count('numeric') ?? 0);
      const v = segment.values;
      let i = 0;
      for (; i + 3 <= v.length; i += 3)
        out.append((v[i] ?? 0) * 100 + (v[i + 1] ?? 0) * 10 + (v[i + 2] ?? 0), 10);
      if (v.length - i === 2) out.append((v[i] ?? 0) * 10 + (v[i + 1] ?? 0), 7);
      else if (v.length - i === 1) out.append(v[i] ?? 0, 4);
      return;
    }
    case 'alphanumeric': {
      out.append(segment.count, framing.count('alphanumeric') ?? 0);
      const v = segment.values;
      let i = 0;
      for (; i + 2 <= v.length; i += 2) out.append((v[i] ?? 0) * 45 + (v[i + 1] ?? 0), 11);
      if (v.length - i === 1) out.append(v[i] ?? 0, 6);
      return;
    }
    case 'byte': {
      out.append(segment.count, framing.count('byte') ?? 0);
      for (const value of Array.from(segment.values)) out.append(value, 8);
      return;
    }
    case 'kanji': {
      out.append(segment.count, framing.count('kanji') ?? 0);
      for (const value of Array.from(segment.values)) out.append(value, 13);
      return;
    }
    case 'eci': {
      const a = segment.parameter;
      if (a < 128) out.append(a, 8);
      else if (a < 16384) out.append((0b10 << 14) | a, 16);
      else out.append((0b110 << 21) | a, 24);
      return;
    }
    case 'fnc1-first':
      return;
    case 'fnc1-second':
      out.append(segment.parameter, 8);
      return;
  }
}

/** Append a prepared segment to the bit stream of QR `version`. */
export function writeSegment(segment: PreparedSegment, version: number, out: BitBuffer): void {
  writeSegmentIn(segment, qrFraming(version), out);
}

export const describeSegment = (segment: PreparedSegment, version: number): SegmentInfo => ({
  mode: segment.mode,
  count: segment.count,
  bits: segmentBits(segment, version),
});
