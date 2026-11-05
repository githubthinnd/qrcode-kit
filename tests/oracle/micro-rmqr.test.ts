/**
 * Micro QR Code (M1–M4) and rMQR, checked three ways:
 *  1. bit for bit against symbols made by other encoders (tests/fixtures/micro-rmqr),
 *  2. by reading what we generate with ZXing-C++, an independent decoder, for every version and level,
 *  3. against the capacities the standard lists.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createQRCodeKit, segment, type Segment } from '../../src/index.js';
import { createJisX0208KanjiMapper } from '../../src/kanji.js';
import { createRandom } from '../unit/oracle-random.js';
import { readCompactSymbol } from './zxing.js';

const kit = createQRCodeKit({ kanji: createJisX0208KanjiMapper() });

interface Vector {
  id: string;
  symbol: 'micro' | 'rmqr';
  designation: string;
  ecc: 'L' | 'M' | 'Q' | 'H';
  text: string;
  rows: string[];
}
const vectors = JSON.parse(
  readFileSync(new URL('../fixtures/micro-rmqr/vectors.json', import.meta.url), 'utf8'),
) as Vector[];

/** Symbols whose maker chose a different segmentation than ours would: spelled out here. */
const explicit: Partial<Record<string, Segment[]>> = {
  // all one byte segment, where our optimiser prefers numeric + byte
  'zxing-test:MQRCodeM4': [segment.byte(Uint8Array.from(Buffer.from('123456abcdefgh', 'latin1')))],
  // ECI 20 (Shift JIS), then alphanumeric, Kanji, numeric, alphanumeric
  'zxing-test:RMQRCodeR13x27M_ECI': [
    segment.eci(20),
    segment.alphanumeric('AB'),
    segment.kanji('貫'),
    segment.numeric('12345'),
    segment.alphanumeric('AB'),
  ],
};
/** The GS1 symbol carries FNC1 and a payload this fixture only stores in decoded form. */
/** Hiragana, Katakana and CJK ideographs: text that needs Kanji mode. */
const hasJapanese = (text: string): boolean =>
  Array.from(text).some((char) => (char.codePointAt(0) ?? 0) >= 0x3000);

const decodeOnly = new Set(['zxing-test:RMQRCodeR15x59H_GS1']);

describe('symbols made by other encoders are reproduced bit for bit', () => {
  const rowsOf = (v: Vector): boolean[][] => v.rows.map((row) => Array.from(row, (c) => c === 'X'));

  it.each(vectors.filter((v) => !decodeOnly.has(v.id)).map((v) => [v.id, v] as const))(
    '%s',
    (_id, v) => {
      const matrix = kit.encode({
        data: explicit[v.id] ?? v.text,
        symbol: v.symbol,
        ecc: v.ecc,
        version: v.designation,
        ...(hasJapanese(v.text) && explicit[v.id] === undefined ? { kanji: true } : {}),
      });
      expect(matrix.designation).toBe(v.designation);
      expect(matrix.symbol).toBe(v.symbol);
      expect(matrix.width).toBe(v.rows[0]?.length);
      expect(matrix.height).toBe(v.rows.length);
      const want = rowsOf(v);
      const got = matrix.toRows();
      const wrong: string[] = [];
      for (let y = 0; y < want.length; y++) {
        for (let x = 0; x < (want[0]?.length ?? 0); x++) {
          if (want[y]?.[x] !== got[y]?.[x]) wrong.push(`${String(x)},${String(y)}`);
        }
      }
      expect(wrong, `differing modules of ${v.id}`).toEqual([]);
    },
  );
});

const pngOf = async (request: Parameters<typeof kit.generate>[0]): Promise<Uint8Array> =>
  (await kit.generate({ ...request, format: 'png', scale: 5 } as never))
    .value as unknown as Uint8Array;

