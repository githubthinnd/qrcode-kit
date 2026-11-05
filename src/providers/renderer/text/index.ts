import { PROVIDER_API_VERSION } from '../../../contracts/common.js';
import type { RenderOptions, RendererProvider, TextOutput } from '../../../contracts/renderer.js';
import type { QRMatrix } from '../../../domain/matrix.js';

export const TEXT_RENDERER_ID = 'qrcode-toolkit/text';

/** Two module rows per text line using half blocks: ▀ ▄ █ and space. */
function buildText(matrix: QRMatrix, options: RenderOptions): TextOutput {
  const columns = matrix.width + options.quietZone * 2;
  const modules = matrix.height + options.quietZone * 2;
  // Dark modules print as filled blocks, so a dark-on-light terminal reads it as-is;
  // `invert` swaps that for light-on-dark terminals.
  const filled = (x: number, y: number): boolean =>
    matrix.get(x - options.quietZone, y - options.quietZone) !== options.invert;
  const lines: string[] = [];
  for (let y = 0; y < modules; y += 2) {
    let line = '';
    for (let x = 0; x < columns; x++) {
      const top = filled(x, y);
      const bottom = y + 1 < modules ? filled(x, y + 1) : options.invert;
      line += top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return { kind: 'text', text: lines.join('\n'), columns, rows: lines.length };
}

/** Renders a matrix as Unicode text for terminals. Monochrome: custom colours are rejected. */
export function createTextRenderer(): RendererProvider {
  return {
    id: TEXT_RENDERER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      produces: 'text',
      transparency: false,
      colors: false,
      gradients: false,
      moduleShapes: ['square'],
      logo: false,
      maxPixels: undefined,
      sync: true,
    },
    render: buildText,
  };
}
