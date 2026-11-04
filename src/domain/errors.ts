/**
 * Error model shared by every layer.
 *
 * Rules:
 * - Errors are typed and carry a stable `code`.
 * - The underlying failure is preserved in `cause`.
 * - Messages and `details` describe *what* went wrong (lengths, kinds, ids),
 *   never the user's data (QR payloads can contain secrets).
 */

/** Stable, machine-readable error codes. New codes are a semver-minor change. */
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_DATA'
  | 'INVALID_CONFIGURATION'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_CONFLICT'
  | 'UNSUPPORTED_CAPABILITY'
  | 'ENCODING_FAILED'
  | 'RENDERING_FAILED'
  | 'EXPORT_FAILED'
  | 'RUNTIME_UNAVAILABLE'
  | 'PLUGIN_FAILED';

/** Primitive-only diagnostic context. Never put user payloads in here. */
export type ErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export interface ErrorOptions {
  readonly cause?: unknown;
  readonly details?: ErrorDetails;
}

const BRAND = Symbol.for('qrcode-toolkit.error');

/** Base class of every error thrown by qrcode-toolkit. */
export class QRCodeKitError<C extends ErrorCode = ErrorCode> extends Error {
  readonly code: C;
  readonly details: ErrorDetails;

  constructor(code: C, message: string, options: ErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = Object.freeze({ ...options.details });
    Object.defineProperty(this, BRAND, { value: true });
  }
}

/**
 * Brand-based guard. Works across duplicated copies of the package, where
 * `instanceof` would fail.
 */
export function isQRCodeKitError(value: unknown): value is QRCodeKitError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<Record<symbol, unknown>>)[BRAND] === true
  );
}

/** The input data or an option value is malformed. */
export class InvalidInputError extends QRCodeKitError<'INVALID_INPUT'> {
  constructor(message: string, options?: ErrorOptions) {
    super('INVALID_INPUT', message, options);
  }
}

/** The data is valid but cannot be represented (too long, unencodable characters). */
export class UnsupportedDataError extends QRCodeKitError<'UNSUPPORTED_DATA'> {
  constructor(message: string, options?: ErrorOptions) {
    super('UNSUPPORTED_DATA', message, options);
  }
}

/** Kit or provider configuration is inconsistent. Raised at kit creation where possible. */
export class InvalidConfigurationError extends QRCodeKitError<'INVALID_CONFIGURATION'> {
  constructor(message: string, options?: ErrorOptions) {
    super('INVALID_CONFIGURATION', message, options);
  }
}

/** A requested provider id is not registered. */
export class ProviderNotFoundError extends QRCodeKitError<'PROVIDER_NOT_FOUND'> {
  constructor(message: string, options?: ErrorOptions) {
    super('PROVIDER_NOT_FOUND', message, options);
  }
}

/** Two providers were registered under the same id. */
export class ProviderConflictError extends QRCodeKitError<'PROVIDER_CONFLICT'> {
  constructor(message: string, options?: ErrorOptions) {
    super('PROVIDER_CONFLICT', message, options);
  }
}

/** A requested feature is not supported by the selected provider(s). */
export class UnsupportedCapabilityError extends QRCodeKitError<'UNSUPPORTED_CAPABILITY'> {
  constructor(message: string, options?: ErrorOptions) {
    super('UNSUPPORTED_CAPABILITY', message, options);
  }
}

/** The encoder failed to produce a symbol. */
export class EncodingError extends QRCodeKitError<'ENCODING_FAILED'> {
  constructor(message: string, options?: ErrorOptions) {
    super('ENCODING_FAILED', message, options);
  }
}

/** The renderer failed to produce output. */
export class RenderingError extends QRCodeKitError<'RENDERING_FAILED'> {
  constructor(message: string, options?: ErrorOptions) {
    super('RENDERING_FAILED', message, options);
  }
}

/** The exporter failed to produce the requested format. */
export class ExportError extends QRCodeKitError<'EXPORT_FAILED'> {
  constructor(message: string, options?: ErrorOptions) {
    super('EXPORT_FAILED', message, options);
  }
}

/** A runtime API the operation needs (canvas, Blob, filesystem, ...) is absent. */
export class RuntimeUnavailableError extends QRCodeKitError<'RUNTIME_UNAVAILABLE'> {
  constructor(message: string, options?: ErrorOptions) {
    super('RUNTIME_UNAVAILABLE', message, options);
  }
}

/** A plugin threw or returned an invalid value. */
export class PluginError extends QRCodeKitError<'PLUGIN_FAILED'> {
  constructor(message: string, options?: ErrorOptions) {
    super('PLUGIN_FAILED', message, options);
  }
}
