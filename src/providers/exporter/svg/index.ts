import { PROVIDER_API_VERSION } from '../../../contracts/common.js';
import type { ExportedResult, ExporterProvider } from '../../../contracts/exporter.js';
import type { RenderedOutput } from '../../../contracts/renderer.js';
import { ExportError } from '../../../domain/errors.js';
import { percentEncode } from '../../../formats/base64.js';

export const SVG_EXPORTER_ID = 'qrcode-toolkit/export-svg';

/** Exports SVG markup as a string (`svg`) or a data URL (`svg-data-url`). */
export function createSvgExporter(): ExporterProvider {
  return {
    id: SVG_EXPORTER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      accepts: ['svg'],
      formats: ['svg', 'svg-data-url'],
      runtimes: ['universal'],
      requiresPath: false,
      quality: false,
      sync: true,
    },
    export(rendered: RenderedOutput, format: string): ExportedResult {
      if (rendered.kind !== 'svg')
        throw new ExportError(`The SVG exporter cannot export "${rendered.kind}" output.`);
      if (format === 'svg') return { format, mimeType: 'image/svg+xml', value: rendered.markup };
      return {
        format,
        mimeType: 'image/svg+xml',
        value: `data:image/svg+xml;charset=utf-8,${percentEncode(rendered.markup)}`,
      };
    },
  };
}
