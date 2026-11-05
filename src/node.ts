import { createQRCodeKit, type QRCodeKit, type QRCodeKitConfig } from './public/index.js';
import { createNodeProviders, type FileExporterOptions } from './runtimes/node/index.js';

export {
  createBufferExporters,
  createFileExporters,
  createNodeProviders,
} from './runtimes/node/index.js';
export type { FileExporterOptions } from './runtimes/node/index.js';

/**
 * A kit with the built-in providers plus the Node.js exporters
 * (`png-buffer`, `svg-buffer`, `png-file`, `svg-file`, `text-file`).
 */
export function createNodeKit(
  config: QRCodeKitConfig & { readonly files?: FileExporterOptions } = {},
): QRCodeKit {
  const { files, ...rest } = config;
  return createQRCodeKit({
    ...rest,
    providers: {
      ...rest.providers,
      // Runtime providers first: the last registered provider wins, so yours override them.
      exporters: [...createNodeProviders(files).exporters, ...(rest.providers?.exporters ?? [])],
    },
  });
}
