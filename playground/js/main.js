import { isQRCodeKitError } from '../../dist/index.js';
import { createBrowserKit } from '../../dist/browser.js';
import { createJisX0208KanjiMapper } from '../../dist/kanji.js';
import { PRESETS } from './presets.js';
import { DEFAULTS, FORMATS, buildRequest, toTypeScript } from './request.js';
import { decodeAll, rasterize } from './decoder.js';
import { buildTests, environment, runSelfTest } from './selftest.js';

const $ = (id) => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el;
};

/* ───────────────────────── state ↔ DOM ───────────────────────── */

const textFields = {
  text: 'in-text',
  hex: 'in-hex',
  segments: 'in-segments',
  symbols: 'in-symbols',
  versionMin: 'in-vmin',
  versionMax: 'in-vmax',
  mask: 'in-mask',
  charset: 'in-charset',
  eci: 'in-eci',
  eciNumber: 'in-eci-n',
  fnc1: 'in-fnc1',
  fnc1Indicator: 'in-fnc1-ai',
  sizeMode: 'in-size-mode',
  sizeValue: 'in-size',
  dark: 'in-dark-text',
  light: 'in-light-text',
  format: 'in-format',
  gradFrom: 'in-grad-from-text',
  gradTo: 'in-grad-to-text',
  gradType: 'in-grad-type',
  gradAngle: 'in-grad-angle',
  logoHref: 'in-logo-href',
  logoSize: 'in-logo-size',
  logoMargin: 'in-logo-margin',
};
const checkFields = {
  boostEcc: 'in-boost',
  kanji: 'in-kanji',
  lightTransparent: 'in-light-transparent',
  invert: 'in-invert',
  qualityOn: 'in-quality-on',
  gradientOn: 'in-gradient',
};

const radioValue = (groupId) =>
  $(groupId).querySelector('[aria-checked="true"]')?.getAttribute('data-value') ?? '';
function setRadio(groupId, value) {
  for (const button of $(groupId).querySelectorAll('[role="radio"]')) {
    const on = button.getAttribute('data-value') === value;
    button.setAttribute('aria-checked', String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

function readState() {
  const state = {
    mode: radioValue('seg-mode'),
    ecc: radioValue('seg-ecc'),
    shape: radioValue('seg-shape'),
  };
  for (const [key, id] of Object.entries(textFields)) state[key] = $(id).value;
  for (const [key, id] of Object.entries(checkFields)) state[key] = $(id).checked;
  state.quietZone = Number($('in-quiet').value);
  state.quality = Number($('in-quality').value);
  return state;
}

function writeState(partial) {
  const state = { ...DEFAULTS, ...partial };
  setRadio('seg-mode', state.mode);
  setRadio('seg-ecc', state.ecc);
  setRadio('seg-shape', state.shape);
  for (const [key, id] of Object.entries(textFields)) $(id).value = String(state[key]);
  for (const [key, id] of Object.entries(checkFields)) $(id).checked = Boolean(state[key]);
  $('in-quiet').value = String(state.quietZone);
  $('in-quality').value = String(state.quality);
  syncColorPickers();
  syncDependents();
}

/** Show/hide and enable/disable controls that only make sense in some situations. */
function syncDependents() {
  const mode = radioValue('seg-mode');
  for (const field of document.querySelectorAll('[data-for]')) {
    field.hidden = !field.getAttribute('data-for').split(' ').includes(mode);
  }
  $('lbl-text').textContent = mode === 'sequence' ? 'Text to split across symbols' : 'Text';
  $('out-quiet').textContent = $('in-quiet').value;
  $('in-size').disabled = $('in-size-mode').value === 'none';
  $('in-size').placeholder = $('in-size-mode').value === 'size' ? '256' : '8';
  $('in-eci-n').disabled = $('in-eci').value !== 'number';
  const fnc1Second = $('in-fnc1').value === 'second';
  $('in-fnc1-ai').disabled = !fnc1Second;
  const quality = $('in-quality-on').checked;
  $('in-quality').disabled = !quality;
  $('in-light').disabled = $('in-light-transparent').checked;
  $('in-light-text').disabled = $('in-light-transparent').checked;

  const gradient = $('in-gradient').checked;
  for (const id of [
    'in-grad-from',
    'in-grad-from-text',
    'in-grad-to',
    'in-grad-to-text',
    'in-grad-type',
    'in-grad-angle',
  ]) {
    $(id).disabled = !gradient;
  }
  $('out-grad-angle').textContent = $('in-grad-angle').value;
  $('in-grad-angle').disabled = !gradient || $('in-grad-type').value === 'radial';
  $('in-dark').disabled = gradient;
  $('in-dark-text').disabled = gradient;

  const logo = $('in-logo-href').value;
  $('in-logo-size').disabled = logo === '';
  $('in-logo-margin').disabled = logo === '';
  $('btn-logo-clear').disabled = logo === '';
  $('out-logo-size').textContent = $('in-logo-size').value;
  const preview = $('logo-preview');
  preview.hidden = logo === '';
  if (logo === '') preview.removeAttribute('src');
  else if (preview.getAttribute('src') !== logo) preview.setAttribute('src', logo);
}

function syncColorPickers() {
  for (const [picker, text] of [
    ['in-dark', 'in-dark-text'],
    ['in-light', 'in-light-text'],
    ['in-grad-from', 'in-grad-from-text'],
    ['in-grad-to', 'in-grad-to-text'],
  ]) {
    const value = $(text).value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) $(picker).value = value.toLowerCase();
  }
}

/* ───────────────────────── URL hash ───────────────────────── */

const encodeHash = (state) => {
  const json = JSON.stringify(state);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
};
const decodeHash = (hash) => {
  try {
    const bytes = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0));
    const state = JSON.parse(new TextDecoder().decode(bytes));
    return typeof state === 'object' && state !== null ? state : null;
  } catch {
    return null;
  }
};
function saveHash() {
  try {
    const diff = {};
    const state = readState();
    for (const key of Object.keys(DEFAULTS)) {
      // An uploaded logo can be large; it is left out of shareable links.
      if (key === 'logoHref' && state[key].length > 1500) continue;
      if (state[key] !== DEFAULTS[key]) diff[key] = state[key];
    }
    const hash = Object.keys(diff).length === 0 ? '' : `#s=${encodeHash(diff)}`;
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  } catch {
    /* history can be unavailable in sandboxed frames; sharing then simply stays off */
  }
}

