import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateQRCode } from '../src/qr.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const build = join(here, '.build');
const LOGO =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=';

type Component = Parameters<typeof render>[0];
let QRCode: Component;

beforeAll(async () => {
  mkdirSync(build, { recursive: true });
  const source = readFileSync(join(here, '../src/QRCode.svelte'), 'utf8');
  const compiled = compile(source, { generate: 'server', filename: 'QRCode.svelte' });
  // the compiled component imports ./qr.js; point it at the real file
  const code = compiled.js.code.replace(
    "'./qr.js'",
    JSON.stringify(pathToFileURL(join(here, '../src/qr.js')).href),
  );
  const file = join(build, 'QRCode.mjs');
  writeFileSync(file, code);
  QRCode = ((await import(/* @vite-ignore */ pathToFileURL(file).href)) as { default: Component })
    .default;
});
afterAll(() => {
  rmSync(build, { recursive: true, force: true });
});

const html = (props: Record<string, unknown>): string =>
  render(QRCode, { props: props as never }).body;

describe('<QRCode> in Svelte 5', () => {
  it('renders an <img> with a data URL, size and alt text', () => {
    const out = html({ value: 'https://example.com/invite/42', size: 220, label: 'Scan to join' });
    expect(out).toMatch(/<img src="data:image\/svg\+xml;charset=utf-8,/);
    expect(out).toContain('width="220"');
    expect(out).toContain('alt="Scan to join"');
  });

  it('renders identically every time', () => {
    const props = { value: 'hydration', ecc: 'Q', moduleShape: 'rounded' };
    expect(html(props)).toBe(html(props));
  });

  it('passes options through', () => {
    expect(decodeURIComponent(html({ value: 'x', moduleShape: 'rounded' }))).toContain('evenodd');
    expect(html({ value: 'x', dark: '#1e1b4b' })).toContain('1e1b4b');
    const withLogo = html({
      value: 'https://example.com/a-longer-address-for-a-bigger-symbol',
      logo: { href: LOGO, size: 0.1 },
    });
    expect(decodeURIComponent(withLogo)).toContain('<image');
  });

  it('supports bytes, PNG and `scale`', () => {
    expect(html({ value: Uint8Array.of(1, 2, 3) })).toContain('<img src="data:image/svg+xml');
    expect(html({ value: 'x', format: 'png' })).toContain('<img src="data:image/png;base64,');
    expect(decodeURIComponent(html({ value: 'x', scale: 3, size: 100 }))).toContain('width="87"');
  });

  it('renders nothing for content that cannot be encoded', () => {
    expect(html({ value: '' })).not.toContain('<img');
  });

  it('throws on programming mistakes instead of hiding them', () => {
    expect(() => html({ value: 'x', colour: 'red' })).toThrow(/Unknown option: colour/);
  });
});

describe('generateQRCode', () => {
  it('returns the matrix and warnings, or the error', () => {
    const ok = generateQRCode('hello', { quietZone: 0 });
    expect(ok.matrix?.version).toBe(1);
    expect(ok.warnings.map((w) => w.code)).toContain('QUIET_ZONE_SMALL');
    expect(generateQRCode('').error?.code).toBe('INVALID_INPUT');
  });
});
