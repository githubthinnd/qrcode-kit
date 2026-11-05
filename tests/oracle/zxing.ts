/**
 * ZXing-C++ (compiled to WebAssembly) as an independent reader for Micro QR Code and rMQR. No
 * other decoder in the toolkit's test set reads these formats, so every claim about them rests on it.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

export interface ZXingRead {
  readonly format: string;
  readonly text: string;
  readonly bytes: Uint8Array;
  /** `L`, `M`, `Q` or `H`. */
  readonly ecLevel: string;
  /** `M3`, `R9x59`, … */
  readonly version: string;
  /** The mask pattern number the decoder found in the format information. */
  readonly mask: number;
  /** AIM symbology identifier, e.g. `]Q1`; `]Q3` and `]Q5` mark FNC1 in first and second position. */
  readonly identifier: string;
}

let ready: Promise<void> | undefined;

function prepare(): Promise<void> {
  ready ??= (async () => {
    const require = createRequire(import.meta.url);
    // the package does not export its package.json: find its folder from the reader entry
    const entry = require.resolve('zxing-wasm/reader');
    const root = entry.slice(0, entry.lastIndexOf('zxing-wasm') + 'zxing-wasm'.length);
    const wasmBinary = readFileSync(join(root, 'dist/reader/zxing_reader.wasm'));
    await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
  })();
  return ready;
}

/** Read the first Micro QR Code or rMQR symbol of a PNG, or `undefined` when nothing is found. */
export async function readCompactSymbol(
  png: Uint8Array,
  formats: ('MicroQRCode' | 'RMQRCode' | 'QRCode')[] = ['MicroQRCode', 'RMQRCode'],
): Promise<ZXingRead | undefined> {
  await prepare();
  const image = PNG.sync.read(Buffer.from(png));
  const results = await readBarcodes(
    {
      data: new Uint8ClampedArray(image.data),
      width: image.width,
      height: image.height,
      colorSpace: 'srgb',
    },
    { formats, tryHarder: true, maxNumberOfSymbols: 1 },
  );
  const first = results.at(0);
  if (first === undefined) return undefined;
  const extra = JSON.parse(first.extra) as {
    DataMask?: number;
    Version?: string;
    ECLevel?: string;
  };
  return {
    format: first.format,
    text: first.text,
    bytes: first.bytes,
    ecLevel: extra.ECLevel ?? '',
    version: extra.Version ?? '',
    mask: extra.DataMask ?? -1,
    identifier: first.symbologyIdentifier,
  };
}
