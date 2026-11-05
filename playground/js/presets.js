// Example inputs. Each preset is a partial state applied on top of the defaults.
export const PRESETS = [
  { id: '', label: 'Choose…', state: null },
  {
    id: 'url',
    label: 'URL',
    state: { mode: 'text', text: 'https://github.com/githubthinnd' },
  },
  {
    id: 'vietnamese',
    label: 'Vietnamese (UTF-8)',
    state: { mode: 'text', text: 'Xin chào Việt Nam — Nhữ Duy Thìn', ecc: 'Q' },
  },
  {
    id: 'wifi',
    label: 'Wi-Fi network',
    state: { mode: 'text', text: 'WIFI:T:WPA;S:Guest Network;P:correct-horse-battery;;', ecc: 'Q' },
  },
  {
    id: 'vcard',
    label: 'vCard contact',
    state: {
      mode: 'text',
      text: 'BEGIN:VCARD\nVERSION:3.0\nN:Nguyen;An;;;\nFN:An Nguyen\nTEL;TYPE=CELL:+84901234567\nEMAIL:an@example.com\nEND:VCARD',
      ecc: 'M',
    },
  },
  {
    id: 'numeric',
    label: 'Numeric (densest)',
    state: { mode: 'text', text: '01234567890123456789012345678901234567890123456789', ecc: 'L' },
  },
  {
    id: 'emoji',
    label: 'Emoji',
    state: { mode: 'text', text: 'Ship it 🚀✨ — 日本語 — Ελληνικά', ecc: 'M' },
  },
  {
    id: 'kanji',
    label: 'Japanese (Kanji mode)',
    state: {
      mode: 'text',
      text: '日本語のテキスト、漢字モードで圧縮されます。',
      kanji: true,
      ecc: 'M',
    },
  },
  {
    id: 'latin1',
    label: 'ISO-8859-1 + ECI',
    state: { mode: 'text', text: 'Café crème brûlée', charset: 'iso-8859-1', eci: 'auto' },
  },
  {
    id: 'gs1',
    label: 'GS1 (FNC1 first)',
    state: { mode: 'text', text: '01095011010209171719050810ABCD1234', fnc1: 'first', ecc: 'M' },
  },
  {
    id: 'segments',
    label: 'Explicit segments',
    state: {
      mode: 'segments',
      segments: 'eci:26\nalphanumeric:ORDER-\nnumeric:20261105\nbyte:20 c3 a9',
    },
  },
  {
    id: 'bytes',
    label: 'Raw bytes',
    state: { mode: 'bytes', hex: '00 01 02 03 fe ff 48 65 6c 6c 6f' },
  },
  {
    id: 'sequence',
    label: 'Structured append (3)',
    state: {
      mode: 'sequence',
      symbols: '3',
      text: 'Structured append splits one message across several linked QR Codes. Scanners that support it reassemble the parts in order; others read each part on its own. '.repeat(
        2,
      ),
      ecc: 'M',
    },
  },
  {
    id: 'v40',
    label: 'Version 40 (stress)',
    state: {
      mode: 'text',
      text: '9'.repeat(7089),
      ecc: 'L',
      quietZone: 4,
      sizeMode: 'scale',
      sizeValue: '2',
    },
  },
];
