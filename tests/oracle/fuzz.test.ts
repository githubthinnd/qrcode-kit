import { createRequire } from 'node:module';
import * as lean from 'lean-qr';
import { describe, expect, it } from 'vitest';
import { encodeTextSymbol } from '../../src/core/symbol.js';
import { UnsupportedDataError } from '../../src/index.js';
import { ERROR_CORRECTION_LEVELS } from '../../src/domain/model.js';
import { createRandom, decodingDecoders, rasterize } from './helpers.js';

const require = createRequire(import.meta.url);
const qrcodeLib = require('qrcode') as {
  create: (t: string, o: { errorCorrectionLevel: string }) => { version: number };
};

const alphabets: Record<string, string> = {
  digits: '0123456789',
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 $%*+-./:',
  ascii: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
  vietnamese: 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵđĐ abc ',
  cjk: '日本語中文한국어テキスト漢字ひらがな',
  mixed: 'abcXYZ0123 ,.é日本🚀',
};

const base = {
  minVersion: 1,
  maxVersion: 40,
  mask: undefined,
  boostEcc: false,
  charset: 'utf-8',
} as const;

function randomText(random: () => number, alphabet: string, length: number): string {
  const chars = Array.from(alphabet);
  let text = '';
  for (let i = 0; i < length; i++) text += chars[Math.floor(random() * chars.length)] ?? '';
  return text;
}

describe('seeded fuzzing: random text decodes back (quorum of independent decoders)', () => {
  const random = createRandom(20261104);
  const cases: { name: string; text: string; ecc: (typeof ERROR_CORRECTION_LEVELS)[number] }[] = [];
  for (let i = 0; i < 240; i++) {
    const name = Object.keys(alphabets)[i % Object.keys(alphabets).length] ?? 'ascii';
    const length = 1 + Math.floor(random() * (name === 'ascii' ? 300 : 160));
    cases.push({
      name,
      text: randomText(random, alphabets[name] ?? '', length),
      ecc: ERROR_CORRECTION_LEVELS[i % 4] ?? 'M',
    });
  }

  it('all random symbols are read back by at least two decoders including jsQR', () => {
    const failures: string[] = [];
    for (const [i, c] of cases.entries()) {
      const matrix = encodeTextSymbol(c.text, { ...base, ecc: c.ecc });
      const ok = decodingDecoders(rasterize(matrix, 5), c.text);
      if (!(ok.includes('jsqr') && ok.length >= 2)) {
        failures.push(
          `#${String(i)} ${c.name}/${c.ecc} v${String(matrix.version)} -> ${ok.join(',') || 'none'}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('segmentation is at least as compact as independent segmenters', () => {
  it('never needs a larger version than lean-qr or qrcode on random mixed content', () => {
    const random = createRandom(99);
    const parts = ['0123456789', 'ABCDEFGHIJ', 'abcdefghij', ' $%*+-./:', 'éèêë', '日本'];
    const worse: string[] = [];
    for (let i = 0; i < 150; i++) {
      let text = '';
      const runs = 1 + Math.floor(random() * 8);
      for (let r = 0; r < runs; r++) {
        const part = parts[Math.floor(random() * parts.length)] ?? '';
        text += randomText(random, part, 1 + Math.floor(random() * 40));
      }
      const ours = encodeTextSymbol(text, { ...base, ecc: 'M' }).version;
      const leanSize = lean.generate(text, {
        minCorrectionLevel: lean.correction.M,
        maxCorrectionLevel: lean.correction.M,
        modes: [lean.mode.numeric, lean.mode.alphaNumeric, lean.mode.ascii, lean.mode.utf8],
      }).size;
      const other = qrcodeLib.create(text, { errorCorrectionLevel: 'M' }).version;
      const best = Math.min((leanSize - 17) / 4, other);
      if (ours > best)
        worse.push(`${JSON.stringify(text)}: ours v${String(ours)} > best v${String(best)}`);
    }
    expect(worse).toEqual([]);
  });
});

describe('boundaries and invalid input', () => {
  it('reports UnsupportedDataError (not a crash) when data exceeds version 40', () => {
    expect(() => encodeTextSymbol('x'.repeat(3000), { ...base, ecc: 'L' })).toThrow(
      UnsupportedDataError,
    );
    expect(() => encodeTextSymbol('9'.repeat(7090), { ...base, ecc: 'L' })).toThrow(
      UnsupportedDataError,
    );
  });

  it('rejects unpaired surrogates', () => {
    expect(() => encodeTextSymbol('bad \ud800 text', { ...base, ecc: 'M' })).toThrow(/surrogate/);
  });

  it('rejects characters that ISO-8859-1 cannot represent', () => {
    expect(() => encodeTextSymbol('日本', { ...base, ecc: 'M', charset: 'iso-8859-1' })).toThrow(
      UnsupportedDataError,
    );
  });

  it('rejects inconsistent version ranges', () => {
    expect(() =>
      encodeTextSymbol('x', { ...base, ecc: 'M', minVersion: 5, maxVersion: 2 }),
    ).toThrow(/Version range/);
    expect(() => encodeTextSymbol('x', { ...base, ecc: 'M', minVersion: 0 })).toThrow(
      /Version range/,
    );
    expect(() => encodeTextSymbol('x', { ...base, ecc: 'M', maxVersion: 41 })).toThrow(
      /Version range/,
    );
  });

  it('honours a forced minimum version and boosts the error correction level on request', () => {
    const forced = encodeTextSymbol('hi', { ...base, ecc: 'L', minVersion: 7 });
    expect(forced.version).toBe(7);
    const boosted = encodeTextSymbol('hi', { ...base, ecc: 'L', boostEcc: true });
    expect(boosted.ecc).toBe('H');
    const plain = encodeTextSymbol('hi', { ...base, ecc: 'L' });
    expect(plain.ecc).toBe('L');
  });

  it('encodes the empty string as a valid (empty) symbol at the core level', () => {
    const matrix = encodeTextSymbol('', { ...base, ecc: 'M' });
    expect(matrix.version).toBe(1);
    expect(matrix.segments).toEqual([]);
  });

  it('is deterministic', () => {
    const a = encodeTextSymbol('determinism ✓', { ...base, ecc: 'Q' });
    const b = encodeTextSymbol('determinism ✓', { ...base, ecc: 'Q' });
    expect(a.toRows()).toEqual(b.toRows());
  });
});
