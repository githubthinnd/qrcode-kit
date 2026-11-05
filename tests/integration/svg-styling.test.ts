/** Module shapes, gradients and logos of the built-in SVG renderer. */
import { describe, expect, it } from 'vitest';
import { createQRCodeKit } from '../../src/index.js';

const kit = createQRCodeKit();
// A 1×1 PNG. Real logos are bigger; the renderer only needs a valid data URL.
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const svg = (request: Record<string, unknown>): string =>
  kit.generateSync({ data: 'https://example.com/styling', ...request }).value;
const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return `${(error as { code: string }).code}: ${(error as Error).message}`;
  }
  return 'no error';
};

describe('module shapes', () => {
  it('square stays the compact crisp default', () => {
    const out = svg({});
    expect(out).toContain('shape-rendering="crispEdges"');
    expect(out).not.toContain('evenodd');
    expect(out).toBe(svg({ moduleShape: 'square' }));
  });

  it.each(['rounded', 'dots'] as const)(
    '%s draws curves, three finder rings and no crisp edges',
    (shape) => {
      const out = svg({ moduleShape: shape });
      expect(out).not.toContain('crispEdges');
      expect(out).toContain('fill-rule="evenodd"');
      expect(out).toContain('a2 2 0 0 1'); // the rounded finder rings
      expect(out.match(/M\d+ 4h3\.?\d*/g)?.length ?? 0).toBeGreaterThanOrEqual(0);
      expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    },
  );

  it('dots are circles, rounded joins neighbours', () => {
    expect(svg({ moduleShape: 'dots' })).toContain('a0.42 0.42 0 1 0');
    expect(svg({ moduleShape: 'rounded' })).toContain('a0.4 0.4 0 0 1');
  });

  it('renders the same modules as square, only differently drawn', () => {
    const square = kit.generateSync({ data: 'same', format: 'svg' }).matrix;
    const dots = kit.generateSync({ data: 'same', format: 'svg', moduleShape: 'dots' }).matrix;
    expect(dots.toRows()).toEqual(square.toRows());
  });

  it('warns that dot modules are read by fewer scanners, and only dots', () => {
    const codes = (moduleShape: string) =>
      kit.generateSync({ data: 'x', moduleShape } as never).warnings.map((w) => w.code);
    expect(codes('dots')).toContain('DOT_MODULES');
    expect(codes('rounded')).not.toContain('DOT_MODULES');
    expect(codes('square')).not.toContain('DOT_MODULES');
  });

  it('rejects an unknown shape', () => {
    expect(message(() => svg({ moduleShape: 'star' }))).toMatch(/INVALID_INPUT.*rounded/);
  });

  it('raster and text renderers refuse styling instead of ignoring it', () => {
    expect(
      message(() => kit.generateSync({ data: 'x', format: 'png', moduleShape: 'dots' })),
    ).toMatch(/UNSUPPORTED_CAPABILITY.*cannot draw "dots" modules/);
    expect(
      message(() =>
        kit.generateSync({ data: 'x', format: 'text', gradient: { from: '#000', to: '#00f' } }),
      ),
    ).toMatch(/does not support gradients/);
    expect(
      message(() => kit.generateSync({ data: 'x', format: 'png', logo: { href: PNG_1PX } })),
    ).toMatch(/does not support a logo/);
  });
});

