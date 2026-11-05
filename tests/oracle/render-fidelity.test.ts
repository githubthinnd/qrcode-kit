/**
 * Render fidelity: whatever the options, the *rendered output* must show exactly the modules of the
 * matrix, in the right colours, with the right quiet zone and scale. The output is read back by
 * code that shares nothing with the renderers (an SVG path reader, pngjs, a block-character
 * reader), so a drawing bug cannot hide behind a matrix-level oracle.
 */
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { createBrowserKit, type CanvasLike } from '../../src/browser.js';
import { createQRCodeKit } from '../../src/index.js';
import { createRandom } from '../unit/oracle-random.js';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}
const hex = (c: Rgba): string =>
  c.a === 255
    ? `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    : `#${[c.r, c.g, c.b, c.a].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const kit = createQRCodeKit();
const TEXTS = [
  'https://example.com/a?b=c',
  '0123456789'.repeat(9),
  'HELLO WORLD',
  'Xin chào Việt Nam — Nhữ Duy Thìn',
  'The quick brown fox jumps over the lazy dog. '.repeat(5),
];

/** Read an SVG from this toolkit back into a grid of colours, one cell per module. */
function readSvg(markup: string): {
  width: number;
  height: number;
  cell: (x: number, y: number) => Rgba;
} {
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(markup);
  expect(viewBox).not.toBeNull();
  const modulesX = Number(viewBox?.[1]);
  const modulesY = Number(viewBox?.[2]);
  const grid: Rgba[] = Array.from({ length: modulesX * modulesY }, () => ({
    r: 0,
    g: 0,
    b: 0,
    a: 0,
  }));
  const paint = (fill: string, fillOpacity: string | undefined, apply: (c: Rgba) => void): void => {
    const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(fill);
    expect(rgb, `fill ${fill}`).not.toBeNull();
    const a = fillOpacity === undefined ? 255 : Math.round(Number(fillOpacity) * 255);
    apply({
      r: Number.parseInt(rgb?.[1] ?? '0', 16),
      g: Number.parseInt(rgb?.[2] ?? '0', 16),
      b: Number.parseInt(rgb?.[3] ?? '0', 16),
      a,
    });
  };
  const rect =
    /<rect width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"(?: fill-opacity="([\d.]+)")?\/>/.exec(
      markup,
    );
  if (rect !== null) {
    paint(rect[3], rect[4], (c) => {
      for (let i = 0; i < grid.length; i++) grid[i] = c;
    });
  }
  for (const path of markup.matchAll(
    /<path d="([^"]*)" fill="(#[0-9a-f]{6})"(?: fill-opacity="([\d.]+)")?\/>/g,
  )) {
    paint(path[2], path[3], (c) => {
      for (const run of path[1].matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
        const [x, y, w] = [Number(run[1]), Number(run[2]), Number(run[3])];
        for (let i = 0; i < w; i++) grid[y * modulesX + x + i] = c;
      }
    });
  }
  return {
    width: modulesX,
    height: modulesY,
    cell: (x, y) => grid[y * modulesX + x] ?? { r: 0, g: 0, b: 0, a: 0 },
  };
}

function readPng(bytes: Uint8Array): {
  width: number;
  height: number;
  pixel: (x: number, y: number) => Rgba;
} {
  const png = PNG.sync.read(Buffer.from(bytes));
  return {
    width: png.width,
    height: png.height,
    pixel: (x, y) => {
      const i = (y * png.width + x) * 4;
      return {
        r: png.data[i] ?? 0,
        g: png.data[i + 1] ?? 0,
        b: png.data[i + 2] ?? 0,
        a: png.data[i + 3] ?? 0,
      };
    },
  };
}

/** Same colour? Fully transparent pixels match each other whatever their RGB. */
function sameColor(actual: Rgba, expected: Rgba): boolean {
  if (expected.a === 0 || actual.a === 0) return expected.a === 0 && actual.a === 0;
  return (
    actual.r === expected.r &&
    actual.g === expected.g &&
    actual.b === expected.b &&
    Math.abs(actual.a - expected.a) <= 1
  );
}

const PALETTE: readonly Rgba[] = [
  { r: 0, g: 0, b: 0, a: 255 },
  { r: 255, g: 255, b: 255, a: 255 },
  { r: 0x1e, g: 0x1b, b: 0x4b, a: 255 },
  { r: 0xfd, g: 0xe6, b: 0x8a, a: 255 },
  { r: 0x16, g: 0xa3, b: 0x4a, a: 255 },
  { r: 0x20, g: 0x40, b: 0x80, a: 0x80 },
  { r: 0, g: 0, b: 0, a: 0 },
];

