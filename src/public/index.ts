import { createQRCodeKit, type QRCodeKit } from './kit.js';
import type { GenerateResult } from '../application/generate.js';
import type { GenerateRequest } from '../application/request.js';

// The default kit holds no mutable state (providers are stateless, the Kanji
// table is a private memo), so sharing it between calls and between
// concurrent server requests cannot leak configuration.
let defaultKit: QRCodeKit | undefined;
const getDefaultKit = (): QRCodeKit => (defaultKit ??= createQRCodeKit());

/**
 * Generate a QR Code with the default kit.
 *
 * @example
 * const { value } = await createQRCode({ data: 'https://example.com', format: 'svg' });
 */
export function createQRCode<F extends string = 'svg'>(
  request: GenerateRequest<F>,
): Promise<GenerateResult<F>> {
  return getDefaultKit().generate(request);
}

export { createQRCodeKit };
export type { QRCodeKit, QRCodeKitConfig, KitDescription } from './kit.js';
export type { GenerateResult, EncodeOnlyRequest, Generator } from '../application/generate.js';
export type {
  AppearanceOptions,
  GenerateRequest,
  OutputOptions,
  ProviderSelection,
  StructuredAppendGenerateRequest,
  SymbolOptions,
} from '../application/request.js';
export type { KitLimits } from '../application/normalize.js';
export { DEFAULT_LIMITS } from '../application/normalize.js';

export { QRMatrix } from '../domain/matrix.js';
export type { QRMatrixInit } from '../domain/matrix.js';
export { segment } from '../domain/segment.js';
export type {
  AlphanumericSegment,
  ByteSegment,
  EciSegment,
  Fnc1FirstSegment,
  Fnc1SecondSegment,
  KanjiSegment,
  NumericSegment,
  Segment,
} from '../domain/segment.js';
export {
  ERROR_CORRECTION_LEVELS,
  MASK_PATTERNS,
  MAX_VERSION,
  MIN_VERSION,
} from '../domain/model.js';
export type {
  ErrorCorrectionLevel,
  MaskPattern,
  ModuleKind,
  SegmentInfo,
  SegmentMode,
  StructuredAppendInfo,
} from '../domain/model.js';

export {
  EncodingError,
  ExportError,
  InvalidConfigurationError,
  InvalidInputError,
  isQRCodeKitError,
  PluginError,
  ProviderConflictError,
  ProviderNotFoundError,
  QRCodeKitError,
  RenderingError,
  RuntimeUnavailableError,
  UnsupportedCapabilityError,
  UnsupportedDataError,
} from '../domain/errors.js';
export type { ErrorCode, ErrorDetails, ErrorOptions } from '../domain/errors.js';

// Provider contracts (for people writing their own providers and plugins).
export { PROVIDER_API_VERSION } from '../contracts/common.js';
export type { Diagnostic, MaybePromise, ProviderBase, Rgba } from '../contracts/common.js';
export type {
  Charset,
  EncodeInput,
  EncodeRequest,
  EncoderCapabilities,
  EncoderProvider,
  StructuredAppendRequest,
} from '../contracts/encoder.js';
export type {
  BitmapOutput,
  CanvasOutput,
  RenderOptions,
  RenderedKind,
  RenderedOutput,
  RenderedOutputMap,
  RendererCapabilities,
  RendererProvider,
  SvgOutput,
  TextOutput,
} from '../contracts/renderer.js';
export type {
  BlobLike,
  ExportOptions,
  ExportedResult,
  ExportedValue,
  ExporterCapabilities,
  ExporterProvider,
  FileResult,
  FormatValue,
  FormatValueMap,
} from '../contracts/exporter.js';
export type { Plugin, PluginBuilder, PluginHooks } from '../contracts/plugin.js';
export type { Route, RouteOverrides } from '../contracts/resolver.js';

// Built-in providers, for composing custom kits.
export { createBuiltInProviders } from './defaults.js';
export type { BuiltInProviders } from './defaults.js';
export { createDefaultEncoder } from '../providers/encoder/default/index.js';
export type { DefaultEncoderOptions } from '../providers/encoder/default/index.js';
export { createShiftJisKanjiMapper } from '../providers/encoder/default/shift-jis-mapper.js';
export type { KanjiMapper } from '../core/kanji.js';
export { createSvgRenderer } from '../providers/renderer/svg/index.js';
export { createBitmapRenderer } from '../providers/renderer/bitmap/index.js';
export { createTextRenderer } from '../providers/renderer/text/index.js';
export { createSvgExporter } from '../providers/exporter/svg/index.js';
export { createPngExporter } from '../providers/exporter/png/index.js';
export { createTextExporter } from '../providers/exporter/text/index.js';
