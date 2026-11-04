# qrcode-toolkit

> One QR Code Toolkit. Every JavaScript Framework.

A universal, extensible, framework-agnostic QR Code toolkit for JavaScript and TypeScript, with **zero runtime dependencies**. The QR Code encoder, the renderers and the PNG writer are implemented in this repository and verified against independent implementations and decoders.

> **Status: pre-release (0.0.0), not published to npm.** The public API may still change before 1.0. The package is marked `private` until the owner authorises publishing.

## Features

- QR Code Model 2, versions 1–40, error correction L / M / Q / H.
- All encoding modes: numeric, alphanumeric, byte (UTF-8), **Kanji**, plus **ECI**, **FNC1** (GS1) and **structured append**.
- Size-optimal automatic segmentation (mixed numeric / alphanumeric / byte / Kanji text).
- Output: **SVG**, **PNG** (own encoder, no dependencies), data URLs, terminal text; Node.js `Buffer` and files; browser canvas and `Blob` (PNG / JPEG / WebP).
- Strict TypeScript types; the output type follows the requested format.
- Provider architecture: replace or add the encoder, renderers and exporters per kit instance, with typed capability checks. No global state, safe for concurrent SSR requests.
- ESM only, tree-shakable, `sideEffects: false`.

## Install

Not on npm yet. Until it is published, build and pack from this repository:

```bash
npm install
npm run build
npm pack            # produces qrcode-toolkit-0.0.0.tgz you can install into a project
```

Requires Node.js `^22.12 || >=24` (older versions are not supported). Verified locally on Node.js 22.23 and 24.21; 26 is covered by the CI definition only. Works in current browsers through any bundler or native ES modules.

## Quick start

```ts
import { createQRCode } from 'qrcode-toolkit';

const { value } = await createQRCode({ data: 'https://example.com', format: 'svg', size: 256 });
// value: string — an SVG document
```

```ts
const png = await createQRCode({ data: 'Xin chào Việt Nam', format: 'png', ecc: 'Q', scale: 8 });
// png.value: Uint8Array — a PNG image
```

`createQRCode` is async because exporters may be (file writing, browser encoders). The built-in providers are synchronous, so you can also use a kit synchronously:

```ts
import { createQRCodeKit } from 'qrcode-toolkit';

const kit = createQRCodeKit();
const svg = kit.generateSync({ data: 'hello', format: 'svg' }).value;
const matrix = kit.encode({ data: 'hello', ecc: 'H' }); // the symbol itself
matrix.get(0, 0); // true when the module at x=0, y=0 is dark
```

### Node.js

```ts
import { createNodeKit } from 'qrcode-toolkit/node';

const kit = createNodeKit({ files: { baseDir: '/srv/qr' } }); // writes are confined to baseDir
await kit.generate({ data: 'https://example.com', format: 'png-file', path: 'code.png' });
const { value } = await kit.generate({ data: 'x', format: 'png-buffer' }); // a Buffer
```

### Browser

```ts
import { createBrowserKit } from 'qrcode-toolkit/browser';

const kit = createBrowserKit();
const { value } = await kit.generate({
  data: 'https://example.com',
  format: 'webp-blob',
  quality: 0.9,
});
img.src = URL.createObjectURL(value);
```

Importing `qrcode-toolkit/browser` touches no DOM API, so it is safe in server-side rendering; canvases are only created when you generate a `*-blob` format.

## Options