/* ───────────────────────── kit & rendering ───────────────────────── */

let kit;
const diagnostics = [];
function makeKit() {
  kit = createBrowserKit({
    kanji: createJisX0208KanjiMapper(),
    onDiagnostic: (d) => diagnostics.push(d),
  });
}

let objectUrls = [];
const releaseUrls = () => {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
};
const urlFor = (blob) => {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
};

const EXTENSIONS = {
  svg: ['svg', 'image/svg+xml'],
  'svg-data-url': ['svg', 'image/svg+xml'],
  png: ['png', 'image/png'],
  'png-data-url': ['png', 'image/png'],
  text: ['txt', 'text/plain'],
  'png-blob': ['png', 'image/png'],
  'jpeg-blob': ['jpg', 'image/jpeg'],
  'webp-blob': ['webp', 'image/webp'],
};

let current = null; // { results, format, blobs }
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const state = readState();
  const status = $('status');
  let built;
  try {
    built = buildRequest(state);
  } catch (error) {
    if (token === renderToken) showError(error, 'INPUT');
    $('code').textContent = '// Fix the input above to see the code.';
    return;
  }
  $('code').textContent = toTypeScript(built);

  const started = performance.now();
  diagnostics.length = 0;
  try {
    const results =
      built.kind === 'sequence'
        ? await kit.generateStructuredAppend(built.request)
        : [await kit.generate(built.request)];
    if (token !== renderToken) return;
    const ms = performance.now() - started;
    status.replaceChildren();
    await show(results, state.format, ms, built.kind === 'sequence');
  } catch (error) {
    if (token === renderToken) showError(error);
  }
}

