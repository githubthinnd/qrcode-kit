import type { EncoderProvider } from '../contracts/encoder.js';
import type { ExporterProvider } from '../contracts/exporter.js';
import type { RendererProvider } from '../contracts/renderer.js';
import type { KanjiMapper } from '../core/kanji.js';
import { createDefaultEncoder } from '../providers/encoder/default/index.js';
import { createPngExporter } from '../providers/exporter/png/index.js';
import { createSvgExporter } from '../providers/exporter/svg/index.js';
import { createTextExporter } from '../providers/exporter/text/index.js';
import { createBitmapRenderer } from '../providers/renderer/bitmap/index.js';
import { createSvgRenderer } from '../providers/renderer/svg/index.js';
import { createTextRenderer } from '../providers/renderer/text/index.js';

export interface BuiltInProviders {
  readonly encoders: readonly EncoderProvider[];
  readonly renderers: readonly RendererProvider[];
  readonly exporters: readonly ExporterProvider[];
}

/** Fresh instances of every universal built-in provider (no DOM, no Node.js APIs). */
export function createBuiltInProviders(kanji?: KanjiMapper): BuiltInProviders {
  return {
    encoders: [createDefaultEncoder(kanji === undefined ? {} : { kanji })],
    renderers: [createSvgRenderer(), createBitmapRenderer(), createTextRenderer()],
    exporters: [createSvgExporter(), createPngExporter(), createTextExporter()],
  };
}
