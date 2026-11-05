# qrcode-toolkit-svelte

Svelte 5 and SvelteKit component for [qrcode-toolkit](https://github.com/githubthinnd/qrcode-toolkit): zero-dependency QR codes that render identically on the server and in the browser.

```bash
npm install qrcode-toolkit-svelte qrcode-toolkit
```

Needs Svelte 5 and `qrcode-toolkit` 0.2 or newer. The package ships the component as a `.svelte` source file (the `svelte` export condition), which Vite and SvelteKit compile with your app.

```svelte
<script>
  import { QRCode } from 'qrcode-toolkit-svelte';
</script>

<QRCode value="https://example.com/invite/42" label="Scan to join the event" size={220} moduleShape="rounded" />
```

## Props

| Prop            | Default            | Meaning                                                                                                                                                      |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `value`         | required           | The text (`string`) or bytes (`Uint8Array`) to encode                                                                                                        |
| `size`          | `192`              | Rendered width and height in CSS pixels                                                                                                                      |
| `label`         | `"QR code"`        | Accessible text for the image; describe what the code does                                                                                                   |
| `format`        | `"svg"`            | `"svg"` or `"png"` (both are data URLs)                                                                                                                      |
| `kit`           | shared default kit | Your own `QRCodeKit` (custom providers, limits)                                                                                                              |
| everything else | –                  | Any `qrcode-toolkit` option: `ecc`, `version`, `mask`, `dark`, `light`, `quietZone`, `scale`, `invert`, `moduleShape`, `gradient`, `logo`, `kanji`, `eci`, … |
| `fallback`      | nothing            | A snippet rendered when nothing could be generated; it receives the error: `{#snippet fallback(error)}…{/snippet}`                                           |

`moduleShape`, `gradient` and `logo` need `format="svg"`. `scale` and `size` exclude each other: when you pass `scale`, it wins over `size` for the generated image.

**Errors.** Content that cannot be encoded (empty, too long, a logo that would hide too much data) renders the fallback instead of an image. Programming mistakes (a misspelt option, an unsupported combination such as `moduleShape` with `format="png"`) are thrown, so you see them during development.

## Function

```js
import { generateQRCode } from 'qrcode-toolkit-svelte';

const { src, matrix, warnings, error } = generateQRCode('https://example.com', { ecc: 'Q' });
```

MIT. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