function showError(error, forcedCode) {
  const status = $('status');
  const banner = document.createElement('div');
  banner.className = 'banner error';
  const code = document.createElement('strong');
  code.textContent = forcedCode ?? (isQRCodeKitError(error) ? error.code : 'ERROR');
  const message = document.createElement('span');
  message.textContent = error instanceof Error ? error.message : String(error);
  banner.append(code, message);
  if (error instanceof Error && error.cause instanceof Error) {
    const cause = document.createElement('small');
    cause.textContent = `Caused by: ${error.cause.message}`;
    banner.append(cause);
  }
  status.replaceChildren(banner);
  $('warnings').replaceChildren();
}

const bytesOf = (value) => {
  if (typeof value === 'string') return new TextEncoder().encode(value).length;
  return value.byteLength ?? value.size ?? 0;
};

async function toBlob(result) {
  const { value, format } = result;
  switch (format) {
    case 'svg':
      return new Blob([value], { type: 'image/svg+xml' });
    case 'png':
      return new Blob([value], { type: 'image/png' });
    case 'text':
      return new Blob([value], { type: 'text/plain' });
    case 'svg-data-url':
    case 'png-data-url':
      return await (await fetch(value)).blob();
    default:
      return value;
  }
}

async function show(results, format, ms, isSequence) {
  releaseUrls();
  const stage = $('stage');
  const blobs = await Promise.all(results.map(toBlob));
  current = { results, format, blobs, isSequence };

  stage.replaceChildren();
  if (format === 'text') {
    const wrapper = isSequence ? document.createElement('div') : stage;
    for (const result of results) {
      const pre = document.createElement('pre');
      pre.textContent = result.value;
      wrapper.append(pre);
    }
    if (isSequence) stage.append(wrapper);
  } else if (isSequence) {
    const grid = document.createElement('div');
    grid.className = 'sequence';
    results.forEach((result, i) => {
      const figure = document.createElement('figure');
      const img = document.createElement('img');
      img.alt = `Symbol ${String(i + 1)} of ${String(results.length)}`;
      img.src = urlFor(blobs[i]);
      const caption = document.createElement('figcaption');
      caption.textContent = `${String(i + 1)} / ${String(results.length)} · v${String(result.matrix.version)}`;
      figure.append(img, caption);
      grid.append(figure);
    });
    stage.append(grid);
  } else {
    const img = document.createElement('img');
    img.alt = `QR Code, ${format}`;
    img.addEventListener('load', () => {
      chip('Pixels', `${String(img.naturalWidth)} × ${String(img.naturalHeight)}`);
    });
    img.src = urlFor(blobs[0]);
    stage.append(img);
  }
  applyZoom();

  const first = results[0];
  const matrix = first.matrix;
  const chips = $('chips');
  chips.replaceChildren();
  const add = (label, value) => chip(label, value);
  add(
    'Version',
    isSequence
      ? `${String(matrix.version)} (${String(results.length)} symbols)`
      : String(matrix.version),
  );
  add('Modules', `${String(matrix.size)} × ${String(matrix.size)}`);
  add('Mask', String(matrix.mask));
  add('Level', matrix.ecc);
  add('Size', formatBytes(results.reduce((n, r) => n + bytesOf(r.value), 0)));
  add('Time', `${ms.toFixed(ms < 10 ? 1 : 0)} ms`);
  add('Pixels', format === 'text' || format.startsWith('svg') ? '–' : '…');

  const warnings = $('warnings');
  warnings.replaceChildren();
  const seen = new Set();
  for (const result of results) {
    for (const w of result.warnings) {
      if (seen.has(w.code)) continue;
      seen.add(w.code);
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = w.code;
      li.append(code, ` — ${w.message}`);
      warnings.append(li);
    }
  }

  $('scan-result').hidden = true;
  fillDetails(results, format);
  drawAnatomy(matrix);
  $('btn-copy').disabled = false;
  $('btn-png').hidden = !format.startsWith('svg');
}

function chip(label, value) {
  const chips = $('chips');
  let dd = [...chips.querySelectorAll('dt')].find(
    (dt) => dt.textContent === label,
  )?.nextElementSibling;
  if (dd === undefined || dd === null) {
    const wrap = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    dd = document.createElement('dd');
    wrap.append(dt, dd);
    chips.append(wrap);
  }
  dd.textContent = value;
}

const formatBytes = (n) => (n < 1024 ? `${String(n)} B` : `${(n / 1024).toFixed(1)} KB`);

