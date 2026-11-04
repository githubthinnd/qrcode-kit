// Reproducible micro-benchmark. Run: npm run build && node bench/bench.mjs
// Compares matrix encoding only (the common ground between libraries). Numbers
// depend on the machine; they are indicators, not guarantees.
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createQRCodeKit } from '../dist/index.js';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');
const { encode: uqr } = await import('uqr');
const { encodeQR } = await import('qr');
const lean = await import('lean-qr');

const kit = createQRCodeKit();
const inputs = {
  'URL (45 chars)': 'https://example.com/path?q=hello&lang=vi#frag',
  '200 chars text': 'The quick brown fox jumps over the lazy dog. '.repeat(5).slice(0, 200),
  '1000 chars Vietnamese': 'Xin chào Việt Nam! '.repeat(60).slice(0, 1000),
};
const engines = {
  'qrcode-toolkit': (t) => kit.encode({ data: t, ecc: 'M' }),
  qrcode: (t) => QRCode.create(t, { errorCorrectionLevel: 'M' }),
  uqr: (t) => uqr(t, { ecc: 'M' }),
  qr: (t) => encodeQR(t, 'raw', { ecc: 'medium' }),
  'lean-qr': (t) => lean.generate(t, { minCorrectionLevel: lean.correction.M }),
};

function time(fn, input, ms = 600) {
  for (let i = 0; i < 50; i++) fn(input); // warm-up
  let runs = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    fn(input);
    runs++;
  }
  return ((performance.now() - start) / runs) * 1000; // µs per encode
}

console.log(
  `Node ${process.version} · ${cpus()[0]?.model ?? 'cpu'} · ${new Date().toISOString().slice(0, 10)}`,
);
console.log(
  'Encode (µs per symbol, lower is better; each engine measured sequentially in one process)',
);
const rows = [];
for (const [engine, fn] of Object.entries(engines)) {
  const row = { engine };
  for (const [name, text] of Object.entries(inputs)) row[name] = Math.round(time(fn, text));
  rows.push(row);
}
console.table(rows);

console.log('Full pipeline of qrcode-toolkit (µs per call)');
const pipeline = {
  'svg (URL)': () => kit.generateSync({ data: inputs['URL (45 chars)'], format: 'svg' }),
  'png scale 8 (URL)': () => kit.generateSync({ data: inputs['URL (45 chars)'], format: 'png' }),
  'png 1024px (URL)': () =>
    kit.generateSync({ data: inputs['URL (45 chars)'], format: 'png', size: 1024 }),
  'text (URL)': () => kit.generateSync({ data: inputs['URL (45 chars)'], format: 'text' }),
};
console.table(
  Object.entries(pipeline).map(([name, fn]) => ({
    pipeline: name,
    µs: Math.round(time(() => fn(), null, 600)),
  })),
);
