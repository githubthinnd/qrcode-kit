// Single-file builds of the package for <script> tags and CDNs (jsDelivr, unpkg, esm.sh):
//   dist/bundles/qrcode-toolkit.min.js       classic script, global `QRCodeToolkit`
//   dist/bundles/qrcode-toolkit.esm.min.js   one ES module, no further requests
// Both hold the universal API plus the browser kit (canvas renderer, Blob exporters). The Node.js
// entry and the Kanji table are not included: import `qrcode-toolkit/kanji` separately if needed.
// esbuild is a development dependency of this repository; nothing here is shipped as a dependency.
import { buildSync } from 'esbuild';
import { mkdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const out = join(dist, 'bundles');
mkdirSync(out, { recursive: true });

const contents = `
export * from './index.js';
export { createBrowserKit, createBrowserProviders, createCanvasRenderer, createBlobExporters } from './browser.js';
`;

for (const [file, format] of [
  ['qrcode-toolkit.min.js', 'iife'],
  ['qrcode-toolkit.esm.min.js', 'esm'],
]) {
  buildSync({
    stdin: { contents, resolveDir: dist, sourcefile: 'cdn-entry.js', loader: 'js' },
    bundle: true,
    minify: true,
    format,
    ...(format === 'iife' ? { globalName: 'QRCodeToolkit' } : {}),
    platform: 'browser',
    target: 'es2022',
    legalComments: 'none',
    banner: { js: '/*! qrcode-toolkit | MIT | https://github.com/githubthinnd/qrcode-toolkit */' },
    outfile: join(out, file),
    logLevel: 'warning',
  });
  const bytes = statSync(join(out, file)).size;
  const gzip = gzipSync(readFileSync(join(out, file)), { level: 9 }).length;
  console.log(`bundle ${file}: ${String(bytes)} bytes, ${String(gzip)} gzipped`);
}
