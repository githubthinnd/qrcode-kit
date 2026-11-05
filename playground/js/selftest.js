// In-browser verification of the built package. Every test runs against the real canvas,
// the real Blob encoders and (when present) the real BarcodeDetector of this browser.
import { createQRCodeKit, isQRCodeKitError } from '../../dist/index.js';
import { createBrowserKit } from '../../dist/browser.js';
import { decodeAll, rasterize } from './decoder.js';

class Skip extends Error {}
const skip = (why) => {
  throw new Skip(why);
};
const ok = (cond, message) => {
  if (!cond) throw new Error(message);
};
const rejectsWith = async (promise, code, pattern) => {
  try {
    await promise;
  } catch (error) {
    ok(isQRCodeKitError(error), `expected a QRCodeKitError, got ${String(error)}`);
    ok(error.code === code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (pattern) ok(pattern.test(error.message), `message "${error.message}" lacks ${pattern}`);
    return error;
  }
  throw new Error(`expected ${code} but the call succeeded`);
};

async function pixels(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
  return { width: bitmap.width, height: bitmap.height, at, bitmap };
}

export function environment() {
  const canvas = document.createElement('canvas');
  const webp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    barcodeDetector: typeof globalThis.BarcodeDetector === 'function',
    webp,
    offscreenCanvas: typeof globalThis.OffscreenCanvas === 'function',
  };
}

