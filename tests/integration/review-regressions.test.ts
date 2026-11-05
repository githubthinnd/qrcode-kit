/** Regression tests for defects found in the full-system review that followed the first release. */
import { describe, expect, it } from 'vitest';
import { createBrowserKit } from '../../src/browser.js';
import { createNodeKit } from '../../src/node.js';
import { createQRCodeKit, segment, type Segment } from '../../src/index.js';

const kit = createQRCodeKit();
const bad = (data: unknown) => () => kit.encode({ data: data as Segment[] });

describe('segments are validated before the encoder sees them', () => {
  it('rejects malformed segments with a typed error naming the segment', () => {
    expect(bad([{ mode: 'numeric' }])).toThrow(/Segment 0 \(numeric\) needs a "text" string/);
    expect(bad([{ mode: 'byte', bytes: [1, 2] }])).toThrow(/Uint8Array/);
    expect(bad([{ mode: 'eci' }])).toThrow(/assignment/);
    expect(bad([{ mode: 'fnc1-second' }])).toThrow(/applicationIndicator/);
    expect(bad([{ mode: 'weird', text: 'x' }])).toThrow(/unknown mode/);
    expect(bad(['a'])).toThrow(/must be an object/);
    expect(bad([null])).toThrow(/must be an object/);
    for (const data of [[{ mode: 'numeric' }], ['a'], [{ mode: 'weird' }]]) {
      expect(bad(data)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }) as Error);
    }
  });

  it('allows one FNC1 marker, before the data, and nothing else', () => {
    expect(() =>
      kit.encode({ data: [segment.fnc1First(), segment.numeric('0123')] }),
    ).not.toThrow();
    expect(() =>
      kit.encode({ data: [segment.eci(26), segment.fnc1Second(37), segment.numeric('1')] }),
    ).not.toThrow();
    expect(bad([segment.fnc1First(), segment.fnc1Second(5), segment.numeric('1')])).toThrow(
      /only one FNC1/,
    );
    expect(bad([segment.fnc1First(), segment.fnc1First(), segment.numeric('1')])).toThrow(
      /only one FNC1/,
    );
    expect(bad([segment.numeric('1'), segment.fnc1First()])).toThrow(/before any data/);
  });
});

describe('kit configuration is validated like requests', () => {
  const config = (value: unknown) => () => createQRCodeKit(value as never);
  const invalid = expect.objectContaining({ code: 'INVALID_CONFIGURATION' }) as Error;

  it('rejects unknown keys at every level', () => {
    expect(config({ limts: {} })).toThrow(/Unknown kit option: limts/);
    expect(config({ limits: { maxInput: 5 } })).toThrow(/Unknown limits option: maxInput/);
    expect(config({ providers: { renderer: [] } })).toThrow(/Unknown providers option/);
    expect(config({ routes: { svg: { render: 'x' } } })).toThrow(/Unknown route "svg" option/);
    expect(config({ limts: {} })).toThrow(invalid);
  });

  it('rejects limits that would silently disable protection', () => {
    for (const value of [Number.NaN, 0, -1, 1.5, Number.POSITIVE_INFINITY, '5']) {
      expect(config({ limits: { maxInputLength: value } })).toThrow(/positive integer/);
      expect(config({ limits: { maxPixels: value } })).toThrow(/positive integer/);
    }
    expect(() =>
      createQRCodeKit({ limits: { maxInputLength: 10, maxPixels: 1000 } }),
    ).not.toThrow();
  });

  it('rejects wrong types instead of failing later with a TypeError', () => {
    expect(config({ plugins: 5 })).toThrow(/must be an array/);
    expect(config({ onDiagnostic: 5 })).toThrow(/must be a function/);
    expect(config({ builtIns: 'no' })).toThrow(/boolean/);
    expect(config({ defaultEncoder: 5 })).toThrow(/id string/);
    expect(config({ kanji: 5 })).toThrow(/KanjiMapper/);
    expect(config(5)).toThrow(/must be an object/);
    expect(config({ providers: { renderers: 'x' } })).toThrow(/must be an array/);
    expect(config({ routes: [] })).toThrow(/object keyed by format/);
  });

  it('applies to the runtime kits and their options', () => {
    expect(() => createNodeKit({ fils: {} } as never)).toThrow(/Unknown kit option: fils/);
    expect(() => createNodeKit({ files: { baseDri: '/x' } as never })).toThrow(
      /Unknown file exporter option: baseDri/,
    );
    expect(() => createNodeKit({ files: { baseDir: '' } })).toThrow(/non-empty string/);
    expect(() => createNodeKit({ files: { createDirectories: 'yes' as never } })).toThrow(
      /boolean/,
    );
    expect(() => createBrowserKit({ canvs: {} } as never)).toThrow(/Unknown kit option: canvs/);
    expect(() => createBrowserKit({ canvas: { createCanvs: () => null } as never })).toThrow(
      /Unknown canvas option/,
    );
    expect(() => createBrowserKit({ canvas: { createCanvas: 5 as never } })).toThrow(
      /must be a function/,
    );
  });

  it('accepts every documented option', () => {
    const encoderId = kit.describe().providers.find((p) => p.kind === 'encoder')?.id;
    expect(() =>
      createQRCodeKit({
        providers: { encoders: [], renderers: [], exporters: [] },
        builtIns: true,
        ...(encoderId === undefined ? {} : { defaultEncoder: encoderId }),
        routes: {},
        plugins: [],
        limits: { maxInputLength: 100, maxPixels: 100_000 },
        onDiagnostic: () => undefined,
        kanji: { shiftJisCode: () => undefined },
      }),
    ).not.toThrow();
  });
});
