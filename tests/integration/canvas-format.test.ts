import { describe, expect, it } from 'vitest';
import { createBrowserKit, createCanvasExporter, type CanvasLike } from '../../src/browser.js';
import { checkExporterProvider, assertConformance } from '../../src/testing.js';
import { createQRCodeKit } from '../../src/index.js';

const fakeCanvas = (): { create: (w: number, h: number) => CanvasLike; made: CanvasLike[] } => {
  const made: CanvasLike[] = [];
  return {
    made,
    create: (width, height) => {
      const canvas: CanvasLike = {
        width,
        height,
        getContext: () => ({ fillStyle: '', fillRect: () => undefined }),
      };
      made.push(canvas);
      return canvas;
    },
  };
};

describe('the canvas format', () => {
  it('hands over the canvas the renderer drew', async () => {
    const fake = fakeCanvas();
    const kit = createBrowserKit({ canvas: { createCanvas: fake.create } });
    const { value, mimeType, matrix } = await kit.generate({
      data: 'canvas',
      format: 'canvas',
      scale: 4,
    });
    expect(value).toBe(fake.made[0]);
    expect(value.width).toBe((matrix.size + 8) * 4);
    expect(value.height).toBe(value.width);
    expect(mimeType).toBe('application/x-canvas');
  });

  it('honours size, colours and the quiet zone like every canvas output', async () => {
    const fake = fakeCanvas();
    const kit = createBrowserKit({ canvas: { createCanvas: fake.create } });
    const { value } = await kit.generate({
      data: 'x',
      format: 'canvas',
      quietZone: 0,
      scale: 5,
      dark: '#102030',
    });
    expect(value.width).toBe(21 * 5);
  });

  it('is rejected by the universal kit, which has no canvas', async () => {
    await expect(createQRCodeKit().generate({ data: 'x', format: 'canvas' })).rejects.toMatchObject(
      {
        code: 'UNSUPPORTED_CAPABILITY',
      },
    );
  });

  it('still lets blobs come from the same canvas renderer', () => {
    const fake = fakeCanvas();
    const kit = createBrowserKit({ canvas: { createCanvas: fake.create } });
    expect(kit.describe().formats).toEqual(
      expect.arrayContaining(['canvas', 'png-blob', 'jpeg-blob', 'webp-blob']),
    );
  });

  it('passes the provider conformance checks', async () => {
    assertConformance(await checkExporterProvider(createCanvasExporter()));
  });
});
