/** Micro QR Code and rMQR through the public API: options, sizes, renderers. */
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { createBrowserKit, type CanvasLike } from '../../src/browser.js';
import { createQRCodeKit } from '../../src/index.js';

const kit = createQRCodeKit();
const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return `${(error as { code: string }).code}: ${(error as Error).message}`;
  }
  return 'no error';
};

describe('choosing the symbol', () => {
  it('QR Code stays the default', () => {
    const m = kit.encode({ data: 'x' });
    expect(m.symbol).toBe('qr');
    expect(m.designation).toBe('1');
    expect([m.width, m.height, m.size]).toEqual([21, 21, 21]);
  });

  it('describes Micro QR and rMQR symbols', () => {
    const micro = kit.encode({ data: '123', symbol: 'micro' });
    expect([micro.symbol, micro.designation, micro.width, micro.height]).toEqual([
      'micro',
      'M1',
      11,
      11,
    ]);
    const rmqr = kit.encode({ data: '123', symbol: 'rmqr' });
    expect(rmqr.symbol).toBe('rmqr');
    expect(rmqr.designation).toBe('R11x27');
    expect([rmqr.width, rmqr.height, rmqr.size]).toEqual([27, 11, 27]);
    expect(rmqr.mask).toBe(4);
  });

  it('rejects an unknown symbol', () => {
    expect(message(() => kit.encode({ data: 'x', symbol: 'aztec' as never }))).toMatch(
      /INVALID_INPUT.*"qr", "micro" or "rmqr"/,
    );
  });

  it('uses level L for Micro QR and M for QR Code and rMQR unless told otherwise', () => {
    expect(kit.encode({ data: '1', symbol: 'micro' }).ecc).toBe('L');
    expect(kit.encode({ data: '1', symbol: 'rmqr' }).ecc).toBe('M');
    expect(kit.encode({ data: '1' }).ecc).toBe('M');
  });

  it('never picks M1 for a level above L, which M1 cannot give', () => {
    expect(kit.encode({ data: '1', symbol: 'micro', ecc: 'M' }).designation).toBe('M2');
    expect(kit.encode({ data: '1', symbol: 'micro', ecc: 'Q' }).designation).toBe('M4');
  });
});

describe('levels', () => {
  it('Micro QR has L, M and Q', () => {
    expect(message(() => kit.encode({ data: '1', symbol: 'micro', ecc: 'H' }))).toMatch(
      /INVALID_INPUT.*"L", "M", "Q" for Micro QR Code/,
    );
  });
  it('rMQR has M and H', () => {
    for (const ecc of ['L', 'Q'] as const) {
      expect(message(() => kit.encode({ data: '1', symbol: 'rmqr', ecc }))).toMatch(
        /INVALID_INPUT.*"M", "H" for rMQR/,
      );
    }
    expect(kit.encode({ data: '1', symbol: 'rmqr', ecc: 'H' }).ecc).toBe('H');
  });
  it('boostEcc raises the level while the data still fits', () => {
    expect(kit.encode({ data: '12', symbol: 'micro', version: 4, boostEcc: true }).ecc).toBe('Q');
    expect(kit.encode({ data: '1', symbol: 'rmqr', version: 1, boostEcc: true }).ecc).toBe('H');
    expect(kit.encode({ data: '1', symbol: 'micro', version: 4 }).ecc).toBe('L');
  });
});

