# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Kanji mode is now strictly JIS X 0208 (6 872 characters), verified per character against the Unicode Consortium's table; Windows-31J extensions and seven ambiguous characters use byte mode.

### Added

- `qrcode-toolkit/kanji`: built-in JIS X 0208 mapper that needs no platform Shift JIS support (not part of the default bundle).
- `npm run check:name`: npm name availability and similarity probe.
- Security: `minimatch` override resolves the only `npm audit` findings; CI audits shipped (blocking) and development (reported) dependencies.
