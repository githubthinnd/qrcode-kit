import type { Diagnostic } from '../contracts/common.js';
import type { EncodeRequest, EncoderProvider } from '../contracts/encoder.js';
import type { ExportedResult, ExporterProvider, FormatValue } from '../contracts/exporter.js';
import type { PluginHooks } from '../contracts/plugin.js';
import type { RenderOptions, RenderedOutput, RendererProvider } from '../contracts/renderer.js';
import type { ProviderResolver } from '../contracts/resolver.js';
import {
  EncodingError,
  ExportError,
  InvalidInputError,
  PluginError,
  RenderingError,
  UnsupportedCapabilityError,
  isQRCodeKitError,
  type QRCodeKitError,
} from '../domain/errors.js';
import { QRMatrix } from '../domain/matrix.js';
import {
  DEFAULT_LIMITS,
  assertKnownSymbolKeys,
  normalizeGenerate,
  normalizeStructuredAppend,
  normalizeSymbol,
  type KitLimits,
  type Prepared,
  type Requirements,
} from './normalize.js';
import type { GenerateRequest, StructuredAppendGenerateRequest, SymbolOptions } from './request.js';

/** The outcome of one generated symbol. */
export interface GenerateResult<F extends string = string> {
  readonly format: F;
  readonly mimeType: string;
  /** The exported value; its type follows `format` for the built-in formats. */
  readonly value: FormatValue<F>;
  /** The symbol, for custom drawing or inspection. */
  readonly matrix: QRMatrix;
  /** Non-fatal observations (never logged by the library). */
  readonly warnings: readonly Diagnostic[];
}

export interface Hooks {
  readonly matrix: readonly ((matrix: QRMatrix) => QRMatrix)[];
  readonly rendered: readonly ((rendered: RenderedOutput) => RenderedOutput)[];
  readonly diagnostics: readonly ((diagnostic: Readonly<Diagnostic>) => void)[];
}

export const NO_HOOKS: Hooks = { matrix: [], rendered: [], diagnostics: [] };

export function sortHooks(
  plugins: readonly { readonly id: string; readonly hooks: readonly PluginHooks[] }[],
): Hooks {
  const all = plugins.flatMap((p) =>
    p.hooks.map((hooks, index) => ({ pluginId: p.id, hooks, index })),
  );
  const ordered = all
    .map((entry, position) => ({ ...entry, position }))
    .sort((a, b) => (a.hooks.order ?? 0) - (b.hooks.order ?? 0) || a.position - b.position);
  const named = <T>(pick: (h: PluginHooks) => T | undefined): { pluginId: string; fn: T }[] =>
    ordered.flatMap((e) => {
      const fn = pick(e.hooks);
      return fn === undefined ? [] : [{ pluginId: e.pluginId, fn }];
    });
  return {
    matrix: named((h) => h.onMatrix?.bind(h)).map(({ pluginId, fn }) =>
      guardHook(pluginId, 'onMatrix', fn),
    ),
    rendered: named((h) => h.onRendered?.bind(h)).map(({ pluginId, fn }) =>
      guardHook(pluginId, 'onRendered', fn),
    ),
    diagnostics: named((h) => h.onDiagnostic?.bind(h)).map(({ pluginId, fn }) =>
      guardHook(pluginId, 'onDiagnostic', fn),
    ),
  };
}

function guardHook<A extends unknown[], R>(
  pluginId: string,
  name: string,
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args) => {
    try {
      return fn(...args);
    } catch (cause) {
      if (isQRCodeKitError(cause) && cause.code === 'PLUGIN_FAILED') throw cause;
      throw new PluginError(`Plugin "${pluginId}" failed in ${name}.`, {
        cause,
        details: { plugin: pluginId, hook: name },
      });
    }
  };
}

const isPromise = (value: unknown): value is Promise<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

/** Warn when a raster came out smaller than the requested `size` (whole pixels per module). */
function sizeDiagnostics(
  requested: number | undefined,
  rendered: RenderedOutput,
): readonly Diagnostic[] {
  if (requested === undefined || (rendered.kind !== 'bitmap' && rendered.kind !== 'canvas')) {
    return [];
  }
  if (rendered.width === requested) return [];
  return [
    {
      code: 'SIZE_ROUNDED',
      message: `The image is ${String(rendered.width)} px wide instead of the requested ${String(requested)} px: raster output uses a whole number of pixels per module so modules stay sharp. Use "scale" for exact control, or SVG for any size.`,
    },
  ];
}

