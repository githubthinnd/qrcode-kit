import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { QRCodeKit } from 'qrcode-toolkit';
import { generateQRCode, type QRCodeImageFormat, type QRCodeOptions } from './qr-code';

/**
 * A QR Code as an `<img>` with a data URL. It renders on the server (Angular SSR) and in the
 * browser with identical output.
 *
 * @example
 * <qr-code [value]="url" label="Scan to join" [size]="220" [options]="{ moduleShape: 'rounded' }" />
 */
@Component({
  selector: 'qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (result().src; as source) {
      <img [src]="source" [attr.width]="size()" [attr.height]="size()" [alt]="label()" />
    }
  `,
})
export class QRCodeComponent {
  /** The text or bytes to encode. */
  readonly value = input.required<string | Uint8Array>();
  /** Rendered width and height in CSS pixels. */
  readonly size = input(192);
  /** Accessible text for the image. Describe what the code does. */
  readonly label = input('QR code');
  readonly format = input<QRCodeImageFormat>('svg');
  /** Any other `qrcode-toolkit` option: `ecc`, `dark`, `light`, `moduleShape`, `gradient`, `logo`, … */
  readonly options = input<QRCodeOptions>({});
  /** Use your own kit (custom providers, limits). */
  readonly kit = input<QRCodeKit | undefined>(undefined);

  /** Content that cannot be encoded renders nothing; `result().error` says why (use `qrCode()` for a custom fallback). */
  protected readonly result = computed(() => {
    const options = this.options();
    const format = this.format();
    // `scale` and `size` are mutually exclusive: the caller's `scale` wins.
    const sizing =
      options.scale !== undefined ? {} : format === 'png' ? { scale: 8 } : { size: this.size() };
    return generateQRCode(this.value(), { ...options, ...sizing, format }, this.kit());
  });
}
