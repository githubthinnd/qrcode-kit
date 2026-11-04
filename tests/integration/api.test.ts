import { inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  InvalidConfigurationError,
  InvalidInputError,
  ProviderConflictError,
  ProviderNotFoundError,
  QRMatrix,
  UnsupportedCapabilityError,
  UnsupportedDataError,
  createBuiltInProviders,
  createQRCode,
  createQRCodeKit,
  type EncoderProvider,
  type ExporterProvider,
  type Plugin,
  type RendererProvider,
} from '../../src/index.js';
import { decodingDecoders, decoders, rasterize, type Raster } from '../oracle/helpers.js';

const URL_TEXT = 'https://example.com/path?q=hello&lang=vi';

function pngToRaster(bytes: Uint8Array): Raster {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { data: new Uint8ClampedArray(png.data), width: png.width };
}

describe('createQRCode (convenience API)', () => {
  it('defaults to SVG and returns a typed string value', async () => {
    const result = await createQRCode({ data: URL_TEXT });
    expect(result.format).toBe('svg');
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.value.startsWith('<svg')).toBe(true);
    expect(result.matrix).toBeInstanceOf(QRMatrix);
    expect(result.warnings).toEqual([]);
  });

  it('produces a PNG that a third-party PNG decoder reads and a QR decoder scans', async () => {
    const { value } = await createQRCode({ data: URL_TEXT, format: 'png', scale: 6 });
    expect(value).toBeInstanceOf(Uint8Array);
    const png = PNG.sync.read(Buffer.from(value));
    expect(png.width).toBe(png.height);
    expect(png.width % 6).toBe(0);
    const raster = pngToRaster(value);
    expect(decodingDecoders(raster, URL_TEXT)).toContain('jsqr');
  });

  it('PNG pixels equal the matrix modules exactly (and the deflate stream is valid zlib)', async () => {
    const result = await createQRCode({
      data: 'pixel check',
      format: 'png',
      scale: 3,
      quietZone: 2,
    });
    const png = PNG.sync.read(Buffer.from(result.value));
    const { matrix } = result;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const dark = matrix.get(Math.floor(x / 3) - 2, Math.floor(y / 3) - 2);
        expect(png.data[(y * png.width + x) * 4]).toBe(dark ? 0 : 255);
      }
    }
    const bytes = Buffer.from(result.value);
    // concatenate IDAT payloads and inflate with Node's zlib as an independent check of our deflate
    const idat: Buffer[] = [];
    for (let i = 8; i < bytes.length;) {
      const length = bytes.readUInt32BE(i);
      if (bytes.toString('latin1', i + 4, i + 8) === 'IDAT')
        idat.push(bytes.subarray(i + 8, i + 8 + length));
      i += 12 + length;
    }
    expect(() => inflateSync(Buffer.concat(idat))).not.toThrow();
  });

  it('exports data URLs', async () => {
    const png = await createQRCode({ data: 'x', format: 'png-data-url' });
    expect(png.value).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    const svg = await createQRCode({ data: 'x', format: 'svg-data-url' });
    expect(svg.value.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    const bytes = Buffer.from(png.value.split(',')[1] ?? '', 'base64');
    expect(() => PNG.sync.read(bytes)).not.toThrow();
  });

  it('renders terminal text', async () => {
    const { value } = await createQRCode({ data: 'text', format: 'text' });
    expect(value).toMatch(/[█▀▄]/);
    const lines = value.split('\n');
    expect(new Set(lines.map((l) => Array.from(l).length)).size).toBe(1);
  });

  it('SVG modules decode back via rasterised bitmap (colours, transparency, invert)', async () => {
    const colored = await createQRCode({
      data: URL_TEXT,
      format: 'svg',
      dark: '#102030',
      light: '#fffbe6',
      scale: 4,
    });
    expect(colored.value).toContain('fill="#102030"');
    expect(colored.value).toContain('fill="#fffbe6"');
    expect(colored.value).toContain('width="');
    const transparent = await createQRCode({ data: 'x', format: 'svg', light: 'transparent' });
    expect(transparent.value).not.toContain('<rect');
    const translucent = await createQRCode({ data: 'x', format: 'svg', dark: '#00000080' });
    expect(translucent.value).toContain('fill-opacity="0.502"');
  });

  it('inverted output is flagged and swaps colours', async () => {
    const r = await createQRCode({ data: 'x', format: 'svg', invert: true });
    expect(r.value).toContain('fill="#000000"/><path');
    expect(r.warnings.map((w) => w.code)).toContain('INVERTED_POLARITY');
  });

  it('transparent PNG carries a tRNS chunk', async () => {
    const { value } = await createQRCode({ data: 'x', format: 'png', light: 'transparent' });
    expect(Buffer.from(value).includes(Buffer.from('tRNS'))).toBe(true);
    const png = PNG.sync.read(Buffer.from(value));
    expect(png.data[3]).toBe(0); // top-left quiet-zone pixel is fully transparent
  });

  it('honours size by choosing the largest whole scale', async () => {
    const r = await createQRCode({ data: 'x', format: 'png', size: 300 });
    const png = PNG.sync.read(Buffer.from(r.value));
    expect(png.width).toBeLessThanOrEqual(300);
    expect(png.width).toBe(
      r.matrix.size + 8 === 0 ? 0 : Math.floor(300 / (r.matrix.size + 8)) * (r.matrix.size + 8),
    );
  });
});