describe('versions', () => {
  it('accepts numbers and names, in any case', () => {
    expect(kit.encode({ data: '1', symbol: 'micro', version: 3 }).designation).toBe('M3');
    expect(kit.encode({ data: '1', symbol: 'micro', version: 'M3' }).designation).toBe('M3');
    expect(kit.encode({ data: '1', symbol: 'micro', version: 'm4' }).designation).toBe('M4');
    expect(kit.encode({ data: '1', symbol: 'rmqr', version: 'R9x59' }).designation).toBe('R9x59');
    expect(kit.encode({ data: '1', symbol: 'rmqr', version: 'r9X59' }).designation).toBe('R9x59');
    expect(kit.encode({ data: '1', symbol: 'rmqr', version: 32 }).designation).toBe('R17x139');
  });

  it('accepts ranges of numbers and names', () => {
    expect(kit.encode({ data: '1', symbol: 'micro', version: { min: 'M3' } }).designation).toBe(
      'M3',
    );
    expect(
      kit.encode({ data: '1', symbol: 'micro', ecc: 'M', version: { max: 3 } }).designation,
    ).toBe('M2');
    expect(
      kit.encode({ data: '1', symbol: 'rmqr', version: { min: 'R13x27', max: 'R17x139' } })
        .designation,
    ).toBe('R13x27');
  });

  it('chooses the rMQR with the smallest area', () => {
    // R11x27 (297 modules) is smaller than R7x43 (301)
    expect(kit.encode({ data: '1', symbol: 'rmqr' }).designation).toBe('R11x27');
    const areas = ['A', 'AB', 'ABCDEFG', 'ABCDEFGHIJKLMNOPQR'].map((data) => {
      const m = kit.encode({ data, symbol: 'rmqr' });
      return m.width * m.height;
    });
    expect(areas).toEqual([...areas].sort((a, b) => a - b));
  });

  it('explains bad versions', () => {
    expect(message(() => kit.encode({ data: '1', symbol: 'micro', version: 5 }))).toMatch(
      /INVALID_INPUT.*1 to 4/,
    );
    expect(message(() => kit.encode({ data: '1', symbol: 'micro', version: 'M5' }))).toMatch(
      /"M1", "M2", "M3", "M4"/,
    );
    expect(message(() => kit.encode({ data: '1', symbol: 'rmqr', version: 'R8x43' }))).toMatch(
      /R9x59/,
    );
    expect(message(() => kit.encode({ data: '1', symbol: 'rmqr', version: 33 }))).toMatch(
      /INVALID_INPUT/,
    );
    expect(message(() => kit.encode({ data: '1', version: 'M2' }))).toMatch(
      /need symbol "micro" or "rmqr"/,
    );
    expect(
      message(() => kit.encode({ data: '1', symbol: 'micro', version: { min: 3, max: 2 } })),
    ).toMatch(/min must not exceed max/);
  });

  it('says so when the data does not fit', () => {
    expect(message(() => kit.encode({ data: '1'.repeat(40), symbol: 'micro' }))).toMatch(
      /UNSUPPORTED_DATA.*does not fit/,
    );
    expect(message(() => kit.encode({ data: 'x'.repeat(500), symbol: 'rmqr' }))).toMatch(
      /UNSUPPORTED_DATA/,
    );
    expect(message(() => kit.encode({ data: 'hello', symbol: 'micro', version: 1 }))).toMatch(
      /UNSUPPORTED_DATA/,
    );
  });
});

describe('masks', () => {
  it('Micro QR takes 0 to 3 and uses the one you give', () => {
    for (const mask of [0, 1, 2, 3] as const) {
      expect(kit.encode({ data: '1234', symbol: 'micro', mask }).mask).toBe(mask);
    }
    expect(message(() => kit.encode({ data: '1', symbol: 'micro', mask: 4 }))).toMatch(
      /0 to 3 for Micro QR/,
    );
  });
  it('rMQR has one mask', () => {
    expect(kit.encode({ data: '1', symbol: 'rmqr', mask: 'auto' }).mask).toBe(4);
    expect(message(() => kit.encode({ data: '1', symbol: 'rmqr', mask: 3 }))).toMatch(
      /single mask/,
    );
  });
});

