import { PROVIDER_API_VERSION, type Rgba } from '../../contracts/common.js';
import type {
  BlobLike,
  ExportOptions,
  ExportedResult,
  ExporterProvider,
} from '../../contracts/exporter.js';
import type {
  BitmapOutput,
  CanvasOutput,
  RenderOptions,
  RenderedOutput,
  RendererProvider,
} from '../../contracts/renderer.js';
import {
  ExportError,
  InvalidConfigurationError,
  RenderingError,
  RuntimeUnavailableError,
} from '../../domain/errors.js';
import type { QRMatrix } from '../../domain/matrix.js';
import { rasterScale } from '../../formats/geometry.js';

declare module '../../contracts/exporter.js' {
  interface FormatValueMap {
    'png-blob': BlobLike;
    'jpeg-blob': BlobLike;
    'webp-blob': BlobLike;
    /** The canvas the renderer drew on: an `HTMLCanvasElement` or an `OffscreenCanvas`. */
    canvas: CanvasLike;
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

function checkCanvasOptions(options: CanvasOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new InvalidConfigurationError('The canvas options must be an object.');
  }
  const unknown = Object.keys(options).filter((key) => key !== 'createCanvas');
  if (unknown.length > 0) {
    throw new InvalidConfigurationError(
      `Unknown canvas option${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Options are never ignored silently.`,
    );
  }
  if (options.createCanvas !== undefined && typeof options.createCanvas !== 'function') {
    throw new InvalidConfigurationError('The "createCanvas" option must be a function.');
  }
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
  /** Fill the horizontal runs of pixels whose state equals `wanted` (true = dark). */
  const fillRuns = (wanted: boolean): void => {
    for (let y = 0; y < bitmap.height; y++) {
      const on = (px: number): boolean => (bitmap.pixels[y * bitmap.width + px] !== 0) === wanted;
      let x = 0;
      while (x < bitmap.width) {
        if (!on(x)) {
          x++;
          continue;
        }
        let end = x;
        while (end < bitmap.width && on(end)) end++;
        ctx.fillRect(x, y, end - x, 1);
        x = end;
      }
    }
  };
  if (bitmap.light.a > 0) {
    ctx.fillStyle = css(bitmap.light);
    // Same rule as the canvas renderer: only an opaque dark layer may paint over the background.
    if (bitmap.dark.a === 255) ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    else fillRuns(false);
  }
  if (bitmap.dark.a === 0) return;
  ctx.fillStyle = css(bitmap.dark);
  fillRuns(true);
}

const DEFAULT_SCALE = 8;

/** Renders onto a canvas (HTMLCanvasElement or OffscreenCanvas) and returns it. */
export function createCanvasRenderer(options: CanvasOptions = {}): RendererProvider {
  checkCanvasOptions(options);
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
      const modulesX = matrix.width + render.quietZone * 2;
      const modulesY = matrix.height + render.quietZone * 2;
      const scale = rasterScale(modulesX, render.scale, render.size, DEFAULT_SCALE);
      if (scale === undefined) {
        throw new RenderingError(
          `The requested size is smaller than the ${String(modulesX)} modules across the symbol.`,
        );
      }
      const width = modulesX * scale;
      const height = modulesY * scale;
      if (width * height > render.maxPixels) {
        throw new RenderingError(
          `The canvas would exceed the limit of ${String(render.maxPixels)} pixels.`,
        );
      }
      const canvas = create(width, height);
      canvas.width = width;
      canvas.height = height;
      const ctx = context(canvas);
      const dark = render.invert ? render.light : render.dark;
      const light = render.invert ? render.dark : render.light;
      /** Fill the runs of modules (quiet zone included) whose state equals `wanted`. */
      const fillRuns = (wanted: boolean): void => {
        for (let y = 0; y < modulesY; y++) {
          const on = (px: number): boolean =>
            matrix.get(px - render.quietZone, y - render.quietZone) === wanted;
          let x = 0;
          while (x < modulesX) {
            if (!on(x)) {
              x++;
              continue;
            }
            let end = x;
            while (end < modulesX && on(end)) end++;
            ctx.fillRect(x * scale, y * scale, (end - x) * scale, scale);
            x = end;
          }
        }
      };
      if (light.a > 0) {
        ctx.fillStyle = css(light);
        // An opaque dark layer hides the background, so one rectangle will do; otherwise the light
        // colour is painted only where modules are light, so translucent dark modules stay clear.
        if (dark.a === 255) ctx.fillRect(0, 0, width, height);
        else fillRuns(false);
      }
      if (dark.a > 0) {
        ctx.fillStyle = css(dark);
        fillRuns(true);
      }
      return { kind: 'canvas', canvas, width, height };
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
  checkCanvasOptions(options);
  return BLOB_FORMATS.map((spec) => createBlobExporter(spec, options));
}

/**
 * `canvas`: hands over the canvas the browser renderer drew, so it can be inserted into the page,
 * drawn onto another canvas or encoded in a way these exporters do not offer.
 */
export function createCanvasExporter(): ExporterProvider {
  return {
    id: 'qrcode-toolkit/browser/canvas-export',
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      accepts: ['canvas'],
      formats: ['canvas'],
      runtimes: ['browser'],
      requiresPath: false,
      quality: false,
      alpha: true,
      sync: true,
    },
    export(rendered: RenderedOutput, format: string): ExportedResult {
      if (rendered.kind !== 'canvas') {
        throw new ExportError(`The canvas exporter cannot export "${rendered.kind}" output.`);
      }
      // Not an image type: the value is the live drawing surface itself.
      return { format, mimeType: 'application/x-canvas', value: rendered.canvas as CanvasLike };
    },
  };
}