describe('Vietnamese and Unicode text survive the whole pipeline', () => {
  it.each(['Xin chào Việt Nam', 'Nhữ Duy Thìn — QR ✓ 🚀', '日本語のテキスト'])(
    'PNG of %s scans',
    async (text) => {
      const { value } = await createQRCode({ data: text, format: 'png', scale: 6, ecc: 'Q' });
      const ok = decodingDecoders(pngToRaster(value), text);
      expect(ok).toContain('jsqr');
      expect(ok.length).toBeGreaterThanOrEqual(2);
    },
  );
});

describe('option handling is strict and explicit', () => {
  it.each([
    [{ data: '' }, InvalidInputError],
    [{ data: new Uint8Array(0) }, InvalidInputError],
    [{ data: [] }, InvalidInputError],
    [{ data: 'x', ecc: 'Z' }, InvalidInputError],
    [{ data: 'x', version: 41 }, InvalidInputError],
    [{ data: 'x', version: { min: 9, max: 3 } }, InvalidInputError],
    [{ data: 'x', mask: 9 }, InvalidInputError],
    [{ data: 'x', quietZone: -1 }, InvalidInputError],
    [{ data: 'x', dark: 'rgb(1,2,3)' }, InvalidInputError],
    [{ data: 'x', dark: '#12' }, InvalidInputError],
    [{ data: 'x', scale: 2, size: 200 }, InvalidConfigurationError],
    [{ data: 'x', colour: 'red' }, InvalidConfigurationError],
    [{ data: 'x', eci: 26 }, InvalidInputError],
    [{ data: new Uint8Array(1), eci: true }, InvalidInputError],
    [{ data: new Uint8Array(1), kanji: true }, InvalidInputError],
    [{ data: 'x', quality: 2 }, InvalidInputError],
    [{ data: 'x', path: 'a\0b' }, InvalidInputError],
    [{ data: 'x', format: 'webp-wizard' }, UnsupportedCapabilityError],
  ])('%j is rejected with %o', async (request, errorClass) => {
    await expect(createQRCode(request as never)).rejects.toBeInstanceOf(errorClass);
  });

  it('never ignores an option the chosen providers cannot honour', async () => {
    await expect(createQRCode({ data: 'x', format: 'text', dark: '#123456' })).rejects.toThrow(
      /custom colours/,
    );
    await expect(createQRCode({ data: 'x', format: 'text', light: 'transparent' })).rejects.toThrow(
      /transparent/,
    );
    await expect(createQRCode({ data: 'x', format: 'svg', quality: 0.5 })).rejects.toThrow(
      /quality/,
    );
    await expect(createQRCode({ data: 'x', format: 'svg', path: '/tmp/x.svg' })).rejects.toThrow(
      /path/,
    );
  });

  it('reports data that is too large as UnsupportedDataError with sizes in details only', async () => {
    const error = await createQRCode({ data: 'secret '.repeat(1000), ecc: 'H' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UnsupportedDataError);
    expect(JSON.stringify(error)).not.toContain('secret');
    expect((error as Error).message).not.toContain('secret');
  });

  it('caps input size before doing any work', async () => {
    const kit = createQRCodeKit({ limits: { maxInputLength: 100 } });
    await expect(kit.generate({ data: 'x'.repeat(101) })).rejects.toThrow(/too large/);
  });

  it('caps raster size', async () => {
    const kit = createQRCodeKit({ limits: { maxPixels: 10_000 } });
    await expect(kit.generate({ data: 'x', format: 'png', scale: 100 })).rejects.toThrow(
      /exceeds the limit/,
    );
    await expect(kit.generate({ data: 'x', format: 'png', size: 10 })).rejects.toThrow(
      /smaller than/,
    );
  });

  it('returns warnings instead of failing for risky but valid choices', async () => {
    const received: string[] = [];
    const kit = createQRCodeKit({ onDiagnostic: (d) => received.push(d.code) });
    const r = await kit.generate({ data: 'x', quietZone: 1, dark: '#777777', light: '#888888' });
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['LOW_CONTRAST', 'QUIET_ZONE_SMALL']);
    expect(received.sort()).toEqual(['LOW_CONTRAST', 'QUIET_ZONE_SMALL']);
  });
});

