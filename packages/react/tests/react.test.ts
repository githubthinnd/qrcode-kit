import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createQRCodeKit } from 'qrcode-toolkit';
import { describe, expect, it } from 'vitest';
import { QRCode, generateQRCode } from '../src/index.js';

const render = (props: Parameters<typeof QRCode>[0]): string =>
  renderToString(createElement(QRCode, props));
const LOGO =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=';

describe('<QRCode> in React', () => {
  it('renders an <img> with a data URL, size and alt text', () => {
    const html = render({
      value: 'https://example.com/invite/42',
      size: 220,
      label: 'Scan to join',
    });
    expect(html).toMatch(/^<img src="data:image\/svg\+xml;charset=utf-8,/);
    expect(html).toContain('width="220"');
    expect(html).toContain('height="220"');
    expect(html).toContain('alt="Scan to join"');
  });

  it('renders identically every time, so server and client markup match', () => {
    const props = { value: 'hydration', ecc: 'Q', moduleShape: 'rounded' } as const;
    expect(render(props)).toBe(render(props));
  });

  it('passes every qrcode-toolkit option through', () => {
    const rounded = decodeURIComponent(render({ value: 'x', moduleShape: 'rounded' }));
    expect(rounded).toContain('fill-rule="evenodd"');
    expect(render({ value: 'x', dark: '#1e1b4b' })).toContain('1e1b4b');
    const withLogo = render({
      value: 'https://example.com/a-longer-address-for-a-bigger-symbol',
      logo: { href: LOGO, size: 0.1 },
    });
    expect(decodeURIComponent(withLogo)).toContain('<image');
  });

  it('encodes bytes and supports PNG output', () => {
    expect(render({ value: Uint8Array.of(1, 2, 3) })).toContain('<img src="data:image/svg+xml');
    expect(render({ value: 'x', format: 'png' })).toContain('<img src="data:image/png;base64,');
  });

  it('lets `scale` take over from `size`', () => {
    const html = decodeURIComponent(render({ value: 'x', scale: 3, size: 100 }));
    expect(html).toContain('width="87"'); // 29 modules × 3, not 100
  });

  it('renders nothing, or the fallback, for content that cannot be encoded', () => {
    expect(render({ value: '' })).toBe('');
    expect(render({ value: 'x'.repeat(70_000) })).toBe('');
    expect(render({ value: '', fallback: 'No code' })).toBe('<span>No code</span>');
  });

  it('throws on programming mistakes instead of hiding them', () => {
    expect(() => render({ value: 'x', colour: 'red' } as never)).toThrow(/Unknown option: colour/);
    expect(() => render({ value: 'x', moduleShape: 'rounded', format: 'png' })).toThrow(
      /cannot draw/,
    );
  });

  it('uses a custom kit when given one', () => {
    const kit = createQRCodeKit({ limits: { maxInputLength: 5 } });
    expect(render({ value: 'toolong', kit })).toBe('');
    expect(render({ value: 'ok', kit })).toContain('<img');
  });
});

describe('generateQRCode', () => {
  it('returns the matrix and warnings, or the error', () => {
    const ok = generateQRCode('hello', { quietZone: 0 });
    expect(ok.src?.startsWith('data:image/svg+xml')).toBe(true);
    expect(ok.matrix?.version).toBe(1);
    expect(ok.warnings.map((w) => w.code)).toContain('QUIET_ZONE_SMALL');
    expect(ok.error).toBeUndefined();
    const bad = generateQRCode('');
    expect(bad.src).toBeUndefined();
    expect(bad.error?.code).toBe('INVALID_INPUT');
  });
});
