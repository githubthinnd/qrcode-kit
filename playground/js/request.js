// Turns the UI state into a qrcode-toolkit request. Only options that differ from the library
// defaults are included, so what you see in the "Code" tab is exactly what is sent.
import { segment } from '../../dist/index.js';

export const DEFAULTS = Object.freeze({
  mode: 'text',
  text: 'https://github.com/githubthinnd',
  hex: '48 65 6c 6c 6f',
  segments: 'numeric:0123456789\nalphanumeric:HELLO WORLD',
  symbols: '',
  ecc: 'M',
  versionMin: '',
  versionMax: '',
  mask: 'auto',
  charset: 'utf-8',
  boostEcc: false,
  kanji: false,
  eci: 'off',
  eciNumber: '',
  fnc1: 'none',
  fnc1Indicator: '',
  quietZone: 4,
  sizeMode: 'scale',
  sizeValue: '8',
  dark: '#000000',
  light: '#ffffff',
  lightTransparent: false,
  invert: false,
  shape: 'square',
  gradientOn: false,
  gradFrom: '#4f46e5',
  gradTo: '#0f172a',
  gradType: 'linear',
  gradAngle: '45',
  logoHref: '',
  logoSize: '20',
  logoMargin: '1',
  format: 'svg',
  qualityOn: false,
  quality: 0.9,
});

export const FORMATS = [
  { value: 'svg', label: 'svg · vector string' },
  { value: 'svg-data-url', label: 'svg-data-url' },
  { value: 'png', label: 'png · Uint8Array' },
  { value: 'png-data-url', label: 'png-data-url' },
  { value: 'text', label: 'text · terminal blocks' },
  { value: 'canvas', label: 'canvas · browser' },
  { value: 'png-blob', label: 'png-blob · browser' },
  { value: 'jpeg-blob', label: 'jpeg-blob · browser' },
  { value: 'webp-blob', label: 'webp-blob · browser' },
];

/** A JSON-ish value that the code generator prints verbatim. */
const code = (text) => ({ __code: text });

export function parseHex(text) {
  const clean = text.replace(/0x/gi, '').replace(/[\s,:-]+/g, '');
  if (clean.length === 0) return new Uint8Array(0);
  if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2 !== 0) {
    throw new SyntaxError('Bytes must be hexadecimal digits in pairs, e.g. "48 65 6c 6c 6f".');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const SEGMENT_MODES = [
  'numeric',
  'alphanumeric',
  'kanji',
  'byte',
  'eci',
  'fnc1-first',
  'fnc1-second',
];

export function parseSegments(text) {
  const result = [];
  const display = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') return;
    const colon = line.indexOf(':');
    const mode = (colon === -1 ? line : line.slice(0, colon)).trim();
    const value = colon === -1 ? '' : line.slice(colon + 1);
    const at = `Line ${String(index + 1)}`;
    if (!SEGMENT_MODES.includes(mode)) {
      throw new SyntaxError(`${at}: unknown segment "${mode}". Use ${SEGMENT_MODES.join(', ')}.`);
    }
    switch (mode) {
      case 'numeric':
      case 'alphanumeric':
      case 'kanji':
        result.push(segment[mode](value));
        display.push(code(`segment.${mode}(${quote(value)})`));
        break;
      case 'byte': {
        const bytes = parseHex(value);
        result.push(segment.byte(bytes));
        display.push(code(`segment.byte(${bytesSource(bytes)})`));
        break;
      }
      case 'eci':
      case 'fnc1-second': {
        if (!/^\d+$/.test(value.trim())) throw new SyntaxError(`${at}: ${mode} needs a number.`);
        const n = Number(value.trim());
        const fn = mode === 'eci' ? 'eci' : 'fnc1Second';
        result.push(segment[fn](n));
        display.push(code(`segment.${fn}(${String(n)})`));
        break;
      }
      default:
        result.push(segment.fnc1First());
        display.push(code('segment.fnc1First()'));
    }
  });
  return { value: result, display };
}

