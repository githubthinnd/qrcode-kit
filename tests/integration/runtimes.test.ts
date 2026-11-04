import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createBrowserKit,
  createBlobExporter,
  createCanvasRenderer,
  type CanvasLike,
} from '../../src/browser.js';
import { createNodeKit } from '../../src/node.js';
import { createQRCodeKit, RuntimeUnavailableError, ExportError } from '../../src/index.js';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'qtk-runtime-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Node.js runtime', () => {
  it('png-buffer returns a Buffer that is a valid PNG', async () => {
    const kit = createNodeKit();
    const { value } = await kit.generate({ data: 'buffer', format: 'png-buffer', scale: 4 });
    expect(Buffer.isBuffer(value)).toBe(true);
    expect(PNG.sync.read(Buffer.from(value)).width).toBeGreaterThan(0);
    const svg = await kit.generate({ data: 'buffer', format: 'svg-buffer' });
    expect(Buffer.isBuffer(svg.value)).toBe(true);
    expect(Buffer.from(svg.value).toString('utf8').startsWith('<svg')).toBe(true);
  });

  it('writes png, svg and text files and reports path and size', async () => {
    const kit = createNodeKit({ files: { baseDir: dir } });
    const png = await kit.generate({ data: 'file', format: 'png-file', path: 'a.png' });
    expect(png.value).toMatchObject({ path: join(dir, 'a.png') });
    expect(PNG.sync.read(readFileSync(join(dir, 'a.png'))).width).toBeGreaterThan(0);
    expect(png.value.bytes).toBe(readFileSync(join(dir, 'a.png')).length);
    await kit.generate({ data: 'file', format: 'svg-file', path: 'a.svg' });
    expect(readFileSync(join(dir, 'a.svg'), 'utf8').startsWith('<svg')).toBe(true);
    await kit.generate({ data: 'file', format: 'text-file', path: 'a.txt' });
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toMatch(/[█▀▄]/);
  });

  it('requires a path for file output and rejects a path for other formats', async () => {
    const kit = createNodeKit({ files: { baseDir: dir } });
    await expect(kit.generate({ data: 'x', format: 'png-file' })).rejects.toThrow(/path/);
    await expect(kit.generate({ data: 'x', format: 'png', path: 'x.png' })).rejects.toThrow(/path/);
  });

  it('confines writes to baseDir (no path traversal)', async () => {
    const kit = createNodeKit({ files: { baseDir: dir } });
    for (const path of ['../escape.png', '/etc/escape.png', 'sub/../../escape.png', '.']) {
      await expect(kit.generate({ data: 'x', format: 'png-file', path })).rejects.toBeInstanceOf(
        ExportError,
      );
    }
    expect(existsSync(join(dir, '..', 'escape.png'))).toBe(false);
  });

  it('does not write through symbolic links that leave baseDir', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'qtk-outside-'));
    try {
      symlinkSync(outside, join(dir, 'link'));
      const kit = createNodeKit({ files: { baseDir: dir } });
      await expect(
        kit.generate({ data: 'x', format: 'png-file', path: 'link/x.png' }),
      ).rejects.toBeInstanceOf(ExportError);
      expect(existsSync(join(outside, 'x.png'))).toBe(false);
      // a symlinked *file* is refused as well
      writeFileSync(join(outside, 'victim.txt'), 'keep');
      symlinkSync(join(outside, 'victim.txt'), join(dir, 'victim.png'));
      await expect(
        kit.generate({ data: 'x', format: 'png-file', path: 'victim.png' }),
      ).rejects.toBeInstanceOf(ExportError);
      expect(readFileSync(join(outside, 'victim.txt'), 'utf8')).toBe('keep');
      // directories created below baseDir through a symlinked parent are rejected too
      const lenient = createNodeKit({ files: { baseDir: dir, createDirectories: true } });
      await expect(
        lenient.generate({ data: 'x', format: 'png-file', path: 'link/new/x.png' }),
      ).rejects.toBeInstanceOf(ExportError);
      expect(existsSync(join(outside, 'new'))).toBe(false);
      mkdirSync(join(dir, 'ok'));
      await lenient.generate({ data: 'x', format: 'png-file', path: 'ok/x.png' });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('creates directories only when asked, and reports failures as typed errors', async () => {
    const strict = createNodeKit({ files: { baseDir: dir } });
    await expect(
      strict.generate({ data: 'x', format: 'png-file', path: 'missing/dir/x.png' }),
    ).rejects.toBeInstanceOf(RuntimeUnavailableError);
    const lenient = createNodeKit({ files: { baseDir: dir, createDirectories: true } });
    await lenient.generate({ data: 'x', format: 'png-file', path: 'made/by/us/x.png' });
    expect(existsSync(join(dir, 'made/by/us/x.png'))).toBe(true);
  });

  it('the universal kit has none of the Node.js formats (isolation)', async () => {
    await expect(
      createQRCodeKit().generate({ data: 'x', format: 'png-file', path: 'x.png' }),
    ).rejects.toThrow(/No registered exporter/);
  });
});

