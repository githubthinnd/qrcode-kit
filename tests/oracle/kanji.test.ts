import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as lean from 'lean-qr';
import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_SHIFT_JIS_CODES,
  JIS_X_0208_RUNS,
  JIS_X_0208_SIZE,
  isJisX0208ShiftJis,
  shiftJisOfCell,
} from '../../src/core/jis-x-0208.js';
import { kanjiValue, type KanjiMapper } from '../../src/core/kanji.js';
import { encodeTextSymbol } from '../../src/core/symbol.js';
import { createJisX0208KanjiMapper } from '../../src/kanji.js';
import { JIS_X_0208_CHARACTERS } from '../../src/kanji-table/table.js';
import { createQRCodeKit } from '../../src/index.js';
import { createShiftJisKanjiMapper } from '../../src/providers/encoder/default/shift-jis-mapper.js';
import { decoders, rasterize, sameMatrix, type Raster } from './helpers.js';

/**
 * Ground truth: the Unicode Consortium's JIS X 0208 table, kept unmodified in the repository
 * (tests/fixtures/jis0208/JIS0208.TXT, see THIRD_PARTY_NOTICES.md).
 */
interface Entry {
  readonly shiftJis: number;
  readonly cell: number;
  readonly codePoint: number;
}
const reference: Entry[] = [];
for (const line of readFileSync(
  join(import.meta.dirname, '../fixtures/jis0208/JIS0208.TXT'),
  'utf8',
).split('\n')) {
  const m = /^0x([0-9A-F]{4})\t0x([0-9A-F]{4})\t0x([0-9A-F]{4})/i.exec(line);
  if (!m) continue;
  const jis = parseInt(m[2], 16);
  reference.push({
    shiftJis: parseInt(m[1], 16),
    cell: ((jis >> 8) - 0x21) * 94 + ((jis & 0xff) - 0x21),
    codePoint: parseInt(m[3], 16),
  });
}
const usable = reference.filter((e) => !AMBIGUOUS_SHIFT_JIS_CODES.has(e.shiftJis));

const mappers: [string, () => KanjiMapper][] = [
  ['embedded table (qrcode-toolkit/kanji)', createJisX0208KanjiMapper],
  ['platform TextDecoder (default)', createShiftJisKanjiMapper],
];

describe('the reference table itself', () => {
  it('has the 6 879 characters of JIS X 0208, each mapped once', () => {
    expect(reference).toHaveLength(6879);
    expect(new Set(reference.map((e) => e.codePoint)).size).toBe(6879);
    expect(new Set(reference.map((e) => e.shiftJis)).size).toBe(6879);
  });
});

describe('generated JIS X 0208 data equals the reference', () => {
  it('the layout covers exactly the reference cells', () => {
    const cells = new Set<number>();
    for (const [a, b] of JIS_X_0208_RUNS) for (let c = a; c <= b; c++) cells.add(c);
    expect(cells.size).toBe(JIS_X_0208_SIZE);
    expect(cells).toEqual(new Set(reference.map((e) => e.cell)));
  });

  it('the row/cell → Shift JIS arithmetic matches the reference for every character', () => {
    for (const e of reference) expect(shiftJisOfCell(e.cell)).toBe(e.shiftJis);
  });

  it('isJisX0208ShiftJis accepts exactly the reference codes inside the Kanji-mode ranges', () => {
    const codes = new Set(reference.map((e) => e.shiftJis));
    for (const [first, last] of [
      [0x8140, 0x9ffc],
      [0xe040, 0xebbf],
    ] as const) {
      for (let code = first; code <= last; code++) {
        if (kanjiValue(code) === undefined) continue;
        expect(isJisX0208ShiftJis(code), code.toString(16)).toBe(codes.has(code));
      }
    }
  });

  it('every JIS X 0208 code is a valid Kanji-mode code (so none needs a fallback)', () => {
    for (const e of reference)
      expect(kanjiValue(e.shiftJis), e.shiftJis.toString(16)).not.toBeUndefined();
  });

  it('the embedded character string equals the reference in layout order', () => {
    const byCell = new Map(reference.map((e) => [e.cell, e.codePoint]));
    let position = 0;
    for (const [a, b] of JIS_X_0208_RUNS) {
      for (let cell = a; cell <= b; cell++, position++) {
        expect(JIS_X_0208_CHARACTERS.charCodeAt(position)).toBe(byCell.get(cell));
      }
    }
    expect(position).toBe(6879);
  });
});