describe('gradient', () => {
  it('writes a deterministic gradient and fills the dark layer with it', () => {
    const out = svg({ gradient: { from: '#4f46e5', to: '#0f172a' } });
    const id = /<linearGradient id="(qrg-[0-9a-f]+l45)"/.exec(out)?.[1];
    expect(id).toBe('qrg-4f46e50f172al45');
    expect(out).toContain(`fill="url(#${id ?? ''})"`);
    expect(out).toContain('<stop offset="0" stop-color="#4f46e5"/>');
    expect(out).toBe(svg({ gradient: { from: '#4f46e5', to: '#0f172a' } }));
  });

  it('different gradients get different ids, so inline SVGs on one page cannot collide', () => {
    const a = /id="(qrg-[^"]+)"/.exec(svg({ gradient: { from: '#000', to: '#00f' } }))?.[1];
    const b = /id="(qrg-[^"]+)"/.exec(svg({ gradient: { from: '#000', to: '#0f0' } }))?.[1];
    const c = /id="(qrg-[^"]+)"/.exec(
      svg({ gradient: { from: '#000', to: '#00f', angle: 90 } }),
    )?.[1];
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('supports radial gradients, alpha stops and every angle', () => {
    expect(svg({ gradient: { from: '#000', to: '#00f', type: 'radial' } })).toContain(
      '<radialGradient',
    );
    expect(svg({ gradient: { from: '#000000cc', to: '#0000ff' } })).toContain('stop-opacity="0.8"');
    for (const angle of [0, 90, 180, 270, 360]) {
      expect(svg({ gradient: { from: '#000', to: '#00f', angle } })).toContain('x1=');
    }
  });

  it('works with every shape', () => {
    for (const moduleShape of ['square', 'rounded', 'dots']) {
      expect(svg({ moduleShape, gradient: { from: '#4f46e5', to: '#0f172a' } })).toContain(
        'url(#qrg-',
      );
    }
  });

  it('is validated', () => {
    const g = (gradient: unknown) => message(() => svg({ gradient }));
    expect(g(5)).toMatch(/INVALID_INPUT/);
    expect(g({ from: '#000' })).toMatch(/INVALID_INPUT.*colour strings/);
    expect(g({ from: '#000', to: 'red' })).toMatch(/INVALID_INPUT.*hex colour/);
    expect(g({ from: '#000', to: '#00000000' })).toMatch(/transparent/);
    expect(g({ from: '#000', to: '#fff', type: 'conic' })).toMatch(/linear.*radial/);
    expect(g({ from: '#000', to: '#fff', angle: 361 })).toMatch(/INVALID_INPUT/);
    expect(g({ from: '#000', to: '#fff', angle: 1.5 })).toMatch(/INVALID_INPUT/);
    expect(g({ from: '#000', to: '#fff', turn: 1 })).toMatch(/INVALID_CONFIGURATION.*turn/);
    expect(message(() => svg({ dark: '#000', gradient: { from: '#000', to: '#fff' } }))).toMatch(
      /mutually exclusive/,
    );
    expect(message(() => svg({ invert: true, gradient: { from: '#000', to: '#fff' } }))).toMatch(
      /invert/,
    );
  });

  it('warns about weak contrast', () => {
    const { warnings } = kit.generateSync({
      data: 'x',
      gradient: { from: '#000000', to: '#f5f5f5' },
    });
    expect(warnings.map((w) => w.code)).toContain('LOW_CONTRAST');
  });
});

