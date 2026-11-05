import { describe, expect, it } from 'vitest';
import { penaltyScore } from '../../../src/core/layout.js';
import { fastPenaltyScore } from '../../../src/core/mask-score.js';
import { createQRCodeKit } from '../../../src/index.js';
import { createRandom } from '../oracle-random.js';

/** The rules written the slow, obvious way: module by module, nothing clever. */
function reference(modules: Uint8Array, n: number): number {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= n || y >= n ? 0 : (modules[y * n + x] ?? 0);
  let score = 0;
  // N1
  for (const horizontal of [true, false]) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        const same = b < n && (horizontal ? at(b, a) === at(b - 1, a) : at(a, b) === at(a, b - 1));
        if (same) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
    }
  }
  // N2
  for (let y = 0; y + 1 < n; y++) {
    for (let x = 0; x + 1 < n; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  }
  // N3: 1011101 with four light modules on one side and at least one on the other (outside the
  // symbol counts as light), found at module size 1
  for (const horizontal of [true, false]) {
    for (let a = 0; a < n; a++) {
      for (let start = -5; start < n + 5; start++) {
        const light = (b: number): boolean => (horizontal ? at(b, a) : at(a, b)) === 0;
        const dark = (b: number): boolean => !light(b);
        const core = [1, 0, 1, 1, 1, 0, 1].every((v, k) =>
          v === 1 ? dark(start + k) : light(start + k),
        );
        if (!core) continue;
        const four = (from: number): boolean => [0, 1, 2, 3].every((k) => light(from + k));
        if (four(start + 7) && light(start - 1)) score += 40; // light after, light before
        if (four(start - 4) && light(start + 7)) score += 40;
      }
    }
  }
  // N4
  let dark = 0;
  for (const m of modules) dark += m;
  score += (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
  return score;
}

describe('word-parallel mask scoring', () => {
  const random = createRandom(4711);

  it.each([21, 25, 29, 33, 45, 57, 77, 101, 133, 177])(
    'equals the plain rules on random grids of %i modules',
    (n) => {
      for (let round = 0; round < 12; round++) {
        const density = [0.5, 0.3, 0.8, 0.5][round % 4] ?? 0.5;
        const modules = new Uint8Array(n * n);
        for (let i = 0; i < modules.length; i++) modules[i] = random() < density ? 1 : 0;
        expect(fastPenaltyScore(modules, n)).toBe(reference(modules, n));
      }
    },
  );

  it.each([21, 29, 41, 63, 100, 177])(
    'equals the plain rules on striped and patterned grids of %i modules',
    (n) => {
      const stripes = [
        (x: number, y: number) => ((x >> 1) + (y >> 1)) % 2, // 2×2 checks
        (x: number) => (x % 7 < 3 ? 1 : 0), // vertical bars of 3 and 4
        (_x: number, y: number) => (y % 11 === 0 ? 0 : 1), // long dark rows
        (x: number, y: number) => ((x * 3 + y * 5) % 11 < 5 ? 1 : 0),
        // finder-like 1011101 repeated with light gaps, in rows and columns
        (x: number, y: number) => [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0][(x + y * 2) % 11] ?? 0,
        (x: number, y: number) => [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1][(y + x * 3) % 11] ?? 0,
      ];
      for (const pattern of stripes) {
        const modules = new Uint8Array(n * n);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) modules[y * n + x] = pattern(x, y);
        expect(fastPenaltyScore(modules, n)).toBe(reference(modules, n));
      }
    },
  );

  it('counts patterns that touch the border', () => {
    const n = 21;
    const modules = new Uint8Array(n * n);
    // row 3: 1011101 starting at the left border, light everywhere else
    [1, 0, 1, 1, 1, 0, 1].forEach((v, x) => (modules[3 * n + x] = v));
    expect(fastPenaltyScore(modules, n)).toBe(reference(modules, n));
    const withoutBorderRule = reference(new Uint8Array(n * n), n);
    expect(fastPenaltyScore(modules, n)).toBeGreaterThan(withoutBorderRule);
  });

  it('stops early when a limit is reached, with a score at or above it', () => {
    const modules = new Uint8Array(21 * 21).fill(1);
    const full = fastPenaltyScore(modules, 21);
    const early = fastPenaltyScore(modules, 21, 100);
    expect(early).toBeGreaterThanOrEqual(100);
    expect(early).toBeLessThanOrEqual(full);
  });

  it("gives the run-length scorer's score on real symbols, up to scaled patterns", () => {
    const kit = createQRCodeKit();
    for (const [data, version] of [
      ['https://example.com', 3],
      ['Hello, QR!', 5],
      ['0123456789'.repeat(20), 12],
    ] as const) {
      for (const mask of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
        const { matrix } = kit.generateSync({ data, version, mask });
        const modules = new Uint8Array(matrix.size * matrix.size);
        for (let y = 0; y < matrix.size; y++)
          for (let x = 0; x < matrix.size; x++)
            modules[y * matrix.size + x] = matrix.get(x, y) ? 1 : 0;
        const exact = reference(modules, matrix.size);
        expect(fastPenaltyScore(modules, matrix.size)).toBe(exact);
        // the run-length scorer also counts scaled finder-like patterns, so it can only score higher or equal
        expect(penaltyScore(modules, matrix.size)).toBeGreaterThanOrEqual(exact);
      }
    }
  });
});
