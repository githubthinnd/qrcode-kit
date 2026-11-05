/**
 * Conformance checks for provider authors.
 *
 * Framework-agnostic: each function runs a fixed set of checks against a
 * provider and returns a report; nothing here depends on a test runner.
 *
 * @example
 * const report = await checkExporterProvider(myExporter);
 * assertConformance(report); // throws listing every failed check
 */
import {
  PROVIDER_API_VERSION,
  QRCodeKitError,
  UnsupportedDataError,
  createBitmapRenderer,
  createDefaultEncoder,
  createSvgRenderer,
  createTextRenderer,
  type EncodeRequest,
  type EncoderProvider,
  type ExporterProvider,
  type QRMatrix,
  type RenderOptions,
  type RenderedKind,
  type RenderedOutput,
  type RendererProvider,
} from '../public/index.js';

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  /** Present when `ok` is false. */
  readonly error?: string;
}

export interface ConformanceReport {
  readonly provider: string;
  readonly kind: 'encoder' | 'renderer' | 'exporter';
  readonly checks: readonly CheckResult[];
  readonly ok: boolean;
}

type Check = readonly [name: string, run: () => unknown];

async function run(
  provider: string,
  kind: ConformanceReport['kind'],
  checks: readonly Check[],
): Promise<ConformanceReport> {
  const results: CheckResult[] = [];
  for (const [name, fn] of checks) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({
        name,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { provider, kind, checks: results, ok: results.every((r) => r.ok) };
}

function ensure(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const isPromise = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

function checkBase(provider: { id: unknown; apiVersion: unknown; capabilities: unknown }): void {
  ensure(
    typeof provider.id === 'string' &&
      /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i.test(provider.id),
    'id must be a non-empty string of letters, digits, ".", "_", "-" and "/" separators',
  );
  ensure(
    provider.apiVersion === PROVIDER_API_VERSION,
    `apiVersion must be ${String(PROVIDER_API_VERSION)}`,
  );
  ensure(
    typeof provider.capabilities === 'object' && provider.capabilities !== null,
    'capabilities must be an object',
  );
}

const rows = (m: QRMatrix): string =>
  m
    .toRows()
    .map((r) => r.map((c) => (c ? '1' : '0')).join(''))
    .join('/');

const sampleRequest = (overrides: Partial<EncodeRequest> = {}): EncodeRequest =>
  Object.freeze({
    input: Object.freeze({
      kind: 'text',
      text: 'https://example.com/conformance',
      charset: 'utf-8',
      eci: false,
      kanji: false,
    }),
    ecc: 'M',
    minVersion: 1,
    maxVersion: 40,
    mask: undefined,
    boostEcc: false,
    fnc1: undefined,
    ...overrides,
  });

/** Run the encoder checks. */
export async function checkEncoderProvider(provider: EncoderProvider): Promise<ConformanceReport> {
  const call = async (request: EncodeRequest): Promise<QRMatrix> => provider.encode(request);
  return run(provider.id, 'encoder', [
    [
      'declares id, apiVersion and capabilities',
      () => {
        checkBase(provider);
      },
    ],
    [
      'returns a QRMatrix with a consistent size and the requested level',
      async () => {
        const m = await call(sampleRequest());
        ensure(m.size === m.version * 4 + 17, 'size must equal version * 4 + 17');
        ensure(
          m.ecc === 'M',
          'the requested error correction level must be used (boostEcc is false)',
        );
      },
    ],
    [
      'is deterministic',
      async () => {
        ensure(
          rows(await call(sampleRequest())) === rows(await call(sampleRequest())),
          'the same request must give the same matrix',
        );
      },
    ],
    [
      'does not modify its request',
      async () => {
        await call(sampleRequest());
      },
    ],
    [
      'honours a fixed version',
      async () => {
        const m = await call(sampleRequest({ minVersion: 7, maxVersion: 7 }));
        ensure(m.version === 7, 'a fixed version range must be respected');
      },
    ],
    [
      'honours a fixed mask when it claims maskControl',
      async () => {
        if (!provider.capabilities.maskControl) return;
        const m = await call(sampleRequest({ mask: 5 }));
        ensure(m.mask === 5, 'maskControl is claimed but the requested mask was not used');
      },
    ],
    [
      'rejects data that cannot fit with UnsupportedDataError',
      async () => {
        const huge = sampleRequest({
          input: { kind: 'bytes', bytes: new Uint8Array(10_000).fill(65), eci: undefined },
        });
        let error: unknown;
        try {
          await call(huge);
        } catch (e) {
          error = e;
        }
        ensure(
          error instanceof UnsupportedDataError,
          'oversized data must raise UnsupportedDataError',
        );
      },
    ],
    [
      'honours the sync claim',
      () => {
        const result = provider.encode(sampleRequest());
        ensure(
          !provider.capabilities.sync || !isPromise(result),
          'sync: true providers must not return a promise',
        );
      },
    ],
    [
      'encodes Unicode text when it claims the utf-8 charset',
      async () => {
        if (!provider.capabilities.charsets.includes('utf-8')) return;
        await call(
          sampleRequest({
            input: {
              kind: 'text',
              text: 'Xin chào Việt Nam ✓',
              charset: 'utf-8',
              eci: false,
              kanji: false,
            },
          }),
        );
      },
    ],
    [
      'supports ECI when it claims it',
      async () => {
        if (!provider.capabilities.eci) return;
        await call(
          sampleRequest({ input: { kind: 'bytes', bytes: Uint8Array.of(1, 2, 3), eci: 26 } }),
        );
      },
    ],
  ]);
}

const sampleMatrix = (): QRMatrix => {
  const result = createDefaultEncoder().encode(sampleRequest());
  if (isPromise(result)) throw new Error('the reference encoder must be synchronous');
  return result as QRMatrix;
};

const renderOptions = (overrides: Partial<RenderOptions> = {}): RenderOptions =>
  Object.freeze({
    quietZone: 4,
    scale: undefined,
    size: undefined,
    dark: { r: 0, g: 0, b: 0, a: 255 },
    light: { r: 255, g: 255, b: 255, a: 255 },
    invert: false,
    moduleShape: 'square',
    gradient: undefined,
    logo: undefined,
    maxPixels: 16_777_216,
    ...overrides,
  });

const same = (a: RenderedOutput, b: RenderedOutput): boolean =>
  JSON.stringify(a, replacer) === JSON.stringify(b, replacer);
const replacer = (_key: string, value: unknown): unknown =>
  value instanceof Uint8Array ? Array.from(value) : value;

/** Run the renderer checks. */
export async function checkRendererProvider(
  provider: RendererProvider,
): Promise<ConformanceReport> {
  const render = async (options: RenderOptions): Promise<RenderedOutput> =>
    provider.render(sampleMatrix(), options);
  return run(provider.id, 'renderer', [
    [
      'declares id, apiVersion and capabilities',
      () => {
        checkBase(provider);
      },
    ],
    [
      'produces the kind it declares',
      async () => {
        const out = await render(renderOptions());
        ensure(
          out.kind === provider.capabilities.produces,
          `declared "${provider.capabilities.produces}" but produced "${out.kind}"`,
        );
      },
    ],
    [
      'is deterministic',
      async () => {
        ensure(
          same(await render(renderOptions()), await render(renderOptions())),
          'the same input must give the same output',
        );
      },
    ],
    [
      'changes the output with the quiet zone',
      async () => {
        ensure(
          !same(
            await render(renderOptions({ quietZone: 0 })),
            await render(renderOptions({ quietZone: 4 })),
          ),
          'quietZone must affect the output',
        );
      },
    ],
    [
      'honours invert',
      async () => {
        // Canvas surfaces are opaque objects, so their pixels cannot be compared here.
        if (provider.capabilities.produces === 'canvas') return;
        if (!provider.capabilities.colors && provider.capabilities.produces !== 'text') return;
        ensure(
          !same(
            await render(renderOptions({ invert: true })),
            await render(renderOptions({ invert: false })),
          ),
          'invert must affect the output',
        );
      },
    ],
    [
      'draws every module shape it claims',
      async () => {
        if (provider.capabilities.produces === 'canvas') return;
        const flat = await render(renderOptions());
        for (const shape of provider.capabilities.moduleShapes) {
          if (shape === 'square') continue;
          ensure(
            !same(await render(renderOptions({ moduleShape: shape })), flat),
            `moduleShape "${shape}" must change the output`,
          );
        }
      },
    ],
    [
      'draws a gradient and a logo when it claims them',
      async () => {
        if (provider.capabilities.produces === 'canvas') return;
        const flat = await render(renderOptions());
        if (provider.capabilities.gradients) {
          const gradient = {
            type: 'linear' as const,
            from: { r: 0, g: 0, b: 0, a: 255 },
            to: { r: 80, g: 0, b: 160, a: 255 },
            angle: 45,
          };
          ensure(
            !same(await render(renderOptions({ gradient })), flat),
            'a gradient must change the output',
          );
        }
        if (provider.capabilities.logo) {
          const logo = { href: 'data:image/png;base64,iVBORw0KGgo=', size: 0.1, margin: 0 };
          ensure(
            !same(await render(renderOptions({ logo })), flat),
            'a logo must change the output',
          );
        }
      },
    ],
    [
      'renders transparency when it claims it',
      async () => {
        if (!provider.capabilities.transparency) return;
        await render(renderOptions({ light: { r: 255, g: 255, b: 255, a: 0 } }));
      },
    ],
    [
      'does not modify its options',
      async () => {
        await render(renderOptions());
      },
    ],
    [
      'honours the sync claim',
      () => {
        const out = provider.render(sampleMatrix(), renderOptions());
        ensure(
          !provider.capabilities.sync || !isPromise(out),
          'sync: true providers must not return a promise',
        );
      },
    ],
  ]);
}

const fixtures: Readonly<Record<string, () => RendererProvider>> = {
  svg: createSvgRenderer,
  bitmap: createBitmapRenderer,
  text: createTextRenderer,
};

/** Run the exporter checks. Rendered kinds that need a runtime (`canvas`) are skipped. */
export async function checkExporterProvider(
  provider: ExporterProvider,
): Promise<ConformanceReport> {
  const kinds = provider.capabilities.accepts.filter((k): k is RenderedKind => k in fixtures);
  const options = { quality: undefined, path: undefined };
  const sample = async (kind: RenderedKind): Promise<RenderedOutput> => {
    const factory = fixtures[kind];
    if (factory === undefined) throw new Error(`no fixture for ${kind}`);
    return factory().render(sampleMatrix(), renderOptions());
  };
  return run(provider.id, 'exporter', [
    [
      'declares id, apiVersion and capabilities',
      () => {
        checkBase(provider);
      },
    ],
    [
      'declares at least one format and accepted kind',
      () => {
        ensure(provider.capabilities.formats.length > 0, 'formats must not be empty');
        ensure(provider.capabilities.accepts.length > 0, 'accepts must not be empty');
      },
    ],
    [
      'exports every declared format for every accepted kind',
      async () => {
        if (provider.capabilities.requiresPath) return; // needs a destination; test it with your own fixture
        for (const kind of kinds) {
          const rendered = await sample(kind);
          for (const format of provider.capabilities.formats) {
            const result = await provider.export(rendered, format, options);
            ensure(
              result.format === format,
              `result.format must echo the requested format "${format}"`,
            );
            ensure(
              typeof result.mimeType === 'string' && result.mimeType.length > 0,
              'mimeType must be a non-empty string',
            );
            ensure(result.value !== undefined && result.value !== null, 'value must be present');
          }
        }
      },
    ],
    [
      'rejects a rendered kind it does not accept with an error',
      async () => {
        const other = (Object.keys(fixtures) as RenderedKind[]).find(
          (k) => !provider.capabilities.accepts.includes(k),
        );
        if (other === undefined) return;
        const rendered = await sample(other);
        let error: unknown;
        try {
          await provider.export(rendered, provider.capabilities.formats[0] ?? '', options);
        } catch (e) {
          error = e;
        }
        ensure(error instanceof Error, 'exporting an unsupported kind must throw');
        ensure(
          error instanceof QRCodeKitError,
          'prefer throwing an ExportError (a QRCodeKitError) so callers get a typed error',
        );
      },
    ],
    [
      'honours the sync claim',
      async () => {
        if (!provider.capabilities.sync || provider.capabilities.requiresPath) return;
        const kind = kinds[0];
        if (kind === undefined) return;
        const result = provider.export(
          await sample(kind),
          provider.capabilities.formats[0] ?? '',
          options,
        );
        ensure(!isPromise(result), 'sync: true providers must not return a promise');
      },
    ],
  ]);
}

/** Throw an error listing every failed check of a report. */
export function assertConformance(report: ConformanceReport): void {
  if (report.ok) return;
  const failed = report.checks.filter((c) => !c.ok);
  throw new Error(
    `${report.kind} provider "${report.provider}" failed ${String(failed.length)} conformance check(s):\n` +
      failed.map((c) => `  - ${c.name}: ${c.error ?? ''}`).join('\n'),
  );
}