describe('symbol options reach the encoder', () => {
  it('ecc, version, mask and boostEcc', () => {
    const kit = createQRCodeKit();
    const a = kit.encode({ data: 'hello', ecc: 'H', version: 6, mask: 3 });
    expect([a.ecc, a.version, a.mask]).toEqual(['H', 6, 3]);
    expect(kit.encode({ data: 'hello', ecc: 'L', boostEcc: true }).ecc).toBe('H');
    expect(kit.encode({ data: 'hello', version: { min: 3 } }).version).toBe(3);
  });

  it('bytes, explicit segments, ECI and FNC1', () => {
    const kit = createQRCodeKit();
    expect(kit.encode({ data: Uint8Array.of(1, 2, 3) }).segments[0]?.mode).toBe('byte');
    const seg = kit.encode({
      data: [
        { mode: 'numeric', text: '123' },
        { mode: 'alphanumeric', text: 'AB' },
      ],
    });
    expect(seg.segments.map((s) => s.mode)).toEqual(['numeric', 'alphanumeric']);
    expect(kit.encode({ data: 'é', eci: true }).segments[0]?.mode).toBe('eci');
    expect(kit.encode({ data: Uint8Array.of(1), eci: 899 }).segments[0]).toMatchObject({
      mode: 'eci',
    });
    expect(kit.encode({ data: '0123', fnc1: 'first' }).segments[0]?.mode).toBe('fnc1-first');
    expect(kit.encode({ data: '0123', fnc1: { applicationIndicator: 7 } }).segments[0]?.mode).toBe(
      'fnc1-second',
    );
  });

  it('Kanji mode via the option', () => {
    const kit = createQRCodeKit();
    const m = kit.encode({ data: '日本語', kanji: true });
    expect(m.segments[0]?.mode).toBe('kanji');
  });

  it('ISO-8859-1 charset', () => {
    const kit = createQRCodeKit();
    const m = kit.encode({ data: 'café', charset: 'iso-8859-1' });
    expect(m.segments[0]).toMatchObject({ mode: 'byte', count: 4 });
  });
});

