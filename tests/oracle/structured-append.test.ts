import { describe, expect, it } from 'vitest';
import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  ResultMetadataType,
  RGBLuminanceSource,
} from '@zxing/library';
import {
  encodeBytesSymbol,
  encodeStructuredAppendSequence,
  encodeTextSymbol,
  planStructuredAppend,
} from '../../src/core/symbol.js';
import { planDataCodewords } from '../../src/core/encoder.js';
import { InvalidInputError } from '../../src/index.js';
import { rasterize, type Raster } from './helpers.js';

const base = { minVersion: 1, maxVersion: 40, mask: undefined, boostEcc: false } as const;

function zxing(raster: Raster) {
  const { data, width } = raster;
  const luminance = new Uint8ClampedArray(width * width);
  for (let i = 0; i < luminance.length; i++) luminance[i] = data[i * 4] ?? 0;
  const result = new QRCodeReader().decode(
    new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, width))),
  );
  const meta = result.getResultMetadata();
  return {
    text: result.getText(),
    sequence: meta.get(ResultMetadataType.STRUCTURED_APPEND_SEQUENCE) as number | undefined,
    parity: meta.get(ResultMetadataType.STRUCTURED_APPEND_PARITY) as number | undefined,
  };
}

describe('structured append', () => {
  const text =
    'Structured append splits one message across several linked QR Code symbols. '.repeat(3);

  it('produces linked symbols whose parts reassemble to the original message', () => {
    const symbols = encodeStructuredAppendSequence(text, {
      ...base,
      ecc: 'M',
      charset: 'utf-8',
      symbols: 3,
    });
    expect(symbols).toHaveLength(3);
    const decoded = symbols.map((m) => zxing(rasterize(m, 8)));
    expect(decoded.map((d) => d.text).join('')).toBe(text);
    const parity = symbols[0]?.structuredAppend?.parity;
    decoded.forEach((d, index) => {
      expect(d.sequence).toBe((index << 4) | 2); // index in high nibble, total-1 in low nibble
      expect(d.parity).toBe(parity);
    });
  });

  it('parity is the XOR of every data byte of the whole message', () => {
    const expected = [...new TextEncoder().encode(text)].reduce((a, b) => a ^ b, 0);
    const plan = planStructuredAppend(text, 3, 'utf-8');
    expect(plan.parity).toBe(expected);
    expect(plan.parts.join('')).toBe(text);
  });

  it('never splits a multi-byte character and keeps Vietnamese text intact', () => {
    const viet = 'Tiếng Việt có dấu: ắằẳẵặ ềếểễệ ọộớợ ưừứử. '.repeat(4);
    const symbols = encodeStructuredAppendSequence(viet, {
      ...base,
      ecc: 'Q',
      charset: 'utf-8',
      symbols: 4,
    });
    expect(symbols.map((m) => zxing(rasterize(m, 8)).text).join('')).toBe(viet);
  });

  it('splits binary data into byte-aligned parts', () => {
    const bytes = Uint8Array.from({ length: 90 }, (_, i) => i);
    const plan = planStructuredAppend(bytes, 3, 'utf-8');
    expect(plan.parts.every((p) => p instanceof Uint8Array)).toBe(true);
    const joined = plan.parts.flatMap((p) => (typeof p === 'string' ? [] : [...p]));
    expect(joined).toEqual([...bytes]);
  });

  it('chooses the smallest symbol count that fits when none is given', () => {
    const long = 'x'.repeat(2500);
    const symbols = encodeStructuredAppendSequence(long, {
      ...base,
      ecc: 'H',
      maxVersion: 20,
      charset: 'utf-8',
    });
    expect(symbols.length).toBeGreaterThanOrEqual(2);
    expect(symbols.length).toBeLessThanOrEqual(16);
    expect(symbols.every((m) => m.version <= 20)).toBe(true);
    expect(symbols.every((m) => m.structuredAppend?.total === symbols.length)).toBe(true);
    expect(symbols.map((m) => m.structuredAppend?.index)).toEqual(symbols.map((_, i) => i));
  });

  it('validates the number of symbols and the amount of data', () => {
    expect(() =>
      encodeStructuredAppendSequence('abc', { ...base, ecc: 'M', charset: 'utf-8', symbols: 1 }),
    ).toThrow(InvalidInputError);
    expect(() =>
      encodeStructuredAppendSequence('abc', { ...base, ecc: 'M', charset: 'utf-8', symbols: 17 }),
    ).toThrow(InvalidInputError);
    expect(() =>
      encodeStructuredAppendSequence('ab', { ...base, ecc: 'M', charset: 'utf-8', symbols: 3 }),
    ).toThrow(/less data/);
  });
});

describe('FNC1 and ECI markers', () => {
  it('FNC1 first position changes the symbol and decodes (GS1-style data)', () => {
    const data = '0112345678901231';
    const plain = encodeTextSymbol(data, { ...base, ecc: 'M', charset: 'utf-8' });
    const gs1 = encodeTextSymbol(data, {
      ...base,
      ecc: 'M',
      charset: 'utf-8',
      fnc1: { position: 'first' },
    });
    expect(gs1.segments[0]?.mode).toBe('fnc1-first');
    expect(gs1.toRows()).not.toEqual(plain.toRows());
    expect(zxing(rasterize(gs1, 8)).text).toBe(data);
  });

  it('FNC1 second position carries the application indicator', () => {
    const matrix = encodeTextSymbol('A1B2C3', {
      ...base,
      ecc: 'M',
      charset: 'utf-8',
      fnc1: { position: 'second', applicationIndicator: 65 },
    });
    expect(matrix.segments[0]).toMatchObject({ mode: 'fnc1-second', bits: 12 });
  });

  it('FNC1 second position bit layout: 1001 + 8-bit indicator, then the data (ISO 18004 §7.4.8)', () => {
    // No independent decoder implements the application indicator (ZXing skips its 8 bits and
    // misparses the rest), so the data bit stream is checked against the standard's layout.
    const plan = planDataCodewords(
      {
        lead: [{ mode: 'fnc1-second', applicationIndicator: 65 }],
        body: () => [{ mode: 'alphanumeric', text: 'AB' }],
      },
      { ...base, ecc: 'M' },
    );
    const bits = [...plan.dataCodewords].map((b) => b.toString(2).padStart(8, '0')).join('');
    // 1001 | 01000001 | 0010 | 000000010 (count 2, 9 bits) | 00111010110 (10*45+11 = 461) | 0000 terminator
    expect(
      bits.startsWith('1001' + '01000001' + '0010' + '000000010' + '00111001101' + '0000'),
    ).toBe(true);
  });

  it('rejects an out-of-range application indicator and ECI assignment', () => {
    expect(() =>
      encodeTextSymbol('A', {
        ...base,
        ecc: 'M',
        charset: 'utf-8',
        fnc1: { position: 'second', applicationIndicator: 256 },
      }),
    ).toThrow(InvalidInputError);
    expect(() =>
      encodeBytesSymbol(new Uint8Array(1), { ...base, ecc: 'M', eci: 1_000_000 }),
    ).toThrow(InvalidInputError);
  });

  it('writes ECI assignments of every width (1, 2 and 3 byte forms)', () => {
    for (const [assignment, bits] of [
      [26, 12],
      [200, 20],
      [20000, 28],
    ] as const) {
      const m = encodeBytesSymbol(Uint8Array.of(0x41), { ...base, ecc: 'L', eci: assignment });
      expect(m.segments[0]).toMatchObject({ mode: 'eci', bits });
    }
  });
});
