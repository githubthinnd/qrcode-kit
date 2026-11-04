import { PROVIDER_API_VERSION } from '../../../contracts/common.js';
import type { ExportedResult, ExporterProvider } from '../../../contracts/exporter.js';
import type { RenderedOutput } from '../../../contracts/renderer.js';
import { ExportError } from '../../../domain/errors.js';

export const TEXT_EXPORTER_ID = 'qrcode-toolkit/export-text';

/** Exports terminal text as a string. */
export function createTextExporter(): ExporterProvider {
  return {
    id: TEXT_EXPORTER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      accepts: ['text'],
      formats: ['text'],
      runtimes: ['universal'],
      requiresPath: false,
      quality: false,
      sync: true,
    },
    export(rendered: RenderedOutput, format: string): ExportedResult {
      if (rendered.kind !== 'text')
        throw new ExportError(`The text exporter cannot export "${rendered.kind}" output.`);
      return { format, mimeType: 'text/plain;charset=utf-8', value: rendered.text };
    },
  };
}
