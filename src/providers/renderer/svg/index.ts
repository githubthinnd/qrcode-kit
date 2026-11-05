import { PROVIDER_API_VERSION, type Rgba } from '../../../contracts/common.js';
import type {
  GradientSpec,
  RenderOptions,
  RendererProvider,
  SvgOutput,
} from '../../../contracts/renderer.js';
import { RenderingError } from '../../../domain/errors.js';
import type { QRMatrix } from '../../../domain/matrix.js';
import type { ErrorCorrectionLevel } from '../../../domain/model.js';

export const SVG_RENDERER_ID = 'qrcode-toolkit/svg';

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/** `#rrggbb` from validated 0–255 integers; nothing user-controlled is interpolated. */
const colorHex = (c: Rgba): string => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;

/** Opacity with at most three decimals, from a validated 0–255 alpha. */
const opacity = (a: number): string => (Math.round((a / 255) * 1000) / 1000).toString();

/** A number with at most three decimals, as written into path data. */
const num = (value: number): string => String(Math.round(value * 1000) / 1000);

/** Share of the data modules an error-correction level can recover, halved for a safety margin. */
const SAFE_COVERAGE: Readonly<Record<ErrorCorrectionLevel, number>> = {
  L: 0.07 / 2,
  M: 0.15 / 2,
  Q: 0.25 / 2,
  H: 0.3 / 2,
};

/** Where the logo sits, in matrix coordinates (without quiet zone). */
interface LogoPlacement {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly cleared: (x: number, y: number) => boolean;
}

/**
 * Centre the logo, clear the modules around it and check that this neither touches a function
 * pattern nor hides more data than the error correction level can safely absorb.
 */
function placeLogo(matrix: QRMatrix, options: RenderOptions): LogoPlacement | undefined {
  const logo = options.logo;
  if (logo === undefined) return undefined;
  if (matrix.symbol !== 'qr') {
    throw new RenderingError('A logo is only available for QR Code symbols.');
  }
  const n = matrix.size;
  let size = Math.max(1, Math.round(n * logo.size));
  if ((n - size) % 2 !== 0) size++; // an odd symbol keeps an odd logo, so it stays centred
  const start = (n - size) / 2;
  const from = start - logo.margin;
  const to = start + size + logo.margin; // exclusive
  if (from < 0 || to > n) {
    throw new RenderingError(
      'The logo and its margin do not fit inside this symbol. Use a smaller "logo.size" or "logo.margin".',
    );
  }
  let hidden = 0;
  let data = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const kind = matrix.kind(x, y);
      const inside = x >= from && x < to && y >= from && y < to;
      if (kind === 'data') {
        data++;
        if (inside) hidden++;
      } else if (inside && kind !== 'alignment') {
        throw new RenderingError(
          `The logo would cover the ${kind} pattern of this version ${String(matrix.version)} symbol. Use a smaller "logo.size" or a larger "version".`,
        );
      }
    }
  }
  const share = hidden / data;
  const allowed = SAFE_COVERAGE[matrix.ecc];
  if (share > allowed) {
    const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
    throw new RenderingError(
      `The logo would hide ${percent(share)} of the data, more than the ${percent(allowed)} that error correction level ${matrix.ecc} can safely absorb. Use ecc "H", a smaller "logo.size" or a larger "version".`,
      { details: { hidden, data } },
    );
  }
  return {
    x: start,
    y: start,
    size,
    cleared: (x, y) => x >= from && x < to && y >= from && y < to,
  };
}

/** Rounded rectangle, clockwise. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const a = `a${num(r)} ${num(r)} 0 0 1`;
  return (
    `M${num(x + r)} ${num(y)}h${num(w - 2 * r)}${a} ${num(r)} ${num(r)}` +
    `v${num(h - 2 * r)}${a} -${num(r)} ${num(r)}` +
    `h-${num(w - 2 * r)}${a} -${num(r)} -${num(r)}` +
    `v-${num(h - 2 * r)}${a} ${num(r)} -${num(r)}z`
  );
}

/** One module with only its exposed corners rounded, so neighbours join into a continuous shape. */
function blob(x: number, y: number, tl: number, tr: number, br: number, bl: number): string {
  const arc = (r: number, dx: number, dy: number): string =>
    r === 0 ? '' : `a${num(r)} ${num(r)} 0 0 1 ${num(dx)} ${num(dy)}`;
  return (
    `M${num(x + tl)} ${num(y)}h${num(1 - tl - tr)}${arc(tr, tr, tr)}` +
    `v${num(1 - tr - br)}${arc(br, -br, br)}` +
    `h-${num(1 - br - bl)}${arc(bl, -bl, -bl)}` +
    `v-${num(1 - bl - tl)}${arc(tl, tl, -tl)}z`
  );
}

