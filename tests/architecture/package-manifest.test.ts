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
    expect(manifest['files']).toEqual(['dist', 'README.md', 'CHANGELOG.md', 'LICENSE']);
    expect(manifest['main']).toBeUndefined();
  });

  it('is private until the owner explicitly authorises publishing', () => {
    expect(manifest['private']).toBe(true);
  });

  it('declares the supported Node range', () => {
    expect(manifest['engines']).toEqual({ node: '^22.12.0 || >=24' });
  });
});