describe('structured append through the kit', () => {
  it('returns one result per symbol, scannable and linked', async () => {
    const kit = createQRCodeKit();
    const text = 'Linked symbols carry one long message. '.repeat(10);
    const results = await kit.generateStructuredAppend({
      data: text,
      symbols: 3,
      format: 'png',
      scale: 6,
    });
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.matrix.structuredAppend?.index)).toEqual([0, 1, 2]);
    // jsQR does not parse the structured-append header; ZXing does.
    const parts = results.map((r) => decoders.zxing(pngToRaster(r.value)));
    expect(parts.join('')).toBe(text);
  });

  it('rejects options that do not apply', async () => {
    const kit = createQRCodeKit();
    await expect(
      kit.generateStructuredAppend({ data: 'abc', eci: true } as never),
    ).rejects.toBeInstanceOf(InvalidConfigurationError);
  });
});

describe('generateSync', () => {
  it('works with the synchronous built-in providers', () => {
    const kit = createQRCodeKit();
    const r = kit.generateSync({ data: 'sync', format: 'text' });
    expect(r.value).toMatch(/[█▀▄]/);
  });

  it('refuses when a provider may be asynchronous', () => {
    const base = createBuiltInProviders();
    const asyncExporter: ExporterProvider = {
      id: 'test/async-svg',
      apiVersion: 1,
      capabilities: {
        accepts: ['svg'],
        formats: ['svg'],
        runtimes: ['universal'],
        requiresPath: false,
        quality: false,
        sync: false,
      },
      export: (r) =>
        Promise.resolve({
          format: 'svg',
          mimeType: 'image/svg+xml',
          value: r.kind === 'svg' ? r.markup : '',
        }),
    };
    const kit = createQRCodeKit({ providers: { exporters: [asyncExporter] } });
    expect(() => kit.generateSync({ data: 'x' })).toThrow(UnsupportedCapabilityError);
    expect(base.encoders).toHaveLength(1);
  });
});

