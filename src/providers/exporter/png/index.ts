import { PROVIDER_API_VERSION } from '../../../contracts/common.js';
import type { ExportedResult, ExporterProvider } from '../../../contracts/exporter.js';
import type { RenderedOutput } from '../../../contracts/renderer.js';
import { ExportError } from '../../../domain/errors.js';
import { toBase64 } from '../../../formats/base64.js';
import { encodeBilevelPng } from '../../../formats/png.js';

export const PNG_EXPORTER_ID = 'qrcode-toolkit/export-png';

/** Exports a bitmap as PNG bytes (`png`) or a data URL (`png-data-url`). Pure JavaScript; no dependencies. */
export function createPngExporter(): ExporterProvider {
  return {
    id: PNG_EXPORTER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      accepts: ['bitmap'],
      formats: ['png', 'png-data-url'],
      runtimes: ['universal'],
      requiresPath: false,
      quality: false,
      sync: true,
    },
    export(rendered: RenderedOutput, format: string): ExportedResult {
      if (rendered.kind !== 'bitmap')
        throw new ExportError(`The PNG exporter cannot export "${rendered.kind}" output.`);
      const bytes = encodeBilevelPng(
        rendered.width,
        rendered.height,
        rendered.pixels,
        rendered.dark,
        rendered.light,
      );
      if (format === 'png') return { format, mimeType: 'image/png', value: bytes };
      return { format, mimeType: 'image/png', value: `data:image/png;base64,${toBase64(bytes)}` };
    },
  };
}
