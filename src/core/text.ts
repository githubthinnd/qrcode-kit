import { InvalidInputError, UnsupportedDataError } from '../domain/errors.js';
import { ALPHANUMERIC_CHARSET } from './tables.js';

export type Charset = 'utf-8' | 'iso-8859-1';

/** Code points of a string; throws when it contains an unpaired surrogate. */
export function toCodePoints(text: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result.push(((unit - 0xd800) << 10) + (next - 0xdc00) + 0x10000);
        i++;
        continue;
      }
      throw new InvalidInputError('Text contains an unpaired surrogate and cannot be encoded.', {
        details: { index: i },
      });
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new InvalidInputError('Text contains an unpaired surrogate and cannot be encoded.', {
        details: { index: i },
      });
    }
    result.push(unit);
  }
  return result;
}

/** Number of bytes a code point occupies in UTF-8. */
export function utf8Length(codePoint: number): number {
  return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
}

/** Append the UTF-8 bytes of a code point. */
export function pushUtf8(codePoint: number, out: number[]): void {
  if (codePoint < 0x80) {
    out.push(codePoint);
  } else if (codePoint < 0x800) {
    out.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
  } else if (codePoint < 0x10000) {
    out.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
  } else {
    out.push(
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
  }
}

/** Bytes of a string in the given charset. */
export function encodeText(text: string, charset: Charset): Uint8Array {
  const out: number[] = [];
  for (const codePoint of toCodePoints(text)) {
    if (charset === 'utf-8') {
      pushUtf8(codePoint, out);
    } else {
      if (codePoint > 0xff) {
        throw new UnsupportedDataError(
          'Text contains characters outside ISO-8859-1; use UTF-8 or another charset.',
          { details: { codePoint } },
        );
      }
      out.push(codePoint);
    }
  }
  return Uint8Array.from(out);
}

export const isDigit = (codePoint: number): boolean => codePoint >= 0x30 && codePoint <= 0x39;

export const alphanumericValue = (codePoint: number): number =>
  codePoint < 0x80 ? ALPHANUMERIC_CHARSET.indexOf(String.fromCharCode(codePoint)) : -1;