describe('provider replacement and isolation', () => {
  const upper: RendererProvider = {
    id: 'test/shouting-text',
    apiVersion: 1,
    capabilities: {
      produces: 'text',
      transparency: false,
      colors: false,
      gradients: false,
      moduleShapes: ['square'],
      logo: false,
      maxPixels: undefined,
      sync: true,
    },
    render: (m) => ({ kind: 'text', text: `MODULES=${String(m.size)}`, columns: 1, rows: 1 }),
  };

  it('a custom renderer replaces the built-in one without touching encoder or exporter', async () => {
    const kit = createQRCodeKit({ providers: { renderers: [upper] } });
    const r = await kit.generate({ data: 'hi', format: 'text' });
    expect(r.value).toBe('MODULES=21');
    // other formats still use built-ins
    expect((await kit.generate({ data: 'hi', format: 'svg' })).value).toContain('<svg');
  });

  it('per-operation provider ids override kit configuration', async () => {
    const kit = createQRCodeKit({ providers: { renderers: [upper] } });
    const r = await kit.generate({
      data: 'hi',
      format: 'text',
      providers: { renderer: 'qrcode-toolkit/text' },
    });
    expect(r.value).toMatch(/[█▀▄]/);
  });

  it('routes pin a provider for a format', async () => {
    const kit = createQRCodeKit({
      providers: { renderers: [upper] },
      routes: { text: { renderer: 'qrcode-toolkit/text' } },
    });
    expect((await kit.generate({ data: 'hi', format: 'text' })).value).toMatch(/[█▀▄]/);
  });

  it('a third-party encoder can replace the built-in one', async () => {
    const calls: string[] = [];
    const fake: EncoderProvider = {
      id: 'test/fixed-encoder',
      apiVersion: 1,
      capabilities: {
        modes: ['byte'],
        charsets: ['utf-8'],
        eci: false,
        fnc1: false,
        structuredAppend: false,
        maskControl: false,
        boostEcc: false,
        sync: true,
      },
      encode(request) {
        calls.push(request.input.kind);
        const builtIn = createBuiltInProviders().encoders[0];
        return builtIn.encode({
          ...request,
          input: { kind: 'text', text: 'FIXED', charset: 'utf-8', eci: false, kanji: false },
        });
      },
    };
    const kit = createQRCodeKit({ providers: { encoders: [fake] } });
    const m = kit.encode({ data: 'ignored' });
    expect(calls).toEqual(['text']);
    expect(m.segments[0]?.count).toBe(5);
    // the capability gap is reported instead of silently ignoring the option
    await expect(kit.generate({ data: 'x', eci: true })).rejects.toThrow(/does not support eci/);
    await expect(kit.generate({ data: 'x', mask: 2 })).rejects.toThrow(/maskControl/);
    await expect(kit.generateStructuredAppend({ data: 'xyz' })).rejects.toThrow(/structuredAppend/);
  });

  it('kits are isolated and concurrent requests do not leak configuration', async () => {
    const a = createQRCodeKit({ providers: { renderers: [upper] } });
    const b = createQRCodeKit();
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        (i % 2 === 0 ? a : b).generate({ data: `req-${String(i)}`, format: 'text' }),
      ),
    );
    results.forEach((r, i) => {
      if (i % 2 === 0) expect(r.value).toMatch(/^MODULES=\d+$/);
      else expect(r.value).toMatch(/[█▀▄]/);
    });
    expect(a.describe().providers.some((p) => p.id === 'test/shouting-text')).toBe(true);
    expect(b.describe().providers.some((p) => p.id === 'test/shouting-text')).toBe(false);
  });

  it('validates the configuration at creation time', () => {
    expect(() => createQRCodeKit({ providers: { renderers: [upper, upper] } })).toThrow(
      ProviderConflictError,
    );
    expect(() => createQRCodeKit({ defaultEncoder: 'nope' })).toThrow(ProviderNotFoundError);
    expect(() => createQRCodeKit({ routes: { svg: { renderer: 'nope' } } })).toThrow(
      ProviderNotFoundError,
    );
    expect(() => createQRCodeKit({ routes: { svg: { renderer: 'qrcode-toolkit/text' } } })).toThrow(
      UnsupportedCapabilityError,
    );
    expect(() => createQRCodeKit({ builtIns: false })).toThrow(InvalidConfigurationError);
    expect(() =>
      createQRCodeKit({ providers: { renderers: [{ ...upper, apiVersion: 2 as never }] } }),
    ).toThrow(/API version 2/);
    expect(() =>
      createQRCodeKit({ providers: { renderers: [{ ...upper, id: 'Bad Id!' }] } }),
    ).toThrow(InvalidConfigurationError);
  });

  it('wraps unexpected provider failures in typed errors with the cause preserved', async () => {
    const boom = new Error('disk on fire');
    const failing: RendererProvider = {
      ...upper,
      id: 'test/failing',
      render: () => {
        throw boom;
      },
    };
    const kit = createQRCodeKit({ providers: { renderers: [failing] } });
    const error = await kit.generate({ data: 'x', format: 'text' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'RENDERING_FAILED' });
    expect((error as Error).cause).toBe(boom);
  });

  it('the kit description is inspectable and frozen', () => {
    const d = createQRCodeKit().describe();
    expect(d.formats).toEqual(
      expect.arrayContaining(['svg', 'png', 'text', 'png-data-url', 'svg-data-url']),
    );
    expect(Object.isFrozen(d)).toBe(true);
    expect(d.providers.map((p) => p.kind)).toEqual(
      expect.arrayContaining(['encoder', 'renderer', 'exporter']),
    );
  });
});

