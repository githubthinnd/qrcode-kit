import { createQRCodeKit, isQRCodeKitError } from 'qrcode-toolkit';

const sharedKit = createQRCodeKit();

/**
 * Errors caused by the content or its size: they become `result.error`. Everything else (a
 * misspelt option, an option the renderer cannot honour, a broken provider) is a programming
 * mistake and is thrown, so it is seen during development instead of rendering nothing.
 */
const RECOVERABLE = new Set([
  'INVALID_INPUT',
  'UNSUPPORTED_DATA',
  'ENCODING_FAILED',
  'RENDERING_FAILED',
]);

/**
 * Generate a QR Code synchronously. Content that cannot be encoded (empty, too long, a logo that
 * hides too much) is returned as `error` so a component can render a fallback; programming mistakes
 * (unknown options, unsupported combinations) are thrown.
 *
 * @param {string | Uint8Array} value
 * @param {Record<string, unknown>} [options] every symbol and appearance option of qrcode-toolkit
 * @param {import('qrcode-toolkit').QRCodeKit} [kit]
 * @returns {import('./index.js').QRCodeResult}
 */
export function generateQRCode(value, options = {}, kit = sharedKit) {
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