/** All browser providers. */
export function createBrowserProviders(options: CanvasOptions = {}): {
  readonly renderers: readonly RendererProvider[];
  readonly exporters: readonly ExporterProvider[];
} {
  return {
    renderers: [createCanvasRenderer(options)],
    exporters: [...createBlobExporters(options), createCanvasExporter()],
  };
}

/** The parts of the page a download needs (structural, so the module type-checks without DOM typings). */
export interface DownloadEnvironment {
  readonly document: {
    createElement(tag: 'a'): {
      href: string;
      download: string;
      rel: string;
      style: { display: string };
      click(): void;
      remove(): void;
    };
    readonly body: { append(node: unknown): void };
  };
  readonly URL: {
    createObjectURL(blob: unknown): string;
    revokeObjectURL(url: string): void;
  };
  readonly Blob: new (parts: unknown[], options: { type: string }) => unknown;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
}

export interface DownloadOptions {
  /** File name for the download. Default: `qrcode` plus the extension of the format. */
  readonly filename?: string;
  /** Override the page objects (tests, iframes). Default: the global `document`, `URL` and `Blob`. */
  readonly environment?: DownloadEnvironment;
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/plain': 'txt',
};

/** A safe file name: no folders, no control characters, never empty. */
export function downloadFilename(requested: string | undefined, mimeType: string): string {
  const extension = EXTENSIONS[mimeType.split(';')[0]?.trim() ?? ''];
  if (requested === undefined) return `qrcode${extension === undefined ? '' : `.${extension}`}`;
  if (typeof requested !== 'string' || requested.trim() === '') {
    throw new InvalidConfigurationError('The download file name must be a non-empty string.');
  }

  const leaf = requested.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = leaf.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '_').trim();
  const name = cleaned.replace(/^\.+/, '').slice(0, 120);
  if (name === '')
    throw new InvalidConfigurationError('The download file name has no usable characters.');
  return extension === undefined || name.includes('.') ? name : `${name}.${extension}`;
}

/**
 * Save a generated QR Code through the browser's download mechanism. Works for `svg`, `png`,
 * `text` and the `*-blob` formats; data URLs are used directly. Must run in a user gesture
 * (a click handler) for browsers to allow it. The canvas format cannot be saved: ask for `png-blob`.
 */
export function downloadResult(
  result: { readonly format: string; readonly mimeType: string; readonly value: unknown },
  options: DownloadOptions = {},
): void {
  const env = options.environment ?? (globalThis as unknown as Partial<DownloadEnvironment>);
  if (
    env.document === undefined ||
    env.URL === undefined ||
    env.Blob === undefined ||
    env.setTimeout === undefined
  ) {
    throw new RuntimeUnavailableError('Downloads need a browser page (document, URL and Blob).');
  }
  const { value } = result;
  let href: string;
  let temporary = false;
  if (typeof value === 'string' && result.format.endsWith('data-url')) {
    href = value;
  } else if (typeof value === 'string' || value instanceof Uint8Array) {
    href = env.URL.createObjectURL(new env.Blob([value], { type: result.mimeType }));
    temporary = true;
  } else if (typeof value === 'object' && value !== null && 'size' in value && 'type' in value) {
    href = env.URL.createObjectURL(value);
    temporary = true;
  } else {
    throw new ExportError(
      `The "${result.format}" format cannot be downloaded; use svg, png, text or png-blob.`,
    );
  }
  const filename = downloadFilename(options.filename, result.mimeType);
  const link = env.document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  env.document.body.append(link);
  link.click();
  link.remove();
  if (temporary) {
    const url = href;
    const urls = env.URL;
    env.setTimeout(() => {
      urls.revokeObjectURL(url);
    }, 10_000);
  }
}
