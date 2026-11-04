import type { EncoderProvider } from './encoder.js';
import type { ExporterProvider } from './exporter.js';
import type { RendererProvider } from './renderer.js';

export interface RouteOverrides {
  readonly renderer?: string | undefined;
  readonly exporter?: string | undefined;
}

export interface Route {
  readonly renderer: RendererProvider;
  readonly exporter: ExporterProvider;
}

/**
 * The narrow view of a registry that the application layer is given. It can
 * only answer "which providers serve this request", never enumerate or mutate.
 */
export interface ProviderResolver {
  /** Resolve the encoder; `id` is a per-operation override. */
  resolveEncoder(id?: string): EncoderProvider;
  /** Resolve renderer and exporter for a format; ids are per-operation overrides. */
  resolveRoute(format: string, overrides?: RouteOverrides): Route;
  /** Formats this kit can produce. */
  formats(): readonly string[];
}