function circle(cx: number, cy: number, r: number): string {
  const a = `a${num(r)} ${num(r)} 0 1 0`;
  return `M${num(cx - r)} ${num(cy)}${a} ${num(2 * r)} 0${a} -${num(2 * r)} 0z`;
}

/** A finder pattern drawn as a rounded ring around a rounded centre (needs `fill-rule="evenodd"`). */
function finder(x: number, y: number): string {
  return (
    roundRect(x, y, 7, 7, 2) + roundRect(x + 1, y + 1, 5, 5, 1) + roundRect(x + 2, y + 2, 3, 3, 1)
  );
}

/** Gradient definition. The id is derived from the colours, so equal gradients share one id. */
function gradientDefs(
  gradient: GradientSpec,
  modulesX: number,
  modulesY: number,
): { id: string; defs: string } {
  const from = colorHex(gradient.from).slice(1);
  const to = colorHex(gradient.to).slice(1);
  const id = `qrg-${from}${to}${gradient.type === 'radial' ? 'r' : 'l'}${String(gradient.angle)}`;
  const stops =
    `<stop offset="0" stop-color="#${from}"${gradient.from.a < 255 ? ` stop-opacity="${opacity(gradient.from.a)}"` : ''}/>` +
    `<stop offset="1" stop-color="#${to}"${gradient.to.a < 255 ? ` stop-opacity="${opacity(gradient.to.a)}"` : ''}/>`;
  const halfX = modulesX / 2;
  const halfY = modulesY / 2;
  if (gradient.type === 'radial') {
    return {
      id,
      defs: `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(halfX)}" cy="${num(halfY)}" r="${num(Math.hypot(halfX, halfY))}">${stops}</radialGradient>`,
    };
  }
  const radians = (gradient.angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const reach = halfX * Math.abs(dx) + halfY * Math.abs(dy);
  return {
    id,
    defs: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(halfX - dx * reach)}" y1="${num(halfY - dy * reach)}" x2="${num(halfX + dx * reach)}" y2="${num(halfY + dy * reach)}">${stops}</linearGradient>`,
  };
}

