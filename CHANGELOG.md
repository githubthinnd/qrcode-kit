# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Micro QR (M1–M4) and rMQR (32 sizes)**: `symbol: 'micro' | 'rmqr'`, version names (`'M3'`, `'R9x59'`), per-symbol levels and defaults, a 2-module default quiet zone and rectangular `QRMatrix` (`width`, `height`, `symbol`, `designation`). Rendered by the SVG, PNG, text and canvas renderers. Verified bit-for-bit against reference symbols from ZXing-C++'s tests and by decoding every version and level with ZXing-C++ (`zxing-wasm`, a development dependency).
- **`maskScoring: 'fast'`**: optional bit-parallel mask scoring for QR Code, checked against the reference scoring exactly; `maskScoring` capability for encoder providers.
- Playground: symbol type, version names and mask scoring controls, rectangular Anatomy view, two more self-tests; select boxes restyled with a custom chevron.
- Framework packages in an npm workspace (`packages/`): `qrcode-toolkit-react` (component usable in Server Components, `useQRCode`), `qrcode-toolkit-vue` (component with a fallback slot, `useQRCode`) and `qrcode-toolkit-svelte` (Svelte 5 component) and `qrcode-toolkit-angular` (standalone component with Angular SSR support and a `qrCode()` signal helper, built with ng-packagr). They are tested against React 19, Vue 3, Svelte 5 and Angular 22 and verified from their packed tarballs by `npm run verify:frameworks`.
- `qrcode-toolkit/http`: `createQRCodeHandler()`, a ready-made image endpoint (`/api/qr?text=...`) for any framework built on the Fetch API (Next.js, SvelteKit, Astro, Remix, Hono, Nuxt, …), with bounded input, a fixed set of parameters, clear 400/405/422 responses, cache and security headers.
- `canvas` output format in the browser kit: `kit.generate({ data, format: 'canvas' })` returns the canvas element the renderer drew (new `createCanvasExporter`, `CanvasHandle` type).
- Single-file builds for `<script>` tags and CDNs: `dist/bundles/qrcode-toolkit.min.js` (global `QRCodeToolkit`) and `dist/bundles/qrcode-toolkit.esm.min.js`; `unpkg` and `jsdelivr` fields point at the script build.
- SVG styling: `moduleShape` (`square`, `rounded`, `dots`), `gradient` (linear or radial) and `logo` (base64 image data URL). The renderer clears the modules under the logo, refuses a logo that would touch a function pattern or hide more than half of what the error correction level recovers, and defaults to level `H`. Raster renderers reject these options. New `DOT_MODULES` warning.
- Renderer contract: `RenderOptions` carries `moduleShape`, `gradient` and `logo`; `moduleShapes` capability lists the shapes a renderer draws; the conformance kit checks the styles a renderer claims.
- Kit configuration is validated like requests: unknown keys, wrong types and limits that would disable protection (`NaN`, zero, negative) are rejected with `INVALID_CONFIGURATION`; the same for file-exporter and canvas options.
- Explicit segments are validated (shape, FNC1 rules) with typed errors.
- Render-fidelity tests that read the rendered SVG, PNG, text and canvas output back and compare every module with the matrix.

### Fixed

- A transparent or translucent `dark` colour no longer shows the `light` background through the dark modules in SVG and canvas output, matching the PNG output.

### Changed

- The published package no longer ships source maps and declaration maps (they pointed at `src/`, which is not published): 102 fewer files.
- Security policy and code of conduct name a contact address; CI actions are pinned by commit hash and updated; a release workflow publishes tagged versions with npm provenance.
- `npm run verify:frameworks` renders the README's React, Vue 3 and Svelte 5 components on the server and calls the Next.js Route Handler against the packed tarball.
- Issue and pull-request templates and Dependabot configuration.

## [0.1.0] - 2026-11-05

First public pre-release, published under the `next` npm tag.

### Added

- QR Code Model 2 encoder written from scratch: versions 1–40, levels L/M/Q/H, numeric / alphanumeric / byte / Kanji modes, ECI, FNC1, structured append, size-optimal automatic segmentation, automatic and fixed masks.
- Immutable `QRMatrix` with per-module roles.
- Provider architecture: `EncoderProvider`, `RendererProvider`, `ExporterProvider`, typed capabilities, instance-scoped immutable registry, kit creation with early validation, per-operation / per-kit / default resolution.
- Built-in renderers (SVG, bitmap, text) and exporters (SVG, PNG, data URLs, text) with no dependencies, including a PNG/deflate writer.
- `qrcode-toolkit/node` (Buffer and file exporters, directory confinement), `qrcode-toolkit/browser` (canvas renderer, PNG/JPEG/WebP Blob exporters), `qrcode-toolkit/testing` (provider conformance checks).
- Experimental plugin API (providers and ordered hooks).
- Typed error model, warnings in results, input and raster size limits.
- Verification suite: bit-exact comparison with four independent implementations, three independent decoders, seeded fuzzing, capacity and Reed-Solomon property tests, packed-tarball consumer tests, runnable examples, benchmark script.
- Project foundation: strict TypeScript, ESLint, Prettier, Vitest, architecture rules (dependency-cruiser), CI definition.

### Fixed

- `createNodeKit` / `createBrowserKit` registered caller providers before the runtime providers, so a custom exporter for `png-buffer`, `png-blob`, … was never selected; callers now win, as documented.
- `quality` was silently accepted for `png-blob`; the browser blob exporter is now one provider per format and only the lossy ones accept it.
- `jpeg-blob` with a transparent colour is rejected (new optional exporter capability `alpha`) instead of risking a black background.
- File write failures are `EXPORT_FAILED` (with the system error as `cause`) instead of `RUNTIME_UNAVAILABLE`; files are opened with `O_NOFOLLOW` and the real path is re-checked.
- Empty explicit segments are rejected; a `null` request gives a typed error; an asynchronous plugin hook gets a clear message.

### Added

- `SIZE_ROUNDED` warning when a raster is smaller than the requested `size`.
- `fnc1.applicationIndicator` accepts `"00"`–`"99"` or one Latin letter (ISO/IEC 18004 mapping) besides the raw 0–255 number.
- `createBlobExporters()` (replaces `createBlobExporter()`).

### Changed

- Kanji mode is now strictly JIS X 0208 (6 872 characters), verified per character against the Unicode Consortium's table; Windows-31J extensions and seven ambiguous characters use byte mode.

### Added

- `qrcode-toolkit/kanji`: built-in JIS X 0208 mapper that needs no platform Shift JIS support (not part of the default bundle).
- `npm run check:name`: npm name availability and similarity probe.
- Security: `minimatch` override resolves the only `npm audit` findings; CI audits shipped (blocking) and development (reported) dependencies.
