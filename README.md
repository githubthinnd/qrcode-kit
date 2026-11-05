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

| Option                      | Default        | Meaning                                                                                                                                           |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`                      | required       | `string`, `Uint8Array`, or an array of explicit segments (`segment.numeric(...)` …)                                                               |
| `ecc`                       | `'M'`          | Error correction level `'L' \| 'M' \| 'Q' \| 'H'`                                                                                                 |
| `version`                   | 1–40, smallest | An exact version, or `{ min, max }`                                                                                                               |
| `mask`                      | `'auto'`       | Mask pattern 0–7, or the lowest-penalty one                                                                                                       |
| `boostEcc`                  | `false`        | Raise the level while the data still fits in the chosen version                                                                                   |
| `charset`                   | `'utf-8'`      | `'utf-8'` or `'iso-8859-1'` for string data                                                                                                       |
| `eci`                       | `false`        | `true`: declare the charset of text (ECI 26 / 3). A number: declare that ECI for byte data                                                        |
| `kanji`                     | `false`        | Allow Kanji mode (13 bits per character) for JIS X 0208 text; see [Kanji](#kanji)                                                                 |
| `fnc1`                      | –              | `'first'` (GS1), or `{ applicationIndicator }`: `"00"`–`"99"`, one letter, or a raw 0–255 number                                                  |
| `format`                    | `'svg'`        | See [formats](#formats)                                                                                                                           |
| `quietZone`                 | `4`            | Quiet zone in modules (a warning is returned below 4)                                                                                             |
| `scale` / `size`            | –              | Pixels per module / target edge in pixels (mutually exclusive); raster `size` is rounded down to whole pixels per module (`SIZE_ROUNDED` warning) |
| `dark` / `light` / `invert` | black / white  | Colours: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `black`, `white`, `transparent`                                                                 |
| `quality`                   | –              | 0–1, for `jpeg-blob` and `webp-blob` only (rejected elsewhere)                                                                                    |
| `path`                      | –              | Destination for file formats                                                                                                                      |
| `providers`                 | –              | Per-operation provider ids: `{ encoder, renderer, exporter }`                                                                                     |

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

`jpeg-blob` has no alpha channel, so a transparent `light`/`dark` colour is rejected (`UNSUPPORTED_CAPABILITY`) instead of being flattened to black.

### Text encoding and ECI

By default text is encoded as UTF-8 **without** an ECI header. This is what the large majority of scanners expect and read correctly. Declaring the charset with `eci: true` follows the standard more strictly, but some readers mishandle ECI (jsQR returns an empty string for ECI 3, for example). Use `eci` when you know your scanners support it.

### Kanji

```ts
import { createQRCodeKit } from 'qrcode-toolkit';
import { createJisX0208KanjiMapper } from 'qrcode-toolkit/kanji'; // optional, platform independent

const kit = createQRCodeKit({ kanji: createJisX0208KanjiMapper() });
kit.encode({ data: '日本語のテキスト', kanji: true }); // Kanji mode: 13 bits per character
```

Kanji mode covers exactly the 6 872 JIS X 0208 characters whose Unicode mapping is the same in the Unicode Consortium's table and in Windows-31J. Everything else (including the Windows extensions and seven ambiguous characters such as `～` U+FF5E) is encoded in byte mode, which always round-trips. Without the `/kanji` entry the mapping is derived from the platform's `TextDecoder('shift_jis')`; where that is missing a `RUNTIME_UNAVAILABLE` error points you to the entry.

### Structured append

```ts
const parts = await kit.generateStructuredAppend({ data: longText, symbols: 3, format: 'svg' });
parts.map((p) => p.matrix.structuredAppend); // { index, total, parity }
```

`generateStructuredAppend` takes `string` or `Uint8Array` data only; `eci`, `kanji`, `fnc1` and segment arrays are rejected. Everything else (`ecc`, `version`, `mask`, `boostEcc`, `charset`, appearance, `format`) works as in `generate`.

## Errors

Every error is a `QRCodeKitError` with a stable `code` (`INVALID_INPUT`, `UNSUPPORTED_DATA`, `INVALID_CONFIGURATION`, `PROVIDER_NOT_FOUND`, `PROVIDER_CONFLICT`, `UNSUPPORTED_CAPABILITY`, `ENCODING_FAILED`, `RENDERING_FAILED`, `EXPORT_FAILED`, `RUNTIME_UNAVAILABLE`, `PLUGIN_FAILED`), the original error in `cause`, and primitive-only `details`. Messages and details describe sizes and option names, never your data. Use `isQRCodeKitError(e)` to recognise them across duplicated copies of the package.

Errors raised by the library never contain your data. An error thrown by your own plugin hook or custom provider is passed through as `cause` unchanged, so it may.

Non-fatal observations (`QUIET_ZONE_SMALL`, `LOW_CONTRAST`, `INVERTED_POLARITY`, `SIZE_ROUNDED`) are returned in `result.warnings` and passed to the optional `onDiagnostic` callback. Nothing is logged.

## Playground

```bash
npm run playground        # builds the package and the playground, then serves http://127.0.0.1:5173/
npm run playground:build  # only writes playground-dist/index.html (one self-contained file)
```

A local, offline workbench for the built package: every option, all eight formats, live preview with zoom and download, an **Anatomy** view that colours each module by role, segment and provider details, copy-ready TypeScript for the current settings, shareable links, and a **Self-test** that runs 28 checks in your browser: canvas drawing, each Blob encoder, capability guards, provider precedence, size rounding and a round trip through independent decoders (jsQR, ZXing and the native `BarcodeDetector` when present). "Verify scan" decodes what you see with the same engines. The decoders are development dependencies bundled into the playground only; the library never imports them.

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
- Kanji mode is strictly JIS X 0208 (6 872 characters; seven characters whose Windows and JIS mappings disagree use byte mode instead). By default it reads the platform's `TextDecoder('shift_jis')`; import `qrcode-toolkit/kanji` for a built-in table that needs no platform support (about 21 kB, only bundled when imported).
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
