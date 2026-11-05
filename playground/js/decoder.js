// Independent decoders for "Verify scan" and the round-trip self-test. They are development
// dependencies bundled into the playground only; the library itself never imports them.
import jsQR from 'jsqr';
// Deep imports keep the bundle small: the package index would pull in every barcode format.
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap.js';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer.js';
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource.js';
import QRCodeReader from '@zxing/library/esm/core/qrcode/QRCodeReader.js';

/** Draw an image source on a white canvas with a quiet margin and return its pixels. */
export function rasterize(source, width, height, margin = 24) {
  const canvas = document.createElement('canvas');
  canvas.width = width + margin * 2;
  canvas.height = height + margin * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, margin, margin);
  return { canvas, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

const engines = [
  {
    name: 'jsQR',
    decode: ({ image }) => jsQR(image.data, image.width, image.height)?.data ?? null,
  },
  {
    name: 'ZXing',
    decode: ({ image }) => {
      const { data, width, height } = image;
      const luminance = new Uint8ClampedArray(width * height);
      for (let i = 0; i < luminance.length; i++) luminance[i] = data[i * 4] ?? 0;
      try {
        const bitmap = new BinaryBitmap(
          new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)),
        );
        return new QRCodeReader().decode(bitmap).getText();
      } catch {
        return null;
      }
    },
  },
];

/**
 * Decode with every engine available in this browser (jsQR, ZXing and, when it exists, the native
 * BarcodeDetector). Each has blind spots, so callers should accept a read by any of them.
 * @returns {Promise<{ name: string, text: string | null }[]>}
 */
export async function decodeAll(raster) {
  const results = engines.map((e) => ({ name: e.name, text: e.decode(raster) }));
  if (typeof globalThis.BarcodeDetector === 'function') {
    try {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const found = await new globalThis.BarcodeDetector({ formats: ['qr_code'] }).detect(
          raster.canvas,
        );
        results.push({ name: 'BarcodeDetector', text: found[0]?.rawValue ?? null });
      }
    } catch {
      /* native detector unavailable at run time: the other engines still answer */
    }
  }
  return results;
}
