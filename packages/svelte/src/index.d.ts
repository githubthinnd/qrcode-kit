import type { Component, Snippet } from 'svelte';
import type {
  AppearanceOptions,
  Diagnostic,
  QRCodeKit,
  QRCodeKitError,
  QRMatrix,
  SymbolOptions,
} from 'qrcode-toolkit';

/** Every symbol and appearance option of `qrcode-toolkit`. */
export type QRCodeOptions = SymbolOptions & AppearanceOptions;

/** How the image is encoded: a vector SVG (default) or a PNG data URL. */
export type QRCodeImageFormat = 'svg' | 'png';

/** The outcome of generating one QR Code. Exactly one of `src` and `error` is set. */
export interface QRCodeResult {
  readonly src: string | undefined;
  readonly matrix: QRMatrix | undefined;
  readonly warnings: readonly Diagnostic[];
  readonly error: QRCodeKitError | undefined;
}

export interface QRCodeProps extends QRCodeOptions {
  /** The text or bytes to encode. */
  value: string | Uint8Array;
  /** Rendered width and height in CSS pixels. Default 192. */
  size?: number;
  /** Accessible text for the image. Default "QR code". */
  label?: string;
  format?: QRCodeImageFormat;
  /** Use your own kit (custom providers, limits). */
  kit?: QRCodeKit;
  /** Rendered when nothing could be generated; receives the error. */
  fallback?: Snippet<[QRCodeKitError | undefined]>;
}

export const QRCode: Component<QRCodeProps>;

export function generateQRCode(
  value: string | Uint8Array,
  options?: QRCodeOptions & { format?: QRCodeImageFormat },
  kit?: QRCodeKit,
): QRCodeResult;