function fillDetails(results, format) {
  const first = results[0];
  const tbody = $('seg-table').querySelector('tbody');
  tbody.replaceChildren();
  results.forEach((result, symbol) => {
    result.matrix.segments.forEach((segment, index) => {
      const tr = document.createElement('tr');
      const cells = [
        results.length > 1 ? `${String(symbol + 1)}.${String(index + 1)}` : String(index + 1),
        segment.mode,
        String(segment.count),
        String(segment.bits),
      ];
      cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i > 1) td.className = 'num';
        tr.append(td);
      });
      tbody.append(tr);
    });
  });

  const summary = results.map((r) => ({
    format: r.format,
    mimeType: r.mimeType,
    bytes: bytesOf(r.value),
    matrix: {
      version: r.matrix.version,
      size: r.matrix.size,
      ecc: r.matrix.ecc,
      mask: r.matrix.mask,
      structuredAppend: r.matrix.structuredAppend ?? null,
    },
    warnings: r.warnings,
  }));
  $('result-json').textContent = JSON.stringify(
    results.length === 1 ? summary[0] : summary,
    null,
    2,
  );

  const value = first.value;
  let source;
  if (format === 'svg' || format === 'text') source = value;
  else if (typeof value === 'string')
    source = `${value.slice(0, 240)}${value.length > 240 ? `… (${String(value.length)} chars)` : ''}`;
  else source = `[binary ${first.mimeType}, ${formatBytes(bytesOf(value))}]`;
  $('source').textContent =
    source.length > 20000 ? `${source.slice(0, 20000)}\n… (truncated)` : source;

  const description = kit.describe();
  $('prov-formats').textContent = `Formats served by this kit: ${description.formats.join(', ')}.`;
  const provBody = $('prov-table').querySelector('tbody');
  provBody.replaceChildren();
  for (const provider of description.providers) {
    const tr = document.createElement('tr');
    for (const text of [provider.kind, provider.id]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    provBody.append(tr);
  }
}

/* ───────────────────────── anatomy ───────────────────────── */

const KINDS = [
  ['data', 'Data & error correction', '#334155'],
  ['finder', 'Finder pattern', '#4f46e5'],
  ['separator', 'Separator', '#94a3b8'],
  ['timing', 'Timing pattern', '#0891b2'],
  ['alignment', 'Alignment pattern', '#059669'],
  ['format', 'Format information', '#d97706'],
  ['version', 'Version information', '#c026d3'],
  ['dark', 'Dark module', '#dc2626'],
];
const hidden = new Set();
let anatomyMatrix = null;

function drawAnatomy(matrix) {
  anatomyMatrix = matrix;
  const canvas = $('anatomy-canvas');
  const size = matrix.size;
  const cell = Math.max(1, Math.floor(960 / size));
  canvas.width = canvas.height = cell * size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const counts = new Map(KINDS.map(([k]) => [k, 0]));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = matrix.kind(x, y);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      const color = KINDS.find(([k]) => k === kind)?.[2] ?? '#000';
      const dark = matrix.get(x, y);
      const muted = hidden.has(kind);
      if (muted) ctx.fillStyle = dark ? '#cbd5e1' : '#ffffff';
      else {
        ctx.fillStyle = color;
        ctx.globalAlpha = dark ? 1 : kind === 'data' ? 0 : 0.16;
      }
      ctx.fillRect(x * cell, y * cell, cell, cell);
      ctx.globalAlpha = 1;
    }
  }
  const legend = $('legend');
  legend.replaceChildren();
  for (const [kind, label, color] of KINDS) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(!hidden.has(kind)));
    const swatch = document.createElement('i');
    swatch.style.background = color;
    const name = document.createElement('span');
    name.textContent = label;
    const count = document.createElement('em');
    count.textContent = String(counts.get(kind) ?? 0);
    button.append(swatch, name, count);
    button.addEventListener('click', () => {
      if (hidden.has(kind)) hidden.delete(kind);
      else hidden.add(kind);
      if (anatomyMatrix !== null) drawAnatomy(anatomyMatrix);
    });
    li.append(button);
    legend.append(li);
  }
}

