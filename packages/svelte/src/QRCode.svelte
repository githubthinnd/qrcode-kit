<!--
  A QR Code as an <img> with a data URL. Renders on the server and in the browser with identical
  output. Needs Svelte 5. Every other prop is passed to qrcode-toolkit as an option
  (ecc, dark, light, moduleShape, gradient, logo, ...).
-->
<script>
  import { generateQRCode } from './qr.js';

  let {
    value,
    size = 192,
    label = 'QR code',
    format = 'svg',
    kit = undefined,
    fallback = undefined,
    ...options
  } = $props();

  const result = $derived.by(() => {
    // `scale` and `size` are mutually exclusive: the caller's `scale` wins.
    const sizing = options.scale !== undefined ? {} : format === 'png' ? { scale: 8 } : { size };
    return generateQRCode(value, { ...options, ...sizing, format }, kit);
  });
</script>

{#if result.src !== undefined}
  <img src={result.src} width={size} height={size} alt={label} />
{:else if fallback}
  {@render fallback(result.error)}
{/if}