const quote = (text) =>
  `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
const bytesSource = (bytes) =>
  `Uint8Array.of(${Array.from(bytes.slice(0, 64)).join(', ')}${bytes.length > 64 ? ', …' : ''})`;

/** Print a request as TypeScript source. */
export function toSource(value, depth = 0) {
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string')
    return quote(value.length > 160 ? `${value.slice(0, 160)}…` : value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Uint8Array) return bytesSource(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => `${pad}${toSource(v, depth + 1)},`).join('\n')}\n${end}]`;
  }
  if (typeof value === 'object' && '__code' in value) return value.__code;
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, v]) => `${pad}${k}: ${toSource(v, depth + 1)},`).join('\n')}\n${end}}`;
}

const intOrUndefined = (text) => {
  const t = String(text).trim();
  return t === '' ? undefined : Number(t);
};

/**
 * @returns {{ kind: 'generate' | 'sequence', request: object, display: object }}
 * `request` goes to the library; `display` is the same shape with printable data for the Code tab.
 * Throws SyntaxError for input the playground itself cannot parse.
 */
export function buildRequest(s) {
  const request = {};
  const display = {};
  const set = (key, value, shown = value) => {
    request[key] = value;
    display[key] = shown;
  };

  if (s.mode === 'text' || s.mode === 'sequence') set('data', s.text);
  else if (s.mode === 'bytes') {
    const bytes = parseHex(s.hex);
    set('data', bytes, code(bytesSource(bytes)));
  } else {
    const parsed = parseSegments(s.segments);
    set('data', parsed.value, parsed.display);
  }
  if (s.mode === 'sequence') {
    const n = intOrUndefined(s.symbols);
    if (n !== undefined && n !== 0) set('symbols', n);
  }

  if (s.ecc !== DEFAULTS.ecc) set('ecc', s.ecc);
  const min = intOrUndefined(s.versionMin);
  const max = intOrUndefined(s.versionMax);
  if (min !== undefined && max !== undefined && min === max) set('version', min);
  else if (min !== undefined || max !== undefined) {
    set('version', {
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    });
  }
  if (s.mask !== 'auto') set('mask', Number(s.mask));
  if (s.boostEcc) set('boostEcc', true);
  if (s.charset !== DEFAULTS.charset && s.mode !== 'bytes') set('charset', s.charset);
  if (s.kanji) set('kanji', true);
  if (s.eci === 'auto') set('eci', true);
  else if (s.eci === 'number') {
    const n = intOrUndefined(s.eciNumber);
    set('eci', n === undefined ? Number.NaN : n);
  }
  if (s.fnc1 === 'first') set('fnc1', 'first');
  else if (s.fnc1 === 'second') {
    const raw = s.fnc1Indicator.trim();
    set('fnc1', {
      applicationIndicator: /^\d+$/.test(raw) && raw.length !== 2 ? Number(raw) : raw,
    });
  }

  if (s.quietZone !== DEFAULTS.quietZone) set('quietZone', Number(s.quietZone));
  const sizing = intOrUndefined(s.sizeValue);
  if (s.sizeMode === 'scale' && sizing !== undefined) set('scale', sizing);
  if (s.sizeMode === 'size' && sizing !== undefined) set('size', sizing);
  if (!s.gradientOn && s.dark.trim() !== '' && s.dark.trim().toLowerCase() !== DEFAULTS.dark) {
    set('dark', s.dark.trim());
  }
  const light = s.lightTransparent ? 'transparent' : s.light.trim();
  if (light !== '' && light.toLowerCase() !== DEFAULTS.light) set('light', light);
  if (s.invert) set('invert', true);
  if (s.shape !== 'square') set('moduleShape', s.shape);
  if (s.gradientOn) {
    const gradient = { from: s.gradFrom.trim(), to: s.gradTo.trim() };
    if (s.gradType !== 'linear') gradient.type = s.gradType;
    if (Number(s.gradAngle) !== 45) gradient.angle = Number(s.gradAngle);
    set('gradient', gradient);
  }
  if (s.logoHref !== '') {
    const logo = { href: s.logoHref };
    if (Number(s.logoSize) !== 20) logo.size = Number(s.logoSize) / 100;
    if (Number(s.logoMargin) !== 1) logo.margin = Number(s.logoMargin);
    set('logo', logo, { ...logo, href: code(`'${s.logoHref.slice(0, 30)}…'`) });
  }

  set('format', s.format);
  if (s.qualityOn) set('quality', Number(s.quality));

  return { kind: s.mode === 'sequence' ? 'sequence' : 'generate', request, display };
}

export function toTypeScript({ kind, display }) {
  const call = kind === 'sequence' ? 'generateStructuredAppend' : 'generate';
  const needsSegment = JSON.stringify(display).includes('segment.');
  const head = [
    needsSegment ? "import { segment } from 'qrcode-toolkit';" : null,
    "import { createBrowserKit } from 'qrcode-toolkit/browser';",
    '',
    'const kit = createBrowserKit();',
  ]
    .filter((line) => line !== null)
    .join('\n');
  const body = `const ${kind === 'sequence' ? 'parts' : 'result'} = await kit.${call}(${toSource(display)});`;
  const tail =
    kind === 'sequence'
      ? '\nparts.forEach((p, i) => console.log(i, p.matrix.structuredAppend, p.warnings));'
      : '\nconsole.log(result.mimeType, result.matrix.version, result.warnings);';
  return `${head}\n\n${body}${tail}\n`;
}
