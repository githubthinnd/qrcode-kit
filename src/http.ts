import {
  createQRCodeKit,
  isQRCodeKitError,
  type QRCodeKit,
  type SymbolOptions,
} from './public/index.js';
import type { AppearanceOptions } from './public/index.js';

/** Query parameters a client may use to shape the image. */
export type QRCodeHandlerParam = 'format' | 'size' | 'ecc' | 'dark' | 'light' | 'margin' | 'shape';

export interface QRCodeHandlerOptions {
  /** Use your own kit (custom providers, limits). Default: a new default kit. */
  readonly kit?: QRCodeKit;
  /** Name of the query parameter that carries the text. Default `text`. */
  readonly param?: string;
  /** Longest text, in characters, that a request may carry. Default 1000. */
  readonly maxLength?: number;
  /** Largest `size` a client may ask for, in pixels. Default 1024. */
  readonly maxSize?: number;
  /** Image formats clients may ask for with `format`; the first one is the default. Default `['png', 'svg']`. */
  readonly formats?: readonly ('png' | 'svg')[];
  /** Which parameters clients may set. Default: all of them. */
  readonly allow?: readonly QRCodeHandlerParam[];
  /** Query parameters to accept and ignore (cache busters such as `v`). Anything else unknown is a 400. */
  readonly ignoreParams?: readonly string[];
  /** Options applied to every image, whatever the client asks (`ecc`, `quietZone`, `dark`, `moduleShape`, …). */
  readonly defaults?: SymbolOptions & AppearanceOptions;
  /** Value of the `Cache-Control` header of successful responses. Default one day, `immutable`. */
  readonly cacheControl?: string;
}

const HEX = /^[0-9a-f]{3,8}$/i;
const ECC = ['L', 'M', 'Q', 'H'] as const;
const SHAPES = ['square', 'rounded', 'dots'] as const;
const ALL_PARAMS: readonly QRCodeHandlerParam[] = [
  'format',
  'size',
  'ecc',
  'dark',
  'light',
  'margin',
  'shape',
];

