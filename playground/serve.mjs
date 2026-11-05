// Static server for the built playground (playground-dist/, see scripts/build-playground.mjs).
// Binds to 127.0.0.1 only and serves nothing outside that folder.
//   npm run playground            → http://127.0.0.1:5173/
//   PORT=8080 npm run playground
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const site = join(root, 'playground-dist');
const served = [site + sep];
const port = Number(process.env.PORT ?? 5173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // The page is one self-contained file, so inline script and style are required; nothing is
  // fetched from anywhere else.
  'Content-Security-Policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; base-uri 'none'; form-action 'none'",
};

const server = createServer((request, response) => {
  void (async () => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD', ...headers }).end();
        return;
      }
      let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = normalize(join(site, pathname));
      if (pathname.includes('\0') || !served.some((dir) => file.startsWith(dir))) {
        response.writeHead(404, headers).end('Not found');
        return;
      }
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        ...headers,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, headers).end('Not found');
    }
  })();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`qrcode-toolkit playground: http://127.0.0.1:${String(port)}/`);
});