/** Build the SVG document. Only numbers, validated colours and a validated data URL are written. */
function buildSvg(matrix: QRMatrix, options: RenderOptions): SvgOutput {
  const modulesX = matrix.width + options.quietZone * 2;
  const modulesY = matrix.height + options.quietZone * 2;
  const dark = options.invert ? options.light : options.dark;
  const light = options.invert ? options.dark : options.light;
  const shape = options.moduleShape;
  const logo = placeLogo(matrix, options);

  // `size` is the width; the height keeps the aspect ratio of the symbol (rMQR is wider than tall).
  let edgeX: number | undefined;
  let edgeY: number | undefined;
  if (options.scale !== undefined) {
    edgeX = modulesX * options.scale;
    edgeY = modulesY * options.scale;
  } else if (options.size !== undefined) {
    edgeX = options.size;
    edgeY = Math.round(((options.size * modulesY) / modulesX) * 1000) / 1000;
  }

  /** A module is dark when the symbol says so and no logo covers it. */
  const isDark = (x: number, y: number): boolean =>
    matrix.get(x, y) && !(logo?.cleared(x, y) ?? false);
  const stateAt = (px: number, py: number): boolean =>
    isDark(px - options.quietZone, py - options.quietZone);

  /** Run-length path of every module (quiet zone included) whose state equals `wanted`. */
  const runs = (wanted: boolean): string => {
    let d = '';
    for (let y = 0; y < modulesY; y++) {
      let x = 0;
      while (x < modulesX) {
        if (stateAt(x, y) !== wanted) {
          x++;
          continue;
        }
        let end = x;
        while (end < modulesX && stateAt(end, y) === wanted) end++;
        d += `M${String(x)} ${String(y)}h${String(end - x)}v1h-${String(end - x)}z`;
        x = end;
      }
    }
    return d;
  };

  /** Rounded or dotted modules; finder patterns are drawn whole so they stay recognisable. */
  const shaped = (): string => {
    const q = options.quietZone;
    // QR Code has three finder patterns; Micro QR and rMQR have one, in the top-left corner.
    const finderOrigins: readonly (readonly [number, number])[] =
      matrix.symbol === 'qr'
        ? [
            [0, 0],
            [matrix.size - 7, 0],
            [0, matrix.size - 7],
          ]
        : [[0, 0]];
    let d = finderOrigins.map(([fx, fy]) => finder(fx + q, fy + q)).join('');
    for (let y = 0; y < matrix.height; y++) {
      for (let x = 0; x < matrix.width; x++) {
        if (!isDark(x, y) || matrix.kind(x, y) === 'finder') continue;
        if (shape === 'dots') {
          d += circle(x + q + 0.5, y + q + 0.5, 0.42);
          continue;
        }
        const up = isDark(x, y - 1);
        const down = isDark(x, y + 1);
        const left = isDark(x - 1, y);
        const right = isDark(x + 1, y);
        const r = 0.4;
        d += blob(
          x + q,
          y + q,
          !up && !left ? r : 0,
          !up && !right ? r : 0,
          !down && !right ? r : 0,
          !down && !left ? r : 0,
        );
      }
    }
    return d;
  };

  const gradient =
    options.gradient === undefined ? undefined : gradientDefs(options.gradient, modulesX, modulesY);
  const darkFill = gradient === undefined ? colorHex(dark) : `url(#${gradient.id})`;
  const darkOpacity =
    gradient === undefined && dark.a < 255 ? ` fill-opacity="${opacity(dark.a)}"` : '';
  const hasDark = gradient !== undefined || dark.a > 0;
  const path = hasDark ? (shape === 'square' ? runs(true) : shaped()) : '';

  const size =
    edgeX === undefined || edgeY === undefined
      ? ''
      : ` width="${String(edgeX)}" height="${String(edgeY)}"`;
  // Curves need anti-aliasing; square modules stay crisp.
  const rendering = shape === 'square' ? ' shape-rendering="crispEdges"' : '';
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(modulesX)} ${String(modulesY)}"${size}${rendering}>`,
  ];
  if (gradient !== undefined) parts.push(`<defs>${gradient.defs}</defs>`);
  if (light.a > 0) {
    const fillOpacity = light.a < 255 ? ` fill-opacity="${opacity(light.a)}"` : '';
    if (dark.a === 255 || gradient !== undefined || shape !== 'square') {
      // An opaque dark layer covers the background, and curved shapes show it between modules,
      // so one rectangle is the right background.
      parts.push(
        `<rect width="${String(modulesX)}" height="${String(modulesY)}" fill="${colorHex(light)}"${fillOpacity}/>`,
      );
    } else {
      // A translucent or transparent dark module must not show the background through it, so
      // the light layer is drawn only where the modules are light.
      parts.push(`<path d="${runs(false)}" fill="${colorHex(light)}"${fillOpacity}/>`);
    }
  }
  if (path.length > 0 && hasDark) {
    const rule = shape === 'square' ? '' : ' fill-rule="evenodd"';
    parts.push(`<path d="${path}" fill="${darkFill}"${darkOpacity}${rule}/>`);
  }
  if (logo !== undefined && options.logo !== undefined) {
    parts.push(
      `<image href="${options.logo.href}" x="${String(logo.x + options.quietZone)}" y="${String(logo.y + options.quietZone)}" width="${String(logo.size)}" height="${String(logo.size)}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  parts.push('</svg>');
  return { kind: 'svg', markup: parts.join(''), modules: modulesX, width: edgeX, height: edgeY };
}

/** Renders a matrix as a compact SVG, optionally with rounded or dotted modules, a gradient and a logo. */
export function createSvgRenderer(): RendererProvider {
  return {
    id: SVG_RENDERER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      produces: 'svg',
      transparency: true,
      colors: true,
      gradients: true,
      moduleShapes: ['square', 'rounded', 'dots'],
      logo: true,
      maxPixels: undefined,
      sync: true,
    },
    render: buildSvg,
  };
}