export function buildTests() {
  const kit = createBrowserKit();
  const plain = createQRCodeKit();
  const tests = [];
  const add = (group, name, run) => tests.push({ group, name, run });

  // ── Encoding ────────────────────────────────────────────────────────────
  add('Encoding', 'all 40 versions × 4 levels produce the right geometry', () => {
    let n = 0;
    for (let version = 1; version <= 40; version++) {
      for (const ecc of ['L', 'M', 'Q', 'H']) {
        const m = plain.encode({ data: '1', version, ecc });
        ok(
          m.version === version && m.size === 4 * version + 17 && m.ecc === ecc,
          `v${version}-${ecc}`,
        );
        n++;
      }
    }
    return `${n} symbols`;
  });
  add('Encoding', 'all 8 mask patterns can be forced', () => {
    for (let mask = 0; mask < 8; mask++)
      ok(plain.encode({ data: 'mask', mask }).mask === mask, `mask ${mask}`);
  });
  add('Encoding', 'Micro QR M1–M4 and all 32 rMQR sizes have the right geometry', () => {
    const micro = [11, 13, 15, 17];
    for (const [i, edge] of micro.entries()) {
      const m = plain.encode({ data: '1', symbol: 'micro', version: i + 1 });
      ok(m.width === edge && m.height === edge, `M${i + 1}`);
    }
    const names = new Set();
    for (let v = 1; v <= 32; v++) {
      const probe = plain.encode({ data: '1', symbol: 'rmqr', version: v });
      ok(probe.height >= 7 && probe.width >= 27 && probe.width !== probe.height, `rMQR ${v}`);
      names.add(probe.designation);
    }
    ok(names.size === 32, 'rMQR designations are not unique');
    return '4 + 32 symbols';
  });
  add('Encoding', 'fast mask scoring picks a valid mask and the same size', () => {
    const text = 'https://example.com/fast?scoring=bit-parallel';
    const a = plain.encode({ data: text, ecc: 'Q' });
    const b = plain.encode({ data: text, ecc: 'Q', maskScoring: 'fast' });
    ok(a.version === b.version && b.mask >= 0 && b.mask <= 7, 'fast scoring changed the symbol');
    return `mask ${a.mask} → ${b.mask}`;
  });
  add('Encoding', 'encoding is deterministic', () => {
    const a = JSON.stringify(plain.encode({ data: 'repeat me', ecc: 'Q' }).toRows());
    const b = JSON.stringify(plain.encode({ data: 'repeat me', ecc: 'Q' }).toRows());
    ok(a === b, 'two encodes of the same input differ');
  });
  add('Encoding', 'structured append links 3 symbols with one parity', async () => {
    const parts = await plain.generateStructuredAppend({
      data: 'x'.repeat(120),
      symbols: 3,
      ecc: 'L',
    });
    ok(parts.length === 3, `got ${parts.length} symbols`);
    const info = parts.map((p) => p.matrix.structuredAppend);
    ok(
      info.every((i, idx) => i.index === idx && i.total === 3 && i.parity === info[0].parity),
      'bad headers',
    );
  });

  // ── Formats in this browser ─────────────────────────────────────────────
  add('Formats', 'svg is a well-formed SVG document', async () => {
    const { value } = await kit.generate({ data: 'svg', format: 'svg' });
    const doc = new DOMParser().parseFromString(value, 'image/svg+xml');
    ok(
      doc.documentElement.localName === 'svg' && !doc.querySelector('parsererror'),
      'not parseable as SVG',
    );
    ok(doc.querySelectorAll('script,foreignObject').length === 0, 'unexpected active content');
    return `${value.length} chars`;
  });
  add('Formats', 'png has a valid signature', async () => {
    const { value } = await kit.generate({ data: 'png', format: 'png' });
    ok(
      [0x89, 0x50, 0x4e, 0x47].every((b, i) => value[i] === b),
      'bad PNG signature',
    );
    return `${value.length} bytes`;
  });
  add('Formats', 'data URLs decode in an <img>', async () => {
    for (const format of ['svg-data-url', 'png-data-url']) {
      const { value } = await kit.generate({ data: 'url', format });
      const img = new Image();
      img.src = value;
      await img.decode();
      ok(img.naturalWidth > 0, `${format} did not load`);
    }
  });
  const blobFormats = [
    ['png-blob', 'image/png'],
    ['jpeg-blob', 'image/jpeg'],
    ['webp-blob', 'image/webp'],
  ];
  for (const [format, mime] of blobFormats) {
    add('Formats', `${format} encodes and decodes at the right size`, async () => {
      let result;
      try {
        result = await kit.generate({ data: 'x', format, scale: 4 });
      } catch (error) {
        if (isQRCodeKitError(error) && error.code === 'RUNTIME_UNAVAILABLE') skip(error.message);
        throw error;
      }
      ok(result.value.type === mime, `type is ${result.value.type}`);
      const px = await pixels(result.value);
      ok(
        px.width === 29 * 4 && px.height === 29 * 4,
        `image is ${px.width}×${px.height}, expected 116×116`,
      );
      return `${result.value.size} bytes`;
    });
  }
  add('Formats', 'canvas format returns the real canvas element, drawn on', async () => {
    const { value } = await kit.generate({ data: 'x', format: 'canvas', scale: 5 });
    ok(value instanceof HTMLCanvasElement || value instanceof OffscreenCanvas, 'not a canvas');
    ok(
      value.width === 29 * 5 && value.height === 29 * 5,
      `canvas is ${value.width}×${value.height}`,
    );
    const ctx = value.getContext('2d');
    const finder = ctx.getImageData(4 * 5 + 2, 4 * 5 + 2, 1, 1).data;
    const quiet = ctx.getImageData(2, 2, 1, 1).data;
    ok(finder[0] < 40 && finder[3] === 255, `finder pixel is rgba(${Array.from(finder)})`);
    ok(quiet[0] > 215 && quiet[3] === 255, `quiet pixel is rgba(${Array.from(quiet)})`);
  });
  add('Formats', 'canvas renderer paints finder patterns dark and quiet zone light', async () => {
    const { value } = await kit.generate({
      data: 'x',
      format: 'png-blob',
      scale: 5,
      providers: { renderer: 'qrcode-toolkit/browser/canvas' },
    });
    const px = await pixels(value);
    const dark = px.at(4 * 5 + 2, 4 * 5 + 2); // first module of the top-left finder pattern
    const quiet = px.at(2, 2);
    ok(dark[0] < 40 && dark[3] === 255, `finder pixel is rgba(${dark})`);
    ok(quiet[0] > 215 && quiet[3] === 255, `quiet-zone pixel is rgba(${quiet})`);
  });
  add('Formats', 'transparent background survives in png-blob', async () => {
    const { value } = await kit.generate({
      data: 'x',
      format: 'png-blob',
      scale: 4,
      light: 'transparent',
    });
    const px = await pixels(value);
    ok(px.at(1, 1)[3] === 0, `alpha is ${px.at(1, 1)[3]}`);
  });
  add('Formats', 'opaque jpeg-blob background is white, not black', async () => {
    let result;
    try {
      result = await kit.generate({ data: 'x', format: 'jpeg-blob', scale: 4, quality: 1 });
    } catch (error) {
      if (isQRCodeKitError(error) && error.code === 'RUNTIME_UNAVAILABLE') skip(error.message);
      throw error;
    }
    const px = await pixels(result.value);
    const p = px.at(2, 2);
    ok(p[0] > 230 && p[1] > 230 && p[2] > 230, `corner pixel is rgb(${p.slice(0, 3)})`);
  });

  // ── Guards ──────────────────────────────────────────────────────────────
  add('Guards', 'jpeg-blob rejects a transparent colour (no black flattening)', () =>
    rejectsWith(
      kit.generate({ data: 'x', format: 'jpeg-blob', light: 'transparent' }),
      'UNSUPPORTED_CAPABILITY',
      /alpha/,
    ),
  );
  add('Guards', 'png-blob rejects `quality` instead of ignoring it', () =>
    rejectsWith(
      kit.generate({ data: 'x', format: 'png-blob', quality: 0.5 }),
      'UNSUPPORTED_CAPABILITY',
      /quality/,
    ),
  );
  add('Guards', 'unknown options are rejected', () =>
    rejectsWith(kit.generate({ data: 'x', colour: 'red' }), 'INVALID_CONFIGURATION', /colour/),
  );
  add('Guards', 'empty data and null requests give typed errors', async () => {
    await rejectsWith(kit.generate({ data: '' }), 'INVALID_INPUT');
    await rejectsWith(kit.generate(null), 'INVALID_INPUT');
    await rejectsWith(
      kit.generate({ data: [{ mode: 'byte', bytes: new Uint8Array(0) }] }),
      'INVALID_INPUT',
      /empty/,
    );
  });
  add('Guards', 'input and raster limits are enforced', async () => {
    await rejectsWith(kit.generate({ data: 'x'.repeat(65_537) }), 'INVALID_INPUT');
    await rejectsWith(kit.generate({ data: 'x', format: 'png', scale: 4096 }), 'RENDERING_FAILED');
  });
  add('Guards', 'errors never contain the payload', async () => {
    const secret = 'S3CR3T-PAYLOAD-0451';
    let error;
    try {
      await kit.generate({ data: secret, version: 1, ecc: 'H' });
    } catch (e) {
      error = e;
    }
    ok(isQRCodeKitError(error), 'expected the symbol not to fit and a typed error');
    const text = JSON.stringify([error.message, error.details]);
    ok(!text.includes(secret), 'payload found in the error');
  });
  add('Guards', 'size is rounded down and the warning says so', async () => {
    const { value, warnings } = await kit.generate({ data: 'x', format: 'png-blob', size: 256 });
    const px = await pixels(value);
    ok(px.width < 256, `width ${px.width}`);
    ok(
      warnings.some((w) => w.code === 'SIZE_ROUNDED'),
      'no SIZE_ROUNDED warning',
    );
    return `${px.width}px for size 256`;
  });

  // ── Providers ───────────────────────────────────────────────────────────
  add('Providers', 'a caller exporter overrides the browser png-blob exporter', async () => {
    const mine = {
      id: 'playground/png-blob',
      apiVersion: 1,
      capabilities: {
        accepts: ['bitmap', 'canvas'],
        formats: ['png-blob'],
        runtimes: ['browser'],
        requiresPath: false,
        quality: false,
        sync: true,
      },
      export: () => ({
        format: 'png-blob',
        mimeType: 'application/x-mine',
        value: new Blob(['mine']),
      }),
    };
    const custom = createBrowserKit({ providers: { exporters: [mine] } });
    const { mimeType } = await custom.generate({ data: 'x', format: 'png-blob' });
    ok(mimeType === 'application/x-mine', `used ${mimeType}`);
  });
  add('Providers', 'kits are isolated from each other', () => {
    const a = createQRCodeKit();
    const b = createBrowserKit();
    ok(
      !a.describe().formats.includes('png-blob') && b.describe().formats.includes('png-blob'),
      'leak between kits',
    );
  });

  // ── Round trip with the browser's own decoder ───────────────────────────
  const samples = [
    ['URL', 'https://example.com/path?query=1&x=2'],
    ['Vietnamese', 'Xin chào Việt Nam — Nhữ Duy Thìn'],
    ['numeric', '0123456789'.repeat(12)],
    ['long text', 'The quick brown fox jumps over the lazy dog. '.repeat(14)],
    ['emoji', 'QR 🚀✨ ok'],
  ];
  for (const [label, text] of samples) {
    add('Round trip', `${label} is read back at L, M, Q and H`, async () => {
      const failures = [];
      const engines = new Set();
      for (const ecc of ['L', 'M', 'Q', 'H']) {
        const { value } = await kit.generate({ data: text, ecc, format: 'png-blob', scale: 6 });
        const bitmap = await createImageBitmap(value);
        const reads = await decodeAll(rasterize(bitmap, bitmap.width, bitmap.height));
        const good = reads.filter((r) => r.text === text);
        // Every decoder has blind spots, so one exact read is enough.
        if (good.length === 0)
          failures.push(`${ecc} (${reads.map((r) => r.name).join('/')} all failed)`);
        for (const r of good) engines.add(r.name);
      }
      ok(failures.length === 0, `not read back at: ${failures.join(', ')}`);
      return `read by ${[...engines].join(', ')}`;
    });
  }

  // ── Styled SVG, decoded from what a browser really draws ───────────────
  const LOGO =
    'data:image/svg+xml;base64,' +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#4f46e5"/><path fill="#fff" d="M28 28h20v20H28zM52 28h20v20H52zM28 52h20v20H28zM56 56h8v8h-8zM68 68h8v8h-8z"/></svg>',
    );
  const BRAND = { from: '#312e81', to: '#0f172a' };
  const styled = [
    ['rounded modules', { moduleShape: 'rounded' }, ['M', 'Q', 'H']],
    ['dot modules', { moduleShape: 'dots' }, ['M', 'Q', 'H']],
    ['linear gradient', { gradient: BRAND }, ['M', 'H']],
    ['radial gradient', { gradient: { ...BRAND, type: 'radial' } }, ['M', 'H']],
    ['logo in the centre', { logo: { href: LOGO }, version: { min: 6 } }, ['H']],
    [
      'rounded + gradient + logo',
      { moduleShape: 'rounded', gradient: BRAND, logo: { href: LOGO }, version: { min: 6 } },
      ['H'],
    ],
  ];
  const STYLED_TEXT = 'https://example.com/styled-qr-codes?scan=still-works&lang=vi';
  for (const [label, options, levels] of styled) {
    add('Styled SVG', `${label} are read back at ${levels.join(', ')}`, async () => {
      const failures = [];
      const engines = new Set();
      for (const ecc of levels) {
        const { value } = await kit.generate({
          data: STYLED_TEXT,
          ecc,
          format: 'svg-data-url',
          scale: 8,
          ...options,
        });
        const img = new Image();
        img.src = value;
        await img.decode();
        const reads = await decodeAll(rasterize(img, img.naturalWidth, img.naturalHeight));
        const good = reads.filter((r) => r.text === STYLED_TEXT);
        if (good.length === 0) failures.push(ecc);
        for (const r of good) engines.add(r.name);
      }
      ok(failures.length === 0, `not read back at: ${failures.join(', ')}`);
      return `read by ${[...engines].join(', ')}`;
    });
  }
  add(
    'Guards',
    'styling is rejected on raster formats and bad logos never reach the markup',
    async () => {
      await rejectsWith(
        kit.generate({ data: 'x', format: 'png-blob', moduleShape: 'dots' }),
        'UNSUPPORTED_CAPABILITY',
        /dots/,
      );
      await rejectsWith(
        kit.generate({ data: 'x', logo: { href: 'https://example.com/x.png' } }),
        'INVALID_INPUT',
        /logo\.href/,
      );
      await rejectsWith(
        kit.generate({ data: 'x', logo: { href: LOGO }, ecc: 'L' }),
        'RENDERING_FAILED',
      );
    },
  );

  // ── Performance ─────────────────────────────────────────────────────────
  add('Performance', 'version 40-L (7 089 digits) renders in under 2 s', async () => {
    const start = performance.now();
    const { matrix } = await kit.generate({ data: '7'.repeat(7089), ecc: 'L', format: 'svg' });
    const ms = performance.now() - start;
    ok(matrix.version === 40, `version ${matrix.version}`);
    ok(ms < 2000, `${ms.toFixed(0)} ms`);
    return `${ms.toFixed(0)} ms`;
  });
  return tests;
}

/** Run all tests, calling `onUpdate(index, result)` as each one starts and finishes. */
export async function runSelfTest(tests, onUpdate) {
  const totals = { pass: 0, fail: 0, skip: 0 };
  for (const [index, test] of tests.entries()) {
    onUpdate(index, { state: 'run' });
    const start = performance.now();
    try {
      const returned = await test.run();
      const detail = typeof returned === 'string' ? returned : '';
      totals.pass++;
      onUpdate(index, { state: 'pass', detail, ms: performance.now() - start });
    } catch (error) {
      const ms = performance.now() - start;
      if (error instanceof Skip) {
        totals.skip++;
        onUpdate(index, { state: 'skip', detail: error.message, ms });
      } else {
        totals.fail++;
        onUpdate(index, {
          state: 'fail',
          detail: error instanceof Error ? error.message : String(error),
          ms,
        });
      }
    }
  }
  return totals;
}