function wrap<T>(fn: () => T, make: (cause: unknown) => QRCodeKitError): T {
  try {
    return fn();
  } catch (error) {
    if (isQRCodeKitError(error)) throw error;
    throw make(error);
  }
}

async function wrapAsync<T>(
  fn: () => T | Promise<T>,
  make: (cause: unknown) => QRCodeKitError,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isQRCodeKitError(error)) throw error;
    throw make(error);
  }
}

function encoderGaps(needs: Requirements['encoder'], encoder: EncoderProvider): string[] {
  const c = encoder.capabilities;
  const gaps: string[] = [];
  const checks: Record<Requirements['encoder'][number], boolean> = {
    eci: c.eci,
    kanji: c.modes.includes('kanji'),
    fnc1: c.fnc1,
    maskControl: c.maskControl,
    boostEcc: c.boostEcc,
    'iso-8859-1': c.charsets.includes('iso-8859-1'),
    structuredAppend: c.structuredAppend && typeof encoder.encodeStructuredAppend === 'function',
  };
  for (const need of needs) {
    if (!checks[need]) gaps.push(`encoder "${encoder.id}" does not support ${need}`);
  }
  return gaps;
}

function missing(
  requirements: Requirements,
  encoder: EncoderProvider,
  renderer: RendererProvider,
  exporter: ExporterProvider,
): string[] {
  const gaps = encoderGaps(requirements.encoder, encoder);
  if (requirements.transparency && !renderer.capabilities.transparency) {
    gaps.push(`renderer "${renderer.id}" does not support transparent colours`);
  }
  if (requirements.colors && !renderer.capabilities.colors) {
    gaps.push(`renderer "${renderer.id}" does not support custom colours`);
  }
  if (requirements.transparency && exporter.capabilities.alpha === false) {
    gaps.push(
      `exporter "${exporter.id}" has no alpha channel, so transparent colours are not possible (use an opaque colour or another format)`,
    );
  }
  const shapes = renderer.capabilities.moduleShapes;
  if (requirements.shape !== 'square' && !shapes.includes(requirements.shape)) {
    gaps.push(`renderer "${renderer.id}" cannot draw "${requirements.shape}" modules`);
  }
  if (requirements.gradient && !renderer.capabilities.gradients) {
    gaps.push(`renderer "${renderer.id}" does not support gradients`);
  }
  if (requirements.logo && !renderer.capabilities.logo) {
    gaps.push(`renderer "${renderer.id}" does not support a logo`);
  }
  if (requirements.quality && !exporter.capabilities.quality) {
    gaps.push(`exporter "${exporter.id}" does not support the "quality" option`);
  }
  if (requirements.path && !exporter.capabilities.requiresPath) {
    gaps.push(
      `exporter "${exporter.id}" does not write files, so the "path" option is not applicable`,
    );
  }
  return gaps;
}

/** Request for `encode`: the symbol part of a request, plus an optional encoder choice. */
export type EncodeOnlyRequest = SymbolOptions & {
  readonly data: GenerateRequest['data'];
  readonly providers?: { readonly encoder?: string };
};

export interface Generator {
  encode(request: EncodeOnlyRequest): QRMatrix;
  generate<F extends string = 'svg'>(request: GenerateRequest<F>): Promise<GenerateResult<F>>;
  generateSync<F extends string = 'svg'>(request: GenerateRequest<F>): GenerateResult<F>;
  generateStructuredAppend<F extends string = 'svg'>(
    request: StructuredAppendGenerateRequest<F>,
  ): Promise<GenerateResult<F>[]>;
}

export interface GeneratorDeps {
  readonly resolver: ProviderResolver;
  readonly hooks?: Hooks | undefined;
  readonly limits?: Partial<KitLimits> | undefined;
  readonly onDiagnostic?: ((diagnostic: Readonly<Diagnostic>) => void) | undefined;
}

