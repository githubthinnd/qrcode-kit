import { zlibCompress } from './deflate.js';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

/** CRC-32 as used by PNG (ISO 3309). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export interface PngColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/**
 * Encode a two-colour image as a 1-bit palette PNG.
 * `pixels` holds one byte per pixel: 0 selects `light`, anything else `dark`.
 */
export function encodeBilevelPng(
  width: number,
  height: number,
  pixels: Uint8Array,
  dark: PngColor,
  light: PngColor,
): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const base = y * (rowBytes + 1); // filter byte 0 (None) is already zero
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x]) {
        raw[base + 1 + (x >> 3)] = (raw[base + 1 + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 1; // bit depth
  header[9] = 3; // colour type: palette
  // compression, filter, interlace = 0

  const palette = Uint8Array.of(light.r, light.g, light.b, dark.r, dark.g, dark.b);
  const parts = [SIGNATURE, chunk('IHDR', header), chunk('PLTE', palette)];
  if (light.a < 255 || dark.a < 255) parts.push(chunk('tRNS', Uint8Array.of(light.a, dark.a)));
  parts.push(chunk('IDAT', zlibCompress(raw)), chunk('IEND', new Uint8Array(0)));

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
