import type { Diagnostic } from '../contracts/common.js';
import type { EncoderProvider } from '../contracts/encoder.js';
import type { ExporterProvider } from '../contracts/exporter.js';
import type { Plugin, PluginBuilder, PluginHooks } from '../contracts/plugin.js';
import type { RendererProvider } from '../contracts/renderer.js';
import type { RouteOverrides } from '../contracts/resolver.js';
import {
  createGenerator,
  sortHooks,
  type EncodeOnlyRequest,
  type Generator,
} from '../application/generate.js';
import type { GenerateRequest, StructuredAppendGenerateRequest } from '../application/request.js';
import type { KitLimits } from '../application/normalize.js';
import type { KanjiMapper } from '../core/kanji.js';
import { InvalidConfigurationError, PluginError, isQRCodeKitError } from '../domain/errors.js';
import { createProviderRegistry, type ProviderSummary } from '../registry/registry.js';
import { createBuiltInProviders } from './defaults.js';

export interface QRCodeKitConfig {
  /**
   * Providers added to the built-in ones. When several providers can serve the
   * same format, the one registered last wins; ids must be unique.
   */
  readonly providers?: {
    readonly encoders?: readonly EncoderProvider[];
    readonly renderers?: readonly RendererProvider[];
    readonly exporters?: readonly ExporterProvider[];
  };
  /** Include the built-in encoder, renderers and exporters. Default `true`. */
  readonly builtIns?: boolean;
  /** Encoder id to use by default (otherwise the last registered encoder). */
  readonly defaultEncoder?: string;
  /** Pin the renderer/exporter used for a format. */
  readonly routes?: Readonly<Record<string, RouteOverrides>>;
  /** Experimental: plugins that add providers and hooks. */
  readonly plugins?: readonly Plugin[];
  readonly limits?: Partial<KitLimits>;
  /** Receives every warning. Diagnostics are never logged by the library itself. */
  readonly onDiagnostic?: (diagnostic: Readonly<Diagnostic>) => void;
  /** Shift JIS mapper for the built-in encoder's Kanji mode (default: from `TextDecoder`). */
  readonly kanji?: KanjiMapper;
}

/** What a kit is made of, for inspection and debugging. */
export interface KitDescription {
  readonly providers: readonly ProviderSummary[];
  readonly formats: readonly string[];
  readonly plugins: readonly string[];
}

export interface QRCodeKit extends Generator {
  describe(): KitDescription;
}

function runPlugins(plugins: readonly Plugin[]): {
  encoders: EncoderProvider[];
  renderers: RendererProvider[];
  exporters: ExporterProvider[];
  hooks: { id: string; hooks: PluginHooks[] }[];
} {
  const encoders: EncoderProvider[] = [];
  const renderers: RendererProvider[] = [];
  const exporters: ExporterProvider[] = [];
  const hooks: { id: string; hooks: PluginHooks[] }[] = [];
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (
      typeof plugin.id !== 'string' ||
      plugin.id.length === 0 ||
      typeof plugin.setup !== 'function'
    ) {
      throw new InvalidConfigurationError('A plugin needs an id and a setup function.');
    }
    if (plugin.apiVersion !== 1) {
      throw new InvalidConfigurationError(
        `Plugin "${plugin.id}" targets plugin API version ${String(plugin.apiVersion)}; this version supports 1.`,
      );
    }
    if (ids.has(plugin.id)) {
      throw new InvalidConfigurationError(`Plugin "${plugin.id}" is registered twice.`);
    }
    ids.add(plugin.id);
    const own: PluginHooks[] = [];
    const builder: PluginBuilder = {
      addEncoder: (p) => encoders.push(p),
      addRenderer: (p) => renderers.push(p),
      addExporter: (p) => exporters.push(p),
      addHooks: (h) => own.push(h),
    };
    try {
      plugin.setup(builder);
    } catch (cause) {
      if (isQRCodeKitError(cause)) throw cause;
      throw new PluginError(`Plugin "${plugin.id}" failed during setup.`, {
        cause,
        details: { plugin: plugin.id },
      });
    }
    hooks.push({ id: plugin.id, hooks: own });
  }
  return { encoders, renderers, exporters, hooks };
}

/**
 * Create an isolated kit. Kits share no state: different kits can use
 * different providers in the same process, and concurrent requests cannot
 * affect each other. Configuration is validated here, not on first use.
 */
export function createQRCodeKit(config: QRCodeKitConfig = {}): QRCodeKit {
  const builtIns = config.builtIns === false ? undefined : createBuiltInProviders(config.kanji);
  const fromPlugins = runPlugins(config.plugins ?? []);

  const registry = createProviderRegistry({
    encoders: [
      ...(builtIns?.encoders ?? []),
      ...(config.providers?.encoders ?? []),
      ...fromPlugins.encoders,
    ],
    renderers: [
      ...(builtIns?.renderers ?? []),
      ...(config.providers?.renderers ?? []),
      ...fromPlugins.renderers,
    ],
    exporters: [
      ...(builtIns?.exporters ?? []),
      ...(config.providers?.exporters ?? []),
      ...fromPlugins.exporters,
    ],
    defaultEncoder: config.defaultEncoder,
    routes: config.routes,
  });

  const generator = createGenerator({
    resolver: registry,
    hooks: sortHooks(fromPlugins.hooks),
    limits: config.limits,
    onDiagnostic: config.onDiagnostic,
  });

  const description: KitDescription = Object.freeze({
    providers: Object.freeze(registry.list()),
    formats: Object.freeze([...registry.formats()]),
    plugins: Object.freeze((config.plugins ?? []).map((p) => p.id)),
  });

  const kit: QRCodeKit = {
    encode: (request: EncodeOnlyRequest) => generator.encode(request),
    generate: <F extends string = 'svg'>(request: GenerateRequest<F>) =>
      generator.generate(request),
    generateSync: <F extends string = 'svg'>(request: GenerateRequest<F>) =>
      generator.generateSync(request),
    generateStructuredAppend: <F extends string = 'svg'>(
      request: StructuredAppendGenerateRequest<F>,
    ) => generator.generateStructuredAppend(request),
    describe: (): KitDescription => description,
  };
  return Object.freeze(kit);
}
