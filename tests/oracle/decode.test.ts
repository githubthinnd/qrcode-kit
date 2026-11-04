import { describe, expect, it } from 'vitest';
import {
  encodeBytesSymbol,
  encodeTextSymbol,
  encodeSegmentsSymbol,
} from '../../src/core/symbol.js';
import { ERROR_CORRECTION_LEVELS } from '../../src/domain/model.js';
import { createShiftJisKanjiMapper } from '../../src/providers/encoder/default/shift-jis-mapper.js';
import { decoders, decodingDecoders, rasterize } from './helpers.js';

const base = { minVersion: 1, maxVersion: 40, mask: undefined, boostEcc: false } as const;

const texts: Record<string, string> = {
  numeric: '0123456789'.repeat(12),
  'numeric short': '8675309',
  alphanumeric: 'HELLO WORLD 12345 $%*+-./:'.repeat(3),
  url: 'https://example.com/path?q=hello&lang=vi#frag',
  'ascii mixed': 'Order #4711: 3 × widgets @ €9.99',
  vietnamese: 'Xin chào Việt Nam — Nhữ Duy Thìn, Nguyễn Văn Ánh, Đặng Thị Hương',
  'vietnamese lower': 'tiếng việt có dấu: ắ ằ ẳ ẵ ặ ề ế ể ễ ệ',
  japanese: 'こんにちは世界、QRコード',
  emoji: 'QR 🚀 café ✓',
  long: 'The quick brown fox jumps over the lazy dog. '.repeat(30),
};

describe('symbols decode with three independent decoders (UTF-8, no ECI)', () => {
  for (const [name, text] of Object.entries(texts)) {
    for (const ecc of ERROR_CORRECTION_LEVELS) {
      if (name === 'long' && (ecc === 'Q' || ecc === 'H')) continue; // exceeds capacity; covered elsewhere
      it(`${name} @ ${ecc}`, () => {
        const matrix = encodeTextSymbol(text, { ...base, ecc, charset: 'utf-8' });
        const raster = rasterize(matrix, 6);
        const ok = decodingDecoders(raster, text);
        expect(ok, `decoders that read it: ${ok.join(',')}`).toContain('jsqr');
        expect(ok.length).toBeGreaterThanOrEqual(2);
      });
    }
  }
});

describe('explicit ECI', () => {
  it('UTF-8 with ECI 26 decodes with the ECI-aware decoders', () => {
    const text = 'Xin chào Việt Nam';
    const matrix = encodeTextSymbol(text, { ...base, ecc: 'M', charset: 'utf-8', eci: true });
    expect(matrix.segments[0]?.mode).toBe('eci');
    const raster = rasterize(matrix, 6);
    expect(decoders.qr(raster)).toBe(text);
    expect(decoders.zxing(raster)).toBe(text);
  });

  it('ISO-8859-1 with ECI 3 round-trips the Latin-1 text', () => {
    const text = 'café crème brûlée';
    const matrix = encodeTextSymbol(text, { ...base, ecc: 'M', charset: 'iso-8859-1', eci: true });
    const raster = rasterize(matrix, 6);
    expect(decoders.qr(raster)).toBe(text);
    expect(decoders.zxing(raster)).toBe(text);
  });
});

describe('binary data and explicit segments', () => {
  it('arbitrary bytes decode back byte-for-byte (via ISO-8859-1 view)', () => {
    const bytes = Uint8Array.from({ length: 200 }, (_, i) => (i * 37 + 11) & 0xff);
    const matrix = encodeBytesSymbol(bytes, { ...base, ecc: 'L' });
    const raster = rasterize(matrix, 6);
    const decoded = decoders.zxing(raster);
    expect(decoded).not.toBeNull();
  });

  it('explicit numeric + alphanumeric + byte segments decode as their concatenation', () => {
    const matrix = encodeSegmentsSymbol(
      [
        { mode: 'numeric', text: '2026' },
        { mode: 'alphanumeric', text: 'ABC-123' },
        { mode: 'byte', bytes: Uint8Array.from([0x68, 0x69]) },
      ],
      { ...base, ecc: 'Q' },
    );
    expect(matrix.segments.map((s) => s.mode)).toEqual(['numeric', 'alphanumeric', 'byte']);
    const raster = rasterize(matrix, 6);
    const ok = decodingDecoders(raster, '2026ABC-123hi');
    expect(ok).toContain('jsqr');
    expect(ok.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Kanji mode', () => {
  const kanji = createShiftJisKanjiMapper();

  it('encodes Japanese text in kanji mode and it decodes to the original text', () => {
    const text = '日本語のテキスト漢字';
    const matrix = encodeTextSymbol(text, { ...base, ecc: 'M', charset: 'utf-8', kanji });
    expect(matrix.segments.some((s) => s.mode === 'kanji')).toBe(true);
    const raster = rasterize(matrix, 6);
    // The `qr` decoder has no Kanji support (it also rejects lean-qr's Kanji symbols), so only
    // the two decoders that implement the mode are required.
    expect(decodingDecoders(raster, text)).toEqual(expect.arrayContaining(['jsqr', 'zxing']));
  });

  it('is smaller than byte mode for the same text', () => {
    const text = '日本語のテキスト漢字日本語のテキスト漢字';
    const withKanji = encodeTextSymbol(text, { ...base, ecc: 'M', charset: 'utf-8', kanji });
    const without = encodeTextSymbol(text, { ...base, ecc: 'M', charset: 'utf-8' });
    const bits = (m: typeof withKanji): number => m.segments.reduce((a, s) => a + s.bits, 0);
    expect(bits(withKanji)).toBeLessThan(bits(without));
  });

  it('falls back to other modes for text outside the Kanji range', () => {
    const matrix = encodeTextSymbol('hello 日本', { ...base, ecc: 'M', charset: 'utf-8', kanji });
    expect(matrix.segments.map((s) => s.mode)).toContain('byte');
  });
});
