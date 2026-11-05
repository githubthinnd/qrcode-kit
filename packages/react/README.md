# qrcode-toolkit-react

React component and hook for [qrcode-toolkit](https://github.com/githubthinnd/qrcode-toolkit): zero-dependency QR codes that render identically on the server and in the browser.

```bash
npm install qrcode-toolkit-react qrcode-toolkit
```

Needs React 18 or newer and `qrcode-toolkit` 0.2 or newer.

```tsx
import { QRCode } from 'qrcode-toolkit-react';

export function Invite() {
  return (
    <QRCode
      value="https://example.com/invite/42"
      label="Scan to join the event"
      size={220}
      moduleShape="rounded"
      gradient={{ from: '#4f46e5', to: '#0f172a' }}
    />
  );
}
```

`<QRCode>` uses no hooks, so it works in **React Server Components** (Next.js App Router), in server-side rendering and in client components, and the server and the client produce the same markup.

## Props

| Prop                          | Default            | Meaning                                                                                                                                                      |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `value`                       | required           | The text (`string`) or bytes (`Uint8Array`) to encode                                                                                                        |
| `size`                        | `192`              | Rendered width and height in CSS pixels                                                                                                                      |
| `label`                       | `"QR code"`        | Accessible text for the image; describe what the code does                                                                                                   |
| `format`                      | `"svg"`            | `"svg"` or `"png"` (both are data URLs)                                                                                                                      |
| `kit`                         | shared default kit | Your own `QRCodeKit` (custom providers, limits)                                                                                                              |
| everything else               | –                  | Any `qrcode-toolkit` option: `ecc`, `version`, `mask`, `dark`, `light`, `quietZone`, `scale`, `invert`, `moduleShape`, `gradient`, `logo`, `kanji`, `eci`, … |
| `fallback`                    | nothing            | A `ReactNode` rendered when nothing could be generated                                                                                                       |
| `className`, `style`, `title` | –                  | Passed to the `<img>`                                                                                                                                        |

`moduleShape`, `gradient` and `logo` need `format="svg"`. `scale` and `size` exclude each other: when you pass `scale`, it wins over `size` for the generated image.

**Errors.** Content that cannot be encoded (empty, too long, a logo that would hide too much data) renders the fallback instead of an image. Programming mistakes (a misspelt option, an unsupported combination such as `moduleShape` with `format="png"`) are thrown, so you see them during development.

## Hook and function

```tsx
import { useQRCode, generateQRCode } from 'qrcode-toolkit-react';

function Preview({ text }: { text: string }) {
  const { src, matrix, warnings, error } = useQRCode(text, { ecc: 'Q' });
  return src ? <img src={src} alt="QR code" /> : <p>{error?.message}</p>;
}
```

`useQRCode` is memoised and for client components. `generateQRCode(value, options?, kit?)` is the same without the hook, for Server Components, loaders and tests.

MIT. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