$('anatomy-canvas').addEventListener('pointermove', (event) => {
  if (anatomyMatrix === null) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * anatomyMatrix.size);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * anatomyMatrix.size);
  if (x < 0 || y < 0 || x >= anatomyMatrix.size || y >= anatomyMatrix.size) return;
  $('probe').textContent =
    `x=${String(x)}  y=${String(y)}  ${anatomyMatrix.kind(x, y)}  ${anatomyMatrix.get(x, y) ? 'dark' : 'light'}`;
});

/* ───────────────────────── actions ───────────────────────── */

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast('Copy is blocked here — select the text manually');
  }
}

$('btn-copy').addEventListener('click', async () => {
  if (current === null) return;
  const { results, format, blobs } = current;
  const value = results[0].value;
  if (format === 'png' || format === 'png-blob' || format === 'png-data-url') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobs[0] })]);
      toast('Image copied');
      return;
    } catch {
      /* fall through to text */
    }
  }
  if (typeof value === 'string') await copyText(value, 'Copied');
  else toast('This format can only be downloaded');
});

$('btn-download').addEventListener('click', () => {
  if (current === null) return;
  const { results, format, blobs } = current;
  const [ext] = EXTENSIONS[format] ?? ['bin'];
  blobs.forEach((blob, i) => {
    const m = results[i].matrix;
    const part = results.length > 1 ? `-part${String(i + 1)}of${String(results.length)}` : '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qrcode-v${String(m.version)}-${m.ecc}${part}.${ext}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
    }, 1000);
  });
  toast(blobs.length > 1 ? `Downloading ${String(blobs.length)} files` : 'Download started');
});

$('btn-scan').addEventListener('click', async () => {
  const box = $('scan-result');
  const say = (kind, text) => {
    box.hidden = false;
    box.className = `scan ${kind}`;
    box.textContent = text;
  };
  if (current === null) return;
  say('info', 'Decoding…');
  try {
    // Re-render the same symbol as a PNG at a decodable scale, whatever format is shown.
    const state = readState();
    const sizing =
      state.sizeMode === 'size'
        ? { sizeMode: 'size', sizeValue: state.sizeValue }
        : { sizeMode: 'scale', sizeValue: String(Math.max(6, Number(state.sizeValue) || 6)) };
    const built = buildRequest({ ...state, ...sizing, format: 'png-blob', qualityOn: false });
    const results =
      built.kind === 'sequence'
        ? await kit.generateStructuredAppend(built.request)
        : [await kit.generate(built.request)];
    const lines = [];
    const isSequence = results.length > 1 || built.kind === 'sequence';
    const parts = [];
    let allRead = true;
    for (const [i, result] of results.entries()) {
      const bitmap = await createImageBitmap(result.value);
      const reads = await decodeAll(rasterize(bitmap, bitmap.width, bitmap.height));
      // jsQR ignores structured-append headers and misreads them as data, so a sequence is
      // read with ZXing first; an empty string is never a valid symbol.
      const ordered = isSequence
        ? [...reads].sort((a, b) => Number(b.name === 'ZXing') - Number(a.name === 'ZXing'))
        : reads;
      const hit = ordered.find((r) => typeof r.text === 'string' && r.text !== '');
      if (hit === undefined) allRead = false;
      else parts.push(hit.text);
      const prefix = isSequence ? `Symbol ${String(i + 1)}: ` : '';
      const engines = reads.map((r) => `${r.name} ${r.text ? '✓' : '✗'}`).join(' · ');
      const shown =
        hit === undefined
          ? 'not readable'
          : JSON.stringify(hit.text.length > 120 ? `${hit.text.slice(0, 120)}…` : hit.text);
      lines.push(`${prefix}${shown}  [${engines}]`);
    }
    const expected = state.mode === 'text' || state.mode === 'sequence' ? state.text : null;
    const exact = allRead && expected !== null && parts.join('') === expected;
    if (allRead) {
      const headline = exact
        ? isSequence
          ? '✓ All symbols decoded; joined in order they equal the input.'
          : '✓ Decoded and identical to the input.'
        : isSequence
          ? '✓ Decoded, but the parts joined do not equal the input (a decoder may not support structured append).'
          : '✓ Decoded.';
      say(exact || !isSequence ? 'ok' : 'info', `${headline}\n${lines.join('\n')}`.slice(0, 1200));
    } else {
      say(
        'bad',
        `✗ ${lines.join('\n')}\nEvery decoder has blind spots; try another level or scale before suspecting the symbol.`,
      );
    }
  } catch (error) {
    say('bad', `Could not verify: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/* ───────────────────────── logo and PNG-from-SVG ───────────────────────── */

const SAMPLE_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#4f46e5"/><path fill="#fff" d="M28 28h20v20H28zM52 28h20v20H52zM28 52h20v20H28zM56 56h8v8h-8zM68 68h8v8h-8z"/></svg>';

function setLogo(href) {
  $('in-logo-href').value = href;
  syncDependents();
  updateCount();
  schedule();
}

$('btn-logo-sample').addEventListener('click', () => {
  setLogo(`data:image/svg+xml;base64,${btoa(SAMPLE_LOGO_SVG)}`);
});
$('btn-logo-clear').addEventListener('click', () => {
  $('in-logo-file').value = '';
  setLogo('');
});
$('in-logo-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file === undefined) return;
  if (file.size > 190_000) {
    toast('That image is too large (limit about 190 KB)');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    setLogo(String(reader.result));
  });
  reader.readAsDataURL(file);
});

$('btn-png').addEventListener('click', async () => {
  if (current === null) return;
  const { results, blobs } = current;
  try {
    for (const [i, blob] of blobs.entries()) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      const modules = results[i].matrix.size + Number(readState().quietZone) * 2;
      const edge = Math.max(512, Math.ceil(1024 / modules) * modules);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = edge;
      canvas.getContext('2d').drawImage(img, 0, 0, edge, edge);
      URL.revokeObjectURL(url);
      const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = `qrcode-v${String(results[i].matrix.version)}-${results[i].matrix.ecc}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
      }, 1000);
    }
    toast('PNG saved');
  } catch {
    toast('Could not draw this SVG on a canvas');
  }
});