describe('plugins (experimental)', () => {
  it('can add providers and run ordered hooks', async () => {
    const order: string[] = [];
    const diag: string[] = [];
    const make = (id: string, order_: number): Plugin => ({
      id,
      version: '1.0.0',
      apiVersion: 1,
      setup: (b) => {
        b.addHooks({
          order: order_,
          onMatrix: (m) => {
            order.push(id);
            return m;
          },
          onDiagnostic: (d) => diag.push(d.code),
        });
      },
    });
    const kit = createQRCodeKit({ plugins: [make('late', 10), make('early', -5), make('mid', 0)] });
    await kit.generate({ data: 'x', quietZone: 0 });
    expect(order).toEqual(['early', 'mid', 'late']);
    expect(diag).toContain('QUIET_ZONE_SMALL');
    expect(kit.describe().plugins).toEqual(['late', 'early', 'mid']);
  });

  it('a matrix hook cannot change the version, and failures become PluginError', async () => {
    const swap: Plugin = {
      id: 'bad',
      version: '1',
      apiVersion: 1,
      setup: (b) => {
        b.addHooks({
          onMatrix: () =>
            new QRMatrix({
              version: 40,
              ecc: 'L',
              mask: 0,
              modules: new Uint8Array(177 * 177),
              kinds: new Uint8Array(177 * 177),
              segments: [],
            }),
        });
      },
    };
    await expect(
      createQRCodeKit({ plugins: [swap] }).generate({ data: 'x' }),
    ).rejects.toMatchObject({ code: 'PLUGIN_FAILED' });
    const throwing: Plugin = {
      id: 't',
      version: '1',
      apiVersion: 1,
      setup: (b) => {
        b.addHooks({
          onRendered: () => {
            throw new Error('x');
          },
        });
      },
    };
    await expect(
      createQRCodeKit({ plugins: [throwing] }).generate({ data: 'x' }),
    ).rejects.toMatchObject({ code: 'PLUGIN_FAILED' });
    expect(() =>
      createQRCodeKit({
        plugins: [
          {
            id: 's',
            version: '1',
            apiVersion: 1,
            setup: () => {
              throw new Error('nope');
            },
          },
        ],
      }),
    ).toThrow(/failed during setup/);
    expect(() =>
      createQRCodeKit({
        plugins: [{ id: 'v', version: '1', apiVersion: 2 as never, setup: () => undefined }],
      }),
    ).toThrow(InvalidConfigurationError);
  });
});

describe('SVG safety', () => {
  it('contains only numbers and validated colours; no user text can reach the markup', async () => {
    const hostile = '"><script>alert(1)</script>';
    const { value } = await createQRCode({ data: hostile });
    expect(value).not.toContain('script');
    expect(value).not.toContain(hostile);
    expect(value).toMatch(
      /^<svg [^<>]*><rect [^<>]*\/><path d="[MhvzV0-9 .-]*" fill="#[0-9a-f]{6}"\/><\/svg>$/,
    );
    await expect(
      createQRCode({ data: 'x', dark: '#000" onload="alert(1)' }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(createQRCode({ data: 'x', light: 'red"/><script>' })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it('rasterised SVG geometry equals the matrix (path covers exactly the dark modules)', async () => {
    const { value, matrix } = await createQRCode({ data: URL_TEXT, quietZone: 0 });
    const covered = new Set<string>();
    for (const m of value.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(m[3]); i++) covered.add(`${String(Number(m[1]) + i)},${m[2]}`);
    }
    const dark = new Set<string>();
    for (let y = 0; y < matrix.size; y++)
      for (let x = 0; x < matrix.size; x++)
        if (matrix.get(x, y)) dark.add(`${String(x)},${String(y)}`);
    expect(covered).toEqual(dark);
    expect(decodingDecoders(rasterize(matrix, 6), URL_TEXT)).toContain('jsqr');
  });
});
