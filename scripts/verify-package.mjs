// Verifies the *packed tarball*, not the source tree: contents allowlist, zero
// dependencies, no runtime globals in universal code, ESM import, require(esm),
// every subpath entry, browser bundling, TypeScript consumption, publint and
// "Are the types wrong?". Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bin = (name) => join(root, 'node_modules', '.bin', name);
const work = mkdtempSync(join(tmpdir(), 'qtk-verify-'));
// When this script runs from `prepublishOnly`, npm leaks its own settings (npm_config_dry_run,
// npm_command, ...) into child processes. A leaked dry-run flag makes the nested `npm pack` write
// no tarball, so every npm_* variable is dropped and only the ones below are set.
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_')),
);
const env = {
  ...inherited,
  npm_config_cache: join(work, 'npm-cache'),
  npm_config_userconfig: '/dev/null',
};
const failures = [];

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    const detail =
      error instanceof Error ? error.stderr || error.stdout || error.message : String(error);
    console.log(`  FAIL ${name}\n${String(detail).trim().replace(/^/gm, '       ')}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

try {
  if (!existsSync(join(root, 'dist', 'index.js'))) {
    throw new Error('dist/ is missing. Run `npm run build` first.');
  }

  console.log('Universal code is free of runtime globals');
  check('dist/ outside src/runtimes contains no Node.js or DOM references', () => {
    const forbidden =
      /\b(node:[a-z/]+|require\(|process\.|Buffer\b|window\b|document\b|navigator\b|__dirname|OffscreenCanvas|HTMLCanvasElement)/;
    const allowed = (file) => /dist\/(runtimes\/|node\.|browser\.|bundles\/)/.test(file);
    // `globalThis` capability probes are allowed: they are guarded lookups, not assumptions.
    const offenders = [];
    for (const file of listFiles(join(root, 'dist')).filter((f) => f.endsWith('.js'))) {
      if (allowed(file)) continue;
      const stripped = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
      const match = forbidden.exec(stripped);
      if (match) offenders.push(`${relative(root, file)}: ${match[0]}`);
    }
    assert(offenders.length === 0, offenders.join('\n'));
  });

  console.log('Packing…');
  const packDir = join(work, 'pack');
  mkdirSync(packDir);
  const [packed] = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: root }),
  );
  const tarball = join(packDir, packed.filename);
  const files = packed.files.map((f) => f.path);

  console.log('Tarball contents');
  check('only allow-listed files are published', () => {
    const allowed =
      /^(package\.json|LICENSE|README\.md|CHANGELOG\.md|THIRD_PARTY_NOTICES\.md|dist\/.+)$/;
    const unexpected = files.filter((f) => !allowed.test(f));
    assert(unexpected.length === 0, `unexpected files: ${unexpected.join(', ')}`);
  });
  check('required files are present', () => {
    for (const f of [
      'package.json',
      'LICENSE',
      'README.md',
      'dist/index.js',
      'dist/index.d.ts',
      'dist/node.js',
      'dist/browser.js',
      'dist/testing.js',
      'dist/kanji.js',
      'dist/http.js',
      'dist/bundles/qrcode-toolkit.min.js',
      'dist/bundles/qrcode-toolkit.esm.min.js',
      'THIRD_PARTY_NOTICES.md',
    ]) {
      assert(files.includes(f), `missing ${f}`);
    }
  });
  check('package declares no dependencies', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      assert(manifest[field] === undefined, `${field} must be absent`);
    }
  });

  console.log('Clean consumer project');
  const consumer = join(work, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
  );
  run('npm', ['install', tarball, '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer,
  });
  const installed = readdirSync(join(consumer, 'node_modules')).filter((n) => !n.startsWith('.'));
  check('installing pulls in no other packages', () => {
    assert(
      installed.length === 1 && installed[0] === 'qrcode-toolkit',
      `installed: ${installed.join(', ')}`,
    );
  });

  writeFileSync(
    join(consumer, 'esm.mjs'),
    `import { createQRCode, createQRCodeKit, InvalidInputError, QRCodeKitError } from 'qrcode-toolkit';
const svg = await createQRCode({ data: 'https://example.com', format: 'svg' });
if (!svg.value.startsWith('<svg')) throw new Error('bad svg');
const png = await createQRCode({ data: 'Xin chào', format: 'png' });
if (!(png.value instanceof Uint8Array) || png.value[1] !== 0x50) throw new Error('bad png');
const e = new InvalidInputError('x');
if (!(e instanceof QRCodeKitError) || e.code !== 'INVALID_INPUT') throw new Error('bad error class');
if (createQRCodeKit().describe().formats.length < 5) throw new Error('missing formats');
`,
  );
  check('ESM import works and generates SVG and PNG', () =>
    run('node', ['esm.mjs'], { cwd: consumer }),
  );

  writeFileSync(
    join(consumer, 'cjs.cjs'),
    `const kit = require('qrcode-toolkit');
const result = kit.createQRCodeKit().generateSync({ data: 'sync', format: 'text' });
if (!result.value.includes('█')) throw new Error('no output');
if (!kit.isQRCodeKitError(new kit.InvalidInputError('x'))) throw new Error('guard failed');
`,
  );
  check(`require(esm) works on Node ${process.versions.node}`, () =>
    run('node', ['cjs.cjs'], { cwd: consumer }),
  );

  writeFileSync(
    join(consumer, 'entries.mjs'),
    `import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeKit } from 'qrcode-toolkit/node';