/** Create the use cases over a provider resolver. */
export function createGenerator(deps: GeneratorDeps): Generator {
  const { resolver } = deps;
  const hooks = deps.hooks ?? NO_HOOKS;
  const limits: KitLimits = { ...DEFAULT_LIMITS, ...deps.limits };

  const emit = (warnings: readonly Diagnostic[]): void => {
    for (const diagnostic of warnings) {
      for (const observer of hooks.diagnostics) observer(diagnostic);
      deps.onDiagnostic?.(diagnostic);
    }
  };

  const select = (
    prepared: Prepared<unknown>,
  ): { encoder: EncoderProvider; renderer: RendererProvider; exporter: ExporterProvider } => {
    const encoder = resolver.resolveEncoder(prepared.output.providers.encoder);
    const route = resolver.resolveRoute(prepared.output.format, {
      renderer: prepared.output.providers.renderer,
      exporter: prepared.output.providers.exporter,
    });
    const gaps = missing(prepared.requirements, encoder, route.renderer, route.exporter);
    if (gaps.length > 0) {
      throw new UnsupportedCapabilityError(`This request cannot be served: ${gaps.join('; ')}.`, {
        details: { format: prepared.output.format, missing: gaps.length },
      });
    }
    if (
      prepared.requirements.path !== route.exporter.capabilities.requiresPath &&
      route.exporter.capabilities.requiresPath
    ) {
      throw new UnsupportedCapabilityError(
        `Exporter "${route.exporter.id}" needs the "path" option.`,
      );
    }
    return { encoder, ...route };
  };

  const renderOptions = (prepared: Prepared<unknown>): RenderOptions => ({
    ...prepared.appearance,
    maxPixels: limits.maxPixels,
  });

  const applyMatrixHooks = (matrix: QRMatrix): QRMatrix => {
    let current = matrix;
    for (const hook of hooks.matrix) {
      const next = hook(current);
      if (isPromise(next)) {
        throw new PluginError('A plugin hook returned a promise; hooks must be synchronous.');
      }
      if (
        !(next instanceof QRMatrix) ||
        next.size !== matrix.size ||
        next.version !== matrix.version
      ) {
        throw new PluginError(
          'A plugin returned an invalid matrix (it must be a QRMatrix of the same version).',
        );
      }
      current = next;
    }
    return current;
  };

  const applyRenderedHooks = (rendered: RenderedOutput): RenderedOutput => {
    let current = rendered;
    for (const hook of hooks.rendered) {
      const next = hook(current);
      if (isPromise(next)) {
        throw new PluginError('A plugin hook returned a promise; hooks must be synchronous.');
      }
      if (next.kind !== rendered.kind)
        throw new PluginError('A plugin changed the kind of the rendered output.');
      current = next;
    }
    return current;
  };

  const finish = <F extends string>(
    exported: ExportedResult,
    matrix: QRMatrix,
    warnings: readonly Diagnostic[],
  ): GenerateResult<F> => ({
    format: exported.format as F,
    mimeType: exported.mimeType,
    value: exported.value as FormatValue<F>,
    matrix,
    warnings,
  });

  const requireSync = (
    providers: { readonly id: string; readonly capabilities: { readonly sync: boolean } }[],
  ): void => {
    const asyncOnes = providers.filter((p) => !p.capabilities.sync).map((p) => p.id);
    if (asyncOnes.length > 0) {
      throw new UnsupportedCapabilityError(
        `generateSync() needs synchronous providers, but ${asyncOnes.map((id) => `"${id}"`).join(', ')} may be asynchronous. Use generate().`,
        { details: { providers: asyncOnes.join(', ') } },
      );
    }
  };
  const noPromise = <T>(
    value: T | Promise<T>,
    id: string,
    make: (cause: unknown) => QRCodeKitError,
  ): T => {
    if (isPromise(value))
      throw make(new Error(`Provider "${id}" declared sync: true but returned a promise.`));
    return value;
  };

  const encodeOne = (prepared: Prepared<EncodeRequest>, encoder: EncoderProvider): QRMatrix =>
    wrap(
      () =>
        noPromise(
          encoder.encode(prepared.encode),
          encoder.id,
          (cause) => new EncodingError('The encoder failed.', { cause }),
        ),
      (cause) =>
        new EncodingError('The encoder failed.', { cause, details: { provider: encoder.id } }),
    );

  return {
    encode(request) {
      if (typeof request !== 'object' || (request as unknown) === null)
        throw new InvalidInputError('The request must be an object with a "data" property.');
      assertKnownSymbolKeys(request);
      const symbol = normalizeSymbol(request, limits);
      const encoder = resolver.resolveEncoder(request.providers?.encoder);
      requireSync([encoder]);
      const gaps = encoderGaps(symbol.needs, encoder);
      if (gaps.length > 0)
        throw new UnsupportedCapabilityError(`This request cannot be served: ${gaps.join('; ')}.`);
      return applyMatrixHooks(
        encodeOne({ encode: symbol.request } as Prepared<EncodeRequest>, encoder),
      );
    },

    async generate(request) {
      const prepared = normalizeGenerate(request, limits);
      const { encoder, renderer, exporter } = select(prepared);
      const matrix = applyMatrixHooks(
        await wrapAsync(
          () => encoder.encode(prepared.encode),
          (cause) =>
            new EncodingError('The encoder failed.', { cause, details: { provider: encoder.id } }),
        ),
      );
      const rendered = applyRenderedHooks(
        await wrapAsync(
          () => renderer.render(matrix, renderOptions(prepared)),
          (cause) =>
            new RenderingError('The renderer failed.', {
              cause,
              details: { provider: renderer.id },
            }),
        ),
      );
      const exported = await wrapAsync(
        () =>
          exporter.export(rendered, prepared.output.format, {
            quality: prepared.output.quality,
            path: prepared.output.path,
          }),
        (cause) =>
          new ExportError('The exporter failed.', {
            cause,
            details: { provider: exporter.id, format: prepared.output.format },
          }),
      );
      const warnings = [
        ...prepared.warnings,
        ...sizeDiagnostics(prepared.appearance.size, rendered),
      ];
      emit(warnings);
      return finish(exported, matrix, warnings);
    },

    generateSync(request) {
      const prepared = normalizeGenerate(request, limits);
      const { encoder, renderer, exporter } = select(prepared);
      requireSync([encoder, renderer, exporter]);
      const matrix = applyMatrixHooks(encodeOne(prepared, encoder));
      const rendered = applyRenderedHooks(
        wrap(
          () =>
            noPromise(
              renderer.render(matrix, renderOptions(prepared)),
              renderer.id,
              (cause) => new RenderingError('The renderer failed.', { cause }),
            ),
          (cause) =>
            new RenderingError('The renderer failed.', {
              cause,
              details: { provider: renderer.id },
            }),
        ),
      );
      const exported = wrap(
        () =>
          noPromise(
            exporter.export(rendered, prepared.output.format, {
              quality: prepared.output.quality,
              path: prepared.output.path,
            }),
            exporter.id,
            (cause) => new ExportError('The exporter failed.', { cause }),
          ),
        (cause) =>
          new ExportError('The exporter failed.', {
            cause,
            details: { provider: exporter.id, format: prepared.output.format },
          }),
      );
      const warnings = [
        ...prepared.warnings,
        ...sizeDiagnostics(prepared.appearance.size, rendered),
      ];
      emit(warnings);
      return finish(exported, matrix, warnings);
    },

    async generateStructuredAppend(request) {
      const prepared = normalizeStructuredAppend(request, limits);
      const { encoder, renderer, exporter } = select(prepared);
      const encodeSequence = encoder.encodeStructuredAppend?.bind(encoder);
      if (encodeSequence === undefined) {
        throw new UnsupportedCapabilityError(
          `Encoder "${encoder.id}" does not support structured append.`,
        );
      }
      const matrices = await wrapAsync(
        () => encodeSequence(prepared.encode),
        (cause) =>
          new EncodingError('The encoder failed.', { cause, details: { provider: encoder.id } }),
      );
      const results: GenerateResult<never>[] = [];
      const sizeWarnings: Diagnostic[] = [];
      for (const original of matrices) {
        const matrix = applyMatrixHooks(original);
        const rendered = applyRenderedHooks(
          await wrapAsync(
            () => renderer.render(matrix, renderOptions(prepared)),
            (cause) =>
              new RenderingError('The renderer failed.', {
                cause,
                details: { provider: renderer.id },
              }),
          ),
        );
        const exported = await wrapAsync(
          () =>
            exporter.export(rendered, prepared.output.format, {
              quality: prepared.output.quality,
              path: prepared.output.path,
            }),
          (cause) =>
            new ExportError('The exporter failed.', {
              cause,
              details: { provider: exporter.id, format: prepared.output.format },
            }),
        );
        const sizing = sizeDiagnostics(prepared.appearance.size, rendered);
        sizeWarnings.push(...sizing);
        results.push(finish(exported, matrix, [...prepared.warnings, ...sizing]));
      }
      emit([...prepared.warnings, ...sizeWarnings]);
      return results;
    },
  };
}
