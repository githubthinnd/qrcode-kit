<div align="center">
<h1 align="center">qrcode-toolkit</h1>
<b>Zero-dependency QR code generator for any JS framework, the browser, Node.js and SSR.</b><br />
Written in TypeScript, works at build time too · SVG, PNG, canvas and Blob output · Kanji, ECI, GS1 and structured append.

[![License: MIT](https://img.shields.io/badge/license-MIT-4f46e5.svg)](LICENSE)
![Runtime dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-16a34a.svg)
![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![ESM only](https://img.shields.io/badge/module-ESM-f59e0b.svg)
![Node.js: ^22.12 or >=24](https://img.shields.io/badge/node-%5E22.12%20%7C%7C%20%3E%3D24-5fa04e.svg)
[![npm version](https://img.shields.io/npm/v/qrcode-toolkit.svg?color=4f46e5)](https://www.npmjs.com/package/qrcode-toolkit)
[![CI](https://github.com/githubthinnd/qrcode-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/githubthinnd/qrcode-toolkit/actions/workflows/ci.yml)
![Status: pre-release](https://img.shields.io/badge/status-pre--release-ef4444.svg)

[Quick start](#quick-start) · [Framework guides](#framework-guides) · [Cookbook](#cookbook) · [API](#api-reference) · [Playground](#playground) · [FAQ](#faq)

<img src="assets/hero.svg" alt="qrcode-toolkit: QR codes for any JS framework, browser, Node.js and SSR" width="860" />

</div>

---

`qrcode-toolkit` generates **QR Codes (Model 2, versions 1–40)** in the browser, on the server and at build time, from one small typed API. The encoder, the SVG and bitmap renderers and the PNG writer are all written in this repository. There is **nothing to install besides the package itself**, and every piece of output is checked against independent QR implementations and decoders.

> **Status: pre-release (0.1.x).** The API may still change before 1.0; pin the version (`npm install qrcode-toolkit@0.1`) if you need stability.

## Why qrcode-toolkit

|                                  |                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Zero dependencies**            | No transitive packages, no install scripts. About 17 kB gzipped for `createQRCode` with every built-in provider (measured with esbuild).                                 |
| **Every framework, one API**     | Plain functions with no framework code inside. The same call powers a React component, a Nuxt server route and an Astro page. See [Framework guides](#framework-guides). |
| **SSR-safe by design**           | Output is deterministic and synchronous with the built-in providers, so the server and the client render the same markup: no hydration mismatch, no global state.        |
| **Complete QR feature set**      | Numeric, alphanumeric, byte and **Kanji** modes, **ECI**, **FNC1/GS1**, **structured append**, automatic size-optimal segmentation, mask selection.                      |
| **Types that follow the format** | `format: 'svg'` gives a `string`, `'png'` a `Uint8Array`, `'png-blob'` a `Blob`. Unknown or unsupported options throw instead of being ignored.                          |
| **Extensible**                   | Replace the encoder, a renderer or an exporter per kit instance, with typed capability checks. Kits are isolated: safe for concurrent requests.                          |
| **Verified, not assumed**        | Bit-exact against four other implementations for all 40 versions × 4 levels × 8 masks, decoded by three independent decoders. See [Quality](#quality-and-verification).  |

## Install

```bash
npm install qrcode-toolkit
```

pnpm, Yarn and Bun work the same way (`pnpm add qrcode-toolkit`, `yarn add qrcode-toolkit`, `bun add qrcode-toolkit`).

To try the repository's latest changes instead, build and pack from source:

```bash
git clone https://github.com/githubthinnd/qrcode-toolkit.git
cd qrcode-toolkit && npm install && npm run build && npm pack   # writes qrcode-toolkit-<version>.tgz
```

**Requirements:** Node.js `^22.12 || >=24` (ESM only; `require()` of the ESM build works on these versions) and any current browser through a bundler or native ES modules. Verified on Node.js 22.23 and 24.21; Node.js 26 is covered by the CI definition only.

## Quick start

```ts
import { createQRCode } from 'qrcode-toolkit';

const { value } = await createQRCode({ data: 'https://example.com', format: 'svg', size: 256 });
// value: string, a complete SVG document
```

```ts
const png = await createQRCode({ data: 'Xin chào Việt Nam', format: 'png', ecc: 'Q', scale: 8 });
// png.value: Uint8Array, a PNG image
```

The built-in providers are synchronous, so inside a render function you can use a kit and skip the `await`:

```ts
import { createQRCodeKit } from 'qrcode-toolkit';

const kit = createQRCodeKit(); // create once, reuse everywhere
const src = kit.generateSync({ data: 'hello', format: 'svg-data-url' }).value; // <img src={src}>
const matrix = kit.encode({ data: 'hello', ecc: 'H' }); // the symbol itself, for custom drawing
matrix.get(0, 0); // true when the module at x=0, y=0 is dark
```

**Which format should I use?**

| You want                                       | Use                                       |
| ---------------------------------------------- | ----------------------------------------- |
| An `<img>` or CSS background, no extra request | `svg-data-url` (or `png-data-url`)        |
| Inline, styleable markup                       | `svg`                                     |
| A file or HTTP response on the server          | `png-buffer` / `svg-buffer` (`/node`)     |
| Save to disk                                   | `png-file` / `svg-file` (`/node`)         |
| A downloadable image in the browser            | `png-blob`, `webp-blob` (`/browser`)      |
| A terminal or log                              | `text`                                    |
| Custom drawing                                 | `kit.encode(...)` and read the `QRMatrix` |

## Framework guides

`qrcode-toolkit` has no framework adapter on purpose: each integration below is a few lines around `kit.generateSync(...)`. Create the kit **once at module level**, derive the image source from your props, and render an `<img>`.

> The React, Vue 3, Svelte 5 and Next.js Route Handler snippets below are executed from this README by `npm run verify:frameworks` (server-side rendering with React 19, Vue 3 and Svelte 5, and the handler called with a Web `Request`). The Angular, Astro, Nuxt and SvelteKit snippets use only the documented API but are not executed by a test; adapt them to your versions.

<details>
<summary><b>React</b> (Vite, Create React App, Remix, React Router)</summary>

```tsx
// QRCode.tsx
import { useMemo } from 'react';
import { createQRCodeKit } from 'qrcode-toolkit';

const kit = createQRCodeKit();

type Props = {
  value: string;
  size?: number;
  ecc?: 'L' | 'M' | 'Q' | 'H';
  dark?: string;
  light?: string;
  label?: string;
};

export function QRCode({
  value,
  size = 192,
  ecc = 'M',
  dark = '#000000',
  light = '#ffffff',
  label = 'QR code',
}: Props) {
  const src = useMemo(() => {
    try {
      return kit.generateSync({ data: value, format: 'svg-data-url', size, ecc, dark, light })
        .value;
    } catch {
      return undefined; // empty or oversized value: render nothing
    }
  }, [value, size, ecc, dark, light]);

  return src ? <img src={src} width={size} height={size} alt={label} /> : null;
}
```

```tsx
<QRCode value="https://example.com/invite/42" label="Scan to join" />
```

Server-side rendering with React 18/19 works unchanged because the call is synchronous and deterministic.

</details>

<details>
<summary><b>Next.js</b> (App Router)</summary>

**1. Server Component.** Rendered on the server, no client JavaScript:

```tsx
// app/share/page.tsx
import { createQRCode } from 'qrcode-toolkit';

export default async function SharePage() {
  const { value: src } = await createQRCode({
    data: 'https://example.com/share/42',
    format: 'svg-data-url',
    size: 240,
  });
  // A data URL cannot be optimised by next/image, so a plain <img> is the right element here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={240} height={240} alt="QR code for this page" />;
}
```

**2. Client Component.** For a value that changes in the browser, use the React component above and add `'use client'` at the top of the file.

**3. Route Handler.** An image endpoint such as `/api/qr?text=...`:

```ts
// app/api/qr/route.ts
import { createNodeKit } from 'qrcode-toolkit/node';

export const runtime = 'nodejs'; // the /node entry needs Node.js APIs, so not the edge runtime

const kit = createNodeKit();

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get('text');
  if (!text || text.length > 1000) return new Response('Invalid "text"', { status: 400 });
  try {
    const { value } = await kit.generate({ data: text, format: 'png-buffer', scale: 8 });
    return new Response(new Uint8Array(value), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch {
    return new Response('This text cannot be encoded', { status: 422 });
  }
}
```

Always bound untrusted input yourself (the example allows 1 000 characters); the library's own limit is 65 536.

**Pages Router:** use `getServerSideProps`/`getStaticProps` to call `createQRCode` and pass the data URL as a prop, or use the React component.

</details>

<details>
<summary><b>Vue 3</b> (Vite)</summary>

```vue
<!-- QrCode.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { createQRCodeKit } from 'qrcode-toolkit';

const kit = createQRCodeKit();

const props = withDefaults(
  defineProps<{
    value: string;
    size?: number;
    ecc?: 'L' | 'M' | 'Q' | 'H';
    dark?: string;
    light?: string;
    label?: string;
  }>(),
  { size: 192, ecc: 'M', dark: '#000000', light: '#ffffff', label: 'QR code' },
);

const src = computed(() => {
  try {
    return kit.generateSync({
      data: props.value,
      format: 'svg-data-url',
      size: props.size,
      ecc: props.ecc,
      dark: props.dark,
      light: props.light,
    }).value;
  } catch {
    return ''; // empty or oversized value
  }
});
</script>

<template>
  <img v-if="src" :src="src" :width="size" :height="size" :alt="label" />
</template>
```

```vue
<QrCode value="https://example.com/invite/42" label="Scan to join" />
```

</details>

<details>
<summary><b>Nuxt</b> (3 and 4)</summary>

No module or plugin is needed. Install the package, then add a component and, optionally, an image endpoint.

**1. Component.** Save the Vue component above as `components/QrCode.vue`; Nuxt auto-imports it as `<QrCode />`. It renders on the server and hydrates without a mismatch because the output is deterministic:

```vue
<template>
  <QrCode value="https://example.com/invite/42" :size="220" label="Scan to join" />
</template>
```

**2. Composable** (optional), for generating data in `<script setup>` or in a store:

```ts
// composables/useQrCode.ts
import { createQRCodeKit } from 'qrcode-toolkit';

const kit = createQRCodeKit();

export function useQrCode(value: MaybeRefOrGetter<string>, size = 192) {
  return computed(() => {
    try {
      return kit.generateSync({ data: toValue(value), format: 'svg-data-url', size }).value;
    } catch {
      return '';
    }
  });
}
```

**3. Server route.** `GET /api/qr?text=...` returns a PNG:

```ts
// server/api/qr.get.ts
import { createNodeKit } from 'qrcode-toolkit/node';

const kit = createNodeKit();

export default defineEventHandler(async (event) => {
  const { text } = getQuery(event);
  if (typeof text !== 'string' || text.length === 0 || text.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid "text"' });
  }
  const { value } = await kit.generate({ data: text, format: 'png-buffer', scale: 8 });
  setHeader(event, 'Content-Type', 'image/png');
  setHeader(event, 'Cache-Control', 'public, max-age=86400');
  return value; // a Buffer; Nitro sends it as binary
});
```

Prerendering works too: the component and the route only use synchronous, deterministic calls.

</details>

<details>
<summary><b>Svelte 5 and SvelteKit</b></summary>

```svelte
<!-- QrCode.svelte -->
<script lang="ts">
  import { createQRCodeKit } from 'qrcode-toolkit';

  const kit = createQRCodeKit();

  let {
    value,
    size = 192,
    ecc = 'M',
    label = 'QR code',
  }: { value: string; size?: number; ecc?: 'L' | 'M' | 'Q' | 'H'; label?: string } = $props();

  const src = $derived.by(() => {
    try {
      return kit.generateSync({ data: value, format: 'svg-data-url', size, ecc }).value;
    } catch {
      return '';
    }
  });
</script>

{#if src}
  <img {src} width={size} height={size} alt={label} />
{/if}
```

On **Svelte 4** replace `$props()` with `export let value: string;` and `$derived` with a reactive statement (`$: src = ...`).

**SvelteKit endpoint** for `/api/qr?text=...`:

```ts
// src/routes/api/qr/+server.ts
import { error } from '@sveltejs/kit';
import { createNodeKit } from 'qrcode-toolkit/node';
import type { RequestHandler } from './$types';

const kit = createNodeKit();

export const GET: RequestHandler = async ({ url }) => {
  const text = url.searchParams.get('text');
  if (!text || text.length > 1000) error(400, 'Invalid "text"');
  const { value } = await kit.generate({ data: text, format: 'png-buffer', scale: 8 });
  return new Response(new Uint8Array(value), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
  });
};
```

Use an adapter that runs Node.js (`adapter-node`, or a Node-based serverless target) for this endpoint, not an edge runtime.

</details>

<details>
<summary><b>Angular</b> (standalone components, signals)</summary>

```ts
// qr-code.component.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { createQRCodeKit } from 'qrcode-toolkit';

const kit = createQRCodeKit();

@Component({
  selector: 'app-qr-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as source) {
      <img [src]="source" [attr.width]="size()" [attr.height]="size()" [alt]="label()" />
    }
  `,
})
export class QrCodeComponent {
  readonly value = input.required<string>();
  readonly size = input(192);
  readonly label = input('QR code');

  // A PNG data URL is accepted by Angular's default URL sanitiser, so no bypassSecurityTrustUrl is needed.
  protected readonly src = computed(() => {
    try {
      return kit.generateSync({ data: this.value(), format: 'png-data-url', scale: 6 }).value;
    } catch {
      return '';
    }
  });
}
```

```html
<app-qr-code value="https://example.com/invite/42" label="Scan to join" />
```

`input()` needs Angular 17.1 or newer; with older versions use `@Input()`. For Angular SSR the same code runs on the server unchanged.

</details>

<details>
<summary><b>Astro</b></summary>

Generated at build time, no JavaScript shipped to the browser:

```astro
---
// src/components/QrCode.astro
import { createQRCode } from 'qrcode-toolkit';

interface Props {
  value: string;
  size?: number;
  label?: string;
}
const { value, size = 192, label = 'QR code' } = Astro.props;
const { value: src } = await createQRCode({ data: value, format: 'svg-data-url', size });
---

<img src={src} width={size} height={size} alt={label} />
```

```astro
<QrCode value="https://example.com/invite/42" label="Scan to join" />
```

</details>

<details>
<summary><b>Node.js servers</b> (Express, Fastify, Hono on Node, serverless on Node)</summary>

```ts
import express from 'express';
import { createNodeKit } from 'qrcode-toolkit/node';

const kit = createNodeKit();
const app = express();

app.get('/qr.png', async (req, res) => {
  const text = typeof req.query.text === 'string' ? req.query.text : '';
  if (text.length === 0 || text.length > 1000) return res.status(400).send('Invalid "text"');
  const { value } = await kit.generate({ data: text, format: 'png-buffer', scale: 8 });
  res.type('png').set('Cache-Control', 'public, max-age=86400').send(value);
});

app.listen(3000);
```

Fastify is the same idea: `reply.type('image/png').send(value)`. To write files, confine them to a directory:

```ts
const files = createNodeKit({ files: { baseDir: '/srv/qr', createDirectories: true } });
await files.generate({
  data: 'https://example.com',
  format: 'png-file',
  path: 'campaign/spring.png',
});
```

</details>

<details>
<summary><b>Plain browser / vanilla JavaScript</b></summary>

```html
<img id="qr" width="256" height="256" alt="QR code" />
<a id="download">Download PNG</a>

<script type="module">
  // Resolve the bare specifier with a bundler (Vite, esbuild, webpack) or an import map.
  import { createBrowserKit } from 'qrcode-toolkit/browser';

  const kit = createBrowserKit();
  const data = 'https://example.com';

  document.getElementById('qr').src = kit.generateSync({
    data,
    format: 'svg-data-url',
    size: 256,
  }).value;

  const { value: blob } = await kit.generate({ data, format: 'png-blob', scale: 10 });
  const link = document.getElementById('download');
  link.href = URL.createObjectURL(blob);
  link.download = 'qr.png';
</script>
```

</details>

**Any other framework** (Solid, Qwik, Lit, Alpine, Eleventy, plain templates): call `createQRCodeKit().generateSync({ data, format: 'svg-data-url' }).value` wherever you need an image source.

### Integration tips

- **Create the kit once** at module level. Kits are cheap to share and hold no per-request state.
- **Prefer `<img src>` with a data URL** over injecting SVG markup. It needs no `innerHTML`, no sanitiser and no CSP exception for inline SVG.
- **Always set `alt` text** that says what the code does ("Scan to join the event"), not "QR code".
- **Keep dark-on-light with enough contrast** and the default quiet zone of 4 modules. The result's `warnings` tell you when a choice may hurt scanning.
- **Size by container:** with SVG, `size` only sets the intrinsic size, so let CSS scale the `<img>`. For PNG, prefer `scale` so every module is a whole number of pixels.
- **Bound untrusted input** before encoding (a few hundred characters is plenty for most links) and handle the thrown `QRCodeKitError`.

## Cookbook

<details>
<summary><b>Common payloads</b>: Wi-Fi, vCard, email, SMS, location</summary>

```ts
const wifi = 'WIFI:T:WPA;S:Guest Network;P:correct-horse-battery;;';
const mail = 'mailto:hello@example.com?subject=Hi';
const sms = 'SMSTO:+84901234567:Hello';
const geo = 'geo:10.7769,106.7009';
const vcard = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:An Nguyen',
  'TEL;TYPE=CELL:+84901234567',
  'END:VCARD',
].join('\n');

const { value } = await createQRCode({ data: wifi, ecc: 'Q', format: 'svg' });
```

</details>

<details>
<summary><b>Brand colours and transparent backgrounds</b></summary>

```ts
await createQRCode({ data: url, format: 'svg', dark: '#312e81', light: '#ffffff' });
await createQRCode({ data: url, format: 'png', light: 'transparent' }); // PNG keeps the alpha channel
```

`jpeg-blob` has no alpha channel, so a transparent colour there is rejected (`UNSUPPORTED_CAPABILITY`) instead of silently turning black.

</details>

<details>
<summary><b>Vietnamese and other Unicode text</b></summary>

```ts
await createQRCode({ data: 'Xin chào Việt Nam — Nhữ Duy Thìn', ecc: 'Q' });
```

Text is encoded as UTF-8 **without** an ECI header by default, which is what almost every phone scanner expects. See [Text encoding and ECI](#text-encoding-and-eci).

</details>

<details>
<summary><b>Choosing an error correction level</b></summary>

| Level | Recovers about | Use for                                       |
| ----- | -------------- | --------------------------------------------- |
| `L`   | 7 %            | Clean screens, the densest and smallest codes |
| `M`   | 15 %           | Default; good for most screens and prints     |
| `Q`   | 25 %           | Printed material that can scuff               |
| `H`   | 30 %           | Harsh conditions, or a partly covered code    |

A higher level means a larger symbol for the same data. `boostEcc: true` raises the level while the data still fits in the version you chose.

</details>

<details>
<summary><b>Download or copy an image in the browser</b></summary>

```ts
import { createBrowserKit } from 'qrcode-toolkit/browser';

const kit = createBrowserKit();
const { value: blob } = await kit.generate({ data: url, format: 'png-blob', scale: 12 });

await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); // copy
const a = Object.assign(document.createElement('a'), {
  href: URL.createObjectURL(blob),
  download: 'qr.png',
});
a.click(); // download
```

</details>

<details>
<summary><b>Split long data across several codes</b> (structured append)</summary>

```ts
const parts = await kit.generateStructuredAppend({ data: longText, symbols: 3, format: 'svg' });
parts.map((p) => p.matrix.structuredAppend); // { index, total, parity }
```

Scanners that support structured append rejoin the parts; others read each part on its own.

</details>

## API reference

### Options

| Option                      | Default        | Meaning                                                                                                                                           |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`                      | required       | `string`, `Uint8Array`, or an array of explicit segments (`segment.numeric(...)` …)                                                               |
| `ecc`                       | `'M'`          | Error correction level `'L' \| 'M' \| 'Q' \| 'H'`                                                                                                 |
| `version`                   | 1–40, smallest | An exact version, or `{ min, max }`                                                                                                               |
| `mask`                      | `'auto'`       | Mask pattern 0–7, or the lowest-penalty one                                                                                                       |
| `boostEcc`                  | `false`        | Raise the level while the data still fits in the chosen version                                                                                   |
| `charset`                   | `'utf-8'`      | `'utf-8'` or `'iso-8859-1'` for string data                                                                                                       |
| `eci`                       | `false`        | `true`: declare the charset of text (ECI 26 / 3). A number: declare that ECI for byte data                                                        |
| `kanji`                     | `false`        | Allow Kanji mode (13 bits per character) for JIS X 0208 text; see [Kanji](#kanji)                                                                 |
| `fnc1`                      | –              | `'first'` (GS1), or `{ applicationIndicator }`: `"00"`–`"99"`, one letter, or a raw 0–255 number                                                  |
| `format`                    | `'svg'`        | See [formats](#formats)                                                                                                                           |
| `quietZone`                 | `4`            | Quiet zone in modules (a warning is returned below 4)                                                                                             |
| `scale` / `size`            | –              | Pixels per module / target edge in pixels (mutually exclusive); raster `size` is rounded down to whole pixels per module (`SIZE_ROUNDED` warning) |
| `dark` / `light` / `invert` | black / white  | Colours: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `black`, `white`, `transparent`                                                                 |
| `quality`                   | –              | 0–1, for `jpeg-blob` and `webp-blob` only (rejected elsewhere)                                                                                    |
| `path`                      | –              | Destination for file formats                                                                                                                      |
| `providers`                 | –              | Per-operation provider ids: `{ encoder, renderer, exporter }`                                                                                     |

Unknown options and options the selected providers cannot honour raise an error; nothing is ignored silently.

### Formats

| Format                               | Value type        | Entry            |
| ------------------------------------ | ----------------- | ---------------- |
| `svg`, `svg-data-url`                | `string`          | `qrcode-toolkit` |
| `png`                                | `Uint8Array`      | `qrcode-toolkit` |
| `png-data-url`                       | `string`          | `qrcode-toolkit` |
| `text`                               | `string`          | `qrcode-toolkit` |
| `png-buffer`, `svg-buffer`           | `Buffer`          | `/node`          |
| `png-file`, `svg-file`, `text-file`  | `{ path, bytes }` | `/node`          |
| `png-blob`, `jpeg-blob`, `webp-blob` | `Blob`            | `/browser`       |

### Entry points

| Import                   | Contents                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `qrcode-toolkit`         | `createQRCode`, `createQRCodeKit`, `segment`, `QRMatrix`, error classes, provider contracts and built-ins |
| `qrcode-toolkit/node`    | `createNodeKit`: Buffer and confined file exporters                                                       |
| `qrcode-toolkit/browser` | `createBrowserKit`: canvas renderer and PNG / JPEG / WebP Blob exporters. Touches no DOM API on import    |
| `qrcode-toolkit/kanji`   | `createJisX0208KanjiMapper`: built-in Kanji table, about 21 kB, bundled only when imported                |
| `qrcode-toolkit/testing` | Conformance checks for provider authors                                                                   |

### Errors and warnings

Every error is a `QRCodeKitError` with a stable `code` (`INVALID_INPUT`, `UNSUPPORTED_DATA`, `INVALID_CONFIGURATION`, `PROVIDER_NOT_FOUND`, `PROVIDER_CONFLICT`, `UNSUPPORTED_CAPABILITY`, `ENCODING_FAILED`, `RENDERING_FAILED`, `EXPORT_FAILED`, `RUNTIME_UNAVAILABLE`, `PLUGIN_FAILED`), the original error in `cause`, and primitive-only `details`. Use `isQRCodeKitError(e)` to recognise them across duplicated copies of the package.

```ts
import { createQRCode, isQRCodeKitError } from 'qrcode-toolkit';

try {
  await createQRCode({ data: userInput, ecc: 'H' });
} catch (error) {
  if (isQRCodeKitError(error) && error.code === 'UNSUPPORTED_DATA')
    showMessage('That is too long for a QR code.');
  else throw error;
}
```

Errors raised by the library never contain your data. An error thrown by your own plugin hook or custom provider is passed through as `cause` unchanged, so it may.

Non-fatal observations (`QUIET_ZONE_SMALL`, `LOW_CONTRAST`, `INVERTED_POLARITY`, `SIZE_ROUNDED`) are returned in `result.warnings` and passed to the optional `onDiagnostic` callback. Nothing is logged.

### Text encoding and ECI

By default text is encoded as UTF-8 **without** an ECI header. This is what the large majority of scanners expect and read correctly. Declaring the charset with `eci: true` follows the standard more strictly, but some readers mishandle ECI (jsQR returns an empty string for ECI 3, for example). Use `eci` when you know your scanners support it.

### Kanji

```ts
import { createQRCodeKit } from 'qrcode-toolkit';
import { createJisX0208KanjiMapper } from 'qrcode-toolkit/kanji'; // optional, platform independent

const kit = createQRCodeKit({ kanji: createJisX0208KanjiMapper() });
kit.encode({ data: '日本語のテキスト', kanji: true }); // Kanji mode: 13 bits per character
```

Kanji mode covers exactly the 6 872 JIS X 0208 characters whose Unicode mapping is the same in the Unicode Consortium's table and in Windows-31J. Everything else (including the Windows extensions and seven ambiguous characters such as `～` U+FF5E) is encoded in byte mode, which always round-trips. Without the `/kanji` entry the mapping is derived from the platform's `TextDecoder('shift_jis')`; where that is missing a `RUNTIME_UNAVAILABLE` error points you to the entry.

### GS1 and structured append

`fnc1: 'first'` marks GS1 formatted data. `generateStructuredAppend` takes `string` or `Uint8Array` data only; `eci`, `kanji`, `fnc1` and segment arrays are rejected there. Everything else (`ecc`, `version`, `mask`, `boostEcc`, `charset`, appearance, `format`) works as in `generate`.

### Providers and plugins

The encoder, renderers and exporters are providers behind small typed contracts. A kit is an isolated composition of providers; when several providers can serve a format, the last registered one wins, so yours override the built-ins:

```ts
const kit = createQRCodeKit({ providers: { renderers: [myRenderer], exporters: [myExporter] } });
```

Provider authors can use `qrcode-toolkit/testing` (conformance checks). Plugins (hooks and extra providers) are **experimental**.

## Playground

```bash
npm run playground        # builds the package and the playground, then serves http://127.0.0.1:5173/
npm run playground:build  # only writes playground-dist/index.html (one self-contained file)
```

A local, offline workbench for the built package: every option, all eight formats, live preview with zoom and download, an **Anatomy** view that colours each module by role, segment and provider details, copy-ready TypeScript for the current settings, shareable links, and a **Self-test** that runs 28 checks in your browser: canvas drawing, each Blob encoder, capability guards, provider precedence, size rounding and a round trip through independent decoders (jsQR, ZXing and the native `BarcodeDetector` when present). "Verify scan" decodes what you see with the same engines. The decoders are development dependencies bundled into the playground only; the library never imports them.

## Quality and verification

Correctness comes from independent oracles, not snapshots:

- **Bit-exact matrices** against four other QR implementations for all 40 versions × 4 error correction levels × 8 masks.
- **Decoding** with three independent decoders; a symbol passes when jsQR and at least one other decoder read it back exactly, because each decoder has known blind spots.
- **Seeded fuzzing**, capacity boundaries, Reed-Solomon and mask-scoring properties.
- **Kanji** checked character by character (all 6 872) against the Unicode Consortium table, a second encoder and two decoders.
- **The packed tarball** is installed into clean consumer projects (ESM, `require(esm)`, TypeScript without Node or DOM types, esbuild bundling, tree-shaking) and linted with publint and Are the Types Wrong.
- More than 330 automated tests run on every `npm run check`, alongside strict TypeScript, ESLint and architecture rules that enforce the layering.

A micro-benchmark script (`node bench/bench.mjs`) compares matrix encoding with other libraries on your machine; numbers are indicators, not guarantees.

## Security

- Input larger than 65 536 characters / bytes and rasters larger than 16 777 216 pixels are rejected before any work is done (configurable with `limits`).
- SVG output contains only numbers and validated colours; user text never reaches the markup.
- File exporters can be confined to a directory with `baseDir`, including symbolic-link checks.
- No install scripts and no dependencies.

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Limitations

- Only QR Code Model 2. Micro QR and rMQR are not supported.
- PNG output is two-colour (1-bit palette). Gradients, rounded modules and logos are not implemented.
- Kanji mode is strictly JIS X 0208 (6 872 characters; seven characters whose Windows and JIS mappings disagree use byte mode instead).
- Real-device scanning (iOS / Android cameras) and real-browser runs have not yet been part of the automated verification.
- Runtimes: browsers and Node.js are supported and tested. The core entry (`qrcode-toolkit`) uses no Node.js or DOM API, so it is built to run on Deno, Bun and edge workers too, but those runtimes are not tested yet and not claimed. The `/node` entry needs Node.js and the `/browser` entry needs a canvas.

## FAQ

<details>
<summary><b>Does it work with Next.js, Nuxt, React, Vue, Svelte, Angular and Astro?</b></summary>

Yes. The package is plain ESM functions with no framework code, so it runs wherever JavaScript runs on Node.js or in a browser. See the [Framework guides](#framework-guides) for copy-paste components and server routes.

</details>

<details>
<summary><b>Will it cause hydration mismatches in SSR?</b></summary>

No. Generation is deterministic and, with the built-in providers, synchronous, so the server and the client produce identical output for the same options.

</details>

<details>
<summary><b>Can I put a logo in the middle?</b></summary>

Not yet; logos, gradients and rounded modules are not implemented. You can draw over the symbol yourself using `kit.encode(...)` (the `QRMatrix` exposes every module and its role) and use error correction `H` to leave room.

</details>

<details>
<summary><b>Why is text UTF-8 without ECI by default?</b></summary>

Most scanners assume UTF-8 for byte data and some mishandle an ECI header. ECI is opt-in with `eci: true` when you know your readers support it.

</details>

<details>
<summary><b>Is it on npm?</b></summary>

Yes: `npm install qrcode-toolkit`. It is a 0.x pre-release, so `^0.1.0` only accepts 0.1.x updates.

</details>

## Contributing

```bash
npm install
npm run check      # format, lint, typecheck, architecture rules, tests, build, packed-tarball verification
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [CHANGELOG](CHANGELOG.md). Please read the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE). "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
