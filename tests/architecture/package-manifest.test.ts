import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
) as Record<string, unknown>;

describe('package manifest invariants', () => {
  it.each(['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies'])(
    'declares no %s (zero runtime dependencies)',
    (field) => {
      expect(manifest[field]).toBeUndefined();
    },
  );

  it('has no lifecycle scripts that run on install', () => {
    const scripts = Object.keys(manifest['scripts'] ?? {});
    const forbidden = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'];
    expect(scripts.filter((s) => forbidden.includes(s))).toEqual([]);
  });

  it('is ESM-only, side-effect free and ships an explicit allowlist', () => {
    expect(manifest['type']).toBe('module');
    expect(manifest['sideEffects']).toBe(false);
    expect(manifest['files']).toEqual([
      'dist',
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
    ]);
    expect(manifest['main']).toBeUndefined();
  });

  it('is publishable and public', () => {
    expect(manifest['private']).toBeUndefined();
    expect(manifest['publishConfig']).toEqual({ access: 'public' });
    expect(manifest['scripts']).toMatchObject({ prepublishOnly: 'npm run check' });
  });

  it('declares the supported Node range', () => {
    expect(manifest['engines']).toEqual({ node: '^22.12.0 || >=24' });
  });
});
