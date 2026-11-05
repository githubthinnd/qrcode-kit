import { PROVIDER_API_VERSION, type Rgba } from '../../contracts/common.js';
import type { BlobLike, ExportOptions, ExporterProvider } from '../../contracts/exporter.js';
import type {
  BitmapOutput,
  CanvasOutput,
  RenderOptions,
  RenderedOutput,
  RendererProvider,
} from '../../contracts/renderer.js';
import { ExportError, RenderingError, RuntimeUnavailableError } from '../../domain/errors.js';
import type { QRMatrix } from '../../domain/matrix.js';
import { rasterScale } from '../../formats/geometry.js';

declare module '../../contracts/exporter.js' {
  interface FormatValueMap {
    'png-blob': BlobLike;
    'jpeg-blob': BlobLike;
    'webp-blob': BlobLike;
  }
}

/** The part of a 2D canvas context these providers use (structural: no DOM typings needed). */
export interface Canvas2DLike {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** The part of `HTMLCanvasElement` / `OffscreenCanvas` these providers use. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: '2d'): Canvas2DLike | null;
  toBlob?(callback: (blob: BlobLike | null) => void, type?: string, quality?: number): void;
  convertToBlob?(options?: { type?: string; quality?: number }): Promise<BlobLike>;
}

export interface CanvasOptions {
  /**
   * Create a canvas. Default: `document.createElement('canvas')`, else
   * `new OffscreenCanvas()`. Pass your own for custom environments and tests.
   */
  readonly createCanvas?: (width: number, height: number) => CanvasLike;
}

function defaultCreateCanvas(width: number, height: number): CanvasLike {
  const g = globalThis as unknown as {
    document?: { createElement(tag: 'canvas'): CanvasLike };
    OffscreenCanvas?: new (width: number, height: number) => CanvasLike;
  };
  if (g.document !== undefined) {
    const canvas = g.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (g.OffscreenCanvas !== undefined) return new g.OffscreenCanvas(width, height);
  throw new RuntimeUnavailableError(
    'No canvas is available in this runtime (neither document nor OffscreenCanvas). Run this in a browser or pass createCanvas.',
  );
}

const css = ({ r, g, b, a }: Rgba): string =>
  `rgba(${String(r)},${String(g)},${String(b)},${String(Math.round((a / 255) * 1000) / 1000)})`;

function context(canvas: CanvasLike): Canvas2DLike {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new RuntimeUnavailableError('The canvas has no 2D drawing context.');
  return ctx;
}

/** Draw runs of dark pixels row by row; light pixels are only painted when not transparent. */
function paintBitmap(canvas: CanvasLike, bitmap: BitmapOutput): void {
  const ctx = context(canvas);
  if (bitmap.light.a > 0) {
    ctx.fillStyle = css(bitmap.light);
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  }
  if (bitmap.dark.a === 0) return;
  ctx.fillStyle = css(bitmap.dark);
  for (let y = 0; y < bitmap.height; y++) {
    let x = 0;
    while (x < bitmap.width) {
      if (bitmap.pixels[y * bitmap.width + x] === 0) {
        x++;
        continue;
      }
      let end = x;
      while (end < bitmap.width && bitmap.pixels[y * bitmap.width + end] !== 0) end++;
      ctx.fillRect(x, y, end - x, 1);
      x = end;
    }
  }
}

const DEFAULT_SCALE = 8;

/** Renders onto a canvas (HTMLCanvasElement or OffscreenCanvas) and returns it. */
export function createCanvasRenderer(options: CanvasOptions = {}): RendererProvider {
  const create = options.createCanvas ?? defaultCreateCanvas;
  return {
    id: 'qrcode-toolkit/browser/canvas',
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      produces: 'canvas',
      transparency: true,
      colors: true,
      gradients: false,
      moduleShapes: ['square'],
      logo: false,
      maxPixels: undefined,
      sync: true,
    },
    render(matrix: QRMatrix, render: RenderOptions): CanvasOutput {
      const modules = matrix.size + render.quietZone * 2;
      const scale = rasterScale(modules, render.scale, render.size, DEFAULT_SCALE);
      if (scale === undefined) {
        throw new RenderingError(
          `The requested size is smaller than the ${String(modules)} modules of the symbol.`,
        );
      }
      const edge = modules * scale;
      if (edge * edge > render.maxPixels) {
        throw new RenderingError(
          `The canvas would exceed the limit of ${String(render.maxPixels)} pixels.`,
        );
      }
      const canvas = create(edge, edge);
      canvas.width = edge;
      canvas.height = edge;
      const ctx = context(canvas);
      const dark = render.invert ? render.light : render.dark;
      const light = render.invert ? render.dark : render.light;
      if (light.a > 0) {
        ctx.fillStyle = css(light);
        ctx.fillRect(0, 0, edge, edge);
      }
      if (dark.a > 0) {
        ctx.fillStyle = css(dark);
        for (let y = 0; y < matrix.size; y++) {
          let x = 0;
          while (x < matrix.size) {
            if (!matrix.get(x, y)) {
              x++;
              continue;
            }
            let end = x;
            while (end < matrix.size && matrix.get(end, y)) end++;
            ctx.fillRect(
              (x + render.quietZone) * scale,
              (y + render.quietZone) * scale,
              (end - x) * scale,
              scale,
            );
            x = end;
          }
        }
      }
      return { kind: 'canvas', canvas, width: edge, height: edge };
    },
  };
}