$('btn-copy-code').addEventListener('click', () =>
  copyText($('code').textContent ?? '', 'Code copied'),
);

$('btn-share').addEventListener('click', () => {
  saveHash();
  void copyText(location.href, 'Link copied');
});

$('btn-reset').addEventListener('click', () => {
  hidden.clear();
  writeState(DEFAULTS);
  schedule();
  toast('Settings reset');
});

/* ───────────────────────── theme ───────────────────────── */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}
function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem('qtk-theme');
  } catch {
    /* storage can be blocked */
  }
  applyTheme(stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}
$('btn-theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('qtk-theme', next);
  } catch {
    /* ignore */
  }
});

/* ───────────────────────── wiring ───────────────────────── */

let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    saveHash();
    void render();
  }, 120);
}

function updateCount() {
  const mode = radioValue('seg-mode');
  const line = $('count-line');
  if (mode === 'text' || mode === 'sequence') {
    const text = $('in-text').value;
    line.textContent = `${String([...text].length)} characters · ${String(new TextEncoder().encode(text).length)} UTF-8 bytes`;
  } else if (mode === 'bytes') {
    const clean = $('in-hex').value.replace(/[^0-9a-f]/gi, '');
    line.textContent = `${String(Math.floor(clean.length / 2))} bytes`;
  } else {
    line.textContent = `${String(
      $('in-segments')
        .value.split('\n')
        .filter((l) => l.trim() !== '').length,
    )} segments`;
  }
}

function initRadioGroups() {
  for (const id of ['seg-mode', 'seg-ecc', 'seg-shape']) {
    const group = $(id);
    const buttons = [...group.querySelectorAll('[role="radio"]')];
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[role="radio"]');
      if (button === null) return;
      setRadio(id, button.getAttribute('data-value'));
      syncDependents();
      updateCount();
      schedule();
    });
    group.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const index = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const next = buttons[(index + step + buttons.length) % buttons.length];
      setRadio(id, next.getAttribute('data-value'));
      next.focus();
      syncDependents();
      updateCount();
      schedule();
    });
  }
}

