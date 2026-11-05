# qrcode-toolkit-vue

Vue 3 and Nuxt component and composable for [qrcode-toolkit](https://github.com/githubthinnd/qrcode-toolkit): zero-dependency QR codes that render identically on the server and in the browser.

```bash
npm install qrcode-toolkit-vue qrcode-toolkit
```

Needs Vue 3.3 or newer and `qrcode-toolkit` 0.2 or newer.

```vue
<script setup lang="ts">
import { QRCode } from 'qrcode-toolkit-vue';
</script>

<template>
  <QRCode
    value="https://example.com/invite/42"
    label="Scan to join the event"
    :size="220"
    module-shape="rounded"
  />
</template>
```

**Nuxt:** nothing to configure. Import the component where you use it, or wrap it in `components/QrCode.vue`. It renders on the server and hydrates without a mismatch.

## Props

| Prop            | Default            | Meaning                                                                                                                                                      |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `value`         | required           | The text (`string`) or bytes (`Uint8Array`) to encode                                                                                                        |
| `size`          | `192`              | Rendered width and height in CSS pixels                                                                                                                      |
| `label`         | `"QR code"`        | Accessible text for the image; describe what the code does                                                                                                   |
| `format`        | `"svg"`            | `"svg"` or `"png"` (both are data URLs)                                                                                                                      |
| `kit`           | shared default kit | Your own `QRCodeKit` (custom providers, limits)                                                                                                              |
| everything else | –                  | Any `qrcode-toolkit` option: `ecc`, `version`, `mask`, `dark`, `light`, `quietZone`, `scale`, `invert`, `moduleShape`, `gradient`, `logo`, `kanji`, `eci`, … |

`moduleShape`, `gradient` and `logo` need `format="svg"`. `scale` and `size` exclude each other: when you pass `scale`, it wins over `size` for the generated image.

**Errors.** Content that cannot be encoded (empty, too long, a logo that would hide too much data) renders the fallback instead of an image. Programming mistakes (a misspelt option, an unsupported combination such as `moduleShape` with `format="png"`) are thrown, so you see them during development.

Use the `fallback` slot for content that cannot be encoded: `<QRCode :value="text"><template #fallback>No code</template></QRCode>`.

## Composable

```ts
import { useQRCode } from 'qrcode-toolkit-vue';

const text = ref('https://example.com');
const result = useQRCode(text, () => ({ ecc: 'Q' })); // refs and getters are tracked
// result.value: { src, matrix, warnings, error }
```

MIT. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
