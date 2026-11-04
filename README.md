# qrcode-toolkit

> One QR Code Toolkit. Every JavaScript Framework.

A universal, extensible, framework-agnostic QR Code toolkit for JavaScript and TypeScript.

**Status: pre-release, under active development. Nothing is published to npm yet and the public API is not stable.** The QR encoder is not implemented yet; only the foundation (tooling, error model, architecture rules) exists.

## Design goals

- **Zero runtime dependencies.** The QR encoder, renderers and exporters are implemented in this repository.
- **Framework independent.** The core knows nothing about React, Vue, Angular, Svelte, Nuxt or Next.js. Framework integrations will be separate packages built on the public API.
- **Runtime aware.** Universal code does not assume `window`, `document`, `Buffer`, `Blob` or the filesystem. Runtime-specific features live in dedicated entry points.
- **Strict TypeScript, ESM-only.** Accurate public declarations; Node.js `^22.12 || >=24`.
- **Replaceable parts.** Encoder, renderer and exporter are provider contracts, composed per kit instance (no global registry).
- **Verified, not assumed.** QR correctness is checked against independent implementations and decoders (dev-time only).


## Development

```bash
npm install
npm run check      # format, lint, typecheck, architecture rules, tests, build, packed-tarball verification
```

| Script                   | Purpose                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `npm test`               | Unit, integration and architecture tests (Vitest)                             |
| `npm run arch`           | Enforce layer boundaries with dependency-cruiser                              |
| `npm run build`          | Compile to `dist/` with `tsc` (unbundled ESM + declarations)                  |
| `npm run verify:package` | Pack the tarball and test it in a clean consumer project (ESM, `require`, TS) |

## License

MIT. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
