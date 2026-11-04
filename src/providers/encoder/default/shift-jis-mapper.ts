import { RuntimeUnavailableError } from '../../../domain/errors.js';
import { kanjiValue, type KanjiMapper } from '../../../core/kanji.js';

interface TextDecoderLike {
  decode(input: Uint8Array): string;
}
type TextDecoderConstructor = new (label: string, options: { fatal: boolean }) => TextDecoderLike;

const KANJI_RANGES: readonly (readonly [number, number])[] = [
  [0x8140, 0x9ffc],
  [0xe040, 0xebbf],
];

/**
 * Builds a Unicode → Shift JIS lookup for Kanji mode by decoding every code in
 * the two Kanji ranges with the platform's `TextDecoder('shift_jis')`, so no
 * large table is shipped. The table is built on first use and is private to
 * the returned mapper.
 *
 * Needs a runtime with `TextDecoder` and Shift JIS support (every current
 * browser and Node.js with full ICU). Note the platform decoder implements
 * Windows-31J, a superset of JIS X 0208; only codes inside the Kanji-mode
 * ranges are used.
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
    for (const [first, last] of KANJI_RANGES) {
      for (let code = first; code <= last; code++) {
        if (kanjiValue(code) === undefined) continue;
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
