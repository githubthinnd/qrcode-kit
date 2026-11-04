import { InvalidInputError } from '../domain/errors.js';
import {
  AMBIGUOUS_SHIFT_JIS_CODES,
  JIS_X_0208_RUNS,
  JIS_X_0208_SIZE,
  shiftJisOfCell,
} from '../core/jis-x-0208.js';
import type { KanjiMapper } from '../core/kanji.js';
import { JIS_X_0208_CHARACTERS } from './table.js';

/**
 * A Kanji-mode mapper with the JIS X 0208 repertoire built in. It needs no
 * `TextDecoder` and no platform Shift JIS support, so it behaves identically in
 * every runtime (including Node.js builds without full ICU and edge runtimes).
 *
 * The data (about 21 kB) comes from the Unicode Consortium's JIS X 0208 mapping
 * table and lives in its own entry point so it is only bundled when you import it.
 * The seven characters whose Windows-31J and JIS mappings disagree are excluded
 * (see `AMBIGUOUS_SHIFT_JIS_CODES`); they are encoded in byte mode instead.
 *
 * @example
 * import { createQRCodeKit } from 'qrcode-toolkit';
 * import { createJisX0208KanjiMapper } from 'qrcode-toolkit/kanji';
 * const kit = createQRCodeKit({ kanji: createJisX0208KanjiMapper() });
 */
export function createJisX0208KanjiMapper(): KanjiMapper {
  let table: Map<number, number> | undefined;

  const build = (): Map<number, number> => {
    if (JIS_X_0208_CHARACTERS.length !== JIS_X_0208_SIZE) {
      throw new InvalidInputError('The embedded JIS X 0208 table is corrupt.');
    }
    const map = new Map<number, number>();
    let position = 0;
    for (const [first, last] of JIS_X_0208_RUNS) {
      for (let cell = first; cell <= last; cell++, position++) {
        const code = shiftJisOfCell(cell);
        if (AMBIGUOUS_SHIFT_JIS_CODES.has(code)) continue;
        map.set(JIS_X_0208_CHARACTERS.charCodeAt(position), code);
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

export type { KanjiMapper };