/** A canvas double that records drawing and encodes "images" as typed blobs. */
function fakeCanvasFactory(
  supported: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'],
): {
  create: (w: number, h: number) => CanvasLike;
  created: {
    width: number;
    height: number;
    rects: [number, number, number, number][];
    fills: string[];
  }[];
} {
  const created: {
    width: number;
    height: number;
    rects: [number, number, number, number][];
    fills: string[];
  }[] = [];
  return {
    created,
    create: (width, height) => {
      const record = {
        width,
        height,
        rects: [] as [number, number, number, number][],
        fills: [] as string[],
      };
      created.push(record);
      const ctx = {
        set fillStyle(v: string) {
          record.fills.push(v);
        },
        get fillStyle() {
          return record.fills.at(-1) ?? '';
        },
        fillRect(x: number, y: number, w: number, h: number) {
          record.rects.push([x, y, w, h]);
        },
      };
      return {
        width,
        height,
        getContext: () => ctx,
        toBlob(cb, type = 'image/png') {
          cb({ size: 123, type: supported.includes(type) ? type : 'image/png' });
        },
      };
    },
  };
}

describe('browser runtime (canvas double; no DOM in this process)', () => {
  it('importing the browser entry in Node touches no DOM, and the default canvas factory reports the missing runtime', async () => {
    expect((globalThis as { document?: unknown }).document).toBeUndefined();
    const kit = createBrowserKit();
    await expect(kit.generate({ data: 'x', format: 'png-blob' })).rejects.toBeInstanceOf(
      RuntimeUnavailableError,
    );
  });

  it('draws exactly the dark modules onto the canvas at the requested scale', () => {
    const { create, created } = fakeCanvasFactory();
    const kit = createQRCodeKit({
      providers: { renderers: [createCanvasRenderer({ createCanvas: create })] },
      routes: {},
    });
    const matrix = kit.encode({ data: 'canvas' });
    const renderer = createCanvasRenderer({ createCanvas: create });
    const out = renderer.render(matrix, {
      quietZone: 2,
      scale: 5,
      size: undefined,
      dark: { r: 0, g: 0, b: 0, a: 255 },
      light: { r: 255, g: 255, b: 255, a: 255 },
      invert: false,
      maxPixels: 1e9,
    });
    expect(out).toMatchObject({ kind: 'canvas', width: (matrix.size + 4) * 5 });
    const record = created.at(-1);
    expect(record?.fills).toEqual(['rgba(255,255,255,1)', 'rgba(0,0,0,1)']);
    // Reconstruct the dark module set from the rectangles and compare with the matrix.
    const drawn = new Set<string>();
    for (const [x, y, w] of (record?.rects ?? []).slice(1)) {
      for (let i = 0; i < w / 5; i++) drawn.add(`${String(x / 5 - 2 + i)},${String(y / 5 - 2)}`);
    }
    const expected = new Set<string>();
    for (let y = 0; y < matrix.size; y++)
      for (let x = 0; x < matrix.size; x++)
        if (matrix.get(x, y)) expected.add(`${String(x)},${String(y)}`);
    expect(drawn).toEqual(expected);
  });

  it('exports blobs in the requested format from canvas and from bitmap output', async () => {
    const { create } = fakeCanvasFactory();
    const kit = createBrowserKit({ canvas: { createCanvas: create } });
    for (const format of ['png-blob', 'jpeg-blob', 'webp-blob'] as const) {
      const r = await kit.generate({ data: 'blob', format, quality: 0.8 });
      expect(r.value.type).toBe(`image/${format.split('-')[0] ?? ''}`);
      expect(r.mimeType).toBe(r.value.type);
    }
    // bitmap path: pin the built-in bitmap renderer
    const viaBitmap = await kit.generate({
      data: 'blob',
      format: 'png-blob',
      providers: { renderer: 'qrcode-toolkit/bitmap' },
    });
    expect(viaBitmap.value.type).toBe('image/png');
  });

  it('reports formats the browser cannot encode instead of returning a wrong image', async () => {
    const { create } = fakeCanvasFactory(['image/png']);
    const kit = createBrowserKit({ canvas: { createCanvas: create } });
    await expect(kit.generate({ data: 'x', format: 'webp-blob' })).rejects.toBeInstanceOf(
      RuntimeUnavailableError,
    );
  });

  it('supports OffscreenCanvas-style canvases (convertToBlob)', async () => {
    const exporter = createBlobExporter({
      createCanvas: (width, height) => ({
        width,
        height,
        getContext: () => ({ fillStyle: '', fillRect: () => undefined }),
        convertToBlob: ({ type = '' } = {}) => Promise.resolve({ size: 1, type }),
      }),
    });
    const bitmap = {
      kind: 'bitmap' as const,
      width: 2,
      height: 2,
      pixels: Uint8Array.of(1, 0, 0, 1),
      dark: { r: 0, g: 0, b: 0, a: 255 },
      light: { r: 255, g: 255, b: 255, a: 255 },
    };
    const result = await exporter.export(bitmap, 'png-blob', {
      quality: undefined,
      path: undefined,
    });
    expect(result.value).toMatchObject({ type: 'image/png' });
  });
});
