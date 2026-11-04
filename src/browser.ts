import { createQRCodeKit, type QRCodeKit, type QRCodeKitConfig } from './public/index.js';
import { createBrowserProviders, type CanvasOptions } from './runtimes/browser/index.js';

export {
  createBlobExporter,
  createBrowserProviders,
  createCanvasRenderer,
} from './runtimes/browser/index.js';
export type { Canvas2DLike, CanvasLike, CanvasOptions } from './runtimes/browser/index.js';

/**
 * A kit with the built-in providers plus the browser ones: a canvas renderer
 * and `png-blob` / `jpeg-blob` / `webp-blob` exporters. Importing this module
 * touches no DOM API; canvases are only created when you generate.
 */
export function createBrowserKit(
  config: QRCodeKitConfig & { readonly canvas?: CanvasOptions } = {},
): QRCodeKit {
  const { canvas, ...rest } = config;
  const extra = createBrowserProviders(canvas);
  return createQRCodeKit({
    ...rest,
    providers: {
      ...rest.providers,
      renderers: [...(rest.providers?.renderers ?? []), ...extra.renderers],
      exporters: [...(rest.providers?.exporters ?? []), ...extra.exporters],
    },
  });
}