describe.each(mappers)('Kanji mapping: %s', (_name, create) => {
  const mapper = create();

  it('maps all 6 872 unambiguous JIS X 0208 characters to their Shift JIS code', () => {
    expect(usable).toHaveLength(6872);
    const wrong = usable.filter((e) => mapper.shiftJisCode(e.codePoint) !== e.shiftJis);
    expect(wrong.map((e) => e.codePoint.toString(16))).toEqual([]);
  });

  it('refuses the seven ambiguous characters under both their JIS and Windows-31J readings', () => {
    const windows = [0xff3c, 0xff5e, 0x2225, 0xff0d, 0xffe0, 0xffe1, 0xffe2];
    const jis = reference
      .filter((e) => AMBIGUOUS_SHIFT_JIS_CODES.has(e.shiftJis))
      .map((e) => e.codePoint);
    expect(jis).toHaveLength(7);
    for (const cp of [...windows, ...jis])
      expect(mapper.shiftJisCode(cp), cp.toString(16)).toBeUndefined();
  });

  it('accepts nothing outside JIS X 0208 (checked for every code point up to U+2FFFF)', () => {
    const allowed = new Set(usable.map((e) => e.codePoint));
    const leaked: number[] = [];
    for (let cp = 0; cp <= 0x2ffff; cp++) {
      if (!allowed.has(cp) && mapper.shiftJisCode(cp) !== undefined) leaked.push(cp);
    }
    expect(leaked.map((cp) => cp.toString(16))).toEqual([]);
  });

  it('excludes the Windows-31J extensions (NEC row 13 circled digits, roman numerals, …)', () => {
    for (const cp of [0x2460, 0x2461, 0x2160, 0x3231, 0x221a /* √ is JIS, kept below */]) {
      const inJis = reference.some((e) => e.codePoint === cp);
      expect(mapper.shiftJisCode(cp) !== undefined, cp.toString(16)).toBe(inJis);
    }
  });
});

describe('both mappers are identical (the platform decoder agrees with the embedded table)', () => {
  it('for every code point up to U+2FFFF', () => {
    const a = createJisX0208KanjiMapper();
    const b = createShiftJisKanjiMapper();
    for (let cp = 0; cp <= 0x2ffff; cp++) {
      if (a.shiftJisCode(cp) !== b.shiftJisCode(cp))
        throw new Error(`mappers differ at U+${cp.toString(16)}`);
    }
  });
});

describe('every JIS X 0208 character round-trips through Kanji mode', () => {
  const kanji = createJisX0208KanjiMapper();
  const options = {
    ecc: 'L',
    minVersion: 1,
    maxVersion: 40,
    mask: undefined,
    boostEcc: false,
    charset: 'utf-8',
    kanji,
  } as const;

  const toRows = (code: lean.Bitmap2D): boolean[][] =>
    Array.from({ length: code.size }, (_, y) =>
      Array.from({ length: code.size }, (_, x) => code.get(x, y)),
    );
  const toRaster = (code: lean.Bitmap2D, scale = 8, quiet = 4): Raster => {
    const width = (code.size + quiet * 2) * scale;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < code.size; y++)
      for (let x = 0; x < code.size; x++)
        if (code.get(x, y))
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const i = (((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx) * 4;
              data[i] = data[i + 1] = data[i + 2] = 0;
            }
    return { data, width };
  };

  it("single characters: jsQR reads all 6 872; lean-qr's independent Shift JIS table agrees bit for bit; ZXing's misses are ZXing's own", () => {
    const jsqrFailures: string[] = [];
    const zxingMismatches: string[] = [];
    const zxingMisses: number[] = [];
    const differsFromLean: number[] = [];
    for (const e of usable) {
      const text = String.fromCharCode(e.codePoint);
      const ours = encodeTextSymbol(text, options);
      if (ours.segments[0]?.mode !== 'kanji')
        jsqrFailures.push(`${e.codePoint.toString(16)}: not Kanji mode`);
      const raster = rasterize(ours, 8);
      if (decoders.jsqr(raster) !== text) jsqrFailures.push(`${e.codePoint.toString(16)}: jsqr`);

      const reference = lean.generate(text, {
        modes: [lean.mode.shift_jis],
        minVersion: ours.version,
        maxVersion: ours.version,
        minCorrectionLevel: lean.correction.L,
        maxCorrectionLevel: lean.correction.L,
        mask: ours.mask,
      });
      if (!sameMatrix(ours, toRows(reference))) differsFromLean.push(e.codePoint);

      const zx = decoders.zxing(raster);
      if (zx !== text) {
        if (zx !== null) zxingMismatches.push(`${e.codePoint.toString(16)} -> ${zx}`);
        // ZXing cannot read this character: it must not be able to read lean-qr's symbol either.
        else if (decoders.zxing(toRaster(reference)) !== text) zxingMisses.push(e.codePoint);
        else
          zxingMismatches.push(
            `${e.codePoint.toString(16)}: ZXing reads lean-qr's symbol but not ours`,
          );
      }
    }
    expect(jsqrFailures).toEqual([]);
    expect(zxingMismatches).toEqual([]);
    // Documented: ZXing cannot decode a few dozen JIS X 0208 characters in Kanji mode from any encoder.
    expect(zxingMisses.length).toBeGreaterThan(0);
    expect(zxingMisses.length).toBeLessThan(100);

    // lean-qr takes the Windows-31J encoder's choice for characters that exist twice there (JIS row 2
    // and the NEC row 13 duplicates); the standard's code is the JIS X 0208 one used here.
    const decoder = new TextDecoder('shift_jis', { fatal: true });
    const explained = differsFromLean.every((cp) => {
      const jisCode = usable.find((e) => e.codePoint === cp)?.shiftJis ?? 0;
      let duplicate = false;
      for (let code = 0x8740; code <= 0x879c; code++) {
        if ((code & 0xff) < 0x40 || (code & 0xff) === 0x7f) continue;
        try {
          if (decoder.decode(Uint8Array.of(code >> 8, code & 0xff)).codePointAt(0) === cp)
            duplicate = true;
        } catch {
          /* unmapped */
        }
      }
      return jisCode < 0x8740 && duplicate;
    });
    expect(explained).toBe(true);
    expect(differsFromLean.length).toBe(9);
  }, 120_000);

  it('long runs: multi-character Kanji symbols decode with jsQR', () => {
    const chars = usable.map((e) => String.fromCharCode(e.codePoint));
    const failures: string[] = [];
    for (let i = 0, n = 0; i < chars.length; i += 300, n++) {
      const text = chars.slice(i, i + 300).join('');
      const matrix = encodeTextSymbol(text, options);
      if (matrix.segments.length !== 1 || matrix.segments[0]?.mode !== 'kanji')
        failures.push(`${String(n)}: not one Kanji segment`);
      let decoded: string | null = null;
      for (const scale of [4, 6, 8]) {
        decoded = decoders.jsqr(rasterize(matrix, scale));
        if (decoded !== null) break;
      }
      if (decoded !== text) failures.push(`${String(n)}: jsqr`);
    }
    expect(failures).toEqual([]);
  }, 60_000);
});