const BLOB_FORMATS = [
  { format: 'png-blob', mimeType: 'image/png', lossy: false },
  { format: 'jpeg-blob', mimeType: 'image/jpeg', lossy: true },
  { format: 'webp-blob', mimeType: 'image/webp', lossy: true },
] as const;

type BlobFormat = (typeof BLOB_FORMATS)[number];

function createBlobExporter(spec: BlobFormat, options: CanvasOptions): ExporterProvider {
  const create = options.createCanvas ?? defaultCreateCanvas;
  const { format, mimeType, lossy } = spec;
  return {
    id: `qrcode-toolkit/browser/blob-${format.slice(0, -'-blob'.length)}`,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      accepts: ['canvas', 'bitmap'],
      formats: [format],
      runtimes: ['browser'],
      requiresPath: false,
      // `quality` only means something to lossy encoders; PNG rejects it instead of ignoring it.
      quality: lossy,
      // JPEG has no alpha channel: transparent colours are rejected, not flattened to black.
      alpha: format !== 'jpeg-blob',
      sync: false,
    },
    async export(rendered: RenderedOutput, _format: string, exportOptions: ExportOptions) {
      let canvas: CanvasLike;
      if (rendered.kind === 'canvas') {
        canvas = rendered.canvas as CanvasLike;
      } else if (rendered.kind === 'bitmap') {
        canvas = create(rendered.width, rendered.height);
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        paintBitmap(canvas, rendered);
      } else {
        throw new ExportError(`The blob exporter cannot export "${rendered.kind}" output.`);
      }
      const quality = exportOptions.quality;
      let blob: BlobLike | null;
      if (typeof canvas.convertToBlob === 'function') {
        blob = await canvas.convertToBlob({
          type: mimeType,
          ...(quality === undefined ? {} : { quality }),
        });
      } else if (typeof canvas.toBlob === 'function') {
        const toBlob = canvas.toBlob.bind(canvas);
        blob = await new Promise<BlobLike | null>((resolve) => {
          toBlob(resolve, mimeType, quality);
        });
      } else {
        throw new RuntimeUnavailableError(
          'This canvas cannot encode images (no toBlob / convertToBlob).',
        );
      }
      if (blob?.type !== mimeType) {
        throw new RuntimeUnavailableError(`This browser cannot encode ${mimeType}.`, {
          details: { requested: mimeType, received: blob?.type ?? 'none' },
        });
      }
      return { format, mimeType, value: blob };
    },
  };
}

/** `png-blob`, `jpeg-blob` and `webp-blob` (one exporter each) via the canvas encoder of the browser. */
export function createBlobExporters(options: CanvasOptions = {}): ExporterProvider[] {
  return BLOB_FORMATS.map((spec) => createBlobExporter(spec, options));
}

/** All browser providers. */
export function createBrowserProviders(options: CanvasOptions = {}): {
  readonly renderers: readonly RendererProvider[];
  readonly exporters: readonly ExporterProvider[];
} {
  return { renderers: [createCanvasRenderer(options)], exporters: createBlobExporters(options) };
}
