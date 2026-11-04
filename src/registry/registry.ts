import type { EncoderProvider } from '../contracts/encoder.js';
import type { ExporterProvider } from '../contracts/exporter.js';
import { PROVIDER_API_VERSION } from '../contracts/common.js';
import type { RendererProvider } from '../contracts/renderer.js';
import type { ProviderResolver, Route, RouteOverrides } from '../contracts/resolver.js';
import {
  InvalidConfigurationError,
  ProviderConflictError,
  ProviderNotFoundError,
  UnsupportedCapabilityError,
} from '../domain/errors.js';

export interface RegistryConfig {
  readonly encoders: readonly EncoderProvider[];
  readonly renderers: readonly RendererProvider[];
  readonly exporters: readonly ExporterProvider[];
  /** Encoder id used when none is requested. Default: the last registered encoder. */
  readonly defaultEncoder?: string | undefined;
  /** Per-format provider choice, applied after per-operation overrides. */
  readonly routes?: Readonly<Record<string, RouteOverrides>> | undefined;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;

/** Description of a registered provider, for inspection. */
export interface ProviderSummary {
  readonly id: string;
  readonly kind: 'encoder' | 'renderer' | 'exporter';
}

export interface ProviderRegistry extends ProviderResolver {
  /** Every registered provider, in registration order. */
  list(): readonly ProviderSummary[];
}

function validateProvider(kind: string, provider: unknown): void {
  const candidate = provider as {
    id?: unknown;
    apiVersion?: unknown;
    capabilities?: unknown;
  } | null;
  if (typeof candidate !== 'object' || candidate === null) {
    throw new InvalidConfigurationError(`A ${kind} provider must be an object.`);
  }
  if (typeof candidate.id !== 'string' || !ID_PATTERN.test(candidate.id)) {
    throw new InvalidConfigurationError(
      `A ${kind} provider needs an id made of letters, digits, ".", "_", "-" and "/" separators.`,
    );
  }
  if (candidate.apiVersion !== PROVIDER_API_VERSION) {
    throw new InvalidConfigurationError(
      `${kind} provider "${candidate.id}" implements provider API version ${String(candidate.apiVersion)}, but this version of qrcode-toolkit supports version ${String(PROVIDER_API_VERSION)}.`,
      { details: { provider: candidate.id } },
    );
  }
  if (typeof candidate.capabilities !== 'object' || candidate.capabilities === null) {
    throw new InvalidConfigurationError(`${kind} provider "${candidate.id}" has no capabilities.`);
  }
}

/**
 * Builds an immutable, instance-scoped registry. Every inconsistency (duplicate
 * ids, unknown ids, incompatible routes) is reported here, at kit creation.
 */
export function createProviderRegistry(config: RegistryConfig): ProviderRegistry {
  const encoders = [...config.encoders];
  const renderers = [...config.renderers];
  const exporters = [...config.exporters];
  const summaries: ProviderSummary[] = [];
  const seen = new Set<string>();

  const register = (kind: ProviderSummary['kind'], provider: { readonly id: string }): void => {
    validateProvider(kind, provider);
    if (seen.has(provider.id)) {
      throw new ProviderConflictError(
        `A provider with the id "${provider.id}" is already registered.`,
        {
          details: { provider: provider.id },
        },
      );
    }
    seen.add(provider.id);
    summaries.push({ id: provider.id, kind });
  };
  encoders.forEach((p) => {
    register('encoder', p);
  });
  renderers.forEach((p) => {
    register('renderer', p);
  });
  exporters.forEach((p) => {
    register('exporter', p);
  });

  if (encoders.length === 0)
    throw new InvalidConfigurationError('A kit needs at least one encoder provider.');

  for (const exporter of exporters) {
    if (!renderers.some((r) => exporter.capabilities.accepts.includes(r.capabilities.produces))) {
      throw new InvalidConfigurationError(
        `Exporter "${exporter.id}" accepts ${exporter.capabilities.accepts.join(', ')} but no registered renderer produces any of them.`,
        { details: { provider: exporter.id } },
      );
    }
  }

  const byId = <T extends { readonly id: string }>(
    list: readonly T[],
    id: string,
    kind: string,
  ): T => {
    const found = list.find((p) => p.id === id);
    if (found === undefined) {
      throw new ProviderNotFoundError(`No ${kind} provider with the id "${id}" is registered.`, {
        details: { provider: id, available: list.map((p) => p.id).join(', ') },
      });
    }
    return found;
  };

  const formats = [...new Set(exporters.flatMap((e) => e.capabilities.formats))];

  const resolveEncoder = (id?: string): EncoderProvider => {
    if (id !== undefined) return byId(encoders, id, 'encoder');
    if (config.defaultEncoder !== undefined)
      return byId(encoders, config.defaultEncoder, 'encoder');
    return encoders[encoders.length - 1];
  };

  const pickExporter = (format: string, id: string | undefined): ExporterProvider => {
    if (id !== undefined) {
      const exporter = byId(exporters, id, 'exporter');
      if (!exporter.capabilities.formats.includes(format)) {
        throw new UnsupportedCapabilityError(
          `Exporter "${id}" cannot produce the format "${format}" (it produces: ${exporter.capabilities.formats.join(', ')}).`,
          { details: { provider: id, format } },
        );
      }
      return exporter;
    }
    for (let i = exporters.length - 1; i >= 0; i--) {
      const exporter = exporters[i];
      if (exporter.capabilities.formats.includes(format)) return exporter;
    }
    throw new UnsupportedCapabilityError(
      `No registered exporter produces the format "${format}". Available formats: ${formats.join(', ')}.`,
      { details: { format } },
    );
  };

  const pickRenderer = (exporter: ExporterProvider, id: string | undefined): RendererProvider => {
    if (id !== undefined) {
      const renderer = byId(renderers, id, 'renderer');
      if (!exporter.capabilities.accepts.includes(renderer.capabilities.produces)) {
        throw new UnsupportedCapabilityError(
          `Exporter "${exporter.id}" cannot use the output of renderer "${id}" (${renderer.capabilities.produces}); it accepts ${exporter.capabilities.accepts.join(', ')}.`,
          { details: { renderer: id, exporter: exporter.id } },
        );
      }
      return renderer;
    }
    for (let i = renderers.length - 1; i >= 0; i--) {
      const renderer = renderers[i];
      if (exporter.capabilities.accepts.includes(renderer.capabilities.produces)) return renderer;
    }
    throw new UnsupportedCapabilityError(
      `No renderer is compatible with exporter "${exporter.id}".`,
    );
  };

  const resolveRoute = (format: string, overrides?: RouteOverrides): Route => {
    const configured = config.routes?.[format];
    const exporter = pickExporter(format, overrides?.exporter ?? configured?.exporter);
    const renderer = pickRenderer(exporter, overrides?.renderer ?? configured?.renderer);
    return { renderer, exporter };
  };

  // Validate configured routes now rather than on first use.
  if (config.defaultEncoder !== undefined) resolveEncoder();
  for (const format of Object.keys(config.routes ?? {})) resolveRoute(format);

  return Object.freeze({
    resolveEncoder,
    resolveRoute,
    formats: (): readonly string[] => formats,
    list: (): readonly ProviderSummary[] => summaries.map((s) => ({ ...s })),
  });
}
