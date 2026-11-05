// Runs the framework snippets of the README for real, against the packed tarball.
//   npm run verify:frameworks        (needs network: it installs React, Vue and Svelte from npm)
//
// The code is taken from README.md itself, so the guide cannot drift from what is tested:
//   React   server-side render of the component
//   Vue 3   SFC compiled for SSR and rendered
//   Svelte  component compiled for the server and rendered
//   Next.js the Route Handler (`GET`) called with a Web Request
// Angular, Astro, Nuxt and SvelteKit snippets are not executed here; they rely on each framework's
// own compiler or server and are listed as such in the output.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'qtk-frameworks-'));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_')),
);
const sh = (cmd, args, cwd = work) =>
  execFileSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const readme = readFileSync(join(root, 'README.md'), 'utf8');
function snippet(title, lang, index = 0) {
  const start = readme.indexOf(`<summary><b>${title}`);
  if (start === -1) throw new Error(`README section "${title}" not found`);
  const end = readme.indexOf('</details>', start);
  const body = readme.slice(start, end);
  const blocks = [...body.matchAll(/```([a-z]+)\n([\s\S]*?)```/g)].filter((m) => m[1] === lang);
  if (blocks[index] === undefined) throw new Error(`No ${lang} block #${index} in "${title}"`);
  return blocks[index][2];
}

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(
      `  FAIL ${name}\n       ${String(error instanceof Error ? error.message : error).split('\n')[0]}`,
    );
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

