import { computed, type Signal } from '@angular/core';
import {
  createQRCodeKit,
  isQRCodeKitError,
  type AppearanceOptions,
  type Diagnostic,
  type QRCodeKit,
  type QRCodeKitError,
  type QRMatrix,
  type SymbolOptions,
} from 'qrcode-toolkit';

/** Every symbol and appearance option of `qrcode-toolkit` (`ecc`, `version`, `dark`, `moduleShape`, `logo`, …). */
export type QRCodeOptions = SymbolOptions & AppearanceOptions;

/** How the image is encoded: a vector SVG (default) or a PNG data URL. */
export type QRCodeImageFormat = 'svg' | 'png';

/** The outcome of generating one QR Code. Exactly one of `src` and `error` is set. */
export interface QRCodeResult {
  /** A data URL, ready for `<img [src]>`. */
  readonly src: string | undefined;
  readonly matrix: QRMatrix | undefined;
  readonly warnings: readonly Diagnostic[];
  /** Why nothing was generated (empty or oversized value, invalid option, …). */
  readonly error: QRCodeKitError | undefined;
}

const sharedKit: QRCodeKit = createQRCodeKit();

/**
 * Errors caused by the content or its size: they become `result.error`. Everything else (a
 * misspelt option, an option the renderer cannot honour, a broken provider) is a programming
 * mistake and is thrown, so it is seen during development instead of rendering nothing.
 */
const RECOVERABLE: ReadonlySet<string> = new Set([
  'INVALID_INPUT',
  'UNSUPPORTED_DATA',
  'ENCODING_FAILED',
  'RENDERING_FAILED',
]);

/**
 * Generate a QR Code synchronously. Content that cannot be encoded (empty, too long, a logo that
 * hides too much) is returned as `error` so a component can render a fallback; programming mistakes
 * (unknown options, unsupported combinations) are thrown.
 */
export function generateQRCode(
  value: string | Uint8Array,
  options: QRCodeOptions & { readonly format?: QRCodeImageFormat } = {},
  kit: QRCodeKit = sharedKit,
): QRCodeResult {
  const { format = 'svg', ...rest } = options;
  try {
    const result = kit.generateSync({
      ...rest,
      data: value,
      format: format === 'png' ? 'png-data-url' : 'svg-data-url',
    });
    return {
      src: result.value,
      matrix: result.matrix,
      warnings: result.warnings,
      error: undefined,
    };
  } catch (error) {
    if (!isQRCodeKitError(error) || !RECOVERABLE.has(error.code)) throw error;
    return { src: undefined, matrix: undefined, warnings: [], error };
  }
}

/**
 * A signal that follows its inputs: pass getters (or signals) for the value and the options.
 *
 * @example
 * readonly qr = qrCode(() => this.url(), () => ({ ecc: 'Q' }));
 * // template: @if (qr().src; as src) { <img [src]="src" alt="Scan me" /> }
 */
export function qrCode(
  value: () => string | Uint8Array,
  options: () => QRCodeOptions & { readonly format?: QRCodeImageFormat } = () => ({}),
  kit?: () => QRCodeKit | undefined,
): Signal<QRCodeResult> {
  return computed(() => generateQRCode(value(), options(), kit?.()));
}