describe('ECI, FNC1, Kanji and structured append', () => {
  it('Micro QR refuses ECI and FNC1', () => {
    expect(
      message(() => kit.encode({ data: 'é', symbol: 'micro', eci: true, version: 4 })),
    ).toMatch(/cannot carry ECI or FNC1/);
    expect(message(() => kit.encode({ data: '12', symbol: 'micro', fnc1: 'first' }))).toMatch(
      /cannot carry ECI or FNC1/,
    );
  });
  it('rMQR carries them', () => {
    expect(kit.encode({ data: 'é', symbol: 'rmqr', eci: true }).segments[0]?.mode).toBe('eci');
    expect(kit.encode({ data: '12', symbol: 'rmqr', fnc1: 'first' }).segments[0]?.mode).toBe(
      'fnc1-first',
    );
  });
  it('Kanji works in M3, M4 and rMQR but not in M1 or M2', () => {
    expect(
      message(() => kit.encode({ data: '日', symbol: 'micro', version: 2, kanji: true })),
    ).toMatch(/UNSUPPORTED_DATA/);
    expect(
      kit.encode({ data: '日', symbol: 'micro', kanji: true, ecc: 'L' }).segments[0]?.mode,
    ).toBe('kanji');
  });
  it('structured append is QR Code only', async () => {
    await expect(
      kit.generateStructuredAppend({ data: 'x'.repeat(100), symbol: 'micro' } as never),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' });
  });
  it('a logo is QR Code only', () => {
    const href = 'data:image/png;base64,iVBORw0KGgo=';
    expect(message(() => kit.generateSync({ data: '1', symbol: 'micro', logo: { href } }))).toMatch(
      /INVALID_CONFIGURATION.*only available for QR Code/,
    );
    expect(message(() => kit.generateSync({ data: '1', symbol: 'rmqr', logo: { href } }))).toMatch(
      /INVALID_CONFIGURATION/,
    );
  });
});

describe('quiet zone', () => {
  it('defaults to 2 modules for Micro QR and rMQR, 4 for QR Code', () => {
    expect(kit.generateSync({ data: '1', symbol: 'micro' }).value).toContain('viewBox="0 0 15 15"'); // 11 + 2 × 2
    expect(kit.generateSync({ data: '1', symbol: 'rmqr' }).value).toContain('viewBox="0 0 31 15"'); // 27×11 + 2 × 2
    expect(kit.generateSync({ data: '1' }).value).toContain('viewBox="0 0 29 29"');
  });
  it('warns below the 2 modules these standards ask for', () => {
    const codes = (request: Parameters<typeof kit.generateSync>[0]): string[] =>
      kit.generateSync(request).warnings.map((w) => w.code);
    expect(codes({ data: '1', symbol: 'micro', quietZone: 1 })).toContain('QUIET_ZONE_SMALL');
    expect(codes({ data: '1', symbol: 'rmqr', quietZone: 2 })).not.toContain('QUIET_ZONE_SMALL');
    expect(codes({ data: '1', quietZone: 2 })).toContain('QUIET_ZONE_SMALL');
    const message = kit.generateSync({ data: '1', symbol: 'micro', quietZone: 1 }).warnings[0]
      ?.message;
    expect(message).toContain('below the 2 modules');
  });
});

describe('rectangular output', () => {
  const rmqr = { data: 'rectangle', symbol: 'rmqr', version: 'R9x59' } as const;

  it('SVG keeps the aspect ratio for scale and size', () => {
    const scaled = kit.generateSync({ ...rmqr, scale: 4 }).value;
    expect(scaled).toContain('viewBox="0 0 63 13"');
    expect(scaled).toContain('width="252" height="52"');
    const sized = kit.generateSync({ ...rmqr, size: 630 }).value;
    expect(sized).toContain('width="630" height="130"');
    const root = kit.generateSync(rmqr).value;
    expect(root.slice(0, root.indexOf('>'))).not.toContain(' width=');
  });

  it('PNG is wider than tall, and size is the width', async () => {
    const png = PNG.sync.read(
      Buffer.from((await kit.generate({ ...rmqr, format: 'png', scale: 3 })).value),
    );
    expect([png.width, png.height]).toEqual([63 * 3, 13 * 3]);
    const sized = await kit.generate({ ...rmqr, format: 'png', size: 400 });
    const decoded = PNG.sync.read(Buffer.from(sized.value));
    expect(decoded.width).toBe(63 * 6); // largest whole scale that fits 400 px
    expect(decoded.height).toBe(13 * 6);
    expect(sized.warnings.map((w) => w.code)).toContain('SIZE_ROUNDED');
  });

  it('text output has one column per module and two rows of modules per line', async () => {
    const { value } = await kit.generate({ ...rmqr, format: 'text' });
    const lines = value.split('\n');
    expect(lines).toHaveLength(Math.ceil(13 / 2));
    for (const line of lines) expect(Array.from(line)).toHaveLength(63);
  });

  it('the canvas follows the same geometry', async () => {
    const made: CanvasLike[] = [];
    const browser = createBrowserKit({
      canvas: {
        createCanvas: (width, height) => {
          const canvas: CanvasLike = {
            width,
            height,
            getContext: () => ({ fillStyle: '', fillRect: () => undefined }),
          };
          made.push(canvas);
          return canvas;
        },
      },
    });
    const { value } = await browser.generate({ ...rmqr, format: 'canvas', scale: 5 });
    expect([value.width, value.height]).toEqual([63 * 5, 13 * 5]);
  });

  it('a pixel limit counts the area, not the width', async () => {
    const small = createQRCodeKit({ limits: { maxPixels: 63 * 13 * 4 } });
    await small.generate({ ...rmqr, format: 'png', scale: 2 });
    await expect(small.generate({ ...rmqr, format: 'png', scale: 3 })).rejects.toMatchObject({
      code: 'RENDERING_FAILED',
    });
  });
});

describe('styles on single-finder symbols', () => {
  const finderRings = (svg: string): number => (svg.match(/a2 2 0 0 1/g) ?? []).length / 4;
  it.each(['rounded', 'dots'] as const)(
    '%s draws one finder ring for Micro QR and rMQR, three for QR Code',
    (moduleShape) => {
      expect(
        finderRings(kit.generateSync({ data: '12345', symbol: 'micro', moduleShape }).value),
      ).toBe(1);
      expect(
        finderRings(kit.generateSync({ data: 'hello', symbol: 'rmqr', moduleShape }).value),
      ).toBe(1);
      expect(finderRings(kit.generateSync({ data: 'hello', moduleShape }).value)).toBe(3);
    },
  );

  it('gradients cover the whole rectangle', () => {
    const svg = kit.generateSync({
      data: 'hello',
      symbol: 'rmqr',
      gradient: { from: '#312e81', to: '#0f172a' },
    }).value;
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('fill="url(#qrg-');
    const radial = kit.generateSync({
      data: 'hello',
      symbol: 'rmqr',
      gradient: { from: '#312e81', to: '#0f172a', type: 'radial' },
    }).value;
    expect(radial).toMatch(
      /<radialGradient id="qrg-[^"]+" gradientUnits="userSpaceOnUse" cx="15.5" cy="7.5"/,
    );
  });
});
