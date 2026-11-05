import {
  createQRCodeKit,
  type GenerateRequest,
  type GenerateResult,
  type QRCodeKit,
  type QRCodeKitConfig,
} from './public/index.js';
import {
  createBrowserProviders,
  downloadResult,
  type CanvasOptions,
  type DownloadOptions,
} from './runtimes/browser/index.js';

export {
  createBlobExporters,
  createCanvasExporter,
  createBrowserProviders,
  createCanvasRenderer,
  downloadFilename,
  downloadResult,
} from './runtimes/browser/index.js';
export type {
  Canvas2DLike,
  CanvasLike,
  CanvasOptions,
  DownloadEnvironment,
  DownloadOptions,
} from './runtimes/browser/index.js';

/** The browser kit adds {@link BrowserKit.download} to the universal kit. */
export interface BrowserKit extends QRCodeKit {
  /**
   * Generate a QR Code and save it as a file in one step. Call it from a click handler.
   * `format` defaults to `'svg'`; `'png-blob'` gives a PNG. Returns the result that was saved.
   */
  download<F extends string = 'svg'>(
    request: GenerateRequest<F> & { readonly filename?: string },
    options?: Pick<DownloadOptions, 'environment'>,
  ): Promise<GenerateResult<F>>;
}

/**
 * A kit with the built-in providers plus the browser ones: a canvas renderer
 * and `png-blob` / `jpeg-blob` / `webp-blob` exporters. Importing this module
 * touches no DOM API; canvases are only created when you generate.
 */
export function createBrowserKit(
  config: QRCodeKitConfig & { readonly canvas?: CanvasOptions } = {},
): BrowserKit {
  const { canvas, ...rest } = config;
  const extra = createBrowserProviders(canvas);
  const kit = createQRCodeKit({
    ...rest,
    providers: {
      ...rest.providers,
      // Runtime providers first: the last registered provider wins, so yours override them.
      renderers: [...extra.renderers, ...(rest.providers?.renderers ?? [])],
      exporters: [...extra.exporters, ...(rest.providers?.exporters ?? [])],
    },
  });
  return {
    describe: () => kit.describe(),
    encode: (request) => kit.encode(request),
    generate: (request) => kit.generate(request),
    generateSync: (request) => kit.generateSync(request),
    generateStructuredAppend: (request) => kit.generateStructuredAppend(request),
    async download(request, options) {
      const { filename, ...rest } = request;
      const result = await kit.generate(rest);
      downloadResult(result, { ...options, ...(filename === undefined ? {} : { filename }) });
      return result;
    },
  };
}
