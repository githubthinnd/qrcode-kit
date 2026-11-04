import type { QRMatrix } from '../domain/matrix.js';
import type { Diagnostic } from './common.js';
import type { EncoderProvider } from './encoder.js';
import type { ExporterProvider } from './exporter.js';
import type { RenderedOutput, RendererProvider } from './renderer.js';

/**
 * Plugin contract (v1).
 *
 * A plugin is a pure setup function run once while a kit is created. It can
 * contribute providers and register typed transform / observer hooks. It
 * receives no kit internals and no mutable state. Plugins are *not* sandboxed:
 * they run with the full privileges of the host process.
 *
 * Hook rules:
 * - `onMatrix` / `onRendered` may return a replacement value. The replacement
 *   is re-validated (matrix size and version must be unchanged for `onMatrix`;
 *   the rendered kind must be unchanged for `onRendered`).
 * - Hooks run in ascending `order`, then in registration order.
 * - `onDiagnostic` only observes; its return value is ignored.
 * - A hook that throws fails the operation with a `PluginError`.
 */
export interface PluginHooks {
  readonly order?: number;
  onMatrix?(matrix: QRMatrix): QRMatrix;
  onRendered?(rendered: RenderedOutput): RenderedOutput;
  onDiagnostic?(diagnostic: Readonly<Diagnostic>): void;
}

export interface PluginBuilder {
  addEncoder(provider: EncoderProvider): void;
  addRenderer(provider: RendererProvider): void;
  addExporter(provider: ExporterProvider): void;
  addHooks(hooks: PluginHooks): void;
}

export interface Plugin {
  /** Unique within a kit. */
  readonly id: string;
  readonly version: string;
  /** Plugin contract version this plugin was written for. */
  readonly apiVersion: 1;
  setup(builder: PluginBuilder): void;
}
