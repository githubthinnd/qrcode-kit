import { createQRCodeKit } from 'qrcode-toolkit';
import { assertConformance, checkRendererProvider } from 'qrcode-toolkit/testing';

/** A renderer that draws the symbol as an HTML table (a new output "kind" would need an exporter; text reuses the text exporter). */
const asciiRenderer = {
  id: 'example/ascii',
  apiVersion: 1,
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
  render(matrix, { quietZone, invert }) {
    const size = matrix.size + quietZone * 2;
    const lines = [];
    for (let y = 0; y < size; y++) {
      let line = '';
      for (let x = 0; x < size; x++) {
        const dark = matrix.get(x - quietZone, y - quietZone) !== invert;
        line += dark ? '##' : '  ';
      }
      lines.push(line);
    }
    return { kind: 'text', text: lines.join('\n'), columns: size * 2, rows: size };
  },
};

// Providers are checked by the public conformance kit…
assertConformance(await checkRendererProvider(asciiRenderer));

// …and composed per kit. The last registered provider that can serve a format wins.
const kit = createQRCodeKit({ providers: { renderers: [asciiRenderer] } });
console.log(kit.generateSync({ data: 'custom', format: 'text', quietZone: 1 }).value);
