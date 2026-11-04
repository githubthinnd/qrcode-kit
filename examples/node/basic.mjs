import { createQRCode, createQRCodeKit } from 'qrcode-toolkit';

// 1. SVG string (default format)
const svg = await createQRCode({ data: 'https://example.com', size: 256 });
console.log('SVG:', svg.value.slice(0, 60) + '…', `(${svg.value.length} chars)`);

// 2. PNG as a data URL, with a custom colour and a higher error correction level
const png = await createQRCode({
  data: 'Xin chào Việt Nam — Nhữ Duy Thìn',
  format: 'png-data-url',
  ecc: 'Q',
  dark: '#0b3d91',
  scale: 6,
});
console.log('PNG data URL:', png.value.slice(0, 40) + '…');

// 3. Terminal output
const kit = createQRCodeKit();
console.log(kit.generateSync({ data: 'https://example.com', format: 'text', quietZone: 2 }).value);

// 4. The matrix itself, for custom drawing
const matrix = kit.encode({ data: 'hello', ecc: 'H' });
console.log(
  `version ${matrix.version}, ${matrix.size}×${matrix.size} modules, mask ${matrix.mask}`,
);

// 5. Errors are typed and never contain your data
try {
  await createQRCode({ data: 'x'.repeat(5000), ecc: 'H' });
} catch (error) {
  console.log(error.code, '-', error.message);
}