describe('ZXing reads every Micro QR version and level at full capacity', () => {
  const combos: [number, 'L' | 'M' | 'Q'][] = [
    [1, 'L'],
    [2, 'L'],
    [2, 'M'],
    [3, 'L'],
    [3, 'M'],
    [4, 'L'],
    [4, 'M'],
    [4, 'Q'],
  ];
  it.each(combos)('M%i-%s', async (version, ecc) => {
    // grow the numeric payload until the exact version stops fitting
    let digits = '1';
    for (;;) {
      const next = `${digits}${String((digits.length * 7) % 10)}`;
      try {
        kit.encode({ data: next, symbol: 'micro', ecc, version });
      } catch {
        break;
      }
      digits = next;
    }
    const matrix = kit.encode({ data: digits, symbol: 'micro', ecc, version });
    expect(matrix.designation).toBe(`M${String(version)}`);
    const read = await readCompactSymbol(
      await pngOf({ data: digits, symbol: 'micro', ecc, version }),
    );
    expect(read?.format).toBe('MicroQRCode');
    expect(read?.mask).toBe(matrix.mask);
    expect(read?.text).toBe(digits);
    expect(read?.version).toBe(`M${String(version)}`);
    expect(read?.ecLevel).toBe(ecc);
  });
});

describe('ZXing reads every rMQR version and level at full capacity', () => {
  const all = Array.from({ length: 32 }, (_, i) => i + 1).flatMap((v) => [
    [v, 'M'] as const,
    [v, 'H'] as const,
  ]);
  it.each(all)('version %i, level %s', async (version, ecc) => {
    let digits = '1';
    for (;;) {
      const next = `${digits}${String((digits.length * 7) % 10)}`;
      try {
        kit.encode({ data: next, symbol: 'rmqr', ecc, version });
      } catch {
        break;
      }
      digits = next;
    }
    const matrix = kit.encode({ data: digits, symbol: 'rmqr', ecc, version });
    const read = await readCompactSymbol(
      await pngOf({ data: digits, symbol: 'rmqr', ecc, version }),
    );
    expect(read?.format).toBe('RMQRCode');
    expect(read?.mask).toBe(matrix.mask);
    expect(read?.text).toBe(digits);
    expect(read?.version).toBe(matrix.designation);
    expect(read?.ecLevel).toBe(ecc);
  });

  it.each([1, 7, 16, 22, 28, 32])(
    'version %i holds random bytes at both levels',
    async (version) => {
      const random = createRandom(version * 977);
      for (const ecc of ['M', 'H'] as const) {
        let length = 1;
        const bytesOf = (n: number): Uint8Array =>
          Uint8Array.from({ length: n }, () => Math.floor(random() * 256));
        let bytes = bytesOf(1);
        for (;;) {
          const next = bytesOf(length + 1);
          try {
            kit.encode({ data: next, symbol: 'rmqr', ecc, version });
          } catch {
            break;
          }
          bytes = next;
          length++;
        }
        const read = await readCompactSymbol(
          await pngOf({ data: bytes, symbol: 'rmqr', ecc, version }),
        );
        expect(Array.from(read?.bytes ?? [])).toEqual(Array.from(bytes));
      }
    },
  );
});

describe('ZXing reads automatically chosen symbols of mixed text', () => {
  const random = createRandom(20261105);
  const pools = [
    '0123456789',
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:',
    'abcdefghijklmnopqrstuvwxyz0123456789 ,;!?',
  ];
  it.each(Array.from({ length: 120 }, (_, i) => i))('random case %i', async () => {
    const symbol = random() < 0.5 ? 'micro' : 'rmqr';
    const pool = pools[Math.floor(random() * pools.length)] ?? '';
    const mixed = random() < 0.4;
    const length = 1 + Math.floor(random() * (symbol === 'micro' ? 10 : 60));
    let text = '';
    for (let i = 0; i < length; i++) {
      const source = mixed ? (pools[Math.floor(random() * pools.length)] ?? pool) : pool;
      text += source[Math.floor(random() * source.length)] ?? '0';
    }
    const ecc =
      symbol === 'micro'
        ? (['L', 'M', 'Q'] as const)[Math.floor(random() * 3)]
        : (['M', 'H'] as const)[Math.floor(random() * 2)];
    let request;
    try {
      request = { data: text, symbol, ecc } as const;
      kit.encode(request);
    } catch {
      return; // too much for this symbol family: refusing is the right answer
    }
    const read = await readCompactSymbol(await pngOf(request));
    expect(read?.text).toBe(text);
    expect(read?.mask).toBe(kit.encode(request).mask);
  });
});

