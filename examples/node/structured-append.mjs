import { createQRCodeKit } from 'qrcode-toolkit';

const kit = createQRCodeKit();
const message = 'One long message split across several linked QR Code symbols. '.repeat(6);
const symbols = await kit.generateStructuredAppend({ data: message, symbols: 3, format: 'svg' });
symbols.forEach((s, i) =>
  console.log(
    `symbol ${i + 1}/${symbols.length}: version ${s.matrix.version}, parity ${s.matrix.structuredAppend.parity}`,
  ),
);
