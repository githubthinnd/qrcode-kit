import { describe, expect, it } from 'vitest';
import { createQRCodeKit } from '../../src/index.js';
import { decodingDecoders, rasterize } from '../oracle/helpers.js';
import { createRandom } from '../unit/oracle-random.js';

const kit = createQRCodeKit();
const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return `${(error as { code: string }).code}: ${(error as Error).message}`;
  }
  return 'no error';
};

describe('the maskScoring option', () => {
  it('is "standard" unless asked otherwise, and "fast" is accepted', () => {
    const base = kit.encode({ data: 'https://example.com' });
    expect(kit.encode({ data: 'https://example.com', maskScoring: 'standard' }).toRows()).toEqual(
      base.toRows(),
    );
    expect(kit.encode({ data: 'https://example.com', maskScoring: 'fast' }).symbol).toBe('qr');
  });

  it('is validated', () => {
    expect(message(() => kit.encode({ data: 'x', maskScoring: 'quick' as never }))).toMatch(
      /INVALID_INPUT.*"standard" or "fast"/,
    );
    expect(message(() => kit.encode({ data: 'x', symbol: 'micro', maskScoring: 'fast' }))).toMatch(
      /INVALID_INPUT.*applies to QR Code symbols/,
    );
    expect(message(() => kit.encode({ data: 'x', symbol: 'rmqr', maskScoring: 'fast' }))).toMatch(
      /INVALID_INPUT/,
    );
    expect(message(() => kit.encode({ data: 'x', mask: 3, maskScoring: 'fast' }))).toMatch(
      /no effect when a mask is chosen/,
    );
    // naming the default is harmless wherever it applies, but is still rejected where it cannot apply
    expect(message(() => kit.encode({ data: 'x', mask: 3, maskScoring: 'standard' }))).toMatch(
      /no effect/,
    );
  });

  it('works for structured append', async () => {
    const parts = await kit.generateStructuredAppend({
      data: 'x'.repeat(200),
      symbols: 2,
      maskScoring: 'fast',
    });
    expect(parts).toHaveLength(2);
  });

  it('is deterministic', () => {
    const request = { data: 'Deterministic mask choice', ecc: 'Q', maskScoring: 'fast' } as const;
    expect(kit.encode(request).toRows()).toEqual(kit.encode(request).toRows());
  });
});

describe('fast scoring chooses valid masks, nearly always the standard one', () => {
  const random = createRandom(31337);
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -./:?=&_';
  const cases = Array.from({ length: 150 }, () => {
    const length = 1 + Math.floor(random() * (random() < 0.2 ? 900 : 120));
    let data = '';
    for (let i = 0; i < length; i++) data += pool[Math.floor(random() * pool.length)];
    return { data, ecc: (['L', 'M', 'Q', 'H'] as const)[Math.floor(random() * 4)] };
  });

  it('agrees with the standard choice on at least 96% of random inputs', () => {
    let same = 0;
    for (const { data, ecc } of cases) {
      const standard = kit.encode({ data, ecc });
      const fast = kit.encode({ data, ecc, maskScoring: 'fast' });
      expect(fast.version).toBe(standard.version);
      if (fast.mask === standard.mask) same++;
    }
    expect(same / cases.length).toBeGreaterThanOrEqual(0.96);
  });

  it('produces symbols that decode, whichever mask it picked', () => {
    for (const { data, ecc } of cases.slice(0, 60)) {
      const matrix = kit.encode({ data, ecc, maskScoring: 'fast' });
      expect(decodingDecoders(rasterize(matrix, 6), data)).toContain('jsqr');
    }
  });
});
