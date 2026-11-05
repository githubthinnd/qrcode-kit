import type { MaybePromise, ProviderBase } from './common.js';
import type { RenderedKind, RenderedOutput } from './renderer.js';

export interface ExportOptions {
  /** Lossy formats: 0–1. */
  readonly quality: number | undefined;
  /** File exporters: destination path. */
  readonly path: string | undefined;
}

/**
 * Structural stand-in for the DOM `Blob` so this module compiles without DOM
 * typings. Real `Blob` instances satisfy it.
 */
export interface BlobLike {
  readonly size: number;
  readonly type: string;
}

/** Result of writing a file (Node.js exporters). */
export interface FileResult {
  readonly path: string;
  readonly bytes: number;
}

/**
 * Value type produced for each known format. Open for extension: provider
 * packages add their formats through declaration merging.
 */
export interface FormatValueMap {
  svg: string;
  'svg-data-url': string;
  png: Uint8Array;
  'png-data-url': string;
  text: string;
}

/** A drawing surface returned by browser exporters (an `HTMLCanvasElement` or `OffscreenCanvas`). */
export interface CanvasHandle {
  readonly width: number;
  readonly height: number;
}

export type ExportedValue = string | Uint8Array | BlobLike | FileResult | CanvasHandle;

/** The value type of a format; unknown (custom) formats yield {@link ExportedValue}. */
export type FormatValue<F extends string> = F extends keyof FormatValueMap
  ? FormatValueMap[F]
  : ExportedValue;

export interface ExportedResult {
  readonly format: string;
  readonly mimeType: string;
  readonly value: ExportedValue;
}

export interface ExporterCapabilities {
  /** Rendered kinds this exporter accepts. */
  readonly accepts: readonly RenderedKind[];
  /** Format identifiers it can produce, e.g. `svg`, `png`, `png-data-url`. */
  readonly formats: readonly string[];
  readonly runtimes: readonly ('universal' | 'node' | 'browser')[];
  /** Needs `ExportOptions.path`. */
  readonly requiresPath: boolean;
  /** Honours `ExportOptions.quality`. */
  readonly quality: boolean;
  /**
   * Can represent transparent pixels. Default `true`; declare `false` for
   * formats without an alpha channel (JPEG) so that a request for a
   * transparent colour is rejected instead of producing a wrong image.
   */
  readonly alpha?: boolean;
  readonly sync: boolean;
}

/** Converts a rendered representation into the requested output form. */
export interface ExporterProvider extends ProviderBase<ExporterCapabilities> {
  export(
    rendered: RenderedOutput,
    format: string,
    options: ExportOptions,
  ): MaybePromise<ExportedResult>;
}
