// Bundles the playground into one static folder (playground-dist/) that works from any static
// host or straight from disk (file://), with the package code inlined from dist/.
//   npm run playground:build
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'playground-dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

execFileSync(
  join(root, 'node_modules', '.bin', 'esbuild'),
  [
    join(root, 'playground/js/main.js'),
    '--bundle',
    '--format=iife',
    '--platform=browser',
    '--target=es2022',
    '--minify',
    `--outfile=${join(out, 'app.js')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

// One self-contained file: styles and script inline, so it can be opened from disk, attached
// to a ticket or dropped on any static host.
const css = await readFile(join(root, 'playground/css/styles.css'), 'utf8');
const js = (await readFile(join(out, 'app.js'), 'utf8')).replaceAll('</script', '<\\/script');
const html = (await readFile(join(root, 'playground/index.html'), 'utf8'))
  .replace('<link rel="stylesheet" href="css/styles.css" />', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${js}\n</script>`);
await writeFile(join(out, 'index.html'), html);
await rm(join(out, 'app.js'));
await rm(join(out, 'css'), { recursive: true, force: true });
console.log(`playground built: ${join(out, 'index.html')}`);
