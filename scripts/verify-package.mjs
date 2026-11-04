// Verifies the *packed tarball*, not the source tree: contents allowlist, zero
// dependencies, ESM import, require(esm), TypeScript consumption, publint and
// "Are the types wrong?". Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bin = (name) => join(root, 'node_modules', '.bin', name);
const work = mkdtempSync(join(tmpdir(), 'qtk-verify-'));
const env = {
  ...process.env,
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
      error instanceof Error ? (error.stderr ?? error.stdout ?? error.message) : String(error);
    console.log(`  FAIL ${name}\n${String(detail).trim().replace(/^/gm, '       ')}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  if (!existsSync(join(root, 'dist', 'index.js'))) {
    throw new Error('dist/ is missing. Run `npm run build` first.');
  }

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
    const allowed = /^(package\.json|LICENSE|README\.md|CHANGELOG\.md|dist\/.+)$/;
    const unexpected = files.filter((f) => !allowed.test(f));
    assert(unexpected.length === 0, `unexpected files: ${unexpected.join(', ')}`);
  });
  check('required files are present', () => {
    for (const f of ['package.json', 'LICENSE', 'README.md', 'dist/index.js', 'dist/index.d.ts']) {
      assert(files.includes(f), `missing ${f}`);
    }
  });
  check('packed package.json declares no dependencies', () => {
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

  const expectedExports = ['QRCodeKitError', 'InvalidInputError', 'isQRCodeKitError'];

  writeFileSync(
    join(consumer, 'esm.mjs'),
    `import * as kit from 'qrcode-toolkit';
for (const name of ${JSON.stringify(expectedExports)}) if (!(name in kit)) throw new Error('missing export ' + name);
const e = new kit.InvalidInputError('x');
if (!(e instanceof kit.QRCodeKitError) || e.code !== 'INVALID_INPUT') throw new Error('bad error class');
`,
  );
  check('ESM import works', () => run('node', ['esm.mjs'], { cwd: consumer }));

  writeFileSync(
    join(consumer, 'cjs.cjs'),
    `const kit = require('qrcode-toolkit');
for (const name of ${JSON.stringify(expectedExports)}) if (!(name in kit)) throw new Error('missing export ' + name);
if (!kit.isQRCodeKitError(new kit.InvalidInputError('x'))) throw new Error('guard failed');
`,
  );
  check(`require(esm) works on Node ${process.versions.node}`, () =>
    run('node', ['cjs.cjs'], { cwd: consumer }),
  );

  writeFileSync(
    join(consumer, 'index.ts'),
    `import { InvalidInputError, isQRCodeKitError, type ErrorCode } from 'qrcode-toolkit';
const code: ErrorCode = new InvalidInputError('x').code;
const guarded: unknown = new InvalidInputError('x');
if (isQRCodeKitError(guarded)) {
  const c: ErrorCode = guarded.code;
  void c;
}
// @ts-expect-error codes are a closed union
const bad: ErrorCode = 'NOT_A_CODE';
void code;
void bad;
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
  check('TypeScript consumer compiles against shipped declarations', () =>
    run(bin('tsc'), ['-p', 'tsconfig.json'], { cwd: consumer }),
  );

  console.log('Package linters');
  check('publint', () => {
    const out = run(bin('publint'), ['run', '--strict', '--pack', 'false'], { cwd: root });
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