try {
  if (!existsSync(join(root, 'dist/index.js'))) sh('npm', ['run', 'build'], root);
  console.log('Packing and installing into a scratch project…');
  const packed = JSON.parse(sh('npm', ['pack', '--json', '--pack-destination', work], root));
  const tarball = join(work, packed[0].filename);
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({ name: 'scratch', private: true, type: 'module' }),
  );
  sh('npm', [
    'install',
    tarball,
    'react@19',
    'react-dom@19',
    'vue@3',
    '@vue/compiler-sfc@3',
    'svelte@5',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  const { transformSync, buildSync } = await import(
    pathToUrl(join(root, 'node_modules/esbuild/lib/main.js'))
  );

  const URL_TEXT = 'https://example.com/invite/42';
  const expectImg = (html, label) => {
    expect(html.includes('<img'), 'no <img> in the output');
    expect(/src="data:image\/(svg\+xml|png)/.test(html), 'img src is not a data URL');
    expect(html.includes(`alt="${label}"`), `alt text "${label}" missing`);
  };

  console.log('Frameworks');

  await check('React: component renders on the server, deterministically', () => {
    writeFileSync(join(work, 'QRCode.tsx'), snippet('React', 'tsx', 0));
    writeFileSync(
      join(work, 'react-entry.tsx'),
      `import { renderToString } from 'react-dom/server';
       import { QRCode } from './QRCode';
       const a = renderToString(<QRCode value="${URL_TEXT}" label="Scan to join" />);
       const b = renderToString(<QRCode value="${URL_TEXT}" label="Scan to join" />);
       const empty = renderToString(<QRCode value="" />);
       console.log(JSON.stringify({ a, same: a === b, empty }));`,
    );
    buildSync({
      entryPoints: [join(work, 'react-entry.tsx')],
      outfile: join(work, 'react-entry.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'qrcode-toolkit'],
      logLevel: 'silent',
    });
    const out = JSON.parse(sh('node', ['react-entry.mjs']));
    expectImg(out.a, 'Scan to join');
    expect(out.same, 'two renders differ (hydration risk)');
    expect(!out.empty.includes('<img'), 'an empty value should render nothing');
    return `${out.a.length} chars`;
  });

  await check('Vue 3: SFC compiles for SSR and renders', async () => {
    const { parse, compileScript } = await import(
      pathToUrl(join(work, 'node_modules/@vue/compiler-sfc/dist/compiler-sfc.cjs.js'))
    ).then((m) => m.default ?? m);
    const { descriptor, errors } = parse(snippet('Vue 3', 'vue', 0), { filename: 'QrCode.vue' });
    expect(errors.length === 0, `parse errors: ${errors.map(String).join('; ')}`);
    const script = compileScript(descriptor, {
      id: 'qr',
      inlineTemplate: true,
      templateOptions: { ssr: true },
    });
    const js = transformSync(script.content, { loader: 'ts', format: 'esm' }).code;
    writeFileSync(join(work, 'QrCode.mjs'), js);
    writeFileSync(
      join(work, 'vue-entry.mjs'),
      `import { createSSRApp } from 'vue';
       import { renderToString } from 'vue/server-renderer';
       import QrCode from './QrCode.mjs';
       const html = await renderToString(createSSRApp(QrCode, { value: '${URL_TEXT}', label: 'Scan to join' }));
       const again = await renderToString(createSSRApp(QrCode, { value: '${URL_TEXT}', label: 'Scan to join' }));
       const empty = await renderToString(createSSRApp(QrCode, { value: '' }));
       console.log(JSON.stringify({ html, same: html === again, empty }));`,
    );
    const out = JSON.parse(sh('node', ['vue-entry.mjs']));
    expectImg(out.html, 'Scan to join');
    expect(out.same, 'two renders differ');
    expect(!out.empty.includes('<img'), 'an empty value should render nothing');
  });

  await check('Svelte 5: component compiles for the server and renders', async () => {
    const { compile } = await import(
      pathToUrl(join(work, 'node_modules/svelte/src/compiler/index.js'))
    );
    const compiled = compile(snippet('Svelte 5', 'svelte', 0), {
      generate: 'server',
      filename: 'QrCode.svelte',
    });
    writeFileSync(join(work, 'QrCodeSvelte.mjs'), compiled.js.code);
    writeFileSync(
      join(work, 'svelte-entry.mjs'),
      `import { render } from 'svelte/server';
       import QrCode from './QrCodeSvelte.mjs';
       const { body } = render(QrCode, { props: { value: '${URL_TEXT}', label: 'Scan to join' } });
       const empty = render(QrCode, { props: { value: '' } }).body;
       console.log(JSON.stringify({ body, empty }));`,
    );
    const out = JSON.parse(sh('node', ['svelte-entry.mjs']));
    expectImg(out.body, 'Scan to join');
    expect(!out.empty.includes('<img'), 'an empty value should render nothing');
  });

  await check('Next.js: the Route Handler returns a PNG and rejects bad input', async () => {
    const js = transformSync(snippet('Next.js', 'ts', 0), { loader: 'ts', format: 'esm' }).code;
    writeFileSync(join(work, 'route.mjs'), js);
    writeFileSync(
      join(work, 'route-entry.mjs'),
      `import { GET } from './route.mjs';
       const ok = await GET(new Request('http://localhost/api/qr?text=hello'));
       const bytes = new Uint8Array(await ok.arrayBuffer());
       const missing = await GET(new Request('http://localhost/api/qr'));
       const long = await GET(new Request('http://localhost/api/qr?text=' + 'x'.repeat(1001)));
       console.log(JSON.stringify({ status: ok.status, type: ok.headers.get('content-type'), png: [...bytes.slice(0, 4)], missing: missing.status, long: long.status }));`,
    );
    const out = JSON.parse(sh('node', ['route-entry.mjs']));
    expect(
      out.status === 200 && out.type === 'image/png',
      `status ${out.status}, type ${out.type}`,
    );
    expect(out.png.join(',') === '137,80,78,71', 'body is not a PNG');
    expect(out.missing === 400 && out.long === 400, 'bad input should give 400');
  });

  console.log(
    'Not executed here: Angular, Astro, Nuxt (h3 route) and SvelteKit (endpoint) snippets.',
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

function pathToUrl(path) {
  return new URL(`file://${path}`).href;
}
const failed = results.filter((r) => !r.ok).length;
console.log(
  failed === 0
    ? `\nverify-frameworks passed (${results.length})`
    : `\nverify-frameworks failed: ${failed}`,
);
process.exit(failed === 0 ? 0 : 1);