describe('rendered output shows exactly the matrix', () => {
  const random = createRandom(20261105);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const int = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));

  it.each(Array.from({ length: 160 }, (_, i) => i))('random request %i', async () => {
    const symbol = pick(['qr', 'qr', 'micro', 'rmqr'] as const);
    // Micro QR and rMQR hold little: short text of one kind keeps every case encodable
    const data = symbol === 'qr' ? pick(TEXTS) : pick(['1', '12345', 'HELLO', 'AB12', 'x', 'rect']);
    const ecc =
      symbol === 'micro'
        ? pick(['L', 'M', 'Q'] as const)
        : symbol === 'rmqr'
          ? pick(['M', 'H'] as const)
          : pick(['L', 'M', 'Q', 'H'] as const);
    const quietZone = int(0, 8);
    const invert = random() < 0.3;
    const dark = pick(PALETTE);
    const light = pick(PALETTE.filter((c) => c !== dark));
    const scale = int(1, 7);
    const format = pick(['svg', 'svg-data-url', 'png', 'png-data-url'] as const);
    const common = {
      data,
      ecc,
      quietZone,
      invert,
      dark: hex(dark),
      light: hex(light),
      symbol,
      ...(symbol !== 'rmqr' && random() < 0.4
        ? { mask: int(0, symbol === 'micro' ? 3 : 7) as 0 }
        : {}),
    };
    const result = await kit.generate({ ...common, format, scale });
    const { matrix } = result;
    const modulesX = matrix.width + quietZone * 2;
    const modulesY = matrix.height + quietZone * 2;
    const expected = (mx: number, my: number): Rgba => {
      const isDark = matrix.get(mx - quietZone, my - quietZone);
      return isDark !== invert ? dark : light;
    };

    let svgText: string | undefined;
    if (format === 'svg') svgText = result.value as string;
    else if (format === 'svg-data-url') {
      svgText = decodeURIComponent(
        (result.value as string).replace('data:image/svg+xml;charset=utf-8,', ''),
      );
    }
    if (svgText !== undefined) {
      const svg = readSvg(svgText);
      expect([svg.width, svg.height]).toEqual([modulesX, modulesY]);
      expect(svgText).toContain(
        `width="${String(modulesX * scale)}" height="${String(modulesY * scale)}"`,
      );
      for (let y = 0; y < modulesY; y++) {
        for (let x = 0; x < modulesX; x++) {
          expect(
            sameColor(svg.cell(x, y), expected(x, y)),
            `svg module ${String(x)},${String(y)} ${JSON.stringify({ d: common.dark, l: common.light, invert, quietZone })}`,
          ).toBe(true);
        }
      }
      return;
    }
    const bytes =
      format === 'png'
        ? (result.value as Uint8Array)
        : Uint8Array.from(Buffer.from((result.value as string).split(',')[1] ?? '', 'base64'));
    const png = readPng(bytes);
    expect(png.width).toBe(modulesX * scale);
    expect(png.height).toBe(modulesY * scale);
    for (let y = 0; y < modulesY; y++) {
      for (let x = 0; x < modulesX; x++) {
        // every pixel of the module square must carry the colour, not only its centre
        for (const [dx, dy] of [
          [0, 0],
          [scale - 1, scale - 1],
          [Math.floor(scale / 2), Math.floor(scale / 2)],
        ] as const) {
          expect(
            sameColor(png.pixel(x * scale + dx, y * scale + dy), expected(x, y)),
            `png module ${String(x)},${String(y)}`,
          ).toBe(true);
        }
      }
    }
  });

  it.each(
    (['qr', 'micro', 'rmqr'] as const).flatMap((symbol) =>
      [0, 1, 2, 4, 7].map((q) => [symbol, q] as const),
    ),
  )(
    '%s text output reads back to the matrix (quiet zone %i, both polarities)',
    async (symbol, q) => {
      for (const invert of [false, true]) {
        const { value, matrix } = await kit.generate({
          data: symbol === 'qr' ? 'text check' : '12345',
          symbol,
          format: 'text',
          quietZone: q,
          invert,
        });
        const lines = value.split('\n');
        const modulesX = matrix.width + q * 2;
        const modulesY = matrix.height + q * 2;
        expect(lines.length).toBe(Math.ceil(modulesY / 2));
        for (const line of lines) expect(Array.from(line).length).toBe(modulesX);
        const filled = (x: number, y: number): boolean => {
          const line = lines[Math.floor(y / 2)] ?? '';
          const ch = Array.from(line)[x] ?? ' ';
          const top = ch === '█' || ch === '▀';
          const bottom = ch === '█' || ch === '▄';
          return y % 2 === 0 ? top : bottom;
        };
        for (let y = 0; y < modulesY; y++) {
          for (let x = 0; x < modulesX; x++) {
            const dark = matrix.get(x - q, y - q);
            expect(filled(x, y), `text ${String(x)},${String(y)}`).toBe(dark !== invert);
          }
        }
      }
    },
  );
});