| Option                      | Default        | Meaning                                                                                    |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `data`                      | required       | `string`, `Uint8Array`, or an array of explicit segments (`segment.numeric(...)` …)        |
| `ecc`                       | `'M'`          | Error correction level `'L' \| 'M' \| 'Q' \| 'H'`                                          |
| `version`                   | 1–40, smallest | An exact version, or `{ min, max }`                                                        |
| `mask`                      | `'auto'`       | Mask pattern 0–7, or the lowest-penalty one                                                |
| `boostEcc`                  | `false`        | Raise the level while the data still fits in the chosen version                            |
| `charset`                   | `'utf-8'`      | `'utf-8'` or `'iso-8859-1'` for string data                                                |
| `eci`                       | `false`        | `true`: declare the charset of text (ECI 26 / 3). A number: declare that ECI for byte data |
| `kanji`                     | `false`        | Allow Kanji mode (13 bits per character) for text it can represent                         |
| `fnc1`                      | –              | `'first'` or `{ applicationIndicator }` for GS1 / application data                         |
| `format`                    | `'svg'`        | See [formats](#formats)                                                                    |
| `quietZone`                 | `4`            | Quiet zone in modules (a warning is returned below 4)                                      |
| `scale` / `size`            | –              | Pixels per module / target edge in pixels (mutually exclusive)                             |
| `dark` / `light` / `invert` | black / white  | Colours: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `black`, `white`, `transparent`          |
| `quality`                   | –              | 0–1, lossy browser formats                                                                 |
| `path`                      | –              | Destination for file formats                                                               |
| `providers`                 | –              | Per-operation provider ids: `{ encoder, renderer, exporter }`                              |

Unknown options and options the selected providers cannot honour raise an error; nothing is ignored silently.

### Formats

| Format                               | Value type        | Runtime    |
| ------------------------------------ | ----------------- | ---------- |
| `svg`, `svg-data-url`                | `string`          | any        |
| `png`                                | `Uint8Array`      | any        |
| `png-data-url`                       | `string`          | any        |
| `text`                               | `string`          | any        |
| `png-buffer`, `svg-buffer`           | `Buffer`          | `/node`    |
| `png-file`, `svg-file`, `text-file`  | `{ path, bytes }` | `/node`    |
| `png-blob`, `jpeg-blob`, `webp-blob` | `Blob`            | `/browser` |

### Text encoding and ECI

By default text is encoded as UTF-8 **without** an ECI header. This is what the large majority of scanners expect and read correctly. Declaring the charset with `eci: true` follows the standard more strictly, but some readers mishandle ECI (jsQR returns an empty string for ECI 3, for example). Use `eci` when you know your scanners support it.

### Structured append

```ts
const parts = await kit.generateStructuredAppend({ data: longText, symbols: 3, format: 'svg' });
parts.map((p) => p.matrix.structuredAppend); // { index, total, parity }
```

## Errors

Every error is a `QRCodeKitError` with a stable `code` (`INVALID_INPUT`, `UNSUPPORTED_DATA`, `INVALID_CONFIGURATION`, `PROVIDER_NOT_FOUND`, `PROVIDER_CONFLICT`, `UNSUPPORTED_CAPABILITY`, `ENCODING_FAILED`, `RENDERING_FAILED`, `EXPORT_FAILED`, `RUNTIME_UNAVAILABLE`, `PLUGIN_FAILED`), the original error in `cause`, and primitive-only `details`. Messages and details describe sizes and option names, never your data. Use `isQRCodeKitError(e)` to recognise them across duplicated copies of the package.

Non-fatal observations (`QUIET_ZONE_SMALL`, `LOW_CONTRAST`, `INVERTED_POLARITY`) are returned in `result.warnings` and passed to the optional `onDiagnostic` callback. Nothing is logged.

## Providers and plugins

The encoder, renderers and exporters are providers behind small typed contracts. A kit is an isolated composition of providers:

```ts
const kit = createQRCodeKit({ providers: { renderers: [myRenderer], exporters: [myExporter] } });
```

Provider authors can use `qrcode-toolkit/testing` (conformance checks). Plugins (hooks and extra providers) are **experimental**.

## Frameworks

The core has no framework dependency, and the built-in providers are synchronous, so a symbol can be computed during render. Dedicated adapter packages are not published yet, and the snippets have not been run inside framework test suites.

## Limits and security

- Input larger than 65 536 characters / bytes and rasters larger than 16 777 216 pixels are rejected before any work is done (configurable with `limits`).
- SVG output contains only numbers and validated colours; user text never reaches the markup.
- File exporters can be confined to a directory with `baseDir`.
- No install scripts and no dependencies. See [SECURITY.md](SECURITY.md).

## Limitations

- Only QR Code Model 2. Micro QR and rMQR are not supported.
- PNG output is two-colour (1-bit palette). Gradients, rounded modules and logos are not implemented.
- Kanji mode relies on the platform's `TextDecoder('shift_jis')` (Windows-31J) unless you pass your own `kanji` mapper.
- Real-device scanning (iOS / Android cameras) and real-browser runs have not been part of the automated verification.
- Deno, Bun and edge runtimes are not claimed to be supported.

## Verification

Correctness is checked against independent engines and decoders (development-time only): bit-exact matrix agreement with four other implementations for all 40 versions × 4 levels × 8 masks, decoding with three decoders, seeded fuzzing, capacity boundaries, mathematical properties of the Reed-Solomon code, and the packed tarball in clean consumers.

## Development

```bash
npm install
npm run check      # format, lint, typecheck, architecture rules, tests, build, packed-tarball verification
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