describe('Kanji, ECI and FNC1', () => {
  it.each([
    ['micro', 'M3', '日本'],
    ['micro', 'M4', '日本語の'],
    ['rmqr', 'R11x27', '日本語'],
    ['rmqr', 'R9x59', '漢字モードで圧縮'],
  ] as const)('%s %s writes Kanji mode and ZXing reads it back', async (symbol, version, text) => {
    const request = {
      data: text,
      symbol,
      version,
      kanji: true,
      ecc: symbol === 'micro' ? 'L' : 'M',
    } as const;
    const matrix = kit.encode(request);
    expect(matrix.segments.map((s) => s.mode)).toEqual(['kanji']);
    const read = await readCompactSymbol(await pngOf(request));
    expect(read?.text).toBe(text);
  });

  it('rMQR declares UTF-8 with ECI 26 and ZXing decodes the text', async () => {
    const request = { data: 'Xin chào Việt Nam', symbol: 'rmqr', eci: true, ecc: 'M' } as const;
    expect(kit.encode(request).segments[0]?.mode).toBe('eci');
    const read = await readCompactSymbol(await pngOf(request));
    expect(read?.text).toBe('Xin chào Việt Nam');
  });

  it('rMQR carries FNC1 in first and second position', async () => {
    const first = await readCompactSymbol(
      await pngOf({ data: '0109524000059109', symbol: 'rmqr', fnc1: 'first', ecc: 'M' }),
    );
    expect(first?.identifier).toBe(']Q3');
    const second = await readCompactSymbol(
      await pngOf({ data: 'AB12', symbol: 'rmqr', fnc1: { applicationIndicator: '37' }, ecc: 'M' }),
    );
    expect(second?.identifier).toBe(']Q5');
  });

  it('reads back as the same GS1 content as the reference symbol', async () => {
    const reference = vectors.find((v) => v.id === 'zxing-test:RMQRCodeR15x59H_GS1');
    expect(reference?.text).toBe('(01)09524000059109(21)12345678p901(10)1234567p(17)231120');
    // the same element string, with <GS> after the variable-length fields, in a symbol of our own
    const request = {
      data: '01095240000591092112345678p901\x1d101234567p\x1d17231120',
      symbol: 'rmqr',
      fnc1: 'first',
      ecc: 'M',
      version: 'R15x59',
    } as const;
    const read = await readCompactSymbol(await pngOf(request));
    expect(read?.identifier).toBe(']Q3');
    expect(read?.text).toBe(reference?.text);
  });
});

describe('capacities match the standard', () => {
  /** [version, level, numeric, alphanumeric, byte, kanji]; 0 where the mode does not exist. */
  const table: [number, 'L' | 'M' | 'Q', number, number, number, number][] = [
    [1, 'L', 5, 0, 0, 0],
    [2, 'L', 10, 6, 0, 0],
    [2, 'M', 8, 5, 0, 0],
    [3, 'L', 23, 14, 9, 6],
    [3, 'M', 18, 11, 7, 4],
    [4, 'L', 35, 21, 15, 9],
    [4, 'M', 30, 18, 13, 8],
    [4, 'Q', 21, 13, 9, 5],
  ];
  const fits = (data: Segment[], version: number, ecc: 'L' | 'M' | 'Q'): boolean => {
    try {
      kit.encode({ data, symbol: 'micro', version, ecc });
      return true;
    } catch {
      return false;
    }
  };
  it.each(table)('M%i-%s', (version, ecc, numeric, alnum, bytes, kanji) => {
    const run = (make: (n: number) => Segment, capacity: number): void => {
      if (capacity === 0) {
        expect(fits([make(1)], version, ecc)).toBe(false);
        return;
      }
      expect(fits([make(capacity)], version, ecc), `capacity ${String(capacity)}`).toBe(true);
      expect(fits([make(capacity + 1)], version, ecc), `capacity + 1`).toBe(false);
    };
    run((n) => segment.numeric('7'.repeat(n)), numeric);
    run((n) => segment.alphanumeric('A'.repeat(n)), alnum);
    run((n) => segment.byte(new Uint8Array(n).fill(0x61)), bytes);
    run((n) => segment.kanji('日'.repeat(n)), kanji);
  });
});
