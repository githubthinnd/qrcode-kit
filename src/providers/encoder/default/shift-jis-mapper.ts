import { RuntimeUnavailableError } from '../../../domain/errors.js';
import {
  AMBIGUOUS_SHIFT_JIS_CODES,
  JIS_X_0208_RUNS,
  shiftJisOfCell,
} from '../../../core/jis-x-0208.js';
import { kanjiValue, type KanjiMapper } from '../../../core/kanji.js';

interface TextDecoderLike {
  decode(input: Uint8Array): string;
}
type TextDecoderConstructor = new (label: string, options: { fatal: boolean }) => TextDecoderLike;

/**
 * Builds a Unicode → Shift JIS lookup for Kanji mode by decoding the Shift JIS
 * codes of the JIS X 0208 repertoire with the platform's
 * `TextDecoder('shift_jis')`, so no character table is shipped in this entry.
 * The table is built on first use and is private to the returned mapper.
 *
 * Strictly JIS X 0208: only the 6 872 characters whose mapping is the same in the
 * Unicode Consortium's JIS X 0208 table and in Windows-31J are used. The
 * Windows-31J extensions (NEC row 13 and similar) and the seven ambiguous
 * characters are left to byte mode, which always round-trips. Needs a runtime
 * with `TextDecoder` and Shift JIS support (every current browser and Node.js
 * with full ICU); otherwise use `createJisX0208KanjiMapper` from `qrcode-toolkit/kanji`.
 */
export function createShiftJisKanjiMapper(): KanjiMapper {
  let table: Map<number, number> | undefined;

  const build = (): Map<number, number> => {
    const ctor = (globalThis as unknown as { TextDecoder?: TextDecoderConstructor }).TextDecoder;
    if (ctor === undefined) {
      throw new RuntimeUnavailableError(
        'Kanji mode needs TextDecoder with Shift JIS support, which this runtime does not provide. Pass a custom kanji mapper instead.',
      );
    }
    let decoder: TextDecoderLike;
    try {
      decoder = new ctor('shift_jis', { fatal: true });
    } catch (cause) {
      throw new RuntimeUnavailableError(
        'This runtime does not support the shift_jis encoding required by Kanji mode. Pass a custom kanji mapper instead.',
        { cause },
      );
    }
    const map = new Map<number, number>();
    for (const [first, last] of JIS_X_0208_RUNS) {
      for (let cell = first; cell <= last; cell++) {
        const code = shiftJisOfCell(cell);
        if (AMBIGUOUS_SHIFT_JIS_CODES.has(code) || kanjiValue(code) === undefined) continue;
        let text: string;
        try {
          text = decoder.decode(Uint8Array.of(code >> 8, code & 0xff));
        } catch {
          continue;
        }
        const codePoint = text.codePointAt(0);
        if (codePoint === undefined || text.length !== String.fromCodePoint(codePoint).length)
          continue;
        if (!map.has(codePoint)) map.set(codePoint, code);
      }
    }
    return map;
  };

  return {
    shiftJisCode(codePoint: number): number | undefined {
      table ??= build();
      return table.get(codePoint);
    },
  };
}
