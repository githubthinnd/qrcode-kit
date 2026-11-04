# Security policy

## Supported versions

The project is pre-release (0.0.0) and not published. Once 1.0 is released, the latest minor version receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately using GitHub's "Report a vulnerability" feature on the repository's Security tab. _Private vulnerability reporting must be enabled on the repository, and a dedicated contact address added here, before the first public release._

Include the version, a minimal reproduction, and the impact you expect. You will get an acknowledgement and a fix or mitigation plan; coordinated disclosure is appreciated.

## Security properties and limits

- **No runtime dependencies and no install scripts**, which removes transitive-dependency and install-time attack surface from consumers. Development dependencies are used for tests and benchmarks only and are not published.
- **Untrusted input:** input size is limited before processing (default 65 536 characters / bytes), raster size is limited (default 16 777 216 pixels), and option values are validated; unknown options are rejected. These limits are configurable per kit and are denial-of-service mitigations, not a sandbox.
- **SVG output** is generated from numbers and validated colours only (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `black`, `white`, `transparent`). Payload text never reaches the markup. Treat the result as trusted-by-construction only for output of the built-in SVG renderer; a custom renderer is responsible for its own escaping.
- **File output** (`qrcode-toolkit/node`) writes where the caller says. Use the `baseDir` option to confine writes (path traversal such as `../x` or absolute paths is rejected) whenever any part of the path can come from untrusted input.
- **Errors** never include the QR payload; messages and details contain option names and sizes only.
- **Plugins and custom providers are not sandboxed.** They run with the full privileges of your process. Install only code you trust.
- QR Codes are not a secure channel: anyone who can see one can read its content. Do not rely on them for secrecy or authentication on their own.
