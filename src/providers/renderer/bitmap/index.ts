import { PROVIDER_API_VERSION } from '../../../contracts/common.js';
import type { BitmapOutput, RenderOptions, RendererProvider } from '../../../contracts/renderer.js';
import { rasterScale } from '../../../formats/geometry.js';
import { RenderingError } from '../../../domain/errors.js';
import type { QRMatrix } from '../../../domain/matrix.js';

export const BITMAP_RENDERER_ID = 'qrcode-toolkit/bitmap';

const DEFAULT_SCALE = 8;

function buildBitmap(matrix: QRMatrix, options: RenderOptions): BitmapOutput {
  const modules = matrix.size + options.quietZone * 2;
  const scale = rasterScale(modules, options.scale, options.size, DEFAULT_SCALE);
  if (scale === undefined) {
    throw new RenderingError(
      `The requested size of ${String(options.size)} px is smaller than the ${String(modules)} modules of the symbol; at least ${String(modules)} px are needed.`,
      { details: { size: options.size ?? 0, modules } },
    );
  }
  const edge = modules * scale;
  if (edge * edge > options.maxPixels) {
    throw new RenderingError(
      `The image would be ${String(edge)}×${String(edge)} px, which exceeds the limit of ${String(options.maxPixels)} pixels. Lower "scale"/"size" or raise the kit's maxPixels limit.`,
      { details: { edge, maxPixels: options.maxPixels } },
    );
  }

  const pixels = new Uint8Array(edge * edge);
  const row = new Uint8Array(edge);
  for (let my = 0; my < modules; my++) {
    const y = my - options.quietZone;
    for (let mx = 0; mx < modules; mx++) {
      const dark = matrix.get(mx - options.quietZone, y) ? 1 : 0;
      row.fill(dark, mx * scale, (mx + 1) * scale);
    }
    for (let dy = 0; dy < scale; dy++) pixels.set(row, (my * scale + dy) * edge);
  }
  return {
    kind: 'bitmap',
    width: edge,
    height: edge,
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
