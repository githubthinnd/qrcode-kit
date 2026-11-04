/**
 * Independent verification oracles. Everything imported here is a devDependency
 * and is never part of the published package.
 */
import { createRequire } from 'node:module';
import { decodeQR } from 'qr/decode.js';
import { encodeQR } from 'qr';
import * as lean from 'lean-qr';
import { encode as uqrEncode } from 'uqr';
import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
  DecodeHintType,
} from '@zxing/library';
import type { QRMatrix } from '../../src/domain/matrix.js';
import type { ErrorCorrectionLevel } from '../../src/domain/model.js';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr') as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data: string } | null;
const qrcodeLib = require('qrcode') as {
  create: (
    data: string | { data: Uint8Array | string; mode: string }[],
    options: { version?: number; errorCorrectionLevel?: string; maskPattern?: number },
  ) => { modules: { size: number; data: Uint8Array }; version: number; maskPattern: number };
};

export interface Raster {
  readonly data: Uint8ClampedArray;
  readonly width: number;
}

/** Render a matrix as an opaque RGBA raster with a quiet zone. */
export function rasterize(matrix: QRMatrix, scale = 8, quiet = 4): Raster {
  const width = (matrix.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width };
}

export type DecoderName = 'jsqr' | 'qr' | 'zxing';

export const decoders: Record<DecoderName, (raster: Raster) => string | null> = {
  jsqr: ({ data, width }) => jsQR(data, width, width)?.data ?? null,
  qr: ({ data, width }) => {
    try {
      return decodeQR({ width, height: width, data });
    } catch {
      return null;
    }
  },
  zxing: ({ data, width }) => {
    try {
      const luminance = new Uint8ClampedArray(width * width);
      for (let i = 0; i < luminance.length; i++) luminance[i] = data[i * 4] ?? 0;
      const bitmap = new BinaryBitmap(
        new HybridBinarizer(new RGBLuminanceSource(luminance, width, width)),
      );
      const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);
      return new QRCodeReader().decode(bitmap, hints).getText();
    } catch {
      return null;
    }
  },
};

export const decoderNames = Object.keys(decoders) as DecoderName[];

/** Reference matrices from independent engines for byte-mode ASCII data at fixed parameters. */
export interface ReferenceParams {
  readonly text: string;
  readonly version: number;
  readonly ecc: ErrorCorrectionLevel;
  readonly mask: number;
}

const toRows = (size: number, at: (x: number, y: number) => boolean): boolean[][] =>
  Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => at(x, y)));

const levelName = { L: 'low', M: 'medium', Q: 'quartile', H: 'high' } as const;

export const referenceEngines: Record<string, (p: ReferenceParams) => boolean[][]> = {
  qrcode: ({ text, version, ecc, mask }) => {
    const bytes = Uint8Array.from(Buffer.from(text, 'latin1'));
    const q = qrcodeLib.create([{ data: bytes, mode: 'byte' }], {
      version,
      errorCorrectionLevel: ecc,
      maskPattern: mask,
    });
    return toRows(q.modules.size, (x, y) => q.modules.data[y * q.modules.size + x] === 1);
  },
  uqr: ({ text, version, ecc, mask }) => {
    const q = uqrEncode(Array.from(Buffer.from(text, 'latin1')), {
      ecc,
      minVersion: version,
      maxVersion: version,
      maskPattern: mask,
      border: 0,
    });
    return q.data.map((row) => [...row]);
  },
  qr: ({ text, version, ecc, mask }) => {
    const rows = encodeQR(text, 'raw', { ecc: levelName[ecc], version, mask, border: 1 });
    const n = rows.length - 2;
    return toRows(n, (x, y) => rows[y + 1]?.[x + 1] ?? false);
  },
  'lean-qr': ({ text, version, ecc, mask }) => {
    const level = lean.correction[ecc];
    const code = lean.generate(text, {
      minVersion: version,
      maxVersion: version,
      minCorrectionLevel: level,
      maxCorrectionLevel: level,
      mask: mask as lean.Mask,
      modes: [lean.mode.ascii],
    });
    return toRows(code.size, (x, y) => code.get(x, y));
  },
};

export function sameMatrix(matrix: QRMatrix, rows: boolean[][]): boolean {
  if (rows.length !== matrix.size) return false;
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.get(x, y) !== rows[y]?.[x]) return false;
    }
  }
  return true;
}

/** Deterministic pseudo-random generator (LCG) so failures are reproducible. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * Decoders that read the raster back correctly. Independent decoders have
 * individual blind spots (e.g. `qr` has no Kanji support, ZXing rejects a few
 * valid symbols), so correctness is asserted by quorum, not unanimity.
 */
export function decodingDecoders(raster: Raster, expected: string): DecoderName[] {
  return decoderNames.filter((name) => decoders[name](raster) === expected);
}
