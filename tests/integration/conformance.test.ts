import { describe, expect, it } from 'vitest';
import { createBlobExporter, createCanvasRenderer } from '../../src/browser.js';
import { createBufferExporters, createFileExporters } from '../../src/node.js';
import {
  assertConformance,
  checkEncoderProvider,
  checkExporterProvider,
  checkRendererProvider,
} from '../../src/testing.js';
import {
  createBuiltInProviders,
  createDefaultEncoder,
  type EncoderProvider,
  type ExporterProvider,
  type RendererProvider,
} from '../../src/index.js';

const builtIns = createBuiltInProviders();

describe('built-in providers pass the public conformance kit', () => {
  it.each(builtIns.encoders.map((p) => [p.id, p] as const))('encoder %s', async (_id, provider) => {
    assertConformance(await checkEncoderProvider(provider));
  });
  it.each(builtIns.renderers.map((p) => [p.id, p] as const))(
    'renderer %s',
    async (_id, provider) => {
      assertConformance(await checkRendererProvider(provider));
    },
  );
  it.each(builtIns.exporters.map((p) => [p.id, p] as const))(
    'exporter %s',
    async (_id, provider) => {
      assertConformance(await checkExporterProvider(provider));
    },
  );
  it.each(createBufferExporters().map((p) => [p.id, p] as const))(
    'node exporter %s',
    async (_id, provider) => {
      assertConformance(await checkExporterProvider(provider));
    },
  );
  it.each(createFileExporters().map((p) => [p.id, p] as const))(
    'node file exporter %s (metadata only)',
    async (_id, provider) => {
      assertConformance(await checkExporterProvider(provider));
    },
  );
  it('browser providers', async () => {
    const create = () => ({
      width: 1,
      height: 1,
      getContext: () => ({ fillStyle: '', fillRect: () => undefined }),
      toBlob: (cb: (b: { size: number; type: string }) => void, t?: string) => {
        cb({ size: 1, type: t ?? '' });
      },
    });
    assertConformance(await checkRendererProvider(createCanvasRenderer({ createCanvas: create })));
    assertConformance(await checkExporterProvider(createBlobExporter({ createCanvas: create })));
  });
});

describe('the conformance kit catches broken providers', () => {
  const good = createDefaultEncoder();

  it('flags a non-deterministic encoder', async () => {
    let n = 0;
    const flaky: EncoderProvider = {
      ...good,
      id: 'test/flaky',
      encode: (request) => good.encode({ ...request, mask: (n++ % 8) as 0 }),
    };
    const report = await checkEncoderProvider(flaky);
    expect(report.ok).toBe(false);
    expect(report.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('is deterministic');
  });

  it('flags a provider that lies about being synchronous', async () => {
    const liar: EncoderProvider = {
      ...good,
      id: 'test/liar',
      encode: (r) => Promise.resolve(good.encode(r) as never),
    };
    const report = await checkEncoderProvider(liar);
    expect(report.checks.find((c) => c.name === 'honours the sync claim')?.ok).toBe(false);
  });

  it('flags an encoder that swallows impossible data', async () => {
    const swallow: EncoderProvider = {
      ...good,
      id: 'test/swallow',
      encode: (r) =>
        good.encode({
          ...r,
          input: { kind: 'text', text: 'ok', charset: 'utf-8', eci: false, kanji: false },
        }),
    };
    const report = await checkEncoderProvider(swallow);
    expect(report.checks.find((c) => c.name.startsWith('rejects data'))?.ok).toBe(false);
  });

  it('flags a renderer that produces a different kind than it declares', async () => {
    const svg = builtIns.renderers[0];
    const wrong: RendererProvider = {
      ...svg,
      id: 'test/wrong-kind',
      capabilities: { ...svg.capabilities, produces: 'bitmap' },
    };
    expect((await checkRendererProvider(wrong)).ok).toBe(false);
  });

  it('flags an exporter that does not echo the format or has a bad id / apiVersion', async () => {
    const png = builtIns.exporters[1];
    const sloppy: ExporterProvider = {
      ...png,
      id: 'test/sloppy',
      export: (r, _f, o) => png.export(r, 'png', o),
    };
    // 'png-data-url' requested but 'png' returned
    expect((await checkExporterProvider(sloppy)).ok).toBe(false);
    const badId = await checkExporterProvider({ ...png, id: 'Not Valid!' });
    expect(badId.ok).toBe(false);
    const badVersion = await checkExporterProvider({ ...png, apiVersion: 9 as never });
    expect(badVersion.ok).toBe(false);
    expect(() => {
      assertConformance(badVersion);
    }).toThrow(/failed .* conformance check/);
  });
});