import { createBrowserKit } from 'qrcode-toolkit/browser';
import { checkExporterProvider, assertConformance } from 'qrcode-toolkit/testing';
import { createSvgExporter, createQRCodeKit } from 'qrcode-toolkit';
import { createJisX0208KanjiMapper } from 'qrcode-toolkit/kanji';
import { createQRCodeHandler } from 'qrcode-toolkit/http';

// the browser entry loads under Node without any DOM and only fails when a canvas is really needed
if (typeof globalThis.document !== 'undefined') throw new Error('unexpected DOM');
const browserKit = createBrowserKit();
await browserKit.generate({ data: 'x', format: 'png-blob' }).then(
  () => { throw new Error('expected a RuntimeUnavailableError'); },
  (error) => { if (error.code !== 'RUNTIME_UNAVAILABLE') throw error; },
);
const svg = await browserKit.generate({ data: 'x', format: 'svg' }); // universal formats still work
if (!svg.value.startsWith('<svg')) throw new Error('svg failed in browser kit');

const dir = mkdtempSync(join(tmpdir(), 'qtk-consumer-'));
const nodeKit = createNodeKit({ files: { baseDir: dir } });
const written = await nodeKit.generate({ data: 'file', format: 'png-file', path: 'out.png' });
if (readFileSync(join(dir, 'out.png'))[1] !== 0x50 || written.value.bytes < 50) throw new Error('file not written');
assertConformance(await checkExporterProvider(createSvgExporter()));

// the opt-in Kanji entry works without any platform Shift JIS support
const kit = createQRCodeKit({ kanji: createJisX0208KanjiMapper() });
const matrix = kit.encode({ data: '日本語の漢字', kanji: true });
if (matrix.segments[0].mode !== 'kanji') throw new Error('kanji mode not used');

// the HTTP handler answers a Fetch API request and refuses a bad one with a reason
const handler = createQRCodeHandler();
const image = await handler(new Request('https://example.com/qr?text=hi'));
if (image.status !== 200 || image.headers.get('content-type') !== 'image/png') throw new Error('handler did not return a PNG');
if ((await handler(new Request('https://example.com/qr'))).status !== 400) throw new Error('handler accepted a request without text');
`,
  );
  check('node, browser and testing entries work from the tarball', () =>
    run('node', ['entries.mjs'], { cwd: consumer }),
  );

  for (const example of ['basic', 'files', 'custom-provider', 'structured-append']) {
    check(`examples/node/${example}.mjs runs against the packed tarball`, () => {
      writeFileSync(
        join(consumer, `example-${example}.mjs`),
        readFileSync(join(root, 'examples', 'node', `${example}.mjs`), 'utf8'),
      );
      run('node', [`example-${example}.mjs`], { cwd: consumer });
    });
  }

  writeFileSync(
    join(consumer, 'cdn.mjs'),
    `import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const dir = 'node_modules/qrcode-toolkit/dist/bundles/';

