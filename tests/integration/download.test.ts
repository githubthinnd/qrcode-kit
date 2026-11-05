import { describe, expect, it } from 'vitest';
import {
  createBrowserKit,
  downloadFilename,
  downloadResult,
  type CanvasLike,
  type DownloadEnvironment,
} from '../../src/browser.js';

interface Click {
  readonly href: string;
  readonly download: string;
}

const environment = (): {
  env: DownloadEnvironment;
  clicks: Click[];
  revoked: string[];
  blobs: { parts: unknown[]; type: string }[];
  attached: () => number;
} => {
  const clicks: Click[] = [];
  const revoked: string[] = [];
  const blobs: { parts: unknown[]; type: string }[] = [];
  let attached = 0;
  const env: DownloadEnvironment = {
    document: {
      createElement: () => {
        const link = {
          href: '',
          download: '',
          rel: '',
          style: { display: '' },
          click: () => {
            clicks.push({ href: link.href, download: link.download });
          },
          remove: () => {
            attached--;
          },
        };
        return link;
      },
      body: {
        append: () => {
          attached++;
        },
      },
    },
    URL: {
      createObjectURL: (blob) => `blob:test/${String(blobs.indexOf(blob as never))}`,
      revokeObjectURL: (url) => revoked.push(url),
    },
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    Blob: class {
      constructor(parts: unknown[], options: { type: string }) {
        blobs.push({ parts, type: options.type });
        return blobs[blobs.length - 1];
      }
    },
    setTimeout: (callback) => {
      callback();
      return 0;
    },
  };
  return { env, clicks, revoked, blobs, attached: () => attached };
};

describe('downloading a QR code in the browser', () => {
  it('saves an SVG with a default name and releases the temporary URL', async () => {
    const { env, clicks, revoked, blobs, attached } = environment();
    const kit = createBrowserKit();
    const result = await kit.download({ data: 'hello' }, { environment: env });
    expect(result.format).toBe('svg');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.download).toBe('qrcode.svg');
    expect(blobs[0]?.type).toBe('image/svg+xml');
    expect(String(blobs[0]?.parts[0])).toContain('<svg');
    expect(revoked).toEqual([clicks[0]?.href]);
    expect(attached()).toBe(0); // the temporary link is removed again
  });

  it('saves a PNG from the bytes and uses the given name', async () => {
    const { env, clicks, blobs } = environment();
    await createBrowserKit().download(
      { data: 'hello', format: 'png', filename: 'ticket-42' },
      { environment: env },
    );
    expect(clicks[0]?.download).toBe('ticket-42.png');
    expect(blobs[0]?.type).toBe('image/png');
    expect(blobs[0]?.parts[0]).toBeInstanceOf(Uint8Array);
  });

  it('uses data URLs directly, without a temporary object URL', async () => {
    const { env, clicks, revoked } = environment();
    await createBrowserKit().download({ data: 'x', format: 'png-data-url' }, { environment: env });
    expect(clicks[0]?.href.startsWith('data:image/png;base64,')).toBe(true);
    expect(revoked).toEqual([]);
  });

  it('saves a blob that the canvas encoder produced', () => {
    const { env, clicks } = environment();
    const blob = { size: 3, type: 'image/png' };
    downloadResult(
      { format: 'png-blob', mimeType: 'image/png', value: blob },
      { environment: env, filename: 'a.png' },
    );
    expect(clicks[0]?.download).toBe('a.png');
  });

  it('cannot save a canvas and says what to ask for instead', () => {
    const { env } = environment();
    const canvas: CanvasLike = { width: 1, height: 1, getContext: () => null };
    expect(() => {
      downloadResult(
        { format: 'canvas', mimeType: 'application/x-canvas', value: canvas },
        { environment: env },
      );
    }).toThrow(/png-blob/);
  });

  it('refuses to run without a page', () => {
    expect(() => {
      downloadResult({ format: 'svg', mimeType: 'image/svg+xml', value: '<svg/>' });
    }).toThrow(/browser page/);
  });

  it('does not let the file name escape or break the download', () => {
    expect(downloadFilename('../../etc/passwd', 'image/png')).toBe('passwd.png');
    expect(downloadFilename('my qr: "v2"?', 'image/svg+xml')).toBe('my qr_ _v2_.svg');
    expect(downloadFilename('.hidden', 'image/png')).toBe('hidden.png');
    expect(downloadFilename('photo.jpeg', 'image/png')).toBe('photo.jpeg');
    expect(() => downloadFilename('   ', 'image/png')).toThrow(/non-empty/);
    expect(() => downloadFilename('///', 'image/png')).toThrow(/usable/);
  });

  it('keeps the options strict: unknown request options are still rejected', async () => {
    const { env } = environment();
    await expect(
      createBrowserKit().download({ data: 'x', bogus: 1 } as never, { environment: env }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' });
  });
});
