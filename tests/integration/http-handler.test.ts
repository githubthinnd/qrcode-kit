import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { createQRCodeHandler, type QRCodeHandlerOptions } from '../../src/http.js';
import { createQRCodeKit } from '../../src/index.js';

const call = (
  query: string,
  options?: QRCodeHandlerOptions,
  init?: RequestInit,
): Promise<Response> =>
  createQRCodeHandler(options)(new Request(`https://example.com/api/qr${query}`, init));
const png = async (response: Response): Promise<PNG> =>
  PNG.sync.read(Buffer.from(await response.arrayBuffer()));

describe('createQRCodeHandler', () => {
  it('returns a PNG by default, with cache and safety headers', async () => {
    const response = await call('?text=hello');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const image = await png(response);
    expect(image.width).toBe(232); // version 1, quiet zone 4, 8 px per module
  });

  it('returns an SVG with a locked-down CSP when asked', async () => {
    const response = await call('?text=hello&format=svg');
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await response.text()).toMatch(/^<svg /);
  });

  it('honours size, ecc, margin, colours and shape', async () => {
    const svg = await (
      await call(
        '?text=hello&format=svg&shape=rounded&dark=1e1b4b&light=%23ffffff&ecc=q&margin=2&size=300',
      )
    ).text();
    expect(svg).toContain('width="300"');
    expect(svg).toContain('fill="#1e1b4b"');
    expect(svg).toContain('fill-rule="evenodd"');
    const image = await png(await call('?text=hello&size=256&margin=0'));
    expect(image.width).toBeLessThanOrEqual(256);
    expect(image.width).toBeGreaterThan(200);
  });

  it('uses the first allowed format as the default', async () => {
    const response = await call('?text=x', { formats: ['svg'] });
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect((await call('?text=x&format=png', { formats: ['svg'] })).status).toBe(400);
  });

  it('is strict about what it is given', async () => {
    const reason = async (response: Response): Promise<string> =>
      `${String(response.status)} ${await response.text()}`;
    expect(await reason(await call(''))).toMatch(/^400 Add the text to encode as \?text=/);
    expect(await reason(await call('?text='))).toMatch(/^400/);
    expect(await reason(await call(`?text=${'x'.repeat(1001)}`))).toMatch(
      /^400 The text is too long: at most 1000 characters/,
    );
    expect(await reason(await call('?text=x&colour=red'))).toMatch(
      /^400 Unknown parameter "colour"\. Use: text, format/,
    );
    expect(await reason(await call('?text=x&size=5000'))).toMatch(
      /^400 "size" must be a whole number from 1 to 1024/,
    );
    expect(await reason(await call('?text=x&size=abc'))).toMatch(/^400 "size"/);
    expect(await reason(await call('?text=x&ecc=Z'))).toMatch(/^400 "ecc" must be L, M, Q or H/);
    expect(await reason(await call('?text=x&shape=star'))).toMatch(/^400 "shape" must be/);
    expect(await reason(await call('?text=x&format=gif'))).toMatch(
      /^400 "format" must be png or svg/,
    );
    expect(await reason(await call('?text=x&dark=red'))).toMatch(/^400 .*hex colour/);
  });

  it('turns library refusals into 400 and 422, never leaking the text', async () => {
    const secret = 'S3CR3T-PAYLOAD';
    const styled = await call(`?text=${secret}&shape=dots`);
    expect(styled.status).toBe(200); // a shape without a format selects SVG
    expect(styled.headers.get('content-type')).toBe('image/svg+xml');
    const png400 = await call(`?text=${secret}&shape=dots&format=png`);
    expect(png400.status).toBe(400);
    expect(await png400.text()).not.toContain(secret);
    const tooBig = await call(`?text=${'9'.repeat(5000)}&ecc=H`, { maxLength: 6000 });
    expect(tooBig.status).toBe(422);
  });

  it('accepts only GET and HEAD', async () => {
    const post = await call('?text=x', undefined, { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    const head = await call('?text=x', undefined, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-type')).toBe('image/png');
  });

  it('can narrow what clients control, and pin defaults', async () => {
    const options: QRCodeHandlerOptions = {
      allow: ['size'],
      defaults: { dark: '#312e81', moduleShape: 'rounded' },
      formats: ['svg'],
      ignoreParams: ['v'],
    };
    const ok = await call('?text=x&size=200&v=3', options);
    expect(ok.status).toBe(200);
    const svg = await ok.text();
    expect(svg).toContain('#312e81');
    expect(svg).toContain('width="200"');
    expect((await call('?text=x&dark=000000', options)).status).toBe(400); // not allowed
    expect(await (await call('?text=x&dark=000000', options)).text()).toContain('Use: text, size');
  });

  it('supports another text parameter, cache policy and kit', async () => {
    const kit = createQRCodeKit({ limits: { maxInputLength: 5 } });
    const response = await call('?q=toolong', { param: 'q', cacheControl: 'no-store', kit });
    expect(response.status).toBe(400); // the kit's own input limit
    const ok = await call('?q=ok', { param: 'q', cacheControl: 'no-store' });
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a misconfigured handler at creation', () => {
    expect(() => createQRCodeHandler({ maxLength: 0 })).toThrow(/maxLength/);
    expect(() => createQRCodeHandler({ maxSize: -1 })).toThrow(/maxSize/);
    expect(() => createQRCodeHandler({ formats: [] })).toThrow(/at least one format/);
    expect(() => createQRCodeHandler({ cache: 1 } as never)).toThrow(
      /Unknown handler option: cache/,
    );
  });
});