describe('canvas drawing shows exactly the matrix, translucent colours included', () => {
  /** A canvas that really composites (source-over), so overlapping fills cannot hide. */
  function compositingCanvas(): {
    create: (w: number, h: number) => CanvasLike;
    last: () => { width: number; pixel: (x: number, y: number) => Rgba };
  } {
    const canvases: { width: number; data: Float64Array }[] = [];
    return {
      create: (width, height) => {
        const surface = { width, data: new Float64Array(width * height * 4) };
        canvases.push(surface);
        let style = 'rgba(0,0,0,1)';
        return {
          width,
          height,
          getContext: () => ({
            set fillStyle(value: string) {
              style = value;
            },
            get fillStyle(): string {
              return style;
            },
            fillRect(x: number, y: number, w: number, h: number): void {
              const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(style);
              const [r, g, b, a] = [Number(m?.[1]), Number(m?.[2]), Number(m?.[3]), Number(m?.[4])];
              for (let py = y; py < y + h; py++) {
                for (let px = x; px < x + w; px++) {
                  const i = (py * width + px) * 4;
                  const dstA = surface.data[i + 3] ?? 0;
                  const outA = a + dstA * (1 - a);
                  for (const [k, c] of [r, g, b].entries()) {
                    const dst = surface.data[i + k] ?? 0;
                    surface.data[i + k] = outA === 0 ? 0 : (c * a + dst * dstA * (1 - a)) / outA;
                  }
                  surface.data[i + 3] = outA;
                }
              }
            },
          }),
          toBlob: (cb: (b: { size: number; type: string }) => void, type?: string) => {
            cb({ size: 1, type: type ?? '' });
          },
        };
      },
      last: () => {
        const surface = canvases[canvases.length - 1];
        return {
          width: surface.width,
          pixel: (x, y) => {
            const i = (y * surface.width + x) * 4;
            return {
              r: Math.round(surface.data[i] ?? 0),
              g: Math.round(surface.data[i + 1] ?? 0),
              b: Math.round(surface.data[i + 2] ?? 0),
              a: Math.round((surface.data[i + 3] ?? 0) * 255),
            };
          },
        };
      },
    };
  }

  const colours: readonly [string, string][] = [
    ['#000000', '#ffffff'],
    ['#00000000', '#ffffff'],
    ['#20408080', '#fde68a'],
    ['#1e1b4b', '#00000000'],
    ['#20408080', '#00000000'],
    ['#ffffff', '#1e1b4b'],
  ];

  it.each(colours.flatMap((c) => [false, true].map((invert) => [...c, invert] as const)))(
    'dark %s on light %s (invert %s), canvas and bitmap routes',
    async (darkText, lightText, invert) => {
      for (const route of ['canvas', 'bitmap'] as const) {
        const fake = compositingCanvas();
        const browserKit = createBrowserKit({ canvas: { createCanvas: fake.create } });
        const { matrix } = await browserKit.generate({
          data: '12345',
          // a rectangular symbol, so width and height cannot be mixed up
          symbol: 'rmqr',
          format: 'png-blob',
          scale: 3,
          quietZone: 2,
          dark: darkText,
          light: lightText,
          invert,
          ...(route === 'bitmap' ? { providers: { renderer: 'qrcode-toolkit/bitmap' } } : {}),
        });
        const canvas = fake.last();
        const modulesX = matrix.width + 4;
        const modulesY = matrix.height + 4;
        expect(canvas.width).toBe(modulesX * 3);
        const parse = (text: string): Rgba => {
          const n = Number.parseInt(text.slice(1), 16);
          return text.length === 9
            ? { r: (n >>> 24) & 255, g: (n >>> 16) & 255, b: (n >>> 8) & 255, a: n & 255 }
            : { r: (n >>> 16) & 255, g: (n >>> 8) & 255, b: n & 255, a: 255 };
        };
        const [dark, light] = [parse(darkText), parse(lightText)];
        for (let y = 0; y < modulesY; y++) {
          for (let x = 0; x < modulesX; x++) {
            const wantDark = matrix.get(x - 2, y - 2) !== invert;
            const want = wantDark ? dark : light;
            expect(
              sameColor(canvas.pixel(x * 3 + 1, y * 3 + 1), want),
              `${route} module ${String(x)},${String(y)}`,
            ).toBe(true);
          }
        }
      }
    },
  );
});

describe('PNG writer on large and awkward rasters', () => {
  it.each([
    [1, 'x', 1],
    [1, 'x', 100],
    [10, 'png sizes '.repeat(20), 13],
    [40, '9'.repeat(7089), 1],
    [40, '9'.repeat(7089), 9],
    [25, 'Xin chào '.repeat(100), 31],
  ] as const)('version≈%i, scale %i: every pixel matches the matrix', async (_v, data, scale) => {
    const { value, matrix } = await kit.generate({ data, format: 'png', scale, ecc: 'L' });
    const png = readPng(value);
    const modules = matrix.size + 8;
    expect(png.width).toBe(modules * scale);
    for (let y = 0; y < png.width; y += Math.max(1, Math.floor(scale / 2))) {
      for (let x = 0; x < png.width; x += Math.max(1, Math.floor(scale / 2))) {
        const mx = Math.floor(x / scale) - 4;
        const my = Math.floor(y / scale) - 4;
        const dark = png.pixel(x, y).r === 0;
        expect(dark, `pixel ${String(x)},${String(y)}`).toBe(matrix.get(mx, my));
      }
    }
  });
});
