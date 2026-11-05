# Security policy

## Supported versions

Security fixes are made on the latest 1.x release.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately using GitHub's "Report a vulnerability" feature on the repository's Security tab, or email **thinnd.work@gmail.com** with the subject `qrcode-toolkit security`.

Include the version, a minimal reproduction, and the impact you expect. You will get an acknowledgement and a fix or mitigation plan; coordinated disclosure is appreciated.

## Security properties and limits

- **No runtime dependencies and no install scripts**, which removes transitive-dependency and install-time attack surface from consumers. Development dependencies are used for tests and benchmarks only and are not published.
- **Untrusted input:** input size is limited before processing (default 65 536 characters / bytes), raster size is limited (default 16 777 216 pixels), and option values are validated; unknown options are rejected. These limits are configurable per kit and are denial-of-service mitigations, not a sandbox.
- **SVG output** is generated from numbers and validated colours only (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `black`, `white`, `transparent`). Payload text never reaches the markup. Treat the result as trusted-by-construction only for output of the built-in SVG renderer; a custom renderer is responsible for its own escaping.
- **File output** (`qrcode-toolkit/node`) writes where the caller says. Use the `baseDir` option to confine writes (path traversal such as `../x` or absolute paths is rejected) whenever any part of the path can come from untrusted input.
- **Errors** raised by the library never include the QR payload; messages and details contain option names and sizes only. An error thrown by a plugin hook or custom provider is kept as `cause` unchanged and is the author's responsibility.
- **File output** with `baseDir` also opens files with `O_NOFOLLOW` (POSIX) and re-checks the real path after opening, which narrows but does not remove the window for a concurrent attacker who can write inside `baseDir`; use a directory only you can write to.
- **Plugins and custom providers are not sandboxed.** They run with the full privileges of your process. Install only code you trust.
- QR Codes are not a secure channel: anyone who can see one can read its content. Do not rely on them for secrecy or authentication on their own.