// classic script: loads with no module system and exposes one global
const context = {};
runInNewContext(readFileSync(dir + 'qrcode-toolkit.min.js', 'utf8'), context);
const api = context.QRCodeToolkit;
for (const name of ['createQRCode', 'createQRCodeKit', 'createBrowserKit', 'segment', 'isQRCodeKitError']) {
  if (typeof api[name] === 'undefined') throw new Error('global QRCodeToolkit lacks ' + name);
}
const svg = (await api.createQRCode({ data: 'https://example.com', format: 'svg' })).value;
if (!svg.startsWith('<svg')) throw new Error('script bundle did not render an SVG');

// one ES module with no further imports
const esm = await import('./' + dir + 'qrcode-toolkit.esm.min.js');
if (esm.createQRCodeKit().generateSync({ data: 'x' }).value.slice(0, 4) !== '<svg') throw new Error('ESM bundle failed');
if (/\\bimport\\s*[("']\\./.test(readFileSync(dir + 'qrcode-toolkit.esm.min.js', 'utf8'))) throw new Error('ESM bundle imports other files');
`,
  );
  check('single-file bundles work as a classic script and as an ES module', () =>
    run('node', ['cdn.mjs'], { cwd: consumer }),
  );

  writeFileSync(
    join(consumer, 'bundle-entry.js'),
    `import { createQRCode } from 'qrcode-toolkit';
import { createBrowserKit } from 'qrcode-toolkit/browser';
globalThis.out = [createQRCode, createBrowserKit];
`,
  );
  check('bundles for the browser without Node.js built-ins (esbuild, platform=browser)', () => {
    const out = run(
      bin('esbuild'),
      [
        'bundle-entry.js',
        '--bundle',
        '--platform=browser',
        '--format=esm',
        '--minify',
        '--outfile=out.js',
        '--log-level=warning',
      ],
      { cwd: consumer },
    );
    const bundle = readFileSync(join(consumer, 'out.js'), 'utf8');
    assert(!/node:(fs|path|zlib|buffer)/.test(bundle), 'bundle references Node built-ins');
    assert(out.trim() === '', out);
  });
  check('the JIS X 0208 table is only bundled when qrcode-toolkit/kanji is imported', () => {
    const probe = '亜唖娃阿哀'; // consecutive JIS X 0208 level 1 kanji, present only in the embedded table
    const bundle = (name, source) => {
      writeFileSync(join(consumer, `${name}.js`), source);
      run(
        bin('esbuild'),
        [
          `${name}.js`,
          '--bundle',
          '--platform=browser',
          '--format=esm',
          '--minify',
          '--charset=utf8',
          `--outfile=${name}.out.js`,
        ],
        { cwd: consumer },
      );
      return readFileSync(join(consumer, `${name}.out.js`), 'utf8');
    };
    const main = bundle(
      'kanji-main',
      `import { createQRCode } from 'qrcode-toolkit';\nimport { createBrowserKit } from 'qrcode-toolkit/browser';\nglobalThis.x = [createQRCode, createBrowserKit];\n`,
    );
    assert(!main.includes(probe), 'the default bundle contains the JIS X 0208 table');
    const withTable = bundle(
      'kanji-opt',
      `import { createJisX0208KanjiMapper } from 'qrcode-toolkit/kanji';\nglobalThis.x = createJisX0208KanjiMapper;\n`,
    );
    assert(withTable.includes(probe), 'the kanji entry does not contain the table');
    console.log(
      `       (kanji entry bundle: ${String(Buffer.byteLength(withTable))} bytes minified)`,
    );
  });
  check('tree-shaking: importing one function does not pull in the rest of the API', () => {
    writeFileSync(
      join(consumer, 'shake.js'),
      `import { QRCodeKitError } from 'qrcode-toolkit';\nglobalThis.x = QRCodeKitError;\n`,
    );
    run(
      bin('esbuild'),
      [
        'shake.js',
        '--bundle',
        '--platform=browser',
        '--format=esm',
        '--minify',
        '--outfile=shake.out.js',
      ],
      { cwd: consumer },
    );
    const size = readFileSync(join(consumer, 'shake.out.js')).length;
    assert(
      size < 3000,
      `error-only bundle is ${String(size)} bytes; sideEffects/tree-shaking is not working`,
    );
  });

  writeFileSync(
    join(consumer, 'index.ts'),
    `import {
  createQRCode,
  createQRCodeKit,
  segment,
  InvalidInputError,
  isQRCodeKitError,
  type ErrorCode,
  type EncoderProvider,
  type GenerateResult,
} from 'qrcode-toolkit';
import { createNodeKit } from 'qrcode-toolkit/node';
import { createBrowserKit } from 'qrcode-toolkit/browser';
import { createJisX0208KanjiMapper } from 'qrcode-toolkit/kanji';
import { assertConformance, checkEncoderProvider } from 'qrcode-toolkit/testing';

async function main(): Promise<void> {
  const svg = await createQRCode({ data: 'x', format: 'svg' });
  const asString: string = svg.value;
  const png = await createQRCode({ data: 'x', format: 'png' });
  const asBytes: Uint8Array = png.value;
  const dflt = await createQRCode({ data: 'x' });
  const defaultIsString: string = dflt.value;
  const text = createQRCodeKit().generateSync({ data: [segment.numeric('123')], format: 'text' });
  const textValue: string = text.value;
  const typed: GenerateResult<'png-data-url'> = await createQRCode({ data: 'x', format: 'png-data-url' });
  const nodeKit = createNodeKit();
  const file = await nodeKit.generate({ data: 'x', format: 'png-file', path: 'a.png' });
  const fileBytes: number = file.value.bytes;
  const blob = await createBrowserKit().generate({ data: 'x', format: 'webp-blob' });
  const blobType: string = blob.value.type;
  // @ts-expect-error png output is bytes, not a string
  const wrong: string = png.value;
  // @ts-expect-error ecc is a closed union
  await createQRCode({ data: 'x', ecc: 'Z' });
  const code: ErrorCode = new InvalidInputError('x').code;
  void [asString, asBytes, defaultIsString, textValue, typed, fileBytes, blobType, wrong, code, isQRCodeKitError];
  const mapper = createJisX0208KanjiMapper().shiftJisCode(0x65e5);
  const mapped: number | undefined = mapper;
  void mapped;
  const provider: EncoderProvider | undefined = undefined;
  if (provider) assertConformance(await checkEncoderProvider(provider));
}
void main;
`,
  );
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        lib: ['ES2022'],
        types: [],
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      include: ['index.ts'],
    }),
  );
  check(
    'TypeScript consumer compiles against shipped declarations (no @types/node, no DOM lib)',
    () => run(bin('tsc'), ['-p', 'tsconfig.json'], { cwd: consumer }),
  );

  console.log('Package linters');
  check('publint', () => {
    // Lint the published files themselves (the unpacked tarball), not the workspace tree.
    const unpacked = join(work, 'publint');
    mkdirSync(unpacked);
    run('tar', ['-xzf', tarball, '-C', unpacked]);
    const out = run(
      bin('publint'),
      ['run', '--strict', '--pack', 'false', join(unpacked, 'package')],
      {
        cwd: root,
      },
    );
    assert(!/Errors:|Warnings:/.test(out), out);
  });
  check('are-the-types-wrong (esm-only profile)', () =>
    run(bin('attw'), [tarball, '--profile', 'esm-only', '--ignore-rules', 'cjs-resolves-to-esm'], {
      cwd: root,
    }),
  );
} catch (error) {
  failures.push('setup');
  console.error(error instanceof Error ? (error.stderr ?? error.message) : error);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nverify-package failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nverify-package passed');
