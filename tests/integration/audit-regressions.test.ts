/**
 * Regression tests for the findings of the 2026-11-05 review.
 * Each describe block is named after the audit item it locks down.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrowserKit, type CanvasLike } from '../../src/browser.js';
import { createNodeKit } from '../../src/node.js';
import {
  createQRCodeKit,
  segment,
  type ExporterProvider,
  type Plugin,
  type QRMatrix,
} from '../../src/index.js';

const blobCanvas = (width: number, height: number): CanvasLike => ({
  width,
  height,
  getContext: () => ({ fillStyle: '', fillRect: () => undefined }),
  toBlob: (cb, type) => {
    cb({ size: 1, type: type ?? '' });
  },
});

const customExporter = (format: string, id: string): ExporterProvider => ({
  id,
  apiVersion: 1,
  capabilities: {
    accepts: ['bitmap', 'canvas'],
    formats: [format],
    runtimes: ['node', 'browser'],
    requiresPath: false,
    quality: false,
    sync: true,
  },
  export: () => ({ format, mimeType: 'application/x-mine', value: 'mine' }),
});

describe('audit 1: caller providers override runtime providers', () => {
  it('a custom png-buffer exporter beats the Node.js one', async () => {
    const kit = createNodeKit({
      providers: { exporters: [customExporter('png-buffer', 'test/my-png-buffer')] },
    });
    const r = await kit.generate({ data: 'x', format: 'png-buffer' });
    expect(r.mimeType).toBe('application/x-mine');
  });

  it('a custom png-blob exporter beats the browser one', async () => {
    const kit = createBrowserKit({
      canvas: { createCanvas: blobCanvas },
      providers: { exporters: [customExporter('png-blob', 'test/my-png-blob')] },
    });
    const r = await kit.generate({ data: 'x', format: 'png-blob' });
    expect(r.mimeType).toBe('application/x-mine');
  });

  it('runtime formats still work when nothing overrides them', async () => {
    const r = await createNodeKit().generate({ data: 'x', format: 'png-buffer' });
    expect(r.mimeType).toBe('image/png');
  });
});

describe('audit 2: size is rounded down, and says so', () => {
  it('raster output reports SIZE_ROUNDED with the real width', async () => {
    const kit = createNodeKit();
    const seen: string[] = [];
    const r = await createNodeKit({ onDiagnostic: (d) => seen.push(d.code) }).generate({
      data: 'x',
      format: 'png-buffer',
      size: 256,
    });
    const width = PNG.sync.read(Buffer.from(r.value)).width;
    expect(width).toBeLessThan(256);
    expect(r.warnings.map((w) => w.code)).toContain('SIZE_ROUNDED');
    expect(r.warnings.find((w) => w.code === 'SIZE_ROUNDED')?.message).toContain(String(width));
    expect(seen).toContain('SIZE_ROUNDED');
    expect(kit).toBeDefined();
  });

  it('is silent when the size divides evenly, for SVG and for scale', async () => {
    const kit = createNodeKit();
    // version 1 + quiet zone 4 = 29 modules; 29 * 8 = 232
    const exact = await kit.generate({ data: 'x', format: 'png-buffer', size: 232 });
    expect(exact.warnings).toEqual([]);
    expect((await kit.generate({ data: 'x', format: 'svg', size: 250 })).warnings).toEqual([]);
    expect((await kit.generate({ data: 'x', format: 'png-buffer', scale: 5 })).warnings).toEqual(
      [],
    );
  });
});

describe('audit 4: JPEG cannot carry transparency', () => {
  const kit = createBrowserKit({ canvas: { createCanvas: blobCanvas } });
  it.each(['transparent', '#ffffff80'])('rejects light: %s for jpeg-blob', async (light) => {
    await expect(kit.generate({ data: 'x', format: 'jpeg-blob', light })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      message: expect.stringContaining('alpha') as unknown,
    });
  });
  it('still allows transparency for png-blob and webp-blob, and opaque JPEG', async () => {
    await kit.generate({ data: 'x', format: 'png-blob', light: 'transparent' });
    await kit.generate({ data: 'x', format: 'webp-blob', light: 'transparent' });
    await kit.generate({ data: 'x', format: 'jpeg-blob', light: '#ffffff' });
  });
});

describe('audit 5: quality is not silently ignored', () => {
  const kit = createBrowserKit({ canvas: { createCanvas: blobCanvas } });
  it('png-blob rejects quality', async () => {
    await expect(
      kit.generate({ data: 'x', format: 'png-blob', quality: 0.5 }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  });
  it('jpeg-blob and webp-blob accept it', async () => {
    await kit.generate({ data: 'x', format: 'jpeg-blob', quality: 0.5 });
    await kit.generate({ data: 'x', format: 'webp-blob', quality: 0.5 });
  });
});

describe('audit 6 and 7: file writing', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'qtk-audit-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a missing directory is EXPORT_FAILED and keeps the system error as cause', async () => {
    const kit = createNodeKit({ files: { baseDir: dir } });
    const error: unknown = await kit
      .generate({ data: 'x', format: 'png-file', path: 'nope/x.png' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'EXPORT_FAILED' });
    expect((error as { cause?: { code?: string } }).cause?.code).toBe('ENOENT');
  });

  it('refuses to write through a symlink at the final path component', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'qtk-outside-'));
    try {
      symlinkSync(join(outside, 'target.png'), join(dir, 'link.png'));
      const kit = createNodeKit({ files: { baseDir: dir } });
      await expect(
        kit.generate({ data: 'x', format: 'png-file', path: 'link.png' }),
      ).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('writes normal files and overwrites existing ones', async () => {
    mkdirSync(join(dir, 'ok'), { recursive: true });
    const kit = createNodeKit({ files: { baseDir: dir } });
    const a = await kit.generate({ data: 'one', format: 'png-file', path: 'ok/a.png' });
    const b = await kit.generate({ data: 'two', format: 'png-file', path: 'ok/a.png' });
    expect(a.value).toMatchObject({ bytes: expect.any(Number) as unknown });
    expect(b.value).toMatchObject({ path: join(dir, 'ok/a.png') });
  });
});

describe('audit 8: small inconsistencies', () => {
  const kit = createQRCodeKit();

  it('rejects empty segments, like empty data', () => {
    expect(() => kit.encode({ data: [segment.byte(new Uint8Array(0))] })).toThrow(/empty/);
    expect(() => kit.encode({ data: [segment.numeric('')] })).toThrow(/empty/);
    expect(() => kit.encode({ data: [segment.numeric('12'), segment.alphanumeric('')] })).toThrow(
      /Segment 1/,
    );
    expect(kit.encode({ data: [segment.eci(26), segment.byte(Uint8Array.of(65))] })).toBeDefined();
  });

  it('names async hooks instead of reporting an "invalid matrix"', () => {
    const asyncHook: Plugin = {
      id: 'async-hook',
      version: '1.0.0',
      apiVersion: 1,
      setup: (b) => {
        b.addHooks({ onMatrix: ((m: QRMatrix) => Promise.resolve(m)) as never });
      },
    };
    const k = createQRCodeKit({ plugins: [asyncHook] });
    expect(() => k.generateSync({ data: 'x' })).toThrow(/synchronous/);
  });

  it('rejects a null request with a typed error, not a TypeError', () => {
    expect(() => kit.encode(null as never)).toThrow(/object/);
    expect(() => kit.generateSync(null as never)).toThrow(/object/);
  });

  it('maps FNC1 application indicators: digits, letters, raw values', () => {
    const rows = (v: number | string): string =>
      JSON.stringify(kit.encode({ data: '0123', fnc1: { applicationIndicator: v } }).toRows());
    expect(rows('37')).toBe(rows(37));
    expect(rows('A')).toBe(rows(165));
    expect(rows('z')).toBe(rows(222));
    expect(rows('A')).not.toBe(rows(65));
    const indicator = rows;
    expect(() => indicator('abc')).toThrow(/two digits/);
    expect(() => indicator('1')).toThrow(/two digits/);
  });
});