describe('why the seven ambiguous characters are excluded', () => {
  /** Decoders disagree on what these Shift JIS codes mean, so a Kanji-mode round trip is not guaranteed. */
  it('independent decoders do not agree with each other on all of them', () => {
    const rows = reference.filter((e) => AMBIGUOUS_SHIFT_JIS_CODES.has(e.shiftJis));
    const decodedBy: Record<string, string[]> = { jsqr: [], zxing: [] };
    for (const e of rows) {
      const mapper: KanjiMapper = {
        shiftJisCode: (cp) => (cp === e.codePoint ? e.shiftJis : undefined),
      };
      const matrix = encodeTextSymbol(String.fromCodePoint(e.codePoint), {
        ecc: 'M',
        minVersion: 1,
        maxVersion: 40,
        mask: undefined,
        boostEcc: false,
        charset: 'utf-8',
        kanji: mapper,
      });
      const raster = rasterize(matrix, 8);
      for (const name of ['jsqr', 'zxing'] as const) {
        const out = decoders[name](raster);
        decodedBy[name].push(
          out === null ? 'none' : `U+${(out.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
        );
      }
    }
    // Recorded evidence: the two decoders map at least one of these codes to different characters,
    // or to a character that is not the JIS X 0208 one.
    const disagree = rows.some(
      (e, i) =>
        decodedBy['jsqr'][i] !== decodedBy['zxing'][i] ||
        decodedBy['jsqr'][i] !== `U+${e.codePoint.toString(16).toUpperCase()}`,
    );
    expect(disagree, JSON.stringify(decodedBy)).toBe(true);
  });

  it('those characters still round-trip because they fall back to byte mode', async () => {
    const text = '～＼∥－￠￡￢ and 〜‖−¢£¬';
    const kit = createQRCodeKit({ kanji: createJisX0208KanjiMapper() });
    const matrix = kit.encode({ data: text, kanji: true });
    expect(matrix.segments.some((s) => s.mode === 'kanji')).toBe(false);
    const raster = rasterize(matrix, 8);
    expect(decoders.jsqr(raster)).toBe(text);
    expect(decoders.zxing(raster)).toBe(text);
    const result = await kit.generate({ data: text, kanji: true, format: 'text' });
    expect(result.matrix.toRows()).toEqual(matrix.toRows());
  });
});

describe('kit integration', () => {
  it('a kit built with the embedded mapper encodes Japanese text in Kanji mode', () => {
    const kit = createQRCodeKit({ kanji: createJisX0208KanjiMapper() });
    expect(kit.encode({ data: '日本語のテキスト', kanji: true }).segments[0]?.mode).toBe('kanji');
  });

  it('a missing platform decoder is reported with a pointer to the embedded mapper', () => {
    const globals = globalThis as { TextDecoder?: unknown };
    const original = globals.TextDecoder;
    globals.TextDecoder = undefined;
    try {
      const kit = createQRCodeKit();
      expect(() => kit.encode({ data: '日本語', kanji: true })).toThrow(
        /qrcode-toolkit\/kanji|custom kanji mapper/,
      );
    } finally {
      globals.TextDecoder = original;
    }
  });
});
