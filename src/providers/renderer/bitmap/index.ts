import { PROVIDER_API_VERSION } from '../../../contracts/common.js';
import type { BitmapOutput, RenderOptions, RendererProvider } from '../../../contracts/renderer.js';
import { rasterScale } from '../../../formats/geometry.js';
import { RenderingError } from '../../../domain/errors.js';
import type { QRMatrix } from '../../../domain/matrix.js';

export const BITMAP_RENDERER_ID = 'qrcode-toolkit/bitmap';

const DEFAULT_SCALE = 8;

function buildBitmap(matrix: QRMatrix, options: RenderOptions): BitmapOutput {
  // `size` is the width of the image; rMQR symbols are wider than they are tall.
  const modulesX = matrix.width + options.quietZone * 2;
  const modulesY = matrix.height + options.quietZone * 2;
  const scale = rasterScale(modulesX, options.scale, options.size, DEFAULT_SCALE);
  if (scale === undefined) {
    throw new RenderingError(
      `The requested size of ${String(options.size)} px is smaller than the ${String(modulesX)} modules across the symbol; at least ${String(modulesX)} px are needed.`,
      { details: { size: options.size ?? 0, modules: modulesX } },
    );
  }
  const width = modulesX * scale;
  const height = modulesY * scale;
  if (width * height > options.maxPixels) {
    throw new RenderingError(
      `The image would be ${String(width)}×${String(height)} px, which exceeds the limit of ${String(options.maxPixels)} pixels. Lower "scale"/"size" or raise the kit's maxPixels limit.`,
      { details: { width, height, maxPixels: options.maxPixels } },
    );
  }

  const pixels = new Uint8Array(width * height);
  const row = new Uint8Array(width);
  for (let my = 0; my < modulesY; my++) {
    const y = my - options.quietZone;
    for (let mx = 0; mx < modulesX; mx++) {
      const dark = matrix.get(mx - options.quietZone, y) ? 1 : 0;
      row.fill(dark, mx * scale, (mx + 1) * scale);
    }
    for (let dy = 0; dy < scale; dy++) pixels.set(row, (my * scale + dy) * width);
  }
  return {
    kind: 'bitmap',
    width,
    height,
    pixels,
    dark: options.invert ? options.light : options.dark,
    light: options.invert ? options.dark : options.light,
  };
}

/** Renders a matrix as a two-tone raster (one byte per pixel). */
export function createBitmapRenderer(): RendererProvider {
  return {
    id: BITMAP_RENDERER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      produces: 'bitmap',
      transparency: true,
      colors: true,
      gradients: false,
      moduleShapes: ['square'],
      logo: false,
      maxPixels: undefined,
      sync: true,
    },
    render: buildBitmap,
  };
}
