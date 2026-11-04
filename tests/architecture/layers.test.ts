import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { cruise, type ICruiseOptions, type IConfiguration } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const config = require(resolve(root, '.dependency-cruiser.cjs')) as IConfiguration;

async function violationsIn(baseDir: string, target: string): Promise<string[]> {
  const options: ICruiseOptions = {
    ...config.options,
    ruleSet: config,
    validate: true,
    baseDir,
    tsConfig: { fileName: resolve(root, 'tsconfig.json') },
  };
  const result = await cruise([target], options);
  if (typeof result.output === 'string') throw new Error('unexpected string output');
  return result.output.summary.violations.map((v) => v.rule.name);
}

describe('architecture rules', () => {
  it('real source tree has no violations', async () => {
    expect(await violationsIn(root, 'src')).toEqual([]);
  });

  it('every declared rule is exercised by a fixture (so a broken rule cannot pass silently)', async () => {
    const fired = new Set(
      await violationsIn(resolve(import.meta.dirname, 'fixtures/violations'), 'src'),
    );
    const declared = (config.forbidden ?? []).flatMap((rule) =>
      rule.name === undefined ? [] : [rule.name],
    );
    expect(declared.length).toBeGreaterThan(0);
    const notExercised = declared.filter((name) => !fired.has(name));
    expect(notExercised).toEqual([]);
  });
});
