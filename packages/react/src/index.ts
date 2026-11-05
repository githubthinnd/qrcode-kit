import {
  createElement,
  useMemo,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
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
  /** A data URL, ready for `<img src>`. */
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

/** Memoised {@link generateQRCode} for client components. In Server Components use `<QRCode>` or `generateQRCode`. */
export function useQRCode(
  value: string | Uint8Array,
  options: QRCodeOptions & { readonly format?: QRCodeImageFormat } = {},
  kit: QRCodeKit = sharedKit,
): QRCodeResult {
  // Options are plain data, so their JSON is a stable key even when the object is recreated each render.
  const key = JSON.stringify(options);
  return useMemo(() => generateQRCode(value, options, kit), [value, key, kit]);
}

export interface QRCodeProps extends QRCodeOptions {
  /** The text or bytes to encode. */
  readonly value: string | Uint8Array;
  /** Rendered width and height in CSS pixels. Default 192. */
  readonly size?: number;
  /** Accessible text for the image. Describe what the code does. Default "QR code". */
  readonly label?: string;
  readonly format?: QRCodeImageFormat;
  /** Use your own kit (custom providers, limits). Default: a shared default kit. */
  readonly kit?: QRCodeKit;
  /** Rendered when nothing could be generated. Default: nothing. */
  readonly fallback?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly title?: string;
}

/**
 * A QR Code as an `<img>` with a data URL. It uses no hooks, so it works in React Server Components,
 * in server-side rendering and in the browser, and renders identically in all of them.
 */
export function QRCode(props: QRCodeProps): ReactElement | null {
  const {
    value,
    size = 192,
    label = 'QR code',
    format = 'svg',
    kit,
    fallback = null,
    className,
    style,
    title,
    ...options
  } = props;
  const sizing = options.scale !== undefined ? {} : format === 'png' ? { scale: 8 } : { size };
  const { src } = generateQRCode(value, { ...options, ...sizing, format }, kit);
  if (src === undefined) return fallback === null ? null : createElement('span', null, fallback);
  return createElement('img', {
    src,
    width: size,
    height: size,
    alt: label,
    className,
    style,
    title,
  });
}