function initTabs() {
  const tabs = [...document.querySelectorAll('#tabs [role="tab"]')];
  const select = (tab, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    $('status').hidden = tab.dataset.tab === 'selftest';
  };
  for (const tab of tabs) tab.addEventListener('click', () => select(tab));
  $('tabs').addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const index = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    if (event.key === 'Home') select(tabs[0], true);
    else if (event.key === 'End') select(tabs[tabs.length - 1], true);
    else if (step !== undefined) select(tabs[(index + step + tabs.length) % tabs.length], true);
  });
}

function applyZoom() {
  const zoom = $('in-zoom').value;
  $('out-zoom').textContent = `${zoom}%`;
  $('stage').style.setProperty('--zoom', zoom);
}

function initSelfTest() {
  const env = environment();
  $('env-line').textContent =
    `Environment: ${env.userAgent} · devicePixelRatio ${String(env.devicePixelRatio)} · BarcodeDetector ${env.barcodeDetector ? 'yes' : 'no'} · WebP encoder ${env.webp ? 'yes' : 'no'} · OffscreenCanvas ${env.offscreenCanvas ? 'yes' : 'no'}`;
  $('btn-selftest').addEventListener('click', async () => {
    const button = $('btn-selftest');
    button.disabled = true;
    const tests = buildTests();
    const list = $('selftest-list');
    list.replaceChildren();
    const rows = tests.map((test) => {
      const li = document.createElement('li');
      li.dataset.state = 'run';
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = '·';
      const body = document.createElement('div');
      const group = document.createElement('span');
      group.className = 'group';
      group.textContent = test.group;
      const name = document.createElement('span');
      name.textContent = test.name;
      const detail = document.createElement('span');
      detail.className = 'detail';
      body.append(group, name, detail);
      const ms = document.createElement('span');
      ms.className = 'ms';
      li.append(mark, body, ms);
      list.append(li);
      return { li, mark, detail, ms };
    });
    const marks = { run: '…', pass: '✓', fail: '✗', skip: '–' };
    const totals = await runSelfTest(tests, (index, update) => {
      const row = rows[index];
      row.li.dataset.state = update.state;
      row.mark.textContent = marks[update.state];
      row.detail.textContent = update.detail ?? '';
      row.ms.textContent = update.ms === undefined ? '' : `${update.ms.toFixed(0)} ms`;
      if (update.state === 'fail') row.li.scrollIntoView({ block: 'nearest' });
    });
    const summary = $('selftest-summary');
    summary.hidden = false;
    summary.replaceChildren();
    for (const [kind, label] of [
      ['pass', 'passed'],
      ['fail', 'failed'],
      ['skip', 'skipped'],
    ]) {
      const pill = document.createElement('span');
      pill.className = kind;
      pill.textContent = `${String(totals[kind])} ${label}`;
      summary.append(pill);
    }
    window.__selfTest = totals; // read by automated browser checks
    button.disabled = false;
  });
}

function init() {
  initTheme();
  makeKit();

  const formatSelect = $('in-format');
  for (const { value, label } of FORMATS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    formatSelect.append(option);
  }
  const presetSelect = $('in-preset');
  for (const preset of PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.append(option);
  }

  const fromHash = location.hash.startsWith('#s=') ? decodeHash(location.hash.slice(3)) : null;
  writeState(fromHash ?? DEFAULTS);
  updateCount();

  const description = kit.describe();
  $('kit-line').textContent =
    `${String(description.providers.length)} providers · ${String(description.formats.length)} formats · runs from dist/`;

  $('controls').addEventListener('submit', (event) => {
    event.preventDefault();
  });
  $('controls').addEventListener('input', (event) => {
    const target = event.target;
    if (target.type === 'color') $(`${target.id}-text`).value = target.value;
    if (target.type === 'text' && target.id.endsWith('-text')) syncColorPickers();
    syncDependents();
    updateCount();
    schedule();
  });
  $('controls').addEventListener('change', () => {
    syncDependents();
    schedule();
  });
  presetSelect.addEventListener('change', () => {
    const preset = PRESETS.find((p) => p.id === presetSelect.value);
    if (preset?.state) {
      writeState({ ...DEFAULTS, ...preset.state });
      updateCount();
      schedule();
    }
    presetSelect.value = '';
  });
  $('in-zoom').addEventListener('input', applyZoom);

  initRadioGroups();
  initTabs();
  initSelfTest();
  void render();
}

init();
