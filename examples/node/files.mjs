import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeKit } from 'qrcode-toolkit/node';

const dir = mkdtempSync(join(tmpdir(), 'qr-'));
// `baseDir` confines writes: paths that escape it are rejected.
const kit = createNodeKit({ files: { baseDir: dir } });

const png = await kit.generate({
  data: 'https://example.com',
  format: 'png-file',
  path: 'code.png',
  size: 512,
});
const svg = await kit.generate({
  data: 'https://example.com',
  format: 'svg-file',
  path: 'code.svg',
});
console.log(png.value, svg.value);

const buffer = await kit.generate({ data: 'in memory', format: 'png-buffer' });
console.log('Buffer?', Buffer.isBuffer(buffer.value), buffer.value.length, 'bytes');