function text(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

/** Accept `ff0000` as well as `#ff0000`: a bare hex colour is easier to put in a URL. */
const colour = (value: string): string => (HEX.test(value) ? `#${value}` : value);

/**
 * An image endpoint that works in any framework built on the Fetch API (`Request` in, `Response`
 * out): Next.js Route Handlers, SvelteKit, Astro, Remix and React Router, Hono, Nuxt, and so on.
 *
 * `GET /qr?text=hello` returns a PNG (asking for a `shape` selects SVG); `format=svg`, `size`, `ecc`, `dark`, `light`, `margin`
 * and `shape` shape it. Every input is validated and bounded: the text length, the image size, and
 * which parameters exist at all. Mistakes get a 400 with a plain-text reason, content that cannot
 * be encoded gets a 422, and responses are cacheable.
 *
 * @example
 * // app/api/qr/route.ts (Next.js)
 * import { createQRCodeHandler } from 'qrcode-toolkit/http';
 * export const GET = createQRCodeHandler();
 */
export function createQRCodeHandler(
  options: QRCodeHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const unknown = Object.keys(options).filter(
    (key) =>
      ![
        'kit',
        'param',
        'maxLength',
        'maxSize',
        'formats',
        'allow',
        'ignoreParams',
        'defaults',
        'cacheControl',
      ].includes(key),
  );
  if (unknown.length > 0) {
    throw new TypeError(`Unknown handler option: ${unknown.join(', ')}.`);
  }
  const kit = options.kit ?? createQRCodeKit();
  const param = options.param ?? 'text';
  const maxLength = options.maxLength ?? 1000;
  const maxSize = options.maxSize ?? 1024;
  const formats = options.formats ?? (['png', 'svg'] as const);
  const allow = new Set<string>(options.allow ?? ALL_PARAMS);
  const ignore = new Set<string>(options.ignoreParams ?? []);
  const cacheControl = options.cacheControl ?? 'public, max-age=86400, immutable';
  if (formats.length === 0) throw new TypeError('The handler needs at least one format.');
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) {
    throw new TypeError('"maxLength" must be a positive integer.');
  }
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) {
    throw new TypeError('"maxSize" must be a positive integer.');
  }

  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text(405, 'Use GET.', { Allow: 'GET, HEAD' });
    }
    const query = new URL(request.url, 'http://localhost').searchParams;

    const permitted = [param, ...allow];
    for (const name of query.keys()) {
      if (!permitted.includes(name) && !ignore.has(name)) {
        return text(400, `Unknown parameter "${name}". Use: ${permitted.join(', ')}.`);
      }
    }
    const data = query.get(param);
    if (data === null || data === '') {
      return text(400, `Add the text to encode as ?${param}=...`);
    }
    if (data.length > maxLength) {
      return text(400, `The text is too long: at most ${String(maxLength)} characters.`);
    }

    const get = (name: QRCodeHandlerParam): string | undefined => {
      const value = query.get(name);
      return value === null || value === '' ? undefined : value;
    };
    const integer = (name: QRCodeHandlerParam, min: number, max: number): number | undefined => {
      const raw = get(name);
      if (raw === undefined) return undefined;
      const value = Number(raw);
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new RangeError(
          `"${name}" must be a whole number from ${String(min)} to ${String(max)}.`,
        );
      }
      return value;
    };

    try {
      // A shape only exists in SVG, so asking for one without a format selects SVG when it is allowed.
      const format =
        get('format') ??
        (get('shape') !== undefined && formats.includes('svg') ? 'svg' : formats[0]);
      if (format !== 'png' && format !== 'svg') {
        throw new RangeError('"format" must be png or svg.');
      }
      if (!formats.includes(format)) {
        throw new RangeError(`"format" must be ${formats.join(' or ')}.`);
      }
      const size = integer('size', 1, maxSize);
      const margin = integer('margin', 0, 16);
      const eccRaw = get('ecc')?.toUpperCase();
      if (eccRaw !== undefined && !(ECC as readonly string[]).includes(eccRaw)) {
        throw new RangeError('"ecc" must be L, M, Q or H.');
      }
      const shape = get('shape');
      if (shape !== undefined && !(SHAPES as readonly string[]).includes(shape)) {
        throw new RangeError('"shape" must be square, rounded or dots.');
      }
      const dark = get('dark');
      const light = get('light');

      const result = await kit.generate({
        ...options.defaults,
        data,
        format,
        ...(size === undefined ? {} : { size }),
        ...(margin === undefined ? {} : { quietZone: margin }),
        ...(eccRaw === undefined ? {} : { ecc: eccRaw as (typeof ECC)[number] }),
        ...(shape === undefined ? {} : { moduleShape: shape as (typeof SHAPES)[number] }),
        ...(dark === undefined ? {} : { dark: colour(dark) }),
        ...(light === undefined ? {} : { light: colour(light) }),
      });
      const headers: Record<string, string> = {
        'Content-Type': result.mimeType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        // An SVG opened on its own gets no active content, whatever a custom renderer wrote.
        ...(format === 'svg'
          ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
          : {}),
      };
      const body = typeof result.value === 'string' ? result.value : new Uint8Array(result.value);
      return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
    } catch (error) {
      if (error instanceof RangeError) return text(400, error.message);
      if (isQRCodeKitError(error)) {
        // Library messages describe options and sizes, never the text itself.
        if (
          ['INVALID_INPUT', 'INVALID_CONFIGURATION', 'UNSUPPORTED_CAPABILITY'].includes(error.code)
        ) {
          return text(400, error.message);
        }
        if (['UNSUPPORTED_DATA', 'ENCODING_FAILED', 'RENDERING_FAILED'].includes(error.code)) {
          return text(422, error.message);
        }
      }
      throw error;
    }
  };
}
