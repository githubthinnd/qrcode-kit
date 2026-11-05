# qrcode-toolkit-angular

Angular standalone component and signal helper for [qrcode-toolkit](https://github.com/githubthinnd/qrcode-toolkit): zero-dependency QR codes that render identically on the server (Angular SSR) and in the browser.

```bash
npm install qrcode-toolkit-angular qrcode-toolkit
```

Needs Angular 19 or newer (signal inputs) and `qrcode-toolkit` 0.2 or newer.

```ts
import { Component } from '@angular/core';
import { QRCodeComponent } from 'qrcode-toolkit-angular';

@Component({
  selector: 'app-invite',
  imports: [QRCodeComponent],
  template: `
    <qr-code
      value="https://example.com/invite/42"
      label="Scan to join the event"
      [size]="220"
      [options]="{ moduleShape: 'rounded', gradient: { from: '#4f46e5', to: '#0f172a' } }"
    />
  `,
})
export class InviteComponent {}
```

## Inputs

| Input     | Default            | Meaning                                                                                                                                               |
| --------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`   | required           | The text (`string`) or bytes (`Uint8Array`) to encode                                                                                                 |
| `size`    | `192`              | Rendered width and height in CSS pixels                                                                                                               |
| `label`   | `"QR code"`        | Accessible text for the image; describe what the code does                                                                                            |
| `format`  | `"svg"`            | `"svg"` or `"png"` (both are data URLs)                                                                                                               |
| `options` | `{}`               | Any `qrcode-toolkit` option: `ecc`, `version`, `mask`, `dark`, `light`, `quietZone`, `scale`, `invert`, `moduleShape`, `gradient`, `logo`, `kanji`, … |
| `kit`     | shared default kit | Your own `QRCodeKit` (custom providers, limits)                                                                                                       |

`moduleShape`, `gradient` and `logo` need `format="svg"`. When `options.scale` is set it wins over `size`.

**Errors.** Content that cannot be encoded (empty, too long, a logo that would hide too much data) renders nothing. Programming mistakes (a misspelt option, an unsupported combination such as `moduleShape` with `format="png"`) are thrown, so you see them during development.

## Signal helper

For a custom fallback or access to the matrix and warnings, use `qrCode()` in your own component:

```ts
import { qrCode } from 'qrcode-toolkit-angular';

readonly qr = qrCode(() => this.url(), () => ({ ecc: 'Q' }));
// template: @if (qr().src; as src) { <img [src]="src" alt="Scan me" /> } @else { {{ qr().error?.message }} }
```

`generateQRCode(value, options?, kit?)` is the same without signals.

## Publishing note

This package is built with `ng-packagr` (partial Ivy output) and published from its `dist` folder.

MIT. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
