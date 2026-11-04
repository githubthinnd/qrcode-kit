import { PROVIDER_API_VERSION, type Rgba } from '../../../contracts/common.js';
import type { RenderOptions, RendererProvider, SvgOutput } from '../../../contracts/renderer.js';
import type { QRMatrix } from '../../../domain/matrix.js';

export const SVG_RENDERER_ID = 'qrcode-toolkit/svg';

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/** `#rrggbb` from validated 0–255 integers; nothing user-controlled is interpolated. */
const colorHex = (c: Rgba): string => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;

/** Opacity with at most three decimals, from a validated 0–255 alpha. */
const opacity = (a: number): string => (Math.round((a / 255) * 1000) / 1000).toString();

/** Build the SVG document. Only numbers and validated colours are written into the markup. */
function buildSvg(matrix: QRMatrix, options: RenderOptions): SvgOutput {
  const modules = matrix.size + options.quietZone * 2;
  const dark = options.invert ? options.light : options.dark;
  const light = options.invert ? options.dark : options.light;

  let edge: number | undefined;
  if (options.scale !== undefined) edge = modules * options.scale;
  else if (options.size !== undefined) edge = options.size;

  let path = '';
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (!matrix.get(x, y)) {
        x++;
        continue;
      }
      let end = x;
      while (end < matrix.size && matrix.get(end, y)) end++;
      path += `M${String(x + options.quietZone)} ${String(y + options.quietZone)}h${String(end - x)}v1h-${String(end - x)}z`;
      x = end;
    }
  }

  const size = edge === undefined ? '' : ` width="${String(edge)}" height="${String(edge)}"`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(modules)} ${String(modules)}"${size} shape-rendering="crispEdges">`,
  ];
  if (light.a > 0) {
    const fillOpacity = light.a < 255 ? ` fill-opacity="${opacity(light.a)}"` : '';
    parts.push(
      `<rect width="${String(modules)}" height="${String(modules)}" fill="${colorHex(light)}"${fillOpacity}/>`,
    );
  }
  if (path.length > 0 && dark.a > 0) {
    const fillOpacity = dark.a < 255 ? ` fill-opacity="${opacity(dark.a)}"` : '';
    parts.push(`<path d="${path}" fill="${colorHex(dark)}"${fillOpacity}/>`);
  }
  parts.push('</svg>');
  return { kind: 'svg', markup: parts.join(''), modules, width: edge, height: edge };
}

/** Renders a matrix as a compact SVG (one path, run-length merged). */
export function createSvgRenderer(): RendererProvider {
  return {
    id: SVG_RENDERER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      produces: 'svg',
      transparency: true,
      colors: true,
      gradients: false,
      moduleShapes: ['square'],
      logo: false,
      maxPixels: undefined,
      sync: true,
    },
    render: buildSvg,
  };
}