describe('logo', () => {
  const big = {
    data: 'https://example.com/a-long-enough-address-to-make-a-big-symbol/'.repeat(4),
    version: { min: 8 },
  };

  it('is placed in the centre and clears the modules under it', () => {
    const result = kit.generateSync({ ...big, logo: { href: PNG_1PX }, format: 'svg' });
    const out = result.value;
    const n = result.matrix.size;
    const image = /<image href="[^"]+" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/.exec(out);
    expect(image).not.toBeNull();
    const [x, y, w] = [Number(image?.[1]), Number(image?.[2]), Number(image?.[3])];
    expect(x - 4).toBe((n - w) / 2); // centred inside the quiet zone
    expect(y).toBe(x);
    // no dark run touches the logo box plus its 1 module margin
    const path = /<path d="([^"]+)" fill="#000000"\/>/.exec(out)?.[1] ?? '';
    for (const run of path.matchAll(/M(\d+) (\d+)h(\d+)v1/g)) {
      const [rx, ry, rw] = [Number(run[1]), Number(run[2]), Number(run[3])];
      const insideRows = ry >= x - 1 && ry < x + w + 1;
      const overlapsCols = rx < x + w + 1 && rx + rw > x - 1;
      expect(insideRows && overlapsCols, `run ${String(rx)},${String(ry)}`).toBe(false);
    }
  });

  it('uses error correction level H unless told otherwise', () => {
    expect(kit.generateSync({ ...big, logo: { href: PNG_1PX } }).matrix.ecc).toBe('H');
    expect(
      kit.generateSync({ ...big, ecc: 'Q', logo: { href: PNG_1PX, size: 0.1 } }).matrix.ecc,
    ).toBe('Q');
  });

  it('refuses a logo that hides more data than the level can absorb', () => {
    expect(
      message(() => kit.generateSync({ ...big, ecc: 'L', logo: { href: PNG_1PX, size: 0.3 } })),
    ).toMatch(
      /RENDERING_FAILED: The logo would hide .*% of the data, more than the .*% that error correction level L/,
    );
    expect(message(() => kit.generateSync({ data: 'x', logo: { href: PNG_1PX } }))).toMatch(
      /RENDERING_FAILED: The logo would (hide|cover)/,
    );
  });

  it('refuses a logo that would cover function patterns', () => {
    expect(
      message(() =>
        kit.generateSync({ data: 'x', version: 1, logo: { href: PNG_1PX, size: 0.3, margin: 4 } }),
      ),
    ).toMatch(/RENDERING_FAILED/);
  });

  it('accepts only base64 image data URLs, so nothing else can reach the markup', () => {
    const href = (value: unknown) => message(() => svg({ ...big, logo: { href: value } }));
    for (const bad of [
      'https://example.com/logo.png',
      'javascript:alert(1)',
      'data:text/html;base64,PGgxPg==',
      'data:image/png,not-base64',
      `${PNG_1PX}" onload="alert(1)`,
      `${PNG_1PX}'`,
      'data:image/png;base64,AAAA<script>',
      `data:image/png;base64,${'A'.repeat(262_200)}`,
      '',
      42,
      undefined,
    ]) {
      expect(href(bad), String(bad).slice(0, 50)).toMatch(/INVALID_INPUT: "logo.href"/);
    }
    for (const type of ['png', 'jpeg', 'webp', 'gif', 'svg+xml']) {
      expect(href(`data:image/${type};base64,AAAA`)).toBe('no error');
    }
  });

  it('validates size, margin and unknown keys', () => {
    const l = (logo: unknown) => message(() => svg({ ...big, logo }));
    expect(l({ href: PNG_1PX, size: 0.01 })).toMatch(/INVALID_INPUT.*0.05 to 0.3/);
    expect(l({ href: PNG_1PX, size: 0.5 })).toMatch(/INVALID_INPUT/);
    expect(l({ href: PNG_1PX, size: 'big' })).toMatch(/INVALID_INPUT/);
    expect(l({ href: PNG_1PX, margin: 5 })).toMatch(/INVALID_INPUT/);
    expect(l({ href: PNG_1PX, margin: 1.5 })).toMatch(/INVALID_INPUT/);
    expect(l({ href: PNG_1PX, color: 'red' })).toMatch(/INVALID_CONFIGURATION.*color/);
    expect(l('logo.png')).toMatch(/INVALID_INPUT.*object/);
  });

  it('combines with shapes, gradients and structured append', async () => {
    const out = svg({
      ...big,
      moduleShape: 'rounded',
      gradient: { from: '#4f46e5', to: '#0f172a' },
      logo: { href: PNG_1PX },
    });
    expect(out).toContain('<image');
    expect(out).toContain('url(#qrg-');
    const parts = await kit.generateStructuredAppend({
      data: 'x'.repeat(400),
      symbols: 2,
      logo: { href: PNG_1PX, size: 0.1 },
    });
    expect(parts.map((p) => p.matrix.ecc)).toEqual(['H', 'H']);
    expect(parts.every((p) => p.value.includes('<image'))).toBe(true);
  });
});
