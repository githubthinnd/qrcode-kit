import { renderToString } from '@vue/server-renderer';
import { createQRCodeKit } from 'qrcode-toolkit';
import { createSSRApp, h, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { QRCode, generateQRCode, useQRCode } from '../src/index.js';

const render = (
  props: Record<string, unknown>,
  slots?: Record<string, () => unknown>,
): Promise<string> =>
  renderToString(createSSRApp({ render: () => h(QRCode, props as never, slots as never) }));
const LOGO =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=';

describe('<QRCode> in Vue', () => {
  it('renders an <img> with a data URL, size and alt text', async () => {
    const html = await render({
      value: 'https://example.com/invite/42',
      size: 220,
      label: 'Scan to join',
    });
    expect(html).toMatch(/^<img src="data:image\/svg\+xml;charset=utf-8,/);
    expect(html).toContain('width="220"');
    expect(html).toContain('alt="Scan to join"');
  });

  it('renders identically every time', async () => {
    const props = { value: 'hydration', ecc: 'Q', moduleShape: 'rounded' };
    expect(await render(props)).toBe(await render(props));
  });

  it('does not turn absent Boolean props into false options', async () => {
    // `invert: false` / `kanji: false` would be harmless, but `gradient` + `invert: false` must still work
    const html = await render({ value: 'x', gradient: { from: '#312e81', to: '#0f172a' } });
    expect(decodeURIComponent(html)).toContain('qrg-');
  });

  it('passes options through', async () => {
    expect(decodeURIComponent(await render({ value: 'x', moduleShape: 'rounded' }))).toContain(
      'evenodd',
    );
    expect(await render({ value: 'x', dark: '#1e1b4b' })).toContain('1e1b4b');
    const withLogo = await render({
      value: 'https://example.com/a-longer-address-for-a-bigger-symbol',
      logo: { href: LOGO, size: 0.1 },
    });
    expect(decodeURIComponent(withLogo)).toContain('<image');
  });

  it('supports bytes, PNG and `scale`', async () => {
    expect(await render({ value: Uint8Array.of(1, 2, 3) })).toContain(
      '<img src="data:image/svg+xml',
    );
    expect(await render({ value: 'x', format: 'png' })).toContain(
      '<img src="data:image/png;base64,',
    );
    expect(decodeURIComponent(await render({ value: 'x', scale: 3, size: 100 }))).toContain(
      'width="87"',
    );
  });

  it('renders nothing, or the fallback slot, for content that cannot be encoded', async () => {
    expect(await render({ value: '' })).toBe('<!---->');
    expect(await render({ value: '' }, { fallback: () => h('em', 'No code') })).toBe(
      '<span><em>No code</em></span>',
    );
  });

  it('throws on programming mistakes instead of hiding them', async () => {
    await expect(
      render({ value: 'x', ecc: 'H', moduleShape: 'rounded', format: 'png' }),
    ).rejects.toThrow(/cannot draw/);
  });

  it('uses a custom kit when given one', async () => {
    const kit = createQRCodeKit({ limits: { maxInputLength: 5 } });
    expect(await render({ value: 'toolong', kit })).toBe('<!---->');
  });
});

describe('useQRCode', () => {
  it('follows reactive inputs', () => {
    const value = ref('first');
    const result = useQRCode(value, () => ({ ecc: 'L' as const }));
    const first = result.value.src;
    expect(first?.startsWith('data:image/svg+xml')).toBe(true);
    value.value = 'second';
    expect(result.value.src).not.toBe(first);
    value.value = '';
    expect(result.value.error?.code).toBe('INVALID_INPUT');
  });

  it('generateQRCode returns the matrix and warnings', () => {
    expect(generateQRCode('hello', { quietZone: 0 }).warnings.map((w) => w.code)).toContain(
      'QUIET_ZONE_SMALL',
    );
  });
});
